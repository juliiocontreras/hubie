import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {dealStages,normalizeDeal} from './workflows.mjs';
const values=r=>r?.rows?.map(row=>row.map(cell=>cell?.value??null))??[];
const changed=r=>Number(r?.affected_row_count??r?.rowsAffected??0)>0;
const select=`SELECT d.id,d.title,d.customer,d.amount_cents,d.stage,d.follow_up_at,d.notes,d.created_at,d.updated_at,l.client_id,c.name
 FROM tenant_crm_deals d LEFT JOIN tenant_deal_clients l ON l.organization_id=d.organization_id AND l.deal_id=d.id
 LEFT JOIN tenant_client_profiles c ON c.organization_id=l.organization_id AND c.id=l.client_id`;
const toDeal=a=>({id:a[0],title:a[1],customer:a[2],amountCents:Number(a[3]),stage:a[4],followUpAt:a[5]||null,notes:a[6],createdAt:a[7],updatedAt:a[8],clientId:a[9]||null,clientName:a[10]||null});
const audit=(org,actor,action,id)=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',args:[randomUUID(),org,actor,action,'crm_deal',id]});
async function ensureClient(org,id){
 if(!id)return;
 const rows=values(await executeSql('SELECT id FROM tenant_client_profiles WHERE organization_id=? AND id=? AND archived_at IS NULL',[org,id]));
 if(!rows.length)throw Error('Client not found');
}
export async function listDeals(token,slug){
 const {tenant}=await authorizeTool(token,slug,'C002');
 const [deals,clients]=await Promise.all([
  executeSql(select+' WHERE d.organization_id=? AND d.archived_at IS NULL ORDER BY d.updated_at DESC LIMIT 200',[tenant.id]),
  executeSql('SELECT id,name,company FROM tenant_client_profiles WHERE organization_id=? AND archived_at IS NULL ORDER BY name LIMIT 250',[tenant.id])
 ]);
 return {deals:values(deals).map(toDeal),clients:values(clients).map(a=>({id:a[0],name:a[1],company:a[2]})),stages:dealStages};
}
export async function createDeal(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'C002',true);
 const d=normalizeDeal(input),id=randomUUID();
 await ensureClient(tenant.id,d.clientId);
 const commands=[
  {sql:'INSERT INTO tenant_crm_deals(organization_id,id,title,customer,amount_cents,stage,follow_up_at,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?)',
   args:[tenant.id,id,d.title,d.customer,d.amountCents,d.stage,d.followUpAt,d.notes,session.userId]},
  ...(d.clientId?[{sql:'INSERT INTO tenant_deal_clients(organization_id,deal_id,client_id) VALUES(?,?,?)',args:[tenant.id,id,d.clientId]}]:[]),
  audit(tenant.id,session.userId,'crm.deal_created',id)
 ];
 await executeBatch(commands);
 return {deal:{id,...d}};
}
export async function updateDeal(token,slug,id,input){
 const {tenant,session}=await authorizeTool(token,slug,'C002',true);
 if(input&&Object.keys(input).length===1&&typeof input.stage==='string'){
  if(!dealStages.includes(input.stage))throw Error('Invalid deal');
  const r=await executeSql('UPDATE tenant_crm_deals SET stage=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',[input.stage,tenant.id,id]);
  if(!changed(r))throw Error('Not found');
 }else{
  const d=normalizeDeal(input);
  await ensureClient(tenant.id,d.clientId);
  if(d.clientId){
   const mismatch=values(await executeSql(`SELECT COUNT(*) FROM tenant_appointment_links
    WHERE organization_id=? AND deal_id=? AND client_id IS NOT NULL AND client_id!=?`,[tenant.id,id,d.clientId]));
   if(Number(mismatch[0]?.[0]||0)>0)throw Error('Relation mismatch');
  }
  const original=values(await executeSql('SELECT id FROM tenant_crm_deals WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,id]));
  if(!original.length)throw Error('Not found');
  await executeBatch([
   {sql:'UPDATE tenant_crm_deals SET title=?,customer=?,amount_cents=?,stage=?,follow_up_at=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',
    args:[d.title,d.customer,d.amountCents,d.stage,d.followUpAt,d.notes,tenant.id,id]},
   {sql:'DELETE FROM tenant_deal_clients WHERE organization_id=? AND deal_id=?',args:[tenant.id,id]},
   ...(d.clientId?[
    {sql:'INSERT INTO tenant_deal_clients(organization_id,deal_id,client_id) VALUES(?,?,?)',args:[tenant.id,id,d.clientId]},
    {sql:'UPDATE tenant_appointment_links SET client_id=? WHERE organization_id=? AND deal_id=? AND client_id IS NULL',args:[d.clientId,tenant.id,id]}
   ]:[])
  ]);
 }
 const record=audit(tenant.id,session.userId,'crm.deal_updated',id);
 await executeSql(record.sql,record.args);
 return {ok:true};
}
export async function archiveDeal(token,slug,id){
 const {tenant,session}=await authorizeTool(token,slug,'C002',true);
 const r=await executeSql('UPDATE tenant_crm_deals SET archived_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,id]);
 if(!changed(r))throw Error('Not found');
 const a=audit(tenant.id,session.userId,'crm.deal_archived',id);
 await executeSql(a.sql,a.args);
 return {archived:true};
}
