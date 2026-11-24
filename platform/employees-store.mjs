import {randomUUID} from 'node:crypto';
import {executeSql as realExecuteSql,executeBatch as realExecuteBatch} from '../database.mjs';
import {authorizeTool as realAuthorize} from './records.mjs';
import {normalizeEmployeeFull,normalizeDocument,normalizeEmployeeStatus} from './employees-domain.mjs';
// T026 Empleados: directorio de Recursos Humanos sobre la MISMA tabla de
// T022 (tenant_training_employees, migración 031). Los empleados creados en
// T022 aparecen aquí y viceversa; createEmployee de T022 no se toca (sus
// columnas nuevas van con defaults NULL).
// Patrón de inyección de dependencias como training-store: `deps` permite
// probar el store con una base falsa sin tocar Turso.
const depsOf=d=>({executeSql:d?.executeSql||realExecuteSql,executeBatch:d?.executeBatch||realExecuteBatch,authorize:d?.authorize||realAuthorize});
const rows=r=>r?.rows?.map(a=>a.map(c=>c?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validId(id,label){if(typeof id!=='string'||!uuid.test(id))throw Error(label);}
const num=v=>Number(v||0);
const EMPLOYEE_COLS='id,name,email,position,area,fecha_ingreso,tipo_contrato,salario_mensual_cents,estado,created_at,updated_at';
function employeeView(x){
 return {id:x[0],name:x[1],email:x[2],position:x[3],area:x[4],fechaIngreso:x[5],
  tipoContrato:x[6],salarioMensualCents:x[7]===null?null:num(x[7]),estado:x[8],createdAt:x[9],updatedAt:x[10]};
}
async function employeeFor(db,org,id){
 validId(id,'Invalid employee');
 const row=rows(await db.executeSql('SELECT '+EMPLOYEE_COLS+' FROM tenant_training_employees WHERE organization_id=? AND id=?',[org,id]))[0];
 if(!row)throw Error('Not found');
 return employeeView(row);
}
async function documentFor(db,org,id){
 validId(id,'Invalid document');
 const row=rows(await db.executeSql('SELECT id,employee_id,tipo,nombre,fecha,notas,created_at,updated_at FROM tenant_hr_documents WHERE organization_id=? AND id=?',[org,id]))[0];
 if(!row)throw Error('Not found');
 return {id:row[0],employeeId:row[1],tipo:row[2],nombre:row[3],fecha:row[4],notas:row[5],createdAt:row[6],updatedAt:row[7]};
}
export async function listEmployees(token,slug,{estado=null,search=null}={},deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T026');
 const conds=['e.organization_id=?'],args=[tenant.id];
 if(estado){if(!['activo','inactivo'].includes(estado))throw Error('Invalid employee');conds.push('e.estado=?');args.push(estado);}
 if(search){conds.push("(e.name LIKE ? OR e.email LIKE ? OR e.position LIKE ? OR e.area LIKE ?)");args.push('%'+search+'%','%'+search+'%','%'+search+'%','%'+search+'%');}
 const r=await db.executeSql(`SELECT e.${EMPLOYEE_COLS.split(',').join(',e.')},
  (SELECT COUNT(*) FROM tenant_hr_documents d WHERE d.organization_id=e.organization_id AND d.employee_id=e.id),
  (SELECT COUNT(*) FROM tenant_training_enrollments n WHERE n.organization_id=e.organization_id AND n.employee_id=e.id AND n.status!='cancelado')
  FROM tenant_training_employees e WHERE ${conds.join(' AND ')} ORDER BY e.name LIMIT 200`,args);
 return {employees:rows(r).map(x=>({...employeeView(x.slice(0,11)),documents:num(x[11]),enrollments:num(x[12])}))};
}
export async function getEmployee(token,slug,id,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T026');
 const employee=await employeeFor(db,tenant.id,id);
 const docs=await listDocuments(token,slug,{employeeId:id},deps);
 return {employee:{...employee,documents:docs.documents.length},documents:docs.documents};
}
export async function createEmployee(token,slug,input,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T026',true);
 const emp=normalizeEmployeeFull(input);
 const id=randomUUID();
 try{
  await db.executeSql('INSERT INTO tenant_training_employees(organization_id,id,name,email,position,area,fecha_ingreso,tipo_contrato,salario_mensual_cents,estado,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
   [tenant.id,id,emp.name,emp.email,emp.position,emp.area,emp.fechaIngreso,emp.tipoContrato,emp.salarioMensualCents,emp.estado,session.userId]);
 }catch(e){
  if(/UNIQUE constraint failed/i.test(e?.message||''))throw Error('Duplicate employee email');
  throw e;
 }
 return {employee:{id,...emp}};
}
export async function updateEmployee(token,slug,id,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T026',true);
 const current=await employeeFor(db,tenant.id,id);
 const base={name:current.name,email:current.email,position:current.position,area:current.area,
  fechaIngreso:current.fechaIngreso,tipoContrato:current.tipoContrato,
  salarioMensualCents:current.salarioMensualCents,estado:current.estado};
 const next=normalizeEmployeeFull({...base,...input});
 try{
  const r=await db.executeSql('UPDATE tenant_training_employees SET name=?,email=?,position=?,area=?,fecha_ingreso=?,tipo_contrato=?,salario_mensual_cents=?,estado=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',
   [next.name,next.email,next.position,next.area,next.fechaIngreso,next.tipoContrato,next.salarioMensualCents,next.estado,tenant.id,id]);
  if(!changed(r))throw Error('Not found');
 }catch(e){
  if(e?.message==='Not found')throw e;
  if(/UNIQUE constraint failed/i.test(e?.message||''))throw Error('Duplicate employee email');
  throw e;
 }
 return {employee:{id,...next}};
}
export async function setEmployeeStatus(token,slug,id,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T026',true);
 const {estado}=normalizeEmployeeStatus(input);
 validId(id,'Invalid employee');
 const r=await db.executeSql("UPDATE tenant_training_employees SET estado=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?",[estado,tenant.id,id]);
 if(!changed(r))throw Error('Not found');
 return {ok:true,estado};
}
// ---- Documentos (solo metadatos, sin subida de binarios) ----
export async function listDocuments(token,slug,{employeeId=null}={},deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T026');
 const conds=['d.organization_id=?'],args=[tenant.id];
 if(employeeId){await employeeFor(db,tenant.id,employeeId);conds.push('d.employee_id=?');args.push(employeeId);}
 const r=await db.executeSql(`SELECT d.id,d.employee_id,d.tipo,d.nombre,d.fecha,d.notas,d.created_at,e.name
  FROM tenant_hr_documents d JOIN tenant_training_employees e ON e.organization_id=d.organization_id AND e.id=d.employee_id
  WHERE ${conds.join(' AND ')} ORDER BY d.created_at DESC LIMIT 200`,args);
 return {documents:rows(r).map(x=>({id:x[0],employeeId:x[1],tipo:x[2],nombre:x[3],fecha:x[4],notas:x[5],createdAt:x[6],employeeName:x[7]}))};
}
export async function createDocument(token,slug,input,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T026',true);
 const data=normalizeDocument(input);
 await employeeFor(db,tenant.id,data.employeeId);
 const id=randomUUID();
 await db.executeSql('INSERT INTO tenant_hr_documents(organization_id,id,employee_id,tipo,nombre,fecha,notas,created_by) VALUES(?,?,?,?,?,?,?,?)',
  [tenant.id,id,data.employeeId,data.tipo,data.nombre,data.fecha,data.notas,session.userId]);
 return {document:{id,...data}};
}
export async function deleteDocument(token,slug,id,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T026',true);
 await documentFor(db,tenant.id,id);
 const r=await db.executeSql('DELETE FROM tenant_hr_documents WHERE organization_id=? AND id=?',[tenant.id,id]);
 if(!changed(r))throw Error('Not found');
 return {ok:true};
}
// ---- Tablero ----
// Composición de la referencia de Julio (dashboard fitness morado, suite
// Health): tarjeta héroe con gráfica de área (ingresos por mes, últimos 6
// meses) y 3 chips KPI dentro (empleados activos, asistencia hoy,
// vacaciones pendientes); tarjetas de actividad por empleado (avance de
// capacitación y asistencia del mes, con barra y %) y lista del equipo.
// La marca sigue siendo Hubie (Nunito, ink, gradiente morado-rosa); la
// referencia solo aporta composición y densidad.
export async function dashboard(token,slug,deps,now=new Date()){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T026');
 const org=tenant.id;
 const today=now.toISOString().slice(0,10),month=now.toISOString().slice(0,7);
 const daysElapsed=now.getUTCDate();
 const sinceMonth=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth()-5,1)).toISOString().slice(0,7)+'-01';
 const [total,activos,inactivos,conSalario,docs,asistenciaHoy,vacPendientes,hires,activeEmps]=await Promise.all([
  db.executeSql('SELECT COUNT(*) FROM tenant_training_employees WHERE organization_id=?',[org]),
  db.executeSql("SELECT COUNT(*) FROM tenant_training_employees WHERE organization_id=? AND estado='activo'",[org]),
  db.executeSql("SELECT COUNT(*) FROM tenant_training_employees WHERE organization_id=? AND estado='inactivo'",[org]),
  db.executeSql('SELECT COUNT(*) FROM tenant_training_employees WHERE organization_id=? AND salario_mensual_cents IS NOT NULL AND salario_mensual_cents>0',[org]),
  db.executeSql('SELECT COUNT(*) FROM tenant_hr_documents WHERE organization_id=?',[org]),
  db.executeSql('SELECT COUNT(*) FROM tenant_hr_attendance WHERE organization_id=? AND fecha=?',[org,today]),
  db.executeSql("SELECT COUNT(*) FROM tenant_hr_requests WHERE organization_id=? AND estado='pendiente'",[org]),
  db.executeSql('SELECT substr(fecha_ingreso,1,7),COUNT(*) FROM tenant_training_employees WHERE organization_id=? AND fecha_ingreso IS NOT NULL AND fecha_ingreso>=? GROUP BY substr(fecha_ingreso,1,7) ORDER BY substr(fecha_ingreso,1,7) ASC',[org,sinceMonth]),
  db.executeSql("SELECT id,name,position,area,estado FROM tenant_training_employees WHERE organization_id=? AND estado='activo' ORDER BY name LIMIT 12",[org])
 ]);
 const activity=[];
 for(const e of rows(activeEmps)){
  const [avg,days]=await Promise.all([
   db.executeSql(`SELECT AVG(p.percent) FROM tenant_training_progress p
    JOIN tenant_training_enrollments n ON n.organization_id=p.organization_id AND n.id=p.enrollment_id
    WHERE p.organization_id=? AND n.employee_id=? AND n.status IN ('inscrito','en curso','completado')`,[org,e[0]]),
   db.executeSql('SELECT COUNT(*) FROM tenant_hr_attendance WHERE organization_id=? AND employee_id=? AND substr(fecha,1,7)=?',[org,e[0],month])
  ]);
  const avgVal=rows(avg)[0]?.[0];
  const workdays=num(rows(days)[0]?.[0]);
  activity.push({employeeId:e[0],name:e[1],position:e[2],area:e[3],estado:e[4],
   trainingProgress:avgVal===null||avgVal===undefined?null:Math.round(num(avgVal)),
   workdaysThisMonth:workdays,
   attendanceMonthPct:Math.min(100,Math.round(100*workdays/Math.max(1,daysElapsed)))});
 }
 return {kpis:{total:num(rows(total)[0]?.[0]),activos:num(rows(activos)[0]?.[0]),
  inactivos:num(rows(inactivos)[0]?.[0]),conSalario:num(rows(conSalario)[0]?.[0]),documentos:num(rows(docs)[0]?.[0]),
  asistenciaHoy:num(rows(asistenciaHoy)[0]?.[0]),vacacionesPendientes:num(rows(vacPendientes)[0]?.[0])},
  hiresByMonth:rows(hires).map(x=>({month:x[0],count:num(x[1])})),
  activity,
  team:activity.map(a=>({employeeId:a.employeeId,name:a.name,position:a.position,area:a.area,estado:a.estado}))};
}
