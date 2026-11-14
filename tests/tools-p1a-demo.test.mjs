import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoStore} from '../assets/demo-backend.js';
import {catalog} from '../platform/catalog.mjs';

const ownerId='33333333-3333-4333-8333-333333333333';
async function p1aTenant(demo){
 const created=await demo.request('/api/admin/tenants',{method:'POST',body:JSON.stringify({
  name:'Comercio P1-A',slug:'comercio-p1a',suiteId:'S004',
  toolIds:[...catalog.tools.filter(t=>t.included).map(t=>t.id),'T003','T004','T007']})});
 return created.tenant.slug;
}
const req=(demo,path,body,method='POST')=>demo.request(path,{method,body:JSON.stringify(body)});

test('demo T003: plantilla, checklist desde plantilla, verificación y progreso',async()=>{
 const demo=createDemoStore(catalog),slug=await p1aTenant(demo);
 const base='/api/app/'+slug+'/workflows/checklists';
 const tpl=await req(demo,base+'/templates',{title:'Cierre',items:['Contar caja','Apagar luces']});
 assert.equal(tpl.template.items.length,2);
 const created=await req(demo,base,{title:'Cierre viernes',templateId:tpl.template.id});
 assert.equal(created.checklist.items.length,2);
 const first=created.checklist.items[0].id,second=created.checklist.items[1].id;
 const toggled=await req(demo,base+'/'+created.checklist.id+'/items/'+first,{checked:true},'PATCH');
 assert.equal(toggled.progress.percent,50);
 await req(demo,base+'/'+created.checklist.id+'/items/'+second,{checked:true},'PATCH');
 const listed=await demo.request(base);
 assert.equal(listed.checklists[0].status,'completed');
 assert.equal(listed.checklists[0].progress.percent,100);
});
test('demo T004: tarea con responsable y vencimiento, filtro por vencidas',async()=>{
 const demo=createDemoStore(catalog),slug=await p1aTenant(demo);
 const base='/api/app/'+slug+'/workflows/tasks';
 const past=new Date(Date.now()-86400000).toISOString().slice(0,10);
 const task=await req(demo,base,{title:'Llamar proveedor',assigneeUserId:ownerId,dueOn:past,priority:'high'});
 assert.equal(task.task.assigneeEmail,'superadmin@ejemplo.invalid');
 const overdue=await demo.request(base+'?overdue=1');
 assert.equal(overdue.tasks.length,1);
 assert.equal(overdue.overdueCount,1);
 await req(demo,base+'/'+task.task.id,{status:'done'},'PATCH');
 assert.equal((await demo.request(base+'?overdue=1')).tasks.length,0);
 await assert.rejects(()=>req(demo,base,{title:'Mala',assigneeUserId:'00000000-0000-4000-8000-000000000000'}),/Assignee not found/);
});
test('demo T007: formulario, respuesta validada y exportación CSV',async()=>{
 const demo=createDemoStore(catalog),slug=await p1aTenant(demo);
 const base='/api/app/'+slug+'/workflows/forms';
 const form=await req(demo,base,{title:'Encuesta',fields:[
  {key:'nombre',label:'Nombre',type:'text',required:true},
  {key:'nivel',label:'Nivel',type:'select',options:['Bajo','Alto']}]});
 const sub=await req(demo,base+'/'+form.form.id+'/submissions',{nombre:'Ana',nivel:'Alto'});
 assert.equal(sub.submission.answers.nombre,'Ana');
 await assert.rejects(()=>req(demo,base+'/'+form.form.id+'/submissions',{nivel:'Alto'}),/Invalid form submission/);
 const exported=await demo.request(base+'/'+form.form.id+'/submissions/export');
 assert.match(exported.filename,/respuestas\.csv/);
 assert.match(exported.csv,/Nombre,Nivel/);
 assert.match(exported.csv,/Ana,Alto/);
});
test('demo C008 + C004 + C005: dashboard, cita con responsable y variante de inventario',async()=>{
 const demo=createDemoStore(catalog),slug=await p1aTenant(demo);
 const dash=await demo.request('/api/app/'+slug+'/workflows/dashboard');
 assert.equal(dash.dashboard,true);
 assert.equal(dash.series.length,12);
 assert.equal(typeof dash.metrics.activeClients,'number');
 assert.equal(typeof dash.metrics.lowStockItems,'number');
 const agenda=await req(demo,'/api/app/'+slug+'/workflows/agenda',{
  title:'Reunión demo',startsAt:'2026-11-16T15:00:00.000Z',endsAt:'2026-11-16T15:30:00.000Z',
  resource:'sala-1',status:'confirmed',assigneeUserId:ownerId,remindMinutesBefore:30});
 assert.equal(agenda.event.status,'confirmed');
 assert.equal(agenda.event.assigneeUserId,ownerId);
 const day=await demo.request('/api/app/'+slug+'/workflows/agenda?view=day&date=2026-11-16');
 assert.equal(day.events.length,1);
 assert.equal(day.members[0].email,'superadmin@ejemplo.invalid');
 assert.equal(day.externalCalendars.status,'pending');
 const inv0=await demo.request('/api/app/'+slug+'/workflows/inventory');
 assert.equal(inv0.items.length,0);
 const created=await req(demo,'/api/app/'+slug+'/workflows/inventory',
  {sku:'DEMO-001',title:'Producto de muestra',location:'Almacén ficticio',lowStock:3,
   variants:[{label:'Talla M · Rojo',sku:'DEMO-001-M-R',warehouse:'Almacén ficticio',lot:'LOTE-1',supplier:'Proveedor ficticio',lowStock:2}]});
 assert.equal(created.item.sku,'DEMO-001');
 const inv=await demo.request('/api/app/'+slug+'/workflows/inventory');
 const item=inv.items[0];
 assert.equal(item.variants.length,1);
 assert.equal(item.variants[0].supplier,'Proveedor ficticio');
 const variant=await req(demo,'/api/app/'+slug+'/workflows/inventory/'+item.id+'/variants',
  {label:'Talla L · Azul',sku:'DEMO-001-L-A',warehouse:'Almacén ficticio',supplier:'Proveedor ficticio'});
 assert.equal(variant.variant.sku,'DEMO-001-L-A');
 const moved=await req(demo,'/api/app/'+slug+'/workflows/inventory/'+item.id+'/movements',
  {delta:2,note:'Entrada demo',variantId:variant.variant.id});
 assert.equal(moved.movement.variantId,variant.variant.id);
 const after=await demo.request('/api/app/'+slug+'/workflows/inventory');
 assert.equal(after.items[0].variants.find(v=>v.id===variant.variant.id).quantity,2);
});
