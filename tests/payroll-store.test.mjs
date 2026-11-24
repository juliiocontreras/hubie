import test from 'node:test';
import assert from 'node:assert/strict';
import {createPayrollFakeDb,payrollDeps} from './payroll-fake-db.mjs';
import {listPeriods,createPeriod,listConcepts,createConcept,updateConcept,deleteConcept,
 calculatePayroll,markPeriodPaid,listReceipts,getReceipt,dashboard} from '../platform/payroll-store.mjs';

const token='<redacted>',slug='demo',otherSlug='demo-b';
const setup=()=>{const fake=createPayrollFakeDb();return {fake,deps:payrollDeps(fake)};};
const seedEmployee=(fake,org,over={})=>{const e={id:over.id||'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 name:'María López',email:'maria@empresa.mx',position:'Operaria',area:'Almacén',estado:'activo',
 salario_mensual_cents:1200000,organization_id:org,created_at:'2026-01-01T00:00:00Z',...over};
 fake.tables.employees.push(e);return e;};
const seedEmployees=fake=>{
 const maria=seedEmployee(fake,fake.orgA);
 const juan=seedEmployee(fake,fake.orgA,{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',name:'Juan Pérez',email:'juan@empresa.mx',salario_mensual_cents:2000000});
 const sinSalario=seedEmployee(fake,fake.orgA,{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',name:'Luis Gómez',email:'luis@empresa.mx',salario_mensual_cents:null});
 const inactivo=seedEmployee(fake,fake.orgA,{id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',name:'Ana Ruiz',email:'ana@empresa.mx',estado:'inactivo',salario_mensual_cents:1500000});
 return {maria,juan,sinSalario,inactivo};
};
const period=(over={})=>({tipo:'mensual',fechaInicio:'2026-11-01',fechaFin:'2026-11-30',...over});
const concept=(over={})=>({nombre:'Bono de puntualidad',tipo:'percepcion',modo:'fijo',montoCents:50000,porcentaje:null,activo:true,...over});

test('periodos: crear, duplicado por tipo+inicio y listado con totales',async()=>{
 const {deps}=setup();
 const p=(await createPeriod(token,slug,period(),deps)).period;
 assert.equal(p.estado,'borrador');
 assert.equal((await listPeriods(token,slug,deps)).periods.length,1);
 await assert.rejects(()=>createPeriod(token,slug,period(),deps),/Duplicate period/);
 // Otro tipo en las mismas fechas sí vale.
 const q=(await createPeriod(token,slug,period({tipo:'quincenal',fechaFin:'2026-11-15'}),deps)).period;
 assert.equal(q.tipo,'quincenal');
 assert.equal((await listPeriods(token,slug,deps)).periods.length,2);
 await assert.rejects(()=>createPeriod(token,slug,period({fechaInicio:'2026-11-30',fechaFin:'2026-11-01'}),deps),/Invalid period/);
 await assert.rejects(()=>createPeriod(token,slug,period({tipo:'semanal'}),deps),/Invalid period/);
 await assert.rejects(()=>listPeriods('bad-token',slug,deps),/Unauthorized/);
});

test('conceptos: fijo y porcentaje, actualizar y no borrar si ya se usó',async()=>{
 const {deps}=setup();
 const fijo=(await createConcept(token,slug,concept(),deps)).concept;
 const pct=(await createConcept(token,slug,{nombre:'ISR (ejemplo)',tipo:'deduccion',modo:'porcentaje',montoCents:null,porcentaje:10},deps)).concept;
 assert.equal(pct.montoCents,null);
 assert.equal((await listConcepts(token,slug,{},deps)).concepts.length,2);
 const updated=await updateConcept(token,slug,fijo.id,{montoCents:75000},deps);
 assert.equal(updated.concept.montoCents,75000);
 assert.equal(updated.concept.nombre,'Bono de puntualidad');
 await assert.rejects(()=>createConcept(token,slug,concept({modo:'porcentaje',montoCents:100,porcentaje:null}),deps),/Invalid concept/);
 await assert.rejects(()=>createConcept(token,slug,concept({porcentaje:101,modo:'porcentaje',montoCents:null}),deps),/Invalid concept/);
 await assert.rejects(()=>createConcept(token,slug,concept({nombre:'X'}),deps),/Invalid concept/);
 assert.deepEqual(await deleteConcept(token,slug,pct.id,deps),{ok:true});
 assert.equal((await listConcepts(token,slug,{},deps)).concepts.length,1);
 await assert.rejects(()=>deleteConcept(token,slug,pct.id,deps),/Not found/);
});

test('cálculo: base mensual/quincenal desde T026, fijo + porcentaje, neto en servidor',async()=>{
 const {deps,fake}=setup();
 const {maria,juan,sinSalario,inactivo}=seedEmployees(fake);
 await createConcept(token,slug,concept(),deps); // +$500 fijo
 await createConcept(token,slug,{nombre:'Vales de despensa',tipo:'percepcion',modo:'porcentaje',montoCents:null,porcentaje:5},deps); // +5%
 await createConcept(token,slug,{nombre:'Préstamo',tipo:'deduccion',modo:'fijo',montoCents:20000,porcentaje:null},deps); // -$200
 const p=(await createPeriod(token,slug,period(),deps)).period;
 const out=await calculatePayroll(token,slug,p.id,deps);
 assert.equal(out.period.estado,'calculado');
 assert.equal(out.receipts.length,2);
 assert.deepEqual(out.skipped,[{employeeId:sinSalario.id,employeeName:'Luis Gómez',reason:'sin salario'}]);
 assert.ok(!out.receipts.some(r=>r.employeeId===inactivo.id),'inactivo no entra');
 const rMaria=out.receipts.find(r=>r.employeeId===maria.id);
 assert.equal(rMaria.salarioBaseCents,1200000);
 assert.equal(rMaria.percepcionesCents,50000+60000); // fijo + 5% de 12000
 assert.equal(rMaria.deduccionesCents,20000);
 assert.equal(rMaria.netoCents,1200000+110000-20000);
 const listed=await listReceipts(token,slug,{periodId:p.id},deps);
 assert.equal(listed.receipts.length,2);
 const detail=listed.receipts.find(r=>r.employeeId===juan.id);
 assert.equal(detail.salarioBaseCents,2000000);
 assert.equal(detail.netoCents,2000000+50000+100000-20000);
 assert.equal(detail.items.length,3);
 assert.deepEqual(detail.items.map(i=>i.nombre).sort(),['Bono de puntualidad','Préstamo','Vales de despensa']);
 const one=await getReceipt(token,slug,detail.id,deps);
 assert.equal(one.receipt.employeeName,'Juan Pérez');
 assert.equal(one.receipt.periodTipo,'mensual');
 // Recalcular un periodo calculado: bloqueado.
 await assert.rejects(()=>calculatePayroll(token,slug,p.id,deps),/Invalid period/);
 // Quincenal: la base es la mitad del mensual.
 const q=(await createPeriod(token,slug,period({tipo:'quincenal',fechaInicio:'2026-11-16',fechaFin:'2026-11-30'}),deps)).period;
 const outQ=await calculatePayroll(token,slug,q.id,deps);
 assert.equal(outQ.receipts.find(r=>r.employeeId===maria.id).salarioBaseCents,600000);
 assert.equal(outQ.receipts.find(r=>r.employeeId===maria.id).netoCents,600000+50000+30000-20000);
});

test('pago: solo desde calculado, marca recibos y periodo como pagado',async()=>{
 const {deps,fake}=setup();
 seedEmployees(fake);
 const p=(await createPeriod(token,slug,period(),deps)).period;
 await assert.rejects(()=>markPeriodPaid(token,slug,p.id,deps),/Invalid period/);
 await calculatePayroll(token,slug,p.id,deps);
 const paid=await markPeriodPaid(token,slug,p.id,deps);
 assert.equal(paid.estado,'pagado');
 assert.equal(paid.receipts,2);
 assert.equal((await listReceipts(token,slug,{periodId:p.id},deps)).receipts[0].estado,'pagado');
 assert.equal((await listPeriods(token,slug,deps)).periods[0].estado,'pagado');
 await assert.rejects(()=>markPeriodPaid(token,slug,p.id,deps),/Invalid period/);
 await assert.rejects(()=>markPeriodPaid(token,slug,'00000000-0000-4000-8000-000000000000',deps),/Not found/);
});

test('concepto usado en recibos no se borra; aislamiento entre tenants y tablero',async()=>{
 const {deps,fake}=setup();
 const {maria}=seedEmployees(fake);
 seedEmployee(fake,fake.orgB,{id:'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',name:'Otra María',email:'otra@empresa.mx'});
 const c=(await createConcept(token,slug,concept(),deps)).concept;
 const p=(await createPeriod(token,slug,period(),deps)).period;
 await calculatePayroll(token,slug,p.id,deps);
 await assert.rejects(()=>deleteConcept(token,slug,c.id,deps),/Invalid concept/);
 assert.equal((await listPeriods(token,otherSlug,deps)).periods.length,0);
 assert.equal((await listReceipts(token,otherSlug,{},deps)).receipts.length,0);
 assert.equal((await listConcepts(token,otherSlug,{},deps)).concepts.length,0);
 const dash=await dashboard(token,slug,deps);
 assert.equal(dash.kpis.periods,1);
 assert.equal(dash.kpis.activeConcepts,1);
 assert.equal(dash.kpis.employeesWithSalary,2);
 assert.equal(dash.lastPeriod.id,p.id);
 assert.equal(dash.lastPeriod.totalNetoCents,1200000+50000+2000000+50000);
 assert.equal(dash.kpis.lastPeriodNetoCents,dash.lastPeriod.totalNetoCents);
 assert.deepEqual(await dashboard(token,otherSlug,deps),{kpis:{periods:0,activeConcepts:0,employeesWithSalary:1,lastPeriodNetoCents:0},lastPeriod:null});
});
