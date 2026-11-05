import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {dealStages,normalizeDeal} from './workflows.mjs';
const values=r=>r?.rows?.map(row=>row.map(cell=>cell?.value??null))??[];
const changed=r=>Number(r?.affected_row_count??r?.rowsAffected??0)>0;
const toDeal=a=>({id:a[0],title:a[1],customer:a[2],amountCents:Number(a[3]),stage:a[4],followUpAt:a[5]||null,notes:a[6],createdAt:a[7],updatedAt:a[8]});
const audit=(org,actor,action,id)=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',args:[randomUUID(),org,actor,action,'crm_deal',id]});
export async function listDeals(token,slug){
 const {tenant}=await authorizeTool(token,slug,'C002');
 const r=await executeSql('SELECT id,title,customer,amount_cents,stage,follow_up_at,notes,created_at,updated_at FROM tenant_crm_deals WHERE organization_id=? AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 200',[tenant.id]);
 return {deals:values(r).map(toDeal),stages:dealStages};
}
export async function createDeal(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'C002',true);
 const d=normalizeDeal(input),id=randomUUID();
 await executeBatch([
  {sql:'INSERT INTO tenant_crm_deals(organization_id,id,title,customer,amount_cents,stage,follow_up_at,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?)',args:[tenant.id,id,d.title,d.customer,d.amountCents,d.stage,d.followUpAt,d.notes,session.userId]},
  audit(tenant.id,session.userId,'crm.deal_created',id)
 ]);
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
  const r=await executeSql('UPDATE tenant_crm_deals SET title=?,customer=?,amount_cents=?,stage=?,follow_up_at=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',[d.title,d.customer,d.amountCents,d.stage,d.followUpAt,d.notes,tenant.id,id]);
  if(!changed(r))throw Error('Not found');
 }
 await executeSql(audit(tenant.id,session.userId,'crm.deal_updated',id).sql,[randomUUID(),tenant.id,session.userId,'crm.deal_updated','crm_deal',id]);
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
