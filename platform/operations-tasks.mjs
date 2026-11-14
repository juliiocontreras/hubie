// T004 Tareas reales: responsable (miembro del equipo), vencimiento,
// estados (pendiente/en curso/hecha), filtro por responsable y vencimiento.
// Al vencer, crea una notificación con el motor canónico
// (platform/notifications.mjs, tabla tenant_notifications de la 020);
// si el aviso no se puede crear, anota el pendiente y NO crea la tabla.
// El aviso se marca una sola vez por tarea (notified_at).
import {randomUUID} from 'node:crypto';
import {executeSql as realExecuteSql,executeBatch as realExecuteBatch} from '../database.mjs';
import {authorizeTool as realAuthorize} from './records.mjs';
import {normalizeTask,taskStatuses,taskDueBucket,isTaskOverdue} from './tools-p1a-domain.mjs';
import {assertTeamMember,listTeamMembers} from './team-members.mjs';
import {createNotification} from './notifications.mjs';

const rows=r=>r?.rows?.map(row=>row.map(c=>c?.value??null))??[];
const changed=r=>Number(r?.affected_row_count??r?.rowsAffected??0)>0;
const depsOf=d=>({executeSql:d?.executeSql||realExecuteSql,executeBatch:d?.executeBatch||realExecuteBatch,
 authorize:d?.authorize||realAuthorize});
const audit=(org,user,action,id)=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',
 args:[randomUUID(),org,user,action,'task',id]});
const taskRow=r=>({id:r[0],title:r[1],notes:r[2],assigneeUserId:r[3]||null,assigneeEmail:r[4]||null,
 dueOn:r[5]||null,status:r[6],priority:r[7],sourceToolId:r[8]||null,sourceRecordId:r[9]||null,
 notifiedAt:r[10]||null,createdAt:r[11],updatedAt:r[12]});
const taskSelect=`SELECT t.id,t.title,t.notes,t.assignee_user_id,u.email,t.due_on,t.status,t.priority,
 t.source_tool_id,t.source_record_id,t.notified_at,t.created_at,t.updated_at
 FROM tenant_tasks t LEFT JOIN users u ON u.id=t.assignee_user_id`;

// Barrido de vencimientos: por cada tarea vencida sin aviso, intenta notificar
// al responsable y marca notified_at (aunque la tabla de notificaciones no
// exista todavía, el aviso queda como pendiente: notified_at sigue NULL y se
// reintenta en el siguiente listado). Nunca hace fallar al llamador.
export async function notifyOverdueTasks(organizationId,deps={},now=new Date()){
 const {executeSql}=depsOf(deps);
 const today=now.toISOString().slice(0,10);
 const overdue=rows(await executeSql(
  "SELECT id,title,assignee_user_id,due_on FROM tenant_tasks WHERE organization_id=? AND archived_at IS NULL "+
  "AND status!='done' AND due_on IS NOT NULL AND due_on<? AND notified_at IS NULL LIMIT 50",[organizationId,today]));
 const result={attempted:overdue.length,created:0,pending:0};
 for(const task of overdue){
  // Motor canónico de notificaciones (search, migración 020): el motor no
  // tiene tipo 'task_overdue'; se usa 'info'. Best-effort: si falla, el
  // aviso queda pendiente (notified_at sigue NULL) y se reintenta luego.
  let sent={created:false};
  try{
   sent=await createNotification(organizationId,{
    userId:task[2]||null,
    type:'info',
    title:'Tarea vencida: '+task[1],
    body:'La tarea venció el '+task[3]+'.',
    link:null},deps);
  }catch{/* aviso best-effort: queda pendiente para el siguiente listado */}
  if(sent.created){
   await executeSql('UPDATE tenant_tasks SET notified_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',[organizationId,task[0]]);
   result.created++;
  }else result.pending++;
 }
 return result;
}

export async function listTasks(token,slug,{assignee=null,status=null,overdue=false,dueFrom=null,dueTo=null}={},deps){
 const {executeSql,authorize}=depsOf(deps);
 const {tenant}=await authorize(token,slug,'T004');
 let notifications={attempted:0,created:0,pending:0};
 try{notifications=await notifyOverdueTasks(tenant.id,{executeSql},new Date());}catch{/* aviso best-effort */}
 const conditions=['t.organization_id=? AND t.archived_at IS NULL'];
 const args=[tenant.id];
 if(assignee){conditions.push('t.assignee_user_id=?');args.push(assignee);}
 if(status){if(!taskStatuses.includes(status))throw Error('Invalid task');conditions.push('t.status=?');args.push(status);}
 if(dueFrom){conditions.push('t.due_on>=?');args.push(dueFrom);}
 if(dueTo){conditions.push('t.due_on<=?');args.push(dueTo);}
 if(overdue)conditions.push("t.status!='done' AND t.due_on IS NOT NULL AND t.due_on<date('now')");
 const result=await executeSql(taskSelect+' WHERE '+conditions.join(' AND ')+
  ' ORDER BY (t.due_on IS NULL), t.due_on, t.created_at DESC LIMIT 200',args);
 const members=await listTeamMembers(tenant.id,{executeSql});
 const tasks=rows(result).map(taskRow);
 return {tasks:tasks.map(t=>({...t,overdue:isTaskOverdue(t),dueBucket:taskDueBucket(t)})),
  members,notifications,overdueCount:tasks.filter(t=>isTaskOverdue(t)).length};
}
export async function createTask(token,slug,input,deps){
 const {executeSql,authorize}=depsOf(deps);
 const {tenant,session}=await authorize(token,slug,'T004',true);
 const data=normalizeTask(input);
 if(data.assigneeUserId)await assertTeamMember(tenant.id,data.assigneeUserId,{executeSql});
 const id=randomUUID();
 await executeSql('INSERT INTO tenant_tasks(organization_id,id,title,notes,assignee_user_id,due_on,status,priority,source_tool_id,source_record_id,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
  [tenant.id,id,data.title,data.notes,data.assigneeUserId,data.dueOn,data.status,data.priority,data.sourceToolId,data.sourceRecordId,session.userId]);
 const entry=audit(tenant.id,session.userId,'tasks.created',id);
 await executeSql(entry.sql,entry.args);
 return {task:{id,...data,notifiedAt:null}};
}
export async function updateTask(token,slug,id,input,deps){
 const {executeSql,authorize}=depsOf(deps);
 const {tenant,session}=await authorize(token,slug,'T004',true);
 if(input&&Object.keys(input).length===1&&typeof input.status==='string'){
  if(!taskStatuses.includes(input.status))throw Error('Invalid task');
  const r=await executeSql('UPDATE tenant_tasks SET status=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',
   [input.status,tenant.id,id]);
  if(!changed(r))throw Error('Not found');
 }else{
  const data=normalizeTask(input);
  if(data.assigneeUserId)await assertTeamMember(tenant.id,data.assigneeUserId,{executeSql});
  const r=await executeSql('UPDATE tenant_tasks SET title=?,notes=?,assignee_user_id=?,due_on=?,status=?,priority=?,source_tool_id=?,source_record_id=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',
   [data.title,data.notes,data.assigneeUserId,data.dueOn,data.status,data.priority,data.sourceToolId,data.sourceRecordId,tenant.id,id]);
  if(!changed(r))throw Error('Not found');
 }
 const entry=audit(tenant.id,session.userId,'tasks.updated',id);
 await executeSql(entry.sql,entry.args);
 return {ok:true};
}
export async function archiveTask(token,slug,id,deps){
 const {executeSql,authorize}=depsOf(deps);
 const {tenant,session}=await authorize(token,slug,'T004',true);
 const r=await executeSql('UPDATE tenant_tasks SET archived_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,id]);
 if(!changed(r))throw Error('Not found');
 const entry=audit(tenant.id,session.userId,'tasks.archived',id);
 await executeSql(entry.sql,entry.args);
 return {archived:true};
}
