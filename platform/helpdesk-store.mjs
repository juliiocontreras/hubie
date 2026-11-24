import {randomUUID} from 'node:crypto';
import {executeSql as realExecuteSql,executeBatch as realExecuteBatch} from '../database.mjs';
import {authorizeTool as realAuthorize} from './records.mjs';
import {normalizeTicket,normalizeReply} from './helpdesk-domain.mjs';
import {assertTeamMember} from './team-members.mjs';
import {createNotification} from './notifications.mjs';
// T028 Mesa de ayuda: tickets, respuestas en hilo y aviso al asignar.
// Al asignar un ticket se crea una notificación en la app con el motor
// canónico (platform/notifications.mjs, tabla tenant_notifications de la
// 020), como hace T004 con las tareas vencidas. Sin correo real.
// Patrón de inyección de dependencias como training-store: `deps` permite
// probar el store con una base falsa sin tocar Turso.
const depsOf=d=>({executeSql:d?.executeSql||realExecuteSql,executeBatch:d?.executeBatch||realExecuteBatch,authorize:d?.authorize||realAuthorize});
const rows=r=>r?.rows?.map(a=>a.map(c=>c?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validId(id,label){if(typeof id!=='string'||!uuid.test(id))throw Error(label);}
const num=v=>Number(v||0);
const link=(slug,id)=>'/app/?tenant='+slug+'&tool=T028&record='+id;
async function assertClient(db,org,clientId){
 if(!clientId)return;
 const found=rows(await db.executeSql('SELECT id FROM tenant_client_profiles WHERE organization_id=? AND id=? AND archived_at IS NULL',[org,clientId]))[0];
 if(!found)throw Error('Client not found');
}
async function ticketFor(db,org,id){
 validId(id,'Invalid ticket');
 const row=rows(await db.executeSql('SELECT id,subject,description,client_id,status,priority,assignee_user_id,created_at,updated_at FROM tenant_helpdesk_tickets WHERE organization_id=? AND id=?',[org,id]))[0];
 if(!row)throw Error('Not found');
 return {id:row[0],subject:row[1],description:row[2],clientId:row[3]||null,status:row[4],priority:row[5],assigneeUserId:row[6]||null,createdAt:row[7],updatedAt:row[8]};
}
async function enrichTickets(db,org,tickets){
 const clientIds=[...new Set(tickets.map(t=>t.clientId).filter(Boolean))];
 const assigneeIds=[...new Set(tickets.map(t=>t.assigneeUserId).filter(Boolean))];
 const clients={},assignees={};
 if(clientIds.length){
  const r=await db.executeSql('SELECT id,name FROM tenant_client_profiles WHERE organization_id=? AND id IN ('+clientIds.map(()=>'?').join(',')+')',[org,...clientIds]);
  for(const x of rows(r))clients[x[0]]=x[1];
 }
 if(assigneeIds.length){
  const r=await db.executeSql('SELECT id,email FROM users WHERE id IN ('+assigneeIds.map(()=>'?').join(',')+')',[...assigneeIds]);
  for(const x of rows(r))assignees[x[0]]=x[1];
 }
 return tickets.map(t=>({...t,clientName:t.clientId?clients[t.clientId]||null:null,
  assigneeEmail:t.assigneeUserId?assignees[t.assigneeUserId]||null:null}));
}
async function repliesCount(db,org,ticketId){
 const row=rows(await db.executeSql('SELECT COUNT(*) FROM tenant_helpdesk_replies WHERE organization_id=? AND ticket_id=?',[org,ticketId]))[0];
 return num(row?.[0]);
}
// Aviso al asignado (best-effort, como T004): si el aviso no se puede
// crear, el ticket queda asignado igual y no falla la operación.
async function notifyAssignee(db,org,slug,ticket){
 if(!ticket.assigneeUserId)return {created:false};
 try{
  return await createNotification(org,{userId:ticket.assigneeUserId,type:'info',
   title:'Ticket asignado: '+ticket.subject,
   body:'Prioridad: '+ticket.priority+'. Estado: '+ticket.status+'.',
   link:link(slug,ticket.id)},{executeSql:db.executeSql});
 }catch{return {created:false};}
}
const ticketListSelect=`SELECT t.id,t.subject,t.description,t.client_id,t.status,t.priority,t.assignee_user_id,t.created_at,t.updated_at,
 (SELECT COUNT(*) FROM tenant_helpdesk_replies r WHERE r.organization_id=t.organization_id AND r.ticket_id=t.id)
 FROM tenant_helpdesk_tickets t WHERE t.organization_id=?`;
export async function listTickets(token,slug,{status=null,priority=null,assignee=null}={},deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T028');
 const conds=[],args=[tenant.id];
 if(status){if(!['abierto','en curso','en espera','resuelto','cerrado'].includes(status))throw Error('Invalid ticket');conds.push('t.status=?');args.push(status);}
 if(priority){if(!['baja','media','alta','urgente'].includes(priority))throw Error('Invalid ticket');conds.push('t.priority=?');args.push(priority);}
 if(assignee){validId(assignee,'Invalid ticket');conds.push('t.assignee_user_id=?');args.push(assignee);}
 const r=await db.executeSql(ticketListSelect+(conds.length?' AND '+conds.join(' AND '):'')+' ORDER BY t.created_at DESC LIMIT 100',args);
 const tickets=rows(r).map(x=>({id:x[0],subject:x[1],description:x[2],clientId:x[3]||null,status:x[4],priority:x[5],
  assigneeUserId:x[6]||null,createdAt:x[7],updatedAt:x[8],replies:num(x[9])}));
 return {tickets:await enrichTickets(db,tenant.id,tickets)};
}
export async function createTicket(token,slug,input,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T028',true);
 const data=normalizeTicket(input);
 await assertClient(db,tenant.id,data.clientId);
 if(data.assigneeUserId)await assertTeamMember(tenant.id,data.assigneeUserId,{executeSql:db.executeSql});
 const id=randomUUID();
 await db.executeSql('INSERT INTO tenant_helpdesk_tickets(organization_id,id,subject,description,client_id,status,priority,assignee_user_id,created_by) VALUES(?,?,?,?,?,?,?,?,?)',
  [tenant.id,id,data.subject,data.description,data.clientId,data.status,data.priority,data.assigneeUserId,session.userId]);
 const ticket=await ticketFor(db,tenant.id,id);
 await notifyAssignee(db,tenant.id,slug,ticket);
 const enriched=(await enrichTickets(db,tenant.id,[ticket]))[0];
 return {ticket:{...enriched,replies:await repliesCount(db,tenant.id,id)}};
}
export async function updateTicket(token,slug,id,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T028',true);
 const current=await ticketFor(db,tenant.id,id);
 const base={subject:current.subject,description:current.description,clientId:current.clientId,status:current.status,priority:current.priority,assigneeUserId:current.assigneeUserId};
 const next=normalizeTicket({...base,...input});
 await assertClient(db,tenant.id,next.clientId);
 if(next.assigneeUserId)await assertTeamMember(tenant.id,next.assigneeUserId,{executeSql:db.executeSql});
 const r=await db.executeSql('UPDATE tenant_helpdesk_tickets SET subject=?,description=?,client_id=?,status=?,priority=?,assignee_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',
  [next.subject,next.description,next.clientId,next.status,next.priority,next.assigneeUserId,tenant.id,id]);
 if(!changed(r))throw Error('Not found');
 const ticket=await ticketFor(db,tenant.id,id);
 if(next.assigneeUserId&&next.assigneeUserId!==current.assigneeUserId)await notifyAssignee(db,tenant.id,slug,ticket);
 const enriched=(await enrichTickets(db,tenant.id,[ticket]))[0];
 return {ticket:{...enriched,replies:await repliesCount(db,tenant.id,id)}};
}
export async function setTicketStatus(token,slug,id,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T028',true);
 if(!input||Object.keys(input).length!==1||!['abierto','en curso','en espera','resuelto','cerrado'].includes(input.status))throw Error('Invalid ticket');
 validId(id,'Invalid ticket');
 const r=await db.executeSql('UPDATE tenant_helpdesk_tickets SET status=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',[input.status,tenant.id,id]);
 if(!changed(r))throw Error('Not found');
 return {ok:true,status:input.status};
}
export async function assignTicket(token,slug,id,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T028',true);
 const current=await ticketFor(db,tenant.id,id);
 const assigneeUserId=input?.assigneeUserId??null;
 if(assigneeUserId!==null){
  if(typeof assigneeUserId!=='string'||!uuid.test(assigneeUserId))throw Error('Invalid ticket');
  await assertTeamMember(tenant.id,assigneeUserId,{executeSql:db.executeSql});
 }
 const r=await db.executeSql('UPDATE tenant_helpdesk_tickets SET assignee_user_id=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',[assigneeUserId,tenant.id,id]);
 if(!changed(r))throw Error('Not found');
 const ticket=await ticketFor(db,tenant.id,id);
 const notified=await notifyAssignee(db,tenant.id,slug,ticket);
 const enriched=(await enrichTickets(db,tenant.id,[ticket]))[0];
 return {ticket:{...enriched,replies:await repliesCount(db,tenant.id,id)},notified:notified.created};
}
export async function getTicket(token,slug,id,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T028');
 const ticket=await ticketFor(db,tenant.id,id);
 const replies=await listReplies(token,slug,id,deps);
 return {ticket:(await enrichTickets(db,tenant.id,[ticket]))[0],replies:replies.replies};
}
// ---- Respuestas en hilo ----
export async function listReplies(token,slug,ticketId,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T028');
 await ticketFor(db,tenant.id,ticketId);
 const r=await db.executeSql('SELECT r.id,r.ticket_id,r.author_user_id,r.body,r.created_at,u.email FROM tenant_helpdesk_replies r LEFT JOIN users u ON u.id=r.author_user_id WHERE r.organization_id=? AND r.ticket_id=? ORDER BY r.created_at ASC LIMIT 200',[tenant.id,ticketId]);
 return {replies:rows(r).map(x=>({id:x[0],ticketId:x[1],authorUserId:x[2]||null,authorEmail:x[5]||null,body:x[3],createdAt:x[4]}))};
}
export async function createReply(token,slug,ticketId,input,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T028',true);
 await ticketFor(db,tenant.id,ticketId);
 const data=normalizeReply({...input,ticketId});
 const id=randomUUID();
 await db.executeSql('INSERT INTO tenant_helpdesk_replies(organization_id,id,ticket_id,author_user_id,body,created_by) VALUES(?,?,?,?,?,?)',
  [tenant.id,id,ticketId,session.userId,data.body,session.userId]);
 const row=rows(await db.executeSql('SELECT r.id,r.ticket_id,r.author_user_id,r.body,r.created_at,u.email FROM tenant_helpdesk_replies r LEFT JOIN users u ON u.id=r.author_user_id WHERE r.organization_id=? AND r.id=?',[tenant.id,id]))[0];
 return {reply:{id:row[0],ticketId:row[1],authorUserId:row[2]||null,authorEmail:row[5]||null,body:row[3],createdAt:row[4]}};
}
// ---- Tablero ----
export async function dashboard(token,slug,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T028');
 const org=tenant.id;
 const r=await db.executeSql(`SELECT
  (SELECT COUNT(*) FROM tenant_helpdesk_tickets WHERE organization_id=? AND status='abierto'),
  (SELECT COUNT(*) FROM tenant_helpdesk_tickets WHERE organization_id=? AND status='en curso'),
  (SELECT COUNT(*) FROM tenant_helpdesk_tickets WHERE organization_id=? AND status='en espera'),
  (SELECT COUNT(*) FROM tenant_helpdesk_tickets WHERE organization_id=? AND status='resuelto'),
  (SELECT COUNT(*) FROM tenant_helpdesk_tickets WHERE organization_id=? AND status='cerrado'),
  (SELECT COUNT(*) FROM tenant_helpdesk_tickets WHERE organization_id=? AND priority='urgente' AND status NOT IN ('resuelto','cerrado')),
  (SELECT COUNT(*) FROM tenant_helpdesk_tickets WHERE organization_id=? AND assignee_user_id IS NULL AND status NOT IN ('resuelto','cerrado'))`,[org,org,org,org,org,org,org]);
 const c=rows(r)[0]||[];
 const open=await listTickets(token,slug,{status:'abierto'},deps);
 return {
  kpis:{open:num(c[0]),inProgress:num(c[1]),waiting:num(c[2]),resolved:num(c[3]),closed:num(c[4]),
   urgentOpen:num(c[5]),unassignedOpen:num(c[6]),total:num(c[0])+num(c[1])+num(c[2])+num(c[3])+num(c[4])},
  recentOpen:open.tickets.slice(0,5)
 };
}
