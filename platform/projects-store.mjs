import {randomUUID} from 'node:crypto';
import {executeSql as realExecuteSql,executeBatch as realExecuteBatch} from '../database.mjs';
import {authorizeTool as realAuthorize} from './records.mjs';
import {normalizeProject,normalizeMilestone,projectProgress} from './projects-domain.mjs';
import {createTask,updateTask} from './operations-tasks.mjs';
import {createKanbanBoard} from './operations-kanban.mjs';
import {assertTeamMember,listTeamMembers} from './team-members.mjs';
// T025 Proyectos: proyectos, hitos y avance derivado.
// Las tareas del proyecto son TAREAS REALES (T004): se crean en
// tenant_tasks con source_tool_id='T025' y source_record_id=<projectId>
// reutilizando platform/operations-tasks.mjs — NO hay tabla propia de
// tareas ni lógica duplicada. El tablero Kanban tampoco se reimplementa:
// el proyecto guarda kanban_board_id y el tablero se crea con
// platform/operations-kanban.mjs (T005, fuente 'generic').
// Patrón de inyección de dependencias como training-store: `deps` permite
// probar el store con una base falsa sin tocar Turso.
const depsOf=d=>({executeSql:d?.executeSql||realExecuteSql,executeBatch:d?.executeBatch||realExecuteBatch,authorize:d?.authorize||realAuthorize});
const rows=r=>r?.rows?.map(a=>a.map(c=>c?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validId(id,label){if(typeof id!=='string'||!uuid.test(id))throw Error(label);}
const num=v=>Number(v||0);
async function assertClient(db,org,clientId){
 if(!clientId)return;
 const found=rows(await db.executeSql('SELECT id FROM tenant_client_profiles WHERE organization_id=? AND id=? AND archived_at IS NULL',[org,clientId]))[0];
 if(!found)throw Error('Client not found');
}
async function projectFor(db,org,id){
 validId(id,'Invalid project');
 const row=rows(await db.executeSql('SELECT id,name,description,client_id,starts_on,ends_on,status,owner_user_id,kanban_board_id,created_at,updated_at FROM tenant_projects WHERE organization_id=? AND id=?',[org,id]))[0];
 if(!row)throw Error('Not found');
 return {id:row[0],name:row[1],description:row[2],clientId:row[3]||null,startsOn:row[4]||null,endsOn:row[5]||null,status:row[6],ownerUserId:row[7]||null,kanbanBoardId:row[8]||null,createdAt:row[9],updatedAt:row[10]};
}
async function milestoneFor(db,org,projectId,id){
 validId(id,'Invalid milestone');
 const row=rows(await db.executeSql('SELECT id,project_id,title,due_on,status,created_at,updated_at FROM tenant_project_milestones WHERE organization_id=? AND project_id=? AND id=?',[org,projectId,id]))[0];
 if(!row)throw Error('Not found');
 return {id:row[0],projectId:row[1],title:row[2],dueOn:row[3]||null,status:row[4],createdAt:row[5],updatedAt:row[6]};
}
async function enrichProjects(db,org,projects){
 const clientIds=[...new Set(projects.map(p=>p.clientId).filter(Boolean))];
 const boardIds=[...new Set(projects.map(p=>p.kanbanBoardId).filter(Boolean))];
 const ownerIds=[...new Set(projects.map(p=>p.ownerUserId).filter(Boolean))];
 const clients={},boards={},owners={};
 if(clientIds.length){
  const r=await db.executeSql('SELECT id,name FROM tenant_client_profiles WHERE organization_id=? AND id IN ('+clientIds.map(()=>'?').join(',')+')',[org,...clientIds]);
  for(const x of rows(r))clients[x[0]]=x[1];
 }
 if(boardIds.length){
  const r=await db.executeSql('SELECT id,name FROM kanban_boards WHERE organization_id=? AND id IN ('+boardIds.map(()=>'?').join(',')+')',[org,...boardIds]);
  for(const x of rows(r))boards[x[0]]=x[1];
 }
 if(ownerIds.length){
  const r=await db.executeSql('SELECT id,email FROM users WHERE id IN ('+ownerIds.map(()=>'?').join(',')+')',[...ownerIds]);
  for(const x of rows(r))owners[x[0]]=x[1];
 }
 return projects.map(p=>({...p,clientName:p.clientId?clients[p.clientId]||null:null,
  kanbanBoardName:p.kanbanBoardId?boards[p.kanbanBoardId]||null:null,
  ownerEmail:p.ownerUserId?owners[p.ownerUserId]||null:null}));
}
function withProgress(p){
 const progress=projectProgress({milestonesDone:p.milestonesDone,milestonesTotal:p.milestonesTotal,tasksDone:p.tasksDone,tasksTotal:p.tasksTotal});
 return {...p,progress};
}
const projectListSelect=`SELECT p.id,p.name,p.description,p.client_id,p.starts_on,p.ends_on,p.status,p.owner_user_id,p.kanban_board_id,p.created_at,p.updated_at,
 (SELECT COUNT(*) FROM tenant_project_milestones m WHERE m.organization_id=p.organization_id AND m.project_id=p.id AND m.status='completado'),
 (SELECT COUNT(*) FROM tenant_project_milestones m WHERE m.organization_id=p.organization_id AND m.project_id=p.id AND m.status!='cancelado'),
 (SELECT COUNT(*) FROM tenant_tasks t WHERE t.organization_id=p.organization_id AND t.source_tool_id='T025' AND t.source_record_id=p.id AND t.archived_at IS NULL AND t.status='done'),
 (SELECT COUNT(*) FROM tenant_tasks t WHERE t.organization_id=p.organization_id AND t.source_tool_id='T025' AND t.source_record_id=p.id AND t.archived_at IS NULL)
 FROM tenant_projects p WHERE p.organization_id=?`;
export async function listProjects(token,slug,{status=null}={},deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T025');
 const r=await db.executeSql(projectListSelect+(status?' AND p.status=?':'')+' ORDER BY p.created_at DESC LIMIT 100',status?[tenant.id,status]:[tenant.id]);
 const projects=rows(r).map(x=>({id:x[0],name:x[1],description:x[2],clientId:x[3]||null,startsOn:x[4]||null,endsOn:x[5]||null,
  status:x[6],ownerUserId:x[7]||null,kanbanBoardId:x[8]||null,createdAt:x[9],updatedAt:x[10],
  milestonesDone:num(x[11]),milestonesTotal:num(x[12]),tasksDone:num(x[13]),tasksTotal:num(x[14])}));
 return {projects:(await enrichProjects(db,tenant.id,projects)).map(withProgress)};
}
export async function createProject(token,slug,input,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T025',true);
 const data=normalizeProject(input);
 await assertClient(db,tenant.id,data.clientId);
 if(data.ownerUserId)await assertTeamMember(tenant.id,data.ownerUserId,{executeSql:db.executeSql});
 const id=randomUUID();
 await db.executeSql('INSERT INTO tenant_projects(organization_id,id,name,description,client_id,starts_on,ends_on,status,owner_user_id,kanban_board_id,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
  [tenant.id,id,data.name,data.description,data.clientId,data.startsOn,data.endsOn,data.status,data.ownerUserId,data.kanbanBoardId,session.userId]);
 const project=await projectFor(db,tenant.id,id);
 const enriched=(await enrichProjects(db,tenant.id,[project]))[0];
 return {project:withProgress({...enriched,milestonesDone:0,milestonesTotal:0,tasksDone:0,tasksTotal:0})};
}
export async function updateProject(token,slug,id,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T025',true);
 const current=await projectFor(db,tenant.id,id);
 const base={name:current.name,description:current.description,clientId:current.clientId,startsOn:current.startsOn,endsOn:current.endsOn,status:current.status,ownerUserId:current.ownerUserId,kanbanBoardId:current.kanbanBoardId};
 const next=normalizeProject({...base,...input});
 await assertClient(db,tenant.id,next.clientId);
 if(next.ownerUserId)await assertTeamMember(tenant.id,next.ownerUserId,{executeSql:db.executeSql});
 if(next.kanbanBoardId){
  const board=rows(await db.executeSql('SELECT id FROM kanban_boards WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,next.kanbanBoardId]))[0];
  if(!board)throw Error('Not found');
 }
 const r=await db.executeSql('UPDATE tenant_projects SET name=?,description=?,client_id=?,starts_on=?,ends_on=?,status=?,owner_user_id=?,kanban_board_id=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',
  [next.name,next.description,next.clientId,next.startsOn,next.endsOn,next.status,next.ownerUserId,next.kanbanBoardId,tenant.id,id]);
 if(!changed(r))throw Error('Not found');
 const project=await projectFor(db,tenant.id,id);
 const enriched=(await enrichProjects(db,tenant.id,[project]))[0];
 const [milestones,tasks]=await Promise.all([listMilestones(token,slug,id,deps),listProjectTasks(token,slug,id,deps)]);
 return {project:{...enriched,progress:projectProgress({
  milestonesDone:milestones.milestones.filter(m=>m.status==='completado').length,
  milestonesTotal:milestones.milestones.filter(m=>m.status!=='cancelado').length,
  tasksDone:tasks.tasks.filter(t=>t.status==='done').length,
  tasksTotal:tasks.tasks.length})}};
}
export async function setProjectStatus(token,slug,id,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T025',true);
 if(!input||Object.keys(input).length!==1||!['planificado','en curso','en pausa','completado','cancelado'].includes(input.status))throw Error('Invalid project');
 validId(id,'Invalid project');
 const r=await db.executeSql('UPDATE tenant_projects SET status=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',[input.status,tenant.id,id]);
 if(!changed(r))throw Error('Not found');
 return {ok:true,status:input.status};
}
export async function getProject(token,slug,id,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T025');
 const project=await projectFor(db,tenant.id,id);
 const [milestones,tasks]=await Promise.all([listMilestones(token,slug,id,deps),listProjectTasks(token,slug,id,deps)]);
 const enriched=(await enrichProjects(db,tenant.id,[project]))[0];
 const progress=projectProgress({
  milestonesDone:milestones.milestones.filter(m=>m.status==='completado').length,
  milestonesTotal:milestones.milestones.filter(m=>m.status!=='cancelado').length,
  tasksDone:tasks.tasks.filter(t=>t.status==='done').length,
  tasksTotal:tasks.tasks.length});
 return {project:{...enriched,progress},milestones:milestones.milestones,tasks:tasks.tasks};
}
// ---- Hitos ----
export async function listMilestones(token,slug,projectId,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T025');
 await projectFor(db,tenant.id,projectId);
 const r=await db.executeSql('SELECT id,project_id,title,due_on,status,created_at,updated_at FROM tenant_project_milestones WHERE organization_id=? AND project_id=? ORDER BY (due_on IS NULL),due_on,created_at ASC LIMIT 200',[tenant.id,projectId]);
 return {milestones:rows(r).map(x=>({id:x[0],projectId:x[1],title:x[2],dueOn:x[3]||null,status:x[4],createdAt:x[5],updatedAt:x[6]}))};
}
export async function createMilestone(token,slug,projectId,input,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T025',true);
 await projectFor(db,tenant.id,projectId);
 const data=normalizeMilestone({...input,projectId});
 const id=randomUUID();
 await db.executeSql('INSERT INTO tenant_project_milestones(organization_id,id,project_id,title,due_on,status,created_by) VALUES(?,?,?,?,?,?,?)',
  [tenant.id,id,projectId,data.title,data.dueOn,data.status,session.userId]);
 return {milestone:await milestoneFor(db,tenant.id,projectId,id)};
}
export async function updateMilestone(token,slug,projectId,id,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T025',true);
 const current=await milestoneFor(db,tenant.id,projectId,id);
 const base={projectId:current.projectId,title:current.title,dueOn:current.dueOn,status:current.status};
 const next=normalizeMilestone({...base,...input,projectId});
 const r=await db.executeSql('UPDATE tenant_project_milestones SET title=?,due_on=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND project_id=? AND id=?',
  [next.title,next.dueOn,next.status,tenant.id,projectId,id]);
 if(!changed(r))throw Error('Not found');
 return {milestone:await milestoneFor(db,tenant.id,projectId,id)};
}
export async function setMilestoneStatus(token,slug,projectId,id,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T025',true);
 if(!input||Object.keys(input).length!==1||!['pendiente','completado','cancelado'].includes(input.status))throw Error('Invalid milestone');
 await milestoneFor(db,tenant.id,projectId,id);
 const r=await db.executeSql('UPDATE tenant_project_milestones SET status=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND project_id=? AND id=?',[input.status,tenant.id,projectId,id]);
 if(!changed(r))throw Error('Not found');
 return {ok:true,status:input.status};
}
// ---- Tareas del proyecto (T004 reutilizada) ----
const projectTaskSelect=`SELECT t.id,t.title,t.notes,t.assignee_user_id,u.email,t.due_on,t.status,t.priority,t.created_at,t.updated_at
 FROM tenant_tasks t LEFT JOIN users u ON u.id=t.assignee_user_id
 WHERE t.organization_id=? AND t.source_tool_id='T025' AND t.source_record_id=? AND t.archived_at IS NULL`;
export async function listProjectTasks(token,slug,projectId,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T025');
 await projectFor(db,tenant.id,projectId);
 const r=await db.executeSql(projectTaskSelect+' ORDER BY (t.due_on IS NULL),t.due_on,t.created_at DESC LIMIT 200',[tenant.id,projectId]);
 return {tasks:rows(r).map(x=>({id:x[0],title:x[1],notes:x[2],assigneeUserId:x[3]||null,assigneeEmail:x[4]||null,
  dueOn:x[5]||null,status:x[6],priority:x[7],createdAt:x[8],updatedAt:x[9]}))};
}
export async function createProjectTask(token,slug,projectId,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T025',true);
 await projectFor(db,tenant.id,projectId);
 // Reutiliza T004 tal cual (validación, responsable del equipo, auditoría);
 // la tarea queda ligada al proyecto por source_tool_id/source_record_id.
 return createTask(token,slug,{...input,sourceToolId:'T025',sourceRecordId:projectId},deps);
}
export async function updateProjectTaskStatus(token,slug,projectId,taskId,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T025',true);
 await projectFor(db,tenant.id,projectId);
 const found=rows(await db.executeSql("SELECT id FROM tenant_tasks WHERE organization_id=? AND id=? AND source_tool_id='T025' AND source_record_id=? AND archived_at IS NULL",[tenant.id,taskId,projectId]))[0];
 if(!found)throw Error('Not found');
 if(!input||Object.keys(input).length!==1||!['pending','in_progress','done'].includes(input.status))throw Error('Invalid task');
 return updateTask(token,slug,taskId,{status:input.status},deps);
}
// ---- Tablero Kanban (T005 reutilizado) ----
export async function linkProjectBoard(token,slug,projectId,boardId,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T025',true);
 await projectFor(db,tenant.id,projectId);
 validId(boardId,'Invalid project');
 const board=rows(await db.executeSql('SELECT id,name FROM kanban_boards WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,boardId]))[0];
 if(!board)throw Error('Not found');
 const r=await db.executeSql('UPDATE tenant_projects SET kanban_board_id=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',[boardId,tenant.id,projectId]);
 if(!changed(r))throw Error('Not found');
 return {ok:true,boardId,boardName:board[1]};
}
export async function createProjectBoard(token,slug,projectId,body={},deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T025',true);
 const project=await projectFor(db,tenant.id,projectId);
 if(body&&typeof body==='object'&&body.boardId)return linkProjectBoard(token,slug,projectId,body.boardId,deps);
 if(project.kanbanBoardId){
  const board=rows(await db.executeSql('SELECT id,name FROM kanban_boards WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,project.kanbanBoardId]))[0];
  if(board)return {ok:true,boardId:board[0],boardName:board[1],alreadyLinked:true};
 }
 // Crea el tablero con T005 (fases por defecto Por hacer/En curso/Hecho)
 // y lo liga al proyecto. Requiere T005 habilitada en el tenant.
 const created=await createKanbanBoard(token,slug,{name:'Tablero: '+project.name,sourceToolId:'generic'});
 const linked=await linkProjectBoard(token,slug,projectId,created.board.id,deps);
 return {ok:true,boardId:linked.boardId,boardName:linked.boardName};
}
// ---- Tablero (KPIs estilo FlowTask: composición de la referencia de Julio) ----
// Sin variación % contra el mes anterior: no hay histórico guardado y no se
// inventa. El equipo se lista con sus tareas activas reales del proyecto
// (sin estado de presencia: no existe ese dato).
export async function dashboard(token,slug,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T025');
 const org=tenant.id;
 const [projects,taskCounts,members]=await Promise.all([
  listProjects(token,slug,{},deps),
  db.executeSql(`SELECT
   (SELECT COUNT(*) FROM tenant_tasks WHERE organization_id=? AND source_tool_id='T025' AND archived_at IS NULL AND status='done'),
   (SELECT COUNT(*) FROM tenant_tasks WHERE organization_id=? AND source_tool_id='T025' AND archived_at IS NULL AND status='pending'),
   (SELECT COUNT(*) FROM tenant_tasks WHERE organization_id=? AND source_tool_id='T025' AND archived_at IS NULL AND status='in_progress'),
   (SELECT COUNT(*) FROM tenant_tasks WHERE organization_id=? AND source_tool_id='T025' AND archived_at IS NULL)`,[org,org,org,org]),
  listTeamMembers(org,{executeSql:db.executeSql})
 ]);
 const counts=rows(taskCounts)[0]||[];
 const activeProjects=projects.projects.filter(p=>p.status==='en curso');
 const team=[];
 for(const m of members){
  const active=rows(await db.executeSql("SELECT COUNT(*) FROM tenant_tasks WHERE organization_id=? AND source_tool_id='T025' AND assignee_user_id=? AND status!='done' AND archived_at IS NULL",[org,m.userId]))[0];
  team.push({userId:m.userId,email:m.email,role:m.role,activeTasks:num(active?.[0])});
 }
 return {
  kpis:{
   activeProjects:activeProjects.length,
   totalProjects:projects.projects.length,
   completedProjects:projects.projects.filter(p=>p.status==='completado').length,
   tasksCompleted:num(counts[0]),tasksPending:num(counts[1]),tasksInProgress:num(counts[2]),tasksTotal:num(counts[3]),
   teamMembers:members.length
  },
  projectProgress:projects.projects.slice(0,8).map(p=>({id:p.id,name:p.name,status:p.status,percent:p.progress.percent,
   milestonesDone:p.progress.milestones.done,milestonesTotal:p.progress.milestones.total,
   tasksDone:p.progress.tasks.done,tasksTotal:p.progress.tasks.total})),
  tasksByStatus:{done:num(counts[0]),pending:num(counts[1]),inProgress:num(counts[2])},
  team
 };
}
