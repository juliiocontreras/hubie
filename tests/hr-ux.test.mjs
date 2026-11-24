import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const noEmoji=/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
const noTextIcon=/content:\s*['"][⌄∨▾v><]['"]/;

test('T026 UI: directorio con tablero héroe (ref. Health), ficha y documentos',async()=>{
 const ui=await readFile('assets/operational-employees.js','utf8');
 assert.match(ui,/export async function renderEmployees/);
 for(const tab of ['Tablero','Directorio','Documentos']){
  assert.ok(ui.includes("'"+tab+"'"),'falta pestaña '+tab);
 }
 assert.match(ui,/Registrar empleado/);
 assert.match(ui,/Registrar documento/);
 assert.match(ui,/Dar de baja/);
 assert.match(ui,/Resumen del equipo/);
 assert.match(ui,/Empleados activos/);
 assert.match(ui,/Asistencia hoy/);
 assert.match(ui,/Vacaciones pendientes/);
 assert.match(ui,/Avance de capacitación/);
 assert.match(ui,/Asistencia del mes/);
 assert.match(ui,/Equipo/);
 assert.match(ui,/areaChart/);
 assert.match(ui,/hr-hero/);
 assert.match(ui,/hr-progress/);
 assert.match(ui,/Solo se guardan los datos del documento/);
 for(const path of ["base+'/dashboard'","base+'/employees'","base+'/documents'","/documents'","/status'"]){
  assert.ok(ui.includes(path),'falta endpoint '+path);
 }
 assert.doesNotMatch(ui,noEmoji);
 assert.doesNotMatch(ui,noTextIcon);
 assert.match(ui,/Nunito/);
 assert.match(ui,/#16123a/);
 assert.doesNotMatch(ui,/#0000ff|#0000FF|blue/i);
});

test('T027 UI: jornada, solicitudes con aprobación solo dueño/admin y resumen',async()=>{
 const ui=await readFile('assets/operational-attendance.js','utf8');
 assert.match(ui,/export async function renderAttendance/);
 for(const tab of ['Jornada','Solicitudes','Resumen']){
  assert.ok(ui.includes("'"+tab+"'"),'falta pestaña '+tab);
 }
 assert.match(ui,/Registrar jornada/);
 assert.match(ui,/Enviar solicitud/);
 assert.match(ui,/Aprobar/);
 assert.match(ui,/Rechazar/);
 assert.match(ui,/canResolve/);
 assert.match(ui,/Vacaciones aprobadas en el año/);
 assert.match(ui,/No hay saldos ni políticas/);
 for(const path of ["base+'/workdays'","base+'/requests'","base+'/summary?year='","base+'/dashboard'","/resolve'"]){
  assert.ok(ui.includes(path),'falta endpoint '+path);
 }
 assert.doesNotMatch(ui,noEmoji);
 assert.doesNotMatch(ui,noTextIcon);
 assert.match(ui,/Nunito/);
 assert.match(ui,/#16123a/);
 assert.doesNotMatch(ui,/#0000ff|#0000FF|blue/i);
});

test('T031 UI: periodos, conceptos, recibos y límite honesto visible',async()=>{
 const ui=await readFile('assets/operational-payroll.js','utf8');
 assert.match(ui,/export async function renderPayroll/);
 for(const tab of ['Periodos','Conceptos','Recibos']){
  assert.ok(ui.includes("'"+tab+"'"),'falta pestaña '+tab);
 }
 assert.match(ui,/Crear periodo/);
 assert.match(ui,/Crear concepto/);
 assert.match(ui,/Calcular nómina/);
 assert.match(ui,/Marcar pagado/);
 assert.match(ui,/Ver detalle/);
 assert.match(ui,/Cálculo básico, sin timbrado CFDI de nómina ni cálculo real de IMSS\/ISR/);
 for(const path of ["base+'/periods'","base+'/concepts'","base+'/receipts?periodId='","base+'/dashboard'","/calculate'","/pay'"]){
  assert.ok(ui.includes(path),'falta endpoint '+path);
 }
 assert.doesNotMatch(ui,noEmoji);
 assert.doesNotMatch(ui,noTextIcon);
 assert.match(ui,/Nunito/);
 assert.match(ui,/#16123a/);
 assert.doesNotMatch(ui,/#0000ff|#0000FF|blue/i);
});

test('RH cableado: app-workflows, app-records, iconos, rutas y catálogo',async()=>{
 const workflows=await readFile('assets/app-workflows.js','utf8');
 assert.match(workflows,/key==='T026'\?renderEmployees/);
 assert.match(workflows,/key==='T027'\?renderAttendance/);
 assert.match(workflows,/key==='T031'\?renderPayroll/);
 assert.match(workflows,/from '\.\/operational-employees\.js'/);
 assert.match(workflows,/from '\.\/operational-attendance\.js'/);
 assert.match(workflows,/from '\.\/operational-payroll\.js'/);
 const records=await readFile('assets/app-records.js','utf8');
 assert.match(records,/'T026'/);
 assert.match(records,/'T027'/);
 assert.match(records,/'T031'/);
 const icons=await readFile('assets/ui-icons.js','utf8');
 assert.match(icons,/T026:'users'/);
 assert.match(icons,/T027:'calendar'/);
 assert.match(icons,/T031:'money'/);
 assert.doesNotMatch(icons,noEmoji);
 const server=await readFile('server.mjs','utf8');
 assert.ok(server.includes("/employees(?:\\/(.*))?"),'ruta base /employees/...');
 assert.ok(server.includes("/attendance(?:\\/(.*))?"),'ruta base /attendance/...');
 assert.ok(server.includes("/payroll(?:\\/(.*))?"),'ruta base /payroll/...');
 for(const segment of ["'dashboard'","'employees'","'documents'","'workdays'","'requests'","'resolve'","'summary'","'periods'","'concepts'","'receipts'","'calculate'","'pay'"]){
  assert.ok(server.includes(segment),'falta ruta RH '+segment);
 }
 assert.ok(server.includes("'031_employees.sql'"),'migración 031 no cableada');
 assert.ok(server.includes("'032_attendance.sql'"),'migración 032 no cableada');
 assert.ok(server.includes("'036_payroll.sql'"),'migración 036 no cableada');
 for(const asset of ['operational-employees.js','operational-attendance.js','operational-payroll.js']){
  assert.ok(server.includes(asset),'asset PWA no permitido: '+asset);
 }
 const catalog=JSON.parse(await readFile('assets/catalog.json','utf8'));
 for(const [id,name] of [['T026','Empleados'],['T027','Asistencia y vacaciones'],['T031','Nómina']]){
  const tool=catalog.tools.find(t=>t.id===id);
  assert.ok(tool,'falta '+id+' en catalog.json');
  assert.equal(tool.name,name);
  assert.equal(tool.group,'Recursos Humanos');
  assert.equal(tool.price,null);
  assert.equal(tool.pricing,'quote');
 }
 const css=await readFile('assets/pwa-refined.css','utf8');
 assert.match(css,/\.hr-hero-grid/,'falta layout héroe RH');
 assert.match(css,/\.hr-progress/,'falta barra de progreso RH');
});
