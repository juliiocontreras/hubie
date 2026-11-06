import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {normalizeEvent} from './workflows.mjs';
const unpack=r=>r?.rows?.map(row=>row.map(c=>c?.value??null))??[];
const changed=r=>Number(r?.affected_row_count??r?.rowsAffected??0)>0;
const eventSelect=`SELECT e.id,e.title,e.customer,e.resource,e.starts_at,e.ends_at,e.status,e.notes,l.client_id,l.deal_id,c.name,d.title
 FROM tenant_schedule_events e
 LEFT JOIN tenant_appointment_links l ON l.organization_id=e.organization_id AND l.appointment_id=e.id
 LEFT JOIN tenant_client_profiles c ON c.organization_id=l.organization_id AND c.id=l.client_id
 LEFT JOIN tenant_crm_deals d ON d.organization_id=l.organization_id AND d.id=l.deal_id`;
const toEvent=r=>({id:r[0],title:r[1],customer:r[2],resource:r[3],startsAt:r[4],endsAt:r[5],status:r[6],notes:r[7],clientId:r[8]||null,dealId:r[9]||null,clientName:r[10]||null,dealTitle:r[11]||null});
const audit=async(tenant,user,action,id)=>executeSql('INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',[randomUUID(),tenant,user,action,'appointment',id]);
async function resolveRefs(org,raw){
 let clientId=raw.clientId,dealId=raw.dealId;
 if(dealId){
  const deal=unpack(await executeSql(`SELECT d.id,l.client_id FROM tenant_crm_deals d LEFT JOIN tenant_deal_clients l
   ON l.organization_id=d.organization_id AND l.deal_id=d.id
   WHERE d.organization_id=? AND d.id=? AND d.archived_at IS NULL`,[org,dealId]))[0];
  if(!deal)throw Error('Deal not found');
  if(deal[1]){
   if(clientId&&clientId!==deal[1])throw Error('Relation mismatch');
   clientId=deal[1];
  }
 }
 if(clientId){
  const client=unpack(await executeSql('SELECT id FROM tenant_client_profiles WHERE organization_id=? AND id=? AND archived_at IS NULL',[org,clientId]));
  if(!client.length)throw Error('Client not found');
 }
 return {clientId,dealId};
}
export async function listAppointments(token,slug){
 const {tenant}=await authorizeTool(token,slug,'C004');
 const [events,clients,deals]=await Promise.all([
  executeSql(eventSelect+' WHERE e.organization_id=? ORDER BY e.starts_at DESC LIMIT 200',[tenant.id]),
  executeSql('SELECT id,name,company FROM tenant_client_profiles WHERE organization_id=? AND archived_at IS NULL ORDER BY name LIMIT 250',[tenant.id]),
  executeSql(`SELECT d.id,d.title,l.client_id FROM tenant_crm_deals d LEFT JOIN tenant_deal_clients l ON l.organization_id=d.organization_id AND l.deal_id=d.id
  WHERE d.organization_id=? AND d.archived_at IS NULL ORDER BY d.updated_at DESC LIMIT 250`,[tenant.id])
 ]);
 return {events:unpack(events).map(toEvent),clients:unpack(clients).map(x=>({id:x[0],name:x[1],company:x[2]})),
  deals:unpack(deals).map(x=>({id:x[0],title:x[1],clientId:x[2]||null}))};
}
export async function createAppointment(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'C004',true);
 const e=normalizeEvent(input),refs=await resolveRefs(tenant.id,e),id=randomUUID();
 const result=await executeSql(`INSERT INTO tenant_schedule_events
 (organization_id,id,title,customer,resource,starts_at,ends_at,status,notes,created_by)
 SELECT ?,?,?,?,?,?,?,?,?,?
 WHERE (? != 'scheduled' OR NOT EXISTS (
  SELECT 1 FROM tenant_schedule_events
  WHERE organization_id=? AND resource=? AND status='scheduled' AND starts_at < ? AND ends_at > ?
 ))`,[tenant.id,id,e.title,e.customer,e.resource,e.startsAt,e.endsAt,e.status,e.notes,session.userId,
 e.status,tenant.id,e.resource,e.endsAt,e.startsAt]);
 if(!changed(result))throw Error('Schedule conflict');
 try{
  await executeBatch([
   ...(refs.clientId||refs.dealId?[{sql:'INSERT INTO tenant_appointment_links(organization_id,appointment_id,client_id,deal_id) VALUES(?,?,?,?)',
    args:[tenant.id,id,refs.clientId,refs.dealId]}]:[]),
   {sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',
    args:[randomUUID(),tenant.id,session.userId,'agenda.appointment_created','appointment',id]}
  ]);
 }catch(error){
  await executeSql('DELETE FROM tenant_schedule_events WHERE organization_id=? AND id=?',[tenant.id,id]);
  throw error;
 }
 return {event:{id,...e,...refs}};
}
export async function updateAppointment(token,slug,id,input){
 const {tenant,session}=await authorizeTool(token,slug,'C004',true);
 if(input&&Object.keys(input).length===1&&['cancelled','completed'].includes(input.status)){
  const result=await executeSql('UPDATE tenant_schedule_events SET status=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',[input.status,tenant.id,id]);
  if(!changed(result))throw Error('Not found');
  await audit(tenant.id,session.userId,'agenda.appointment_status',id);
  return {ok:true};
 }
 const e=normalizeEvent(input),refs=await resolveRefs(tenant.id,e);
 const result=await executeSql(`UPDATE tenant_schedule_events SET title=?,customer=?,resource=?,starts_at=?,ends_at=?,status=?,notes=?,updated_at=CURRENT_TIMESTAMP
 WHERE organization_id=? AND id=?
 AND (? != 'scheduled' OR NOT EXISTS (
  SELECT 1 FROM tenant_schedule_events e
  WHERE e.organization_id=? AND e.id!=? AND e.resource=? AND e.status='scheduled'
  AND e.starts_at < ? AND e.ends_at > ?
 ))`,[e.title,e.customer,e.resource,e.startsAt,e.endsAt,e.status,e.notes,tenant.id,id,
 e.status,tenant.id,id,e.resource,e.endsAt,e.startsAt]);
 if(!changed(result)){
  const found=await executeSql('SELECT id FROM tenant_schedule_events WHERE organization_id=? AND id=?',[tenant.id,id]);
  throw Error(unpack(found).length?'Schedule conflict':'Not found');
 }
 await executeBatch([
  {sql:'DELETE FROM tenant_appointment_links WHERE organization_id=? AND appointment_id=?',args:[tenant.id,id]},
  ...(refs.clientId||refs.dealId?[{sql:'INSERT INTO tenant_appointment_links(organization_id,appointment_id,client_id,deal_id) VALUES(?,?,?,?)',
    args:[tenant.id,id,refs.clientId,refs.dealId]}]:[])
 ]);
 await audit(tenant.id,session.userId,'agenda.appointment_updated',id);
 return {ok:true};
}
