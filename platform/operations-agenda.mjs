import {randomUUID} from 'node:crypto';
import {executeSql} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {normalizeEvent} from './workflows.mjs';
const unpack=r=>r?.rows?.map(row=>row.map(c=>c?.value??null))??[];
const changed=r=>Number(r?.affected_row_count??r?.rowsAffected??0)>0;
const toEvent=r=>({id:r[0],title:r[1],customer:r[2],resource:r[3],startsAt:r[4],endsAt:r[5],status:r[6],notes:r[7]});
const audit=async(tenant,user,action,id)=>executeSql('INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',[randomUUID(),tenant,user,action,'appointment',id]);
export async function listAppointments(token,slug){
 const {tenant}=await authorizeTool(token,slug,'C004');
 const result=await executeSql('SELECT id,title,customer,resource,starts_at,ends_at,status,notes FROM tenant_schedule_events WHERE organization_id=? ORDER BY starts_at DESC LIMIT 200',[tenant.id]);
 return {events:unpack(result).map(toEvent)};
}
export async function createAppointment(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'C004',true);
 const e=normalizeEvent(input),id=randomUUID();
 const result=await executeSql(`INSERT INTO tenant_schedule_events
 (organization_id,id,title,customer,resource,starts_at,ends_at,status,notes,created_by)
 SELECT ?,?,?,?,?,?,?,?,?,?
 WHERE (? != 'scheduled' OR NOT EXISTS (
  SELECT 1 FROM tenant_schedule_events
  WHERE organization_id=? AND resource=? AND status='scheduled'
  AND starts_at < ? AND ends_at > ?
 ))`,
 [tenant.id,id,e.title,e.customer,e.resource,e.startsAt,e.endsAt,e.status,e.notes,session.userId,
 e.status,tenant.id,e.resource,e.endsAt,e.startsAt]);
 if(!changed(result))throw Error('Schedule conflict');
 await audit(tenant.id,session.userId,'agenda.appointment_created',id);
 return {event:{id,...e}};
}
export async function updateAppointment(token,slug,id,input){
 const {tenant,session}=await authorizeTool(token,slug,'C004',true);
 if(input&&Object.keys(input).length===1&&['cancelled','completed'].includes(input.status)){
  const result=await executeSql('UPDATE tenant_schedule_events SET status=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',[input.status,tenant.id,id]);
  if(!changed(result))throw Error('Not found');
  await audit(tenant.id,session.userId,'agenda.appointment_status',id);
  return {ok:true};
 }
 const e=normalizeEvent(input);
 const result=await executeSql(`UPDATE tenant_schedule_events
 SET title=?,customer=?,resource=?,starts_at=?,ends_at=?,status=?,notes=?,updated_at=CURRENT_TIMESTAMP
 WHERE organization_id=? AND id=?
 AND (? != 'scheduled' OR NOT EXISTS (
  SELECT 1 FROM tenant_schedule_events e
  WHERE e.organization_id=? AND e.id!=? AND e.resource=? AND e.status='scheduled'
  AND e.starts_at < ? AND e.ends_at > ?
 ))`,
 [e.title,e.customer,e.resource,e.startsAt,e.endsAt,e.status,e.notes,tenant.id,id,
 e.status,tenant.id,id,e.resource,e.endsAt,e.startsAt]);
 if(!changed(result)){
  const found=await executeSql('SELECT id FROM tenant_schedule_events WHERE organization_id=? AND id=?',[tenant.id,id]);
  throw Error(unpack(found).length?'Schedule conflict':'Not found');
 }
 await audit(tenant.id,session.userId,'agenda.appointment_updated',id);
 return {ok:true};
}
