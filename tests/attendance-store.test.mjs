import test from 'node:test';
import assert from 'node:assert/strict';
import {createAttendanceFakeDb,attendanceDeps} from './attendance-fake-db.mjs';
import {recordWorkday,listWorkdays,createRequest,listRequests,resolveRequest,
 vacationSummary,dashboard} from '../platform/attendance-store.mjs';

const token='<redacted>',slug='demo',otherSlug='demo-b';
const setup=()=>{const fake=createAttendanceFakeDb();return {fake,deps:attendanceDeps(fake)};};
const seedEmployee=(fake,org,over={})=>{const e={id:over.id||'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
 name:'María López',email:'maria@empresa.mx',position:'Operaria',area:'Almacén',estado:'activo',
 organization_id:org,created_at:'2026-01-01T00:00:00Z',...over};
 fake.tables.employees.push(e);return e;};
const seedEmployees=fake=>{
 const maria=seedEmployee(fake,fake.orgA);
 const juan=seedEmployee(fake,fake.orgA,{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',name:'Juan Pérez',email:'juan@empresa.mx'});
 return {maria,juan};
};
const workday=(employeeId,over={})=>({employeeId,fecha:'2026-11-16',entrada:'09:00',salida:'18:00',notas:'',...over});
const request=(employeeId,over={})=>({employeeId,tipo:'vacaciones',fechaInicio:'2026-12-20',fechaFin:'2026-12-22',motivo:'Descanso con familia',...over});

test('jornada: registrar, upsert por empleado+fecha, horas calculadas y listado',async()=>{
 const {deps,fake}=setup();
 const {maria,juan}=seedEmployees(fake);
 const first=await recordWorkday(token,slug,workday(maria.id),deps);
 assert.equal(first.workday.minutes,540);
 assert.equal((await listWorkdays(token,slug,{employeeId:maria.id},deps)).workdays.length,1);
 // Mismo día otra vez: actualiza, no duplica.
 const again=await recordWorkday(token,slug,workday(maria.id,{salida:'17:00',notas:'Salida temprana'}),deps);
 assert.equal(again.workday.id,first.workday.id);
 assert.equal(again.workday.minutes,480);
 assert.equal((await listWorkdays(token,slug,{employeeId:maria.id},deps)).workdays.length,1);
 await recordWorkday(token,slug,workday(juan.id,{fecha:'2026-11-16',entrada:'08:00',salida:'16:30'}),deps);
 assert.equal((await listWorkdays(token,slug,{from:'2026-11-16',to:'2026-11-16'},deps)).workdays.length,2);
 assert.equal((await listWorkdays(token,slug,{employeeId:juan.id},deps)).workdays[0].minutes,510);
 assert.equal((await listWorkdays(token,slug,{employeeId:juan.id},deps)).workdays[0].employeeName,'Juan Pérez');
 // Sin salida: minutos null, registro válido.
 const open=await recordWorkday(token,slug,workday(maria.id,{fecha:'2026-11-17',entrada:'09:00',salida:null}),deps);
 assert.equal(open.workday.minutes,null);
 await assert.rejects(()=>recordWorkday(token,slug,workday(maria.id,{entrada:'18:00',salida:'09:00'}),deps),/Invalid workday/);
 await assert.rejects(()=>recordWorkday(token,slug,workday(maria.id,{entrada:'9:00'}),deps),/Invalid workday/);
 await assert.rejects(()=>recordWorkday(token,slug,workday('00000000-0000-4000-8000-000000000000'),deps),/Not found/);
 await assert.rejects(()=>listWorkdays('bad-token',slug,{},deps),/Unauthorized/);
});

test('solicitudes: crear, listar por estado/tipo y días contados',async()=>{
 const {deps,fake}=setup();
 const {maria,juan}=seedEmployees(fake);
 const r1=(await createRequest(token,slug,request(maria.id),deps)).request;
 assert.equal(r1.estado,'pendiente');
 assert.equal(r1.days,3);
 const r2=(await createRequest(token,slug,request(juan.id,{tipo:'permiso',fechaInicio:'2026-11-20',fechaFin:'2026-11-20',motivo:'Trámite personal'}),deps)).request;
 assert.equal(r2.days,1);
 assert.equal((await listRequests(token,slug,{},deps)).requests.length,2);
 assert.equal((await listRequests(token,slug,{estado:'pendiente'},deps)).requests.length,2);
 assert.equal((await listRequests(token,slug,{tipo:'permiso'},deps)).requests[0].employeeName,'Juan Pérez');
 assert.equal((await listRequests(token,slug,{employeeId:maria.id},deps)).requests.length,1);
 await assert.rejects(()=>createRequest(token,slug,request(maria.id,{fechaInicio:'2026-12-22',fechaFin:'2026-12-20'}),deps),/Invalid request/);
 await assert.rejects(()=>createRequest(token,slug,request(maria.id,{tipo:'incapacidad'}),deps),/Invalid request/);
 await assert.rejects(()=>createRequest(token,slug,request(maria.id,{motivo:'X'}),deps),/Invalid request/);
 await assert.rejects(()=>createRequest(token,slug,request('00000000-0000-4000-8000-000000000000'),deps),/Not found/);
 assert.equal(r1.id.length,36);
});

test('resolución: solo dueño/admin aprueban o rechazan; viewer/member NO pueden',async()=>{
 const {fake,deps}=setup();
 const {maria}=seedEmployees(fake);
 const req=(await createRequest(token,slug,request(maria.id),deps)).request;
 // Member: pasa el control de escritura pero el rol lo bloquea.
 const memberDeps=attendanceDeps(fake,{userId:fake.memberId,role:'member'});
 await assert.rejects(()=>resolveRequest(token,slug,req.id,{estado:'aprobada'},memberDeps),/Forbidden/);
 // Viewer: también bloqueado por rol (en real, authorize ya lo deja fuera).
 const viewerDeps=attendanceDeps(fake,{userId:fake.viewerId,role:'viewer'});
 await assert.rejects(()=>resolveRequest(token,slug,req.id,{estado:'aprobada'},viewerDeps),/Forbidden/);
 // La solicitud sigue pendiente tras los dos intentos bloqueados.
 assert.equal((await listRequests(token,slug,{estado:'pendiente'},deps)).requests.length,1);
 // Admin sí puede aprobar.
 const adminDeps=attendanceDeps(fake,{userId:fake.ownerId,role:'admin'});
 const ok=await resolveRequest(token,slug,req.id,{estado:'aprobada'},adminDeps);
 assert.equal(ok.estado,'aprobada');
 assert.equal((await listRequests(token,slug,{estado:'aprobada'},deps)).requests[0].resueltaPor,fake.ownerId);
 // Ya resuelta: no se puede volver a resolver.
 await assert.rejects(()=>resolveRequest(token,slug,req.id,{estado:'rechazada'},deps),/Invalid request/);
 await assert.rejects(()=>resolveRequest(token,slug,'00000000-0000-4000-8000-000000000000',{estado:'aprobada'},deps),/Not found/);
 // El dueño rechaza otra solicitud.
 const req2=(await createRequest(token,slug,request(maria.id,{fechaInicio:'2026-12-28',fechaFin:'2026-12-29'}),deps)).request;
 assert.deepEqual(await resolveRequest(token,slug,req2.id,{estado:'rechazada'},deps),{ok:true,estado:'rechazada'});
});

test('resumen: días de vacaciones aprobados en el año por empleado, sin saldos inventados',async()=>{
 const {deps,fake}=setup();
 const {maria,juan}=seedEmployees(fake);
 const r1=(await createRequest(token,slug,request(maria.id),deps)).request;
 await resolveRequest(token,slug,r1.id,{estado:'aprobada'},deps);
 // Vacaciones que cruzan el año: solo cuentan los días dentro de 2026.
 const r2=(await createRequest(token,slug,request(maria.id,{fechaInicio:'2026-12-30',fechaFin:'2027-01-02'}),deps)).request;
 await resolveRequest(token,slug,r2.id,{estado:'aprobada'},deps);
 // Rechazada y permiso aprobado: no cuentan como vacaciones.
 const r3=(await createRequest(token,slug,request(juan.id,{fechaInicio:'2026-11-10',fechaFin:'2026-11-12'}),deps)).request;
 await resolveRequest(token,slug,r3.id,{estado:'rechazada'},deps);
 const r4=(await createRequest(token,slug,request(juan.id,{tipo:'permiso',fechaInicio:'2026-11-05',fechaFin:'2026-11-06',motivo:'Trámite'}),deps)).request;
 await resolveRequest(token,slug,r4.id,{estado:'aprobada'},deps);
 const summary=await vacationSummary(token,slug,{year:2026},deps);
 assert.equal(summary.year,2026);
 assert.equal(summary.employees.length,1);
 assert.equal(summary.employees[0].employeeName,'María López');
 assert.equal(summary.employees[0].days,5); // 3 + 2 de 2026
 assert.deepEqual(await vacationSummary(token,slug,{year:2027},deps),{year:2027,employees:[{employeeId:maria.id,employeeName:'María López',days:2}]});
 assert.deepEqual((await vacationSummary(token,slug,{year:2026,employeeId:juan.id},deps)).employees,[]);
 await assert.rejects(()=>vacationSummary(token,slug,{year:1999},deps),/Invalid request/);
});

test('aislamiento entre tenants y tablero',async()=>{
 const {deps,fake}=setup();
 const {maria}=seedEmployees(fake);
 seedEmployee(fake,fake.orgB,{id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',name:'Otra María',email:'otra@empresa.mx'});
 await recordWorkday(token,slug,workday(maria.id),deps);
 const req=(await createRequest(token,slug,request(maria.id),deps)).request;
 assert.equal((await listWorkdays(token,otherSlug,{},deps)).workdays.length,0);
 assert.equal((await listRequests(token,otherSlug,{},deps)).requests.length,0);
 await assert.rejects(()=>resolveRequest(token,otherSlug,req.id,{estado:'aprobada'},deps),/Not found/);
 const dash=await dashboard(token,slug,deps);
 assert.equal(dash.kpis.pendingRequests,1);
 assert.equal(dash.kpis.workdaysThisMonth,1);
 assert.equal(dash.kpis.activeEmployees,2);
 assert.equal(dash.kpis.approvedVacationDays,0);
 await resolveRequest(token,slug,req.id,{estado:'aprobada'},deps);
 const dash2=await dashboard(token,slug,deps);
 assert.equal(dash2.kpis.pendingRequests,0);
 assert.equal(dash2.kpis.approvedVacationDays,3);
});
