import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {executableStatements} from '../platform/migration-parser.mjs';
import {createProjectsFakeDb,projectsDeps} from './projects-fake-db.mjs';
import {listProjects,createProject,updateProject,setProjectStatus,getProject,
 listMilestones,createMilestone,updateMilestone,setMilestoneStatus,
 listProjectTasks,createProjectTask,updateProjectTaskStatus,
 linkProjectBoard,dashboard} from '../platform/projects-store.mjs';
import {normalizeProject,normalizeMilestone,projectProgress} from '../platform/projects-domain.mjs';

const token='fake-token',slug='demo',otherSlug='demo-b';
const setup=()=>{const fake=createProjectsFakeDb();return {fake,deps:projectsDeps(fake)};};
const projectInput=(over={})=>({name:'Rediseño de tienda',description:'Proyecto base',
 startsOn:'2026-11-20',endsOn:'2027-02-28',status:'en curso',...over});
const milestoneInput=(over={})=>({title:'Entrega de mockups',dueOn:'2026-12-15',...over});
const taskInput=(over={})=>({title:'Revisar catálogo',notes:'',dueOn:'2026-12-01',status:'pending',priority:'high',...over});

test('migraciones 030 y 033: aplican limpias en SQLite y crean sus tablas',async()=>{
 const db=new DatabaseSync(':memory:');
 for(const migration of ['030_projects.sql','033_helpdesk.sql']){
  const sql=await readFile(new URL('../turso/migrations/'+migration,import.meta.url),'utf8');
  for(const statement of executableStatements(sql))db.exec(statement);
 }
 const tables=db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r=>r.name);
 for(const table of ['tenant_projects','tenant_project_milestones','tenant_helpdesk_tickets','tenant_helpdesk_replies'])
  assert.ok(tables.includes(table),'falta tabla '+table);
 db.close();
});

test('dominio: normalización estricta y avance derivado',()=>{
 assert.equal(normalizeProject({name:'  Web nueva  '}).status,'planificado');
 assert.equal(normalizeProject({name:'Web nueva'}).clientId,null);
 assert.throws(()=>normalizeProject({name:'Ab'}),/Invalid/);
 assert.throws(()=>normalizeProject({name:'Web',startsOn:'2027-01-10',endsOn:'2027-01-01'}),/Invalid project/);
 assert.throws(()=>normalizeProject({name:'Web',status:'hecho'}),/Invalid project/);
 assert.throws(()=>normalizeMilestone({projectId:'x',title:'Hito'}),/Invalid milestone/);
 assert.deepEqual(projectProgress({milestonesDone:1,milestonesTotal:2,tasksDone:3,tasksTotal:4}),
  {milestones:{done:1,total:2,percent:50},tasks:{done:3,total:4,percent:75},percent:67});
 assert.equal(projectProgress({}).percent,0);
 assert.equal(projectProgress({milestonesDone:1,milestonesTotal:1}).percent,100);
});

test('proyectos: crear con defaults, listar con avance, actualizar y cambiar estatus',async()=>{
 const {fake,deps}=setup();
 const created=await createProject(token,slug,{name:'Web nueva'},deps);
 assert.equal(created.project.status,'planificado');
 assert.equal(created.project.clientId,null);
 assert.equal(created.project.progress.percent,0);
 const full=await createProject(token,slug,projectInput({clientId:fake.clientId,ownerUserId:fake.memberId}),deps);
 assert.equal(full.project.clientName,'Cliente Ejemplo SA');
 assert.equal(full.project.ownerEmail,'member@demo.test');
 assert.equal((await listProjects(token,slug,{},deps)).projects.length,2);
 assert.equal((await listProjects(token,slug,{status:'en curso'},deps)).projects.length,1);
 const updated=await updateProject(token,slug,full.project.id,{name:'Rediseño actualizado',status:'en pausa'},deps);
 assert.equal(updated.project.name,'Rediseño actualizado');
 assert.equal(updated.project.status,'en pausa');
 assert.equal(updated.project.clientId,fake.clientId);
 const moved=await setProjectStatus(token,slug,full.project.id,{status:'completado'},deps);
 assert.equal(moved.status,'completado');
 await assert.rejects(()=>createProject(token,slug,{name:'Ab'},deps),/Invalid/);
 await assert.rejects(()=>createProject(token,slug,projectInput({clientId:'00000000-0000-4000-8000-000000000000'}),deps),/Client not found/);
 await assert.rejects(()=>createProject(token,slug,projectInput({ownerUserId:'00000000-0000-4000-8000-000000000000'}),deps),/Assignee not found/);
 await assert.rejects(()=>setProjectStatus(token,slug,full.project.id,{status:'hecho'},deps),/Invalid project/);
 await assert.rejects(()=>updateProject(token,slug,'00000000-0000-4000-8000-000000000000',{name:'Nada'},deps),/Not found/);
 await assert.rejects(()=>listProjects('bad-token',slug,{},deps),/Unauthorized/);
 await assert.rejects(()=>listProjects(token,'sin-tenant',{},deps),/Not found/);
});

test('aislamiento entre tenants: un proyecto de demo no se ve en demo-b',async()=>{
 const {fake,deps}=setup();
 const created=await createProject(token,slug,projectInput(),deps);
 assert.equal((await listProjects(token,slug,{},deps)).projects.length,1);
 assert.equal((await listProjects(token,otherSlug,{},deps)).projects.length,0);
 await assert.rejects(()=>getProject(token,otherSlug,created.project.id,deps),/Not found/);
 await assert.rejects(()=>createMilestone(token,otherSlug,created.project.id,milestoneInput(),deps),/Not found/);
 const other=await createProject(token,otherSlug,projectInput(),deps);
 assert.notEqual(other.project.id,created.project.id);
 assert.equal((await listProjects(token,otherSlug,{},deps)).projects.length,1);
});

test('hitos: crear, listar ordenados por fecha, actualizar y completar',async()=>{
 const {deps}=setup();
 const project=(await createProject(token,slug,projectInput(),deps)).project;
 const first=await createMilestone(token,slug,project.id,milestoneInput({title:'Hito A',dueOn:'2026-12-20'}),deps);
 const second=await createMilestone(token,slug,project.id,milestoneInput({title:'Hito B',dueOn:'2026-12-01'}),deps);
 assert.equal(first.milestone.status,'pendiente');
 const listed=await listMilestones(token,slug,project.id,deps);
 assert.equal(listed.milestones.length,2);
 assert.equal(listed.milestones[0].id,second.milestone.id,'el hito más próximo va primero');
 const updated=await updateMilestone(token,slug,project.id,first.milestone.id,{title:'A actualizado'},deps);
 assert.equal(updated.milestone.title,'A actualizado');
 assert.equal(updated.milestone.dueOn,'2026-12-20');
 const done=await setMilestoneStatus(token,slug,project.id,second.milestone.id,{status:'completado'},deps);
 assert.equal(done.status,'completado');
 await assert.rejects(()=>setMilestoneStatus(token,slug,project.id,first.milestone.id,{status:'hecho'},deps),/Invalid milestone/);
 await assert.rejects(()=>createMilestone(token,slug,project.id,{title:'X'},deps),/Invalid/);
 await assert.rejects(()=>createMilestone(token,slug,'00000000-0000-4000-8000-000000000000',milestoneInput(),deps),/Not found/);
});

test('tareas del proyecto: son tareas reales T004 ligadas por source',async()=>{
 const {fake,deps}=setup();
 const project=(await createProject(token,slug,projectInput(),deps)).project;
 const task=(await createProjectTask(token,slug,project.id,taskInput({assigneeUserId:fake.memberId}),deps)).task;
 assert.equal(task.sourceToolId,'T025');
 assert.equal(task.sourceRecordId,project.id);
 assert.equal(task.assigneeUserId,fake.memberId);
 assert.equal(task.priority,'high');
 // La tarea vive en tenant_tasks: el listado del proyecto la ve y el
 // listado general de T004 también la vería por source (misma tabla).
 assert.equal(fake.tables.tasks.length,1);
 assert.equal(fake.tables.tasks[0].source_tool_id,'T025');
 assert.equal((await listProjectTasks(token,slug,project.id,deps)).tasks.length,1);
 assert.equal((await listProjectTasks(token,slug,project.id,deps)).tasks[0].assigneeEmail,'member@demo.test');
 const moved=await updateProjectTaskStatus(token,slug,project.id,task.id,{status:'done'},deps);
 assert.equal(moved.ok,true);
 assert.equal((await listProjectTasks(token,slug,project.id,deps)).tasks[0].status,'done');
 await assert.rejects(()=>createProjectTask(token,slug,project.id,taskInput({title:'X'}),deps),/Invalid task/);
 await assert.rejects(()=>createProjectTask(token,slug,project.id,taskInput({assigneeUserId:'00000000-0000-4000-8000-000000000000'}),deps),/Assignee not found/);
 await assert.rejects(()=>updateProjectTaskStatus(token,slug,project.id,task.id,{status:'hecha'},deps),/Invalid task/);
 await assert.rejects(()=>updateProjectTaskStatus(token,slug,project.id,'00000000-0000-4000-8000-000000000000',{status:'done'},deps),/Not found/);
});

test('avance derivado: hitos + tareas hechas en el detalle y en el listado',async()=>{
 const {deps}=setup();
 const project=(await createProject(token,slug,projectInput(),deps)).project;
 const m1=(await createMilestone(token,slug,project.id,milestoneInput({title:'Hito A'}),deps)).milestone;
 await createMilestone(token,slug,project.id,milestoneInput({title:'Hito B'}),deps);
 const t1=(await createProjectTask(token,slug,project.id,taskInput({title:'Tarea 1'}),deps)).task;
 await createProjectTask(token,slug,project.id,taskInput({title:'Tarea 2'}),deps);
 let detail=await getProject(token,slug,project.id,deps);
 assert.equal(detail.project.progress.percent,0);
 assert.equal(detail.milestones.length,2);
 assert.equal(detail.tasks.length,2);
 await setMilestoneStatus(token,slug,project.id,m1.id,{status:'completado'},deps);
 await updateProjectTaskStatus(token,slug,project.id,t1.id,{status:'done'},deps);
 detail=await getProject(token,slug,project.id,deps);
 // 1 de 2 hitos + 1 de 2 tareas = 2 de 4 = 50%.
 assert.equal(detail.project.progress.percent,50);
 assert.equal(detail.project.progress.milestones.percent,50);
 assert.equal(detail.project.progress.tasks.percent,50);
 const listed=(await listProjects(token,slug,{},deps)).projects[0];
 assert.equal(listed.progress.percent,50);
});

test('tablero kanban: ligar un tablero existente al proyecto',async()=>{
 const {fake,deps}=setup();
 const project=(await createProject(token,slug,projectInput(),deps)).project;
 const linked=await linkProjectBoard(token,slug,project.id,fake.boardId,deps);
 assert.equal(linked.boardId,fake.boardId);
 assert.equal(linked.boardName,'Tablero del proyecto');
 const detail=await getProject(token,slug,project.id,deps);
 assert.equal(detail.project.kanbanBoardId,fake.boardId);
 assert.equal(detail.project.kanbanBoardName,'Tablero del proyecto');
 await assert.rejects(()=>linkProjectBoard(token,slug,project.id,'00000000-0000-4000-8000-000000000000',deps),/Not found/);
 await assert.rejects(()=>linkProjectBoard(token,otherSlug,project.id,fake.boardId,deps),/Not found/);
});

test('tablero de proyectos: KPIs, dona de tareas y equipo con tareas activas',async()=>{
 const {fake,deps}=setup();
 const p1=(await createProject(token,slug,projectInput({name:'Activo 1'}),deps)).project;
 await createProject(token,slug,projectInput({name:'Planificado',status:'planificado'}),deps);
 await createProjectTask(token,slug,p1.id,taskInput({title:'Hecha',status:'done'}),deps);
 await createProjectTask(token,slug,p1.id,taskInput({title:'Pendiente',assigneeUserId:fake.memberId}),deps);
 await createProjectTask(token,slug,p1.id,taskInput({title:'En curso',status:'in_progress'}),deps);
 const dash=await dashboard(token,slug,deps);
 assert.equal(dash.kpis.activeProjects,1);
 assert.equal(dash.kpis.totalProjects,2);
 assert.equal(dash.kpis.tasksCompleted,1);
 assert.equal(dash.kpis.tasksPending,1);
 assert.equal(dash.kpis.tasksInProgress,1);
 assert.equal(dash.kpis.tasksTotal,3);
 assert.equal(dash.kpis.teamMembers,2);
 assert.equal(dash.tasksByStatus.done,1);
 assert.equal(dash.tasksByStatus.pending,1);
 assert.equal(dash.tasksByStatus.inProgress,1);
 assert.equal(dash.projectProgress.length,2);
 assert.equal(dash.projectProgress.find(p=>p.id===p1.id).percent,33,'1 de 3 tareas hechas');
 assert.equal(dash.projectProgress.find(p=>p.name==='Planificado').percent,0);
 const member=dash.team.find(m=>m.userId===fake.memberId);
 assert.equal(member.activeTasks,1);
 assert.equal(dash.team.find(m=>m.userId===fake.ownerId).activeTasks,0);
});
