import test from 'node:test';
import assert from 'node:assert/strict';
import {createP1aFakeDb,p1aDeps} from './tools-p1a-fake-db.mjs';
import {listChecklistTemplates,createChecklistTemplate,listChecklists,createChecklist,
 addChecklistItem,toggleChecklistItem,archiveChecklist} from '../platform/operations-checklists.mjs';
import {listTasks,createTask,updateTask,archiveTask} from '../platform/operations-tasks.mjs';
import {listForms,createForm,submitForm,listSubmissions,exportSubmissionsCsv} from '../platform/operations-forms.mjs';
import {getDashboard,setDashboardGoal,listDashboardGoals} from '../platform/dashboard.mjs';

const org='11111111-1111-4111-8111-111111111111';
const member='44444444-4444-4444-8444-444444444444';
const token='fake-token',slug='demo';
const yesterday=()=>{const d=new Date();d.setDate(d.getDate()-1);return d.toISOString().slice(0,10);};
const tomorrow=()=>{const d=new Date();d.setDate(d.getDate()+1);return d.toISOString().slice(0,10);};

test('T003 checklists: plantilla reutilizable, checklist desde plantilla, verificación y progreso',async()=>{
 const fake=createP1aFakeDb(),deps=p1aDeps(fake);
 const tpl=await createChecklistTemplate(token,slug,{title:'Apertura',description:'',items:['Abrir caja','Revisar exhibición']},deps);
 assert.equal(tpl.template.items.length,2);
 const listed=await listChecklistTemplates(token,slug,deps);
 assert.equal(listed.templates[0].items.length,2);
 const created=await createChecklist(token,slug,{title:'Apertura lunes',templateId:tpl.template.id},deps);
 assert.equal(created.checklist.items.length,2);
 assert.deepEqual(created.checklist.progress,{total:2,checked:0,percent:0,done:false});
 assert.equal(created.checklist.items[0].title,'Abrir caja');
 const first=created.checklist.items[0].id,second=created.checklist.items[1].id;
 const toggled=await toggleChecklistItem(token,slug,created.checklist.id,first,{checked:true},deps);
 assert.deepEqual(toggled.progress,{total:2,checked:1,percent:50,done:false});
 await toggleChecklistItem(token,slug,created.checklist.id,second,{checked:true},deps);
 const after=await listChecklists(token,slug,deps);
 assert.equal(after.checklists[0].status,'completed');
 assert.deepEqual(after.checklists[0].progress,{total:2,checked:2,percent:100,done:true});
 await assert.rejects(()=>toggleChecklistItem(token,slug,created.checklist.id,'00000000-0000-4000-8000-000000000000',{checked:true},deps),/Not found/);
 const archived=await archiveChecklist(token,slug,created.checklist.id,deps);
 assert.equal(archived.archived,true);
 assert.equal((await listChecklists(token,slug,deps)).checklists.length,0);
});
test('T003 checklists: ítem con responsable real y evidencia en pwa_media',async()=>{
 const fake=createP1aFakeDb({media:[{id:'55555555-5555-4555-8555-555555555555',organization_id:org,kind:'attachment',name:'foto.jpg'}]}),deps=p1aDeps(fake);
 const created=await createChecklist(token,slug,{title:'Inspección',items:[{title:'Foto del local'}]},deps);
 const item=await addChecklistItem(token,slug,created.checklist.id,
  {title:'Medir fachada',assigneeUserId:member,dueOn:tomorrow(),evidenceMediaId:'55555555-5555-4555-8555-555555555555'},deps);
 assert.equal(item.item.assigneeUserId,member);
 const list=await listChecklists(token,slug,deps);
 assert.equal(list.checklists[0].items[1].assigneeEmail,'miembro@ejemplo.mx');
 assert.equal(list.checklists[0].items[1].evidenceName,'foto.jpg');
 await assert.rejects(()=>addChecklistItem(token,slug,created.checklist.id,
  {title:'Otro',assigneeUserId:'99999999-9999-4999-8999-999999999999'},deps),/Assignee not found/);
 await assert.rejects(()=>addChecklistItem(token,slug,created.checklist.id,
  {title:'Otro',evidenceMediaId:'66666666-6666-4666-8666-666666666666'},deps),/Evidence not found/);
});
test('T004 tareas: responsable, vencimiento, filtros y aviso al vencer sin tabla de notificaciones',async()=>{
 const fake=createP1aFakeDb(),deps=p1aDeps(fake);
 const overdue=await createTask(token,slug,{title:'Vencida',assigneeUserId:member,dueOn:yesterday()},deps);
 await createTask(token,slug,{title:'Futura',assigneeUserId:member,dueOn:tomorrow()},deps);
 await createTask(token,slug,{title:'Sin responsable',dueOn:tomorrow()},deps);
 const all=await listTasks(token,slug,{},deps);
 assert.equal(all.tasks.length,3);
 assert.equal(all.overdueCount,1);
 assert.equal(all.notifications.attempted,1);
 assert.equal(all.notifications.created,0);
 assert.equal(all.notifications.pending,1);
 assert.equal(all.tasks.find(t=>t.id===overdue.task.id).overdue,true);
 const byMember=await listTasks(token,slug,{assignee:member},deps);
 assert.equal(byMember.tasks.length,2);
 const onlyOverdue=await listTasks(token,slug,{overdue:true},deps);
 assert.equal(onlyOverdue.tasks.length,1);
 const done=await updateTask(token,slug,overdue.task.id,{status:'done'},deps);
 assert.equal(done.ok,true);
 assert.equal((await listTasks(token,slug,{overdue:true},deps)).tasks.length,0);
 await assert.rejects(()=>createTask(token,slug,{title:'Mala',assigneeUserId:'99999999-9999-4999-8999-999999999999'},deps),/Assignee not found/);
 const archived=await archiveTask(token,slug,overdue.task.id,deps);
 assert.equal(archived.archived,true);
});
test('T004 tareas: con tenant_notifications existente, el aviso se crea una sola vez',async()=>{
 const fake=createP1aFakeDb({notificationsTable:true}),deps=p1aDeps(fake);
 await createTask(token,slug,{title:'Vencida',assigneeUserId:member,dueOn:yesterday()},deps);
 const first=await listTasks(token,slug,{},deps);
 assert.equal(first.notifications.created,1);
 assert.equal(fake.tables.notifications.length,1);
 assert.equal(fake.tables.notifications[0].user_id,member);
 const second=await listTasks(token,slug,{},deps);
 assert.equal(second.notifications.attempted,0);
 assert.equal(second.notifications.created,0);
 assert.equal(fake.tables.notifications.length,1);
});
test('T007 formularios: constructor, respuestas validadas, listado y CSV',async()=>{
 const fake=createP1aFakeDb(),deps=p1aDeps(fake);
 const form=await createForm(token,slug,{title:'Encuesta',description:'',fields:[
  {key:'nombre',label:'Nombre',type:'text',required:true},
  {key:'nivel',label:'Nivel',type:'select',options:['Bajo','Alto']},
  {key:'acepto',label:'Acepto',type:'checkbox'}]},deps);
 assert.equal(form.form.fields.length,3);
 const sub=await submitForm(token,slug,form.form.id,{nombre:'Ana',nivel:'Alto',acepto:true},deps);
 assert.equal(sub.submission.answers.nombre,'Ana');
 await assert.rejects(()=>submitForm(token,slug,form.form.id,{nivel:'Alto'},deps),/Invalid form submission/);
 await assert.rejects(()=>submitForm(token,slug,form.form.id,{nombre:'Ana',nivel:'Medio'},deps),/Invalid form submission/);
 const listed=await listSubmissions(token,slug,form.form.id,deps);
 assert.equal(listed.submissions.length,1);
 assert.equal(listed.submissions[0].submittedByEmail,'duena@ejemplo.mx');
 const exported=await exportSubmissionsCsv(token,slug,form.form.id,deps);
 assert.match(exported.filename,/hubie-formulario-.*-respuestas\.csv/);
 assert.match(exported.csv,/Nombre,Nivel,Acepto/);
 assert.match(exported.csv,/Ana,Alto,Sí/);
 assert.equal((await listForms(token,slug,deps)).forms[0].submissions,1);
});
test('C008 dashboard: métricas reales, meta mensual y serie de 12 semanas',async()=>{
 const month='2026-11';
 const monday='2026-11-09',tuesday='2026-11-10',today='2026-11-13';
 const now=new Date('2026-11-13T12:00:00Z');
 const fake=createP1aFakeDb({
  clients:[{organization_id:org,status:'active'},{organization_id:org,status:'active'},{organization_id:org,status:'inactive'}],
  quotes:[{organization_id:org,status:'draft',total_cents:100000,created_at:monday+'T10:00:00.000Z'},
   {organization_id:org,status:'accepted',total_cents:999000,created_at:monday+'T10:00:00.000Z'}],
  payments:[{organization_id:org,amount_cents:60000,paid_on:monday},
   {organization_id:org,amount_cents:40000,paid_on:tuesday}],
  expenses:[{organization_id:org,amount_cents:15000,occurred_on:month+'-03'}],
  events:[{organization_id:org,status:'scheduled',starts_at:today+'T10:00:00.000Z'},
   {organization_id:org,status:'cancelled',starts_at:today+'T11:00:00.000Z'}],
  items:[{organization_id:org,quantity:1,low_stock:5},{organization_id:org,quantity:10,low_stock:2}],
  variants:[{organization_id:org,quantity:0,low_stock:1}],
  dashboard_goals:[{organization_id:org,month,target_cents:200000}]
 }),deps=p1aDeps(fake);
 const dash=await getDashboard(token,slug,{from:month+'-01',to:month+'-28'},deps,now);
 assert.equal(dash.metrics.activeClients,2);
 assert.equal(dash.metrics.openQuotes,1);
 assert.equal(dash.metrics.openQuotesCents,100000);
 assert.equal(dash.metrics.paymentsCents,100000);
 assert.equal(dash.metrics.paymentsCount,2);
 assert.equal(dash.metrics.expensesCents,15000);
 assert.equal(dash.metrics.appointmentsToday,1);
 assert.equal(dash.metrics.lowStockItems,2);
 assert.deepEqual(dash.goal,{month,targetCents:200000,actualCents:100000,percent:50,remainingCents:100000});
 assert.equal(dash.series.length,12);
 assert.match(dash.chartSvg,/^<svg /);
 assert.equal(dash.series[11].quotesCreated,2);
 assert.equal(dash.series[11].paymentsCents,100000);
 const filtered=await getDashboard(token,slug,{from:month+'-01',to:month+'-28',module:'C004'},deps,now);
 assert.equal(filtered.metrics.appointmentsToday,1);
 assert.equal(filtered.metrics.activeClients,undefined);
 const saved=await setDashboardGoal(token,slug,{month,targetCents:300000},deps);
 assert.equal(saved.goal.targetCents,300000);
 assert.equal((await listDashboardGoals(token,slug,deps)).goals[0].targetCents,300000);
});
