import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {getTenantTools} from '../tenant.mjs';
import {normalizeAppointment,agendaRange,reminderNotifyAt,appointmentStatuses} from './tools-p1a-domain.mjs';
import {assertTeamMember,listTeamMembers} from './team-members.mjs';
import {createNotification} from './notifications.mjs';
const unpack=r=>r?.rows?.map(row=>row.map(c=>c?.value??null))??[];
const changed=r=>Number(r?.affected_row_count??r?.rowsAffected??0)>0;
// P1-A: la cita lleva responsable (miembro del equipo, tenant_appointment_
// assignees) y recordatorio ligado (tenant_appointment_reminders). El estado
// 'confirmed' se suma a 'scheduled' como estado que bloquea el recurso.
// Calendarios externos (Google/Outlook): fuera de alcance, etiquetado en UI.
const eventSelect=`SELECT e.id,e.title,e.customer,e.resource,e.starts_at,e.ends_at,e.status,e.notes,l.client_id,l.deal_id,c.name,d.title,
 a.user_id,u.email,r.remind_minutes_before,r.notify_at,r.notified_at
 FROM tenant_schedule_events e
 LEFT JOIN tenant_appointment_links l ON l.organization_id=e.organization_id AND l.appointment_id=e.id
 LEFT JOIN tenant_client_profiles c ON c.organization_id=l.organization_id AND c.id=l.client_id
 LEFT JOIN tenant_crm_deals d ON d.organization_id=l.organization_id AND d.id=l.deal_id
 LEFT JOIN tenant_appointment_assignees a ON a.organization_id=e.organization_id AND a.appointment_id=e.id
 LEFT JOIN users u ON u.id=a.user_id
 LEFT JOIN tenant_appointment_reminders r ON r.organization_id=e.organization_id AND r.appointment_id=e.id`;
const toEvent=r=>({id:r[0],title:r[1],customer:r[2],resource:r[3],startsAt:r[4],endsAt:r[5],status:r[6],notes:r[7],
 clientId:r[8]||null,dealId:r[9]||null,clientName:r[10]||null,dealTitle:r[11]||null,
 assigneeUserId:r[12]||null,assigneeEmail:r[13]||null,
 remindMinutesBefore:r[14]===null||r[14]===undefined?null:Number(r[14]),
 reminderNotifyAt:r[15]||null,reminderNotifiedAt:r[16]||null});
const audit=async(tenant,user,action,id)=>executeSql('INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',[randomUUID(),tenant,user,action,'appointment',id]);
async function resolveRefs(token,slug,org,raw){
 let clientId=raw.clientId,dealId=raw.dealId;
 if(dealId){
  await authorizeTool(token,slug,'C002');
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
  await authorizeTool(token,slug,'C001');
  const client=unpack(await executeSql('SELECT id FROM tenant_client_profiles WHERE organization_id=? AND id=? AND archived_at IS NULL',[org,clientId]));
  if(!client.length)throw Error('Client not found');
 }
 return {clientId,dealId};
}
const blockingStatuses=`status IN ('scheduled','confirmed')`;
async function saveAssigneeAndReminder(org,appointmentId,assigneeUserId,remindMinutesBefore,startsAt){
 await executeBatch([
  {sql:'DELETE FROM tenant_appointment_assignees WHERE organization_id=? AND appointment_id=?',args:[org,appointmentId]},
  ...(assigneeUserId?[{sql:'INSERT INTO tenant_appointment_assignees(organization_id,appointment_id,user_id) VALUES(?,?,?)',
   args:[org,appointmentId,assigneeUserId]}]:[]),
  {sql:'DELETE FROM tenant_appointment_reminders WHERE organization_id=? AND appointment_id=?',args:[org,appointmentId]},
  ...(remindMinutesBefore!==null&&remindMinutesBefore!==undefined?[{sql:'INSERT INTO tenant_appointment_reminders(organization_id,id,appointment_id,remind_minutes_before,notify_at) VALUES(?,?,?,?,?)',
   args:[org,randomUUID(),appointmentId,remindMinutesBefore,reminderNotifyAt(startsAt,remindMinutesBefore)]}]:[])
 ]);
}
// Recordatorios vencidos: intenta notificar al responsable (o al equipo si no
// hay responsable) con el motor canónico (platform/notifications.mjs, tabla
// tenant_notifications de la migración 020). Best-effort: si falla, el
// recordatorio queda con notified_at NULL y se anota como pendiente; la cita
// no falla por eso.
async function sendDueReminders(org,now=new Date()){
 const due=unpack(await executeSql(
  'SELECT r.id,r.appointment_id,r.notify_at,a.user_id,e.title FROM tenant_appointment_reminders r '+
  'JOIN tenant_schedule_events e ON e.organization_id=r.organization_id AND e.id=r.appointment_id '+
  'LEFT JOIN tenant_appointment_assignees a ON a.organization_id=r.organization_id AND a.appointment_id=r.appointment_id '+
  "WHERE r.organization_id=? AND r.notified_at IS NULL AND r.notify_at<=? LIMIT 50",[org,now.toISOString()]));
 const result={attempted:due.length,created:0,pending:0};
 for(const row of due){
  // Motor canónico de notificaciones (search, migración 020): tipo
  // 'appointment_soon', enlace null (el dedupe por enlace no aplica y cada
  // recordatorio crea su aviso). Best-effort: si falla, queda pendiente.
  let sent={created:false};
  try{
   sent=await createNotification(org,{userId:row[3]||null,
    type:'appointment_soon',
    title:'Recordatorio de cita: '+row[4],
    body:'Tu cita empieza pronto.',link:null});
  }catch{/* recordatorio best-effort: queda pendiente para el siguiente barrido */}
  if(sent.created){
   await executeSql('UPDATE tenant_appointment_reminders SET notified_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',[org,row[0]]);
   result.created++;
  }else result.pending++;
 }
 return result;
}
export async function listAppointments(token,slug,{view='list',date=null}={}){
 const {tenant}=await authorizeTool(token,slug,'C004');
 const enabled=new Set(await getTenantTools(tenant.id));
 const range=agendaRange(view,date);
 const conditions=['e.organization_id=?'];
 const args=[tenant.id];
 if(range.from){conditions.push('substr(e.starts_at,1,10)>=?');args.push(range.from);}
 if(range.to){conditions.push('substr(e.starts_at,1,10)<=?');args.push(range.to);}
 const [events,clients,deals,members]=await Promise.all([
  executeSql(eventSelect+' WHERE '+conditions.join(' AND ')+' ORDER BY e.starts_at DESC LIMIT 200',args),
  enabled.has('C001')?executeSql('SELECT id,name,company FROM tenant_client_profiles WHERE organization_id=? AND archived_at IS NULL ORDER BY name LIMIT 250',[tenant.id]):Promise.resolve({rows:[]}),
  enabled.has('C002')?executeSql(`SELECT d.id,d.title,l.client_id FROM tenant_crm_deals d LEFT JOIN tenant_deal_clients l ON l.organization_id=d.organization_id AND l.deal_id=d.id
  WHERE d.organization_id=? AND d.archived_at IS NULL ORDER BY d.updated_at DESC LIMIT 250`,[tenant.id]):Promise.resolve({rows:[]}),
  listTeamMembers(tenant.id)
 ]);
 let reminders={attempted:0,created:0,pending:0};
 try{reminders=await sendDueReminders(tenant.id);}catch{/* recordatorio best-effort */}
 return {events:unpack(events).map(a=>{const e=toEvent(a);return {...e,clientId:enabled.has('C001')?e.clientId:null,clientName:enabled.has('C001')?e.clientName:null,dealId:enabled.has('C002')?e.dealId:null,dealTitle:enabled.has('C002')?e.dealTitle:null};}),
  clients:unpack(clients).map(x=>({id:x[0],name:x[1],company:x[2]})),
  deals:unpack(deals).map(x=>({id:x[0],title:x[1],clientId:x[2]||null})),
  members,view,from:range.from,to:range.to,statuses:appointmentStatuses,reminders,
  externalCalendars:{status:'pending',note:'Sincronización con Google/Outlook pendiente de integración.'}};
}
export async function createAppointment(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'C004',true);
 const e=normalizeAppointment(input),refs=await resolveRefs(token,slug,tenant.id,e),id=randomUUID();
 if(e.assigneeUserId)await assertTeamMember(tenant.id,e.assigneeUserId);
 const result=await executeSql(`INSERT INTO tenant_schedule_events
 (organization_id,id,title,customer,resource,starts_at,ends_at,status,notes,created_by)
 SELECT ?,?,?,?,?,?,?,?,?,?
 WHERE (? NOT IN ('scheduled','confirmed') OR NOT EXISTS (
  SELECT 1 FROM tenant_schedule_events
  WHERE organization_id=? AND resource=? AND ${blockingStatuses} AND starts_at < ? AND ends_at > ?
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
  await saveAssigneeAndReminder(tenant.id,id,e.assigneeUserId,e.remindMinutesBefore,e.startsAt);
 }catch(error){
  await executeSql('DELETE FROM tenant_schedule_events WHERE organization_id=? AND id=?',[tenant.id,id]);
  throw error;
 }
 return {event:{id,...e,...refs}};
}
export async function updateAppointment(token,slug,id,input){
 const {tenant,session}=await authorizeTool(token,slug,'C004',true);
 if(input&&Object.keys(input).length===1&&['cancelled','completed','confirmed'].includes(input.status)){
  const result=await executeSql('UPDATE tenant_schedule_events SET status=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',[input.status,tenant.id,id]);
  if(!changed(result))throw Error('Not found');
  await audit(tenant.id,session.userId,'agenda.appointment_status',id);
  return {ok:true};
 }
 const e=normalizeAppointment(input),refs=await resolveRefs(token,slug,tenant.id,e);
 if(e.assigneeUserId)await assertTeamMember(tenant.id,e.assigneeUserId);
 const result=await executeSql(`UPDATE tenant_schedule_events SET title=?,customer=?,resource=?,starts_at=?,ends_at=?,status=?,notes=?,updated_at=CURRENT_TIMESTAMP
 WHERE organization_id=? AND id=?
 AND (? NOT IN ('scheduled','confirmed') OR NOT EXISTS (
  SELECT 1 FROM tenant_schedule_events e
  WHERE e.organization_id=? AND e.id!=? AND e.resource=? AND e.${blockingStatuses}
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
 await saveAssigneeAndReminder(tenant.id,id,e.assigneeUserId,e.remindMinutesBefore,e.startsAt);
 await audit(tenant.id,session.userId,'agenda.appointment_updated',id);
 return {ok:true};
}
