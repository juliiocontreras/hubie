import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAppointment,agendaRange,reminderNotifyAt,normalizeVariant,normalizeVariantUpdate,
 isVariantLow,isVariantExpired,isVariantExpiringSoon,normalizeChecklistTemplate,normalizeChecklist,
 normalizeChecklistItem,checklistProgress,normalizeTask,isTaskOverdue,taskDueBucket,
 normalizeCustomForm,validateFormSubmission,formSubmissionsCsv,normalizeDashboardGoal,
 normalizeDashboardQuery,weeklySeries,goalProgress,dashboardSvg,appointmentStatuses} from '../platform/tools-p1a-domain.mjs';

const memberId='33333333-3333-4333-8333-333333333333';
const appt={title:'Visita',startsAt:'2026-11-16T15:00:00.000Z',endsAt:'2026-11-16T15:30:00.000Z'};

test('C004 agenda: cita con responsable, estado confirmado y recordatorio',()=>{
 const e=normalizeAppointment({...appt,status:'confirmed',assigneeUserId:memberId,remindMinutesBefore:30});
 assert.equal(e.status,'confirmed');
 assert.equal(e.assigneeUserId,memberId);
 assert.equal(e.remindMinutesBefore,30);
 assert.deepEqual(appointmentStatuses,['scheduled','confirmed','completed','cancelled']);
 assert.throws(()=>normalizeAppointment({...appt,status:'nope'}),/Invalid appointment/);
 assert.throws(()=>normalizeAppointment({...appt,assigneeUserId:'no-es-uuid'}),/Invalid appointment/);
 assert.throws(()=>normalizeAppointment({...appt,remindMinutesBefore:20000}),/Invalid appointment/);
 assert.throws(()=>normalizeAppointment({...appt,remindMinutesBefore:-5}),/Invalid appointment/);
 assert.throws(()=>normalizeAppointment({...appt,endsAt:appt.startsAt}),/Invalid appointment/);
});
test('C004 agenda: vista por día y por semana (lunes a domingo)',()=>{
 assert.deepEqual(agendaRange('day','2026-11-13'),{from:'2026-11-13',to:'2026-11-13'});
 assert.deepEqual(agendaRange('week','2026-11-13'),{from:'2026-11-09',to:'2026-11-15'});
 assert.deepEqual(agendaRange('week','2026-11-09'),{from:'2026-11-09',to:'2026-11-15'});
 assert.deepEqual(agendaRange('list','2026-11-13'),{from:null,to:null});
 assert.equal(reminderNotifyAt('2026-11-16T15:00:00.000Z',30),'2026-11-16T14:30:00.000Z');
 assert.equal(reminderNotifyAt('2026-11-16T15:00:00.000Z',null),null);
});
test('C005 inventario: variante con SKU propio, almacén, lote, caducidad y proveedor',()=>{
 const v=normalizeVariant({label:'Talla M · Rojo',sku:' abc-1 ',warehouse:'Bodega A',lot:'L-9',expiresOn:'2027-01-31',supplier:'Proveedor MX',lowStock:2});
 assert.equal(v.sku,'ABC-1');
 assert.equal(v.warehouse,'Bodega A');
 assert.equal(v.supplier,'Proveedor MX');
 assert.deepEqual(normalizeVariant({label:'General'}),{label:'General',sku:null,warehouse:'',lot:'',expiresOn:null,supplier:'',lowStock:0});
 assert.throws(()=>normalizeVariant({label:'X'}),/Invalid inventory variant/);
 assert.throws(()=>normalizeVariant({label:'Talla',sku:'!'}),/Invalid inventory variant/);
 assert.throws(()=>normalizeVariant({label:'Talla',expiresOn:'2026-02-30'}),/Invalid inventory variant/);
 const updated=normalizeVariantUpdate({label:'Talla L',warehouse:'Bodega B',lot:'L-10',supplier:'Otro',lowStock:1});
 assert.equal(updated.label,'Talla L');
 assert.throws(()=>normalizeVariantUpdate({label:'Talla L',sku:'X-1'}),/Invalid inventory variant/);
 assert.equal(isVariantLow({quantity:2,lowStock:2}),true);
 assert.equal(isVariantLow({quantity:3,lowStock:2}),false);
 assert.equal(isVariantExpired({expiresOn:'2026-01-01'},new Date('2026-11-13T00:00:00Z')),true);
 assert.equal(isVariantExpired({expiresOn:null},new Date('2026-11-13T00:00:00Z')),false);
 assert.equal(isVariantExpiringSoon({expiresOn:'2026-11-20'},30,new Date('2026-11-13T00:00:00Z')),true);
 assert.equal(isVariantExpiringSoon({expiresOn:'2027-06-01'},30,new Date('2026-11-13T00:00:00Z')),false);
});
test('T003 checklists: plantillas, ítems verificables y progreso',()=>{
 const tpl=normalizeChecklistTemplate({title:'Apertura',description:'',items:['Abrir caja','Revisar']});
 assert.equal(tpl.items.length,2);
 assert.equal(tpl.items[1].position,1);
 assert.throws(()=>normalizeChecklistTemplate({title:'A',items:[]}),/Invalid checklist template/);
 assert.throws(()=>normalizeChecklistTemplate({title:'Apertura',items:['x']}),/Invalid checklist template/);
 const list=normalizeChecklist({title:'Lunes',items:[{title:'Abrir',assigneeUserId:memberId,dueOn:'2026-11-16'}]});
 assert.equal(list.items[0].assigneeUserId,memberId);
 assert.throws(()=>normalizeChecklist({title:'Lunes',items:[{title:'Abrir',dueOn:'16/11/2026'}]}),/Invalid checklist/);
 assert.deepEqual(checklistProgress([{checkedAt:null},{checkedAt:'2026-11-13T00:00:00.000Z'}]),{total:2,checked:1,percent:50,done:false});
 assert.deepEqual(checklistProgress([{checkedAt:'x'}]),{total:1,checked:1,percent:100,done:true});
 assert.deepEqual(checklistProgress([]),{total:0,checked:0,percent:0,done:false});
 const item=normalizeChecklistItem({title:'Verificar',assigneeUserId:memberId,dueOn:'2026-11-16'});
 assert.equal(item.evidenceMediaId,null);
 assert.throws(()=>normalizeChecklistItem({title:'Verificar',assigneeUserId:'zz'}),/Invalid checklist item/);
});
test('T004 tareas: responsable, vencimiento, estados y aviso al vencer',()=>{
 const t=normalizeTask({title:'Llamar',assigneeUserId:memberId,dueOn:'2026-11-14',priority:'high'});
 assert.equal(t.status,'pending');
 assert.equal(t.priority,'high');
 assert.throws(()=>normalizeTask({title:'Llamar',status:'hecha'}),/Invalid task/);
 assert.throws(()=>normalizeTask({title:'Llamar',dueOn:'14-11-2026'}),/Invalid task/);
 const now=new Date('2026-11-13T12:00:00Z');
 assert.equal(isTaskOverdue({dueOn:'2026-11-12',status:'pending'},now),true);
 assert.equal(isTaskOverdue({dueOn:'2026-11-12',status:'done'},now),false);
 assert.equal(isTaskOverdue({dueOn:'2026-11-13',status:'pending'},now),false);
 assert.equal(taskDueBucket({dueOn:'2026-11-12'},now),'overdue');
 assert.equal(taskDueBucket({dueOn:'2026-11-13'},now),'today');
 assert.equal(taskDueBucket({dueOn:'2026-11-18'},now),'week');
 assert.equal(taskDueBucket({dueOn:'2027-01-01'},now),'later');
 assert.equal(taskDueBucket({dueOn:null},now),'no-date');
});
test('T007 formularios: constructor, validación y CSV de respuestas',()=>{
 const form=normalizeCustomForm({title:'Encuesta',description:'',fields:[
  {key:'nombre',label:'Nombre',type:'text',required:true},
  {key:'edad',label:'Edad',type:'number'},
  {key:'fecha',label:'Fecha',type:'date'},
  {key:'nivel',label:'Nivel',type:'select',options:['Bajo','Alto']},
  {key:'acepto',label:'Acepto',type:'checkbox'}]});
 assert.equal(form.fields.length,5);
 assert.throws(()=>normalizeCustomForm({title:'X',fields:[{key:'a',label:'A',type:'text'},{key:'a',label:'B',type:'text'}]}),/Invalid form/);
 assert.throws(()=>normalizeCustomForm({title:'X',fields:[{key:'nivel',label:'Nivel',type:'select',options:['Solo']}]}),/Invalid form/);
 assert.throws(()=>normalizeCustomForm({title:'X',fields:[]}),/Invalid form/);
 const answers=validateFormSubmission(form,{nombre:' Ana ',edad:'33',fecha:'2026-11-13',nivel:'Alto',acepto:true});
 assert.deepEqual(answers,{nombre:'Ana',edad:33,fecha:'2026-11-13',nivel:'Alto',acepto:true});
 assert.throws(()=>validateFormSubmission(form,{edad:33}),/Invalid form submission/);
 assert.throws(()=>validateFormSubmission(form,{nombre:'Ana',nivel:'Medio'}),/Invalid form submission/);
 assert.throws(()=>validateFormSubmission(form,{nombre:'Ana',edad:'treinta'}),/Invalid form submission/);
 assert.throws(()=>validateFormSubmission(form,{nombre:'Ana',otro:1}),/Invalid form submission/);
 const csv=formSubmissionsCsv(form,[{createdAt:'2026-11-13T10:00:00.000Z',submittedBy:'duena@ejemplo.mx',answers}]);
 assert.match(csv,/Nombre,Edad,Fecha,Nivel,Acepto/);
 assert.match(csv,/Ana,33,2026-11-13,Alto,Sí/);
});
test('C008 dashboard: metas, filtros, series de 12 semanas y gráfica SVG',()=>{
 const goal=normalizeDashboardGoal({month:'2026-11',targetCents:500000});
 assert.equal(goal.targetCents,500000);
 assert.throws(()=>normalizeDashboardGoal({month:'2026-13',targetCents:1}),/Invalid dashboard goal/);
 assert.throws(()=>normalizeDashboardGoal({month:'2026-11',targetCents:-1}),/Invalid dashboard goal/);
 assert.deepEqual(normalizeDashboardQuery({from:'2026-11-01',to:'2026-11-30',module:'T013'}),
  {from:'2026-11-01',to:'2026-11-30',module:'T013'});
 assert.throws(()=>normalizeDashboardQuery({from:'2026-11-30',to:'2026-11-01'}),/Invalid dashboard query/);
 assert.throws(()=>normalizeDashboardQuery({module:'T999'}),/Invalid dashboard query/);
 const now=new Date('2026-11-13T12:00:00Z');
 const series=weeklySeries(
  [{createdAt:'2026-11-10T10:00:00.000Z'},{createdAt:'2026-11-11T10:00:00.000Z'},{createdAt:'2026-10-01T10:00:00.000Z'}],
  [{paidOn:'2026-11-10',amountCents:25000},{paidOn:'2026-09-01',amountCents:99999}],12,now);
 assert.equal(series.length,12);
 assert.equal(series[11].weekStart,'2026-11-09');
 assert.equal(series[11].quotesCreated,2);
 assert.equal(series[11].paymentsCents,25000);
 assert.equal(series[0].quotesCreated,0);
 assert.deepEqual(goalProgress(500000,250000),{targetCents:500000,actualCents:250000,percent:50,remainingCents:250000});
 assert.deepEqual(goalProgress(0,100),{targetCents:0,actualCents:100,percent:100,remainingCents:0});
 const svg=dashboardSvg(series);
 assert.match(svg,/^<svg /);
 assert.match(svg,/#7c5cfc/);
 assert.match(svg,/#ec4899/);
 assert.match(svg,/#16123a/);
 assert.doesNotMatch(svg,/https?:\/\/(?!www\.w3\.org)/);
 assert.doesNotMatch(svg,/<script/);
});
