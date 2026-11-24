import test from 'node:test';
import assert from 'node:assert/strict';
import {createEmployeesFakeDb,employeesDeps} from './employees-fake-db.mjs';
import {listEmployees,getEmployee,createEmployee,updateEmployee,setEmployeeStatus,
 listDocuments,createDocument,deleteDocument,dashboard} from '../platform/employees-store.mjs';
import {createEmployee as createTrainingEmployee,listEmployees as listTrainingEmployees} from '../platform/training-store.mjs';

const token='<redacted>',slug='demo',otherSlug='demo-b';
const setup=()=>{const fake=createEmployeesFakeDb();return {fake,deps:employeesDeps(fake)};};
const employeeInput=(over={})=>({name:'María López',email:'maria@empresa.mx',position:'Operaria',area:'Almacén',
 fechaIngreso:'2026-01-15',tipoContrato:'indefinido',salarioMensualCents:1200000,estado:'activo',...over});

test('empleados: crear con campos RH, listar con contadores, actualizar y cambiar estado',async()=>{
 const {deps}=setup();
 const created=await createEmployee(token,slug,{name:'Juan Pérez',email:'juan@empresa.mx'},deps);
 assert.equal(created.employee.estado,'activo');
 assert.equal(created.employee.fechaIngreso,null);
 assert.equal(created.employee.salarioMensualCents,null);
 const full=await createEmployee(token,slug,employeeInput(),deps);
 assert.equal(full.employee.tipoContrato,'indefinido');
 assert.equal(full.employee.salarioMensualCents,1200000);
 assert.equal((await listEmployees(token,slug,{},deps)).employees.length,2);
 assert.equal((await listEmployees(token,slug,{estado:'activo'},deps)).employees.length,2);
 assert.equal((await listEmployees(token,slug,{search:'maria'},deps)).employees[0].email,'maria@empresa.mx');
 assert.equal((await listEmployees(token,slug,{search:'maria'},deps)).employees[0].documents,0);
 const updated=await updateEmployee(token,slug,full.employee.id,{salarioMensualCents:1350000,position:'Supervisora'},deps);
 assert.equal(updated.employee.salarioMensualCents,1350000);
 assert.equal(updated.employee.position,'Supervisora');
 assert.equal(updated.employee.email,'maria@empresa.mx');
 const off=await setEmployeeStatus(token,slug,full.employee.id,{estado:'inactivo'},deps);
 assert.equal(off.estado,'inactivo');
 assert.equal((await listEmployees(token,slug,{estado:'activo'},deps)).employees.length,1);
 assert.equal((await listEmployees(token,slug,{estado:'inactivo'},deps)).employees.length,1);
 await assert.rejects(()=>createEmployee(token,slug,employeeInput({tipoContrato:'vitalicio'}),deps),/Invalid employee/);
 await assert.rejects(()=>createEmployee(token,slug,employeeInput({salarioMensualCents:-5}),deps),/Invalid employee/);
 await assert.rejects(()=>createEmployee(token,slug,employeeInput({fechaIngreso:'15-01-2026'}),deps),/Invalid employee/);
 await assert.rejects(()=>setEmployeeStatus(token,slug,full.employee.id,{estado:'despedido'},deps),/Invalid employee/);
 await assert.rejects(()=>updateEmployee(token,slug,'00000000-0000-4000-8000-000000000000',{position:'X'},deps),/Not found/);
 await assert.rejects(()=>listEmployees('bad-token',slug,{},deps),/Unauthorized/);
});

test('empleados: correo duplicado por tenant y mismo correo en otro tenant',async()=>{
 const {fake,deps}=setup();
 await createEmployee(token,slug,employeeInput({email:'  MARIA@Empresa.MX '}),deps);
 await assert.rejects(()=>createEmployee(token,slug,employeeInput(),deps),/Duplicate employee email/);
 const other=await createEmployee(token,otherSlug,employeeInput(),deps);
 assert.equal(other.employee.email,'maria@empresa.mx');
 assert.equal((await listEmployees(token,slug,{},deps)).employees.length,1);
 assert.equal((await listEmployees(token,otherSlug,{},deps)).employees.length,1);
 const second=(await createEmployee(token,slug,employeeInput({name:'Juan Pérez',email:'juan@empresa.mx'}),deps)).employee;
 await assert.rejects(()=>updateEmployee(token,slug,second.id,{email:'maria@empresa.mx'},deps),/Duplicate employee email/);
 assert.equal(fake.tables.employees.length,3);
});

test('empleados: la tabla es la misma de T022 — creado en T022 aparece en T026 y viceversa',async()=>{
 const {fake,deps}=setup();
 // Alta por el store de T022 (sin columnas nuevas): aparece en T026 con defaults.
 const t022deps=employeesDeps(fake,{userId:fake.ownerId,role:'owner'},'T022');
 const fromTraining=await createTrainingEmployee(token,slug,{name:'Ana Ruiz',email:'ana@empresa.mx',position:'Cajera',area:'Ventas'},t022deps);
 assert.equal(fromTraining.employee.email,'ana@empresa.mx');
 const listed=await listEmployees(token,slug,{},deps);
 assert.equal(listed.employees.length,1);
 assert.equal(listed.employees[0].estado,'activo');
 assert.equal(listed.employees[0].salarioMensualCents,null);
 // Alta por T026 con salario: el listado de T022 la ve (mismos id/correo).
 const fromHr=await createEmployee(token,slug,employeeInput(),deps);
 const trainingList=await listTrainingEmployees(token,slug,t022deps);
 assert.equal(trainingList.employees.length,2);
 assert.ok(trainingList.employees.some(e=>e.id===fromHr.employee.id));
 // Y un empleado T026 inactivo sigue existiendo para T022 (sin filtro de estado allí).
 await setEmployeeStatus(token,slug,fromHr.employee.id,{estado:'inactivo'},deps);
 assert.equal((await listTrainingEmployees(token,slug,t022deps)).employees.length,2);
});

test('documentos: solo metadatos, crear/listar por empleado y eliminar',async()=>{
 const {deps}=setup();
 const emp=(await createEmployee(token,slug,employeeInput(),deps)).employee;
 const doc=(await createDocument(token,slug,{employeeId:emp.id,tipo:'contrato',nombre:'Contrato indefinido 2026.pdf',fecha:'2026-01-15',notas:'Firmado en original'},deps)).document;
 assert.equal(doc.tipo,'contrato');
 assert.equal((await listDocuments(token,slug,{employeeId:emp.id},deps)).documents.length,1);
 assert.equal((await listDocuments(token,slug,{},deps)).documents[0].employeeName,'María López');
 const got=await getEmployee(token,slug,emp.id,deps);
 assert.equal(got.documents.length,1);
 await createDocument(token,slug,{employeeId:emp.id,tipo:'identificación',nombre:'INE frente.jpg',fecha:null,notas:''},deps);
 assert.equal((await getEmployee(token,slug,emp.id,deps)).documents.length,2);
 assert.equal((await listEmployees(token,slug,{},deps)).employees[0].documents,2);
 await assert.rejects(()=>createDocument(token,slug,{employeeId:emp.id,tipo:'pasaporte',nombre:'Doc',fecha:null,notas:''},deps),/Invalid document/);
 await assert.rejects(()=>createDocument(token,slug,{employeeId:'00000000-0000-4000-8000-000000000000',tipo:'otro',nombre:'Doc',fecha:null,notas:''},deps),/Not found/);
 assert.deepEqual(await deleteDocument(token,slug,doc.id,deps),{ok:true});
 assert.equal((await listDocuments(token,slug,{employeeId:emp.id},deps)).documents.length,1);
 await assert.rejects(()=>deleteDocument(token,slug,doc.id,deps),/Not found/);
});

test('tablero: KPIs, ingresos por mes, actividad por empleado y equipo (composición ref. Health)',async()=>{
 const {fake,deps}=setup();
 const now=new Date('2026-11-16T12:00:00.000Z');
 const a=(await createEmployee(token,slug,employeeInput({fechaIngreso:'2026-08-10'}),deps)).employee;
 const b=(await createEmployee(token,slug,employeeInput({name:'Juan Pérez',email:'juan@empresa.mx',fechaIngreso:'2026-11-02',salarioMensualCents:null}),deps)).employee;
 await createEmployee(token,slug,employeeInput({name:'Luis Gómez',email:'luis@empresa.mx',fechaIngreso:null,salarioMensualCents:null}),deps);
 // Datos de asistencia/vacaciones para el tablero (tablas de T027).
 fake.tables.workdays.push(
  {organization_id:fake.orgA,id:'w1',employee_id:a.id,fecha:'2026-11-16',entrada:'09:00',salida:'18:00',notas:'',created_at:'2026-11-16T00:00:00Z'},
  {organization_id:fake.orgA,id:'w2',employee_id:a.id,fecha:'2026-11-15',entrada:'09:00',salida:'18:00',notas:'',created_at:'2026-11-15T00:00:00Z'},
  {organization_id:fake.orgA,id:'w3',employee_id:b.id,fecha:'2026-11-16',entrada:'08:00',salida:'17:00',notas:'',created_at:'2026-11-16T00:00:00Z'});
 fake.tables.requests.push(
  {organization_id:fake.orgA,id:'r1',employee_id:a.id,tipo:'vacaciones',fecha_inicio:'2026-12-20',fecha_fin:'2026-12-22',motivo:'Descanso',estado:'pendiente',created_at:'2026-11-16T00:00:00Z'});
 // Avance de capacitación de María: 1 inscripción con 80%.
 fake.tables.enrollments.push({organization_id:fake.orgA,id:'n1',employee_id:a.id,course_id:'c1',status:'en curso'});
 fake.tables.progress.push({organization_id:fake.orgA,id:'p1',enrollment_id:'n1',completed_modules:4,total_modules:5,percent:80});
 const dash=await dashboard(token,slug,deps,now);
 assert.equal(dash.kpis.total,3);
 assert.equal(dash.kpis.activos,3);
 assert.equal(dash.kpis.asistenciaHoy,2);
 assert.equal(dash.kpis.vacacionesPendientes,1);
 assert.equal(dash.kpis.conSalario,1);
 assert.deepEqual(dash.hiresByMonth,[{month:'2026-08',count:1},{month:'2026-11',count:1}]);
 assert.equal(dash.activity.length,3);
 const maria=dash.activity.find(x=>x.employeeId===a.id);
 assert.equal(maria.trainingProgress,80);
 assert.equal(maria.workdaysThisMonth,2);
 assert.equal(maria.attendanceMonthPct,13); // 2 de 16 días transcurridos
 const juan=dash.activity.find(x=>x.employeeId===b.id);
 assert.equal(juan.trainingProgress,null);
 assert.equal(juan.workdaysThisMonth,1);
 assert.equal(dash.team.length,3);
 assert.equal(dash.team[0].estado,'activo');
});
