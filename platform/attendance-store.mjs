import {randomUUID} from 'node:crypto';
import {executeSql as realExecuteSql,executeBatch as realExecuteBatch} from '../database.mjs';
import {authorizeTool as realAuthorize} from './records.mjs';
import {normalizeWorkday,normalizeRequest,normalizeResolve,workdayMinutes,requestDays} from './attendance-domain.mjs';
// T027 Asistencia y vacaciones: registro de jornada y solicitudes.
// Solo registro y aprobación: NO hay saldos ni políticas de vacaciones
// inventadas; el resumen muestra días de vacaciones APROBADOS en el año.
// La aprobación/rechazo es SOLO para dueño/admin (session.role).
// Patrón de inyección de dependencias como training-store.
const depsOf=d=>({executeSql:d?.executeSql||realExecuteSql,executeBatch:d?.executeBatch||realExecuteBatch,authorize:d?.authorize||realAuthorize});
const rows=r=>r?.rows?.map(a=>a.map(c=>c?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validId(id,label){if(typeof id!=='string'||!uuid.test(id))throw Error(label);}
const num=v=>Number(v||0);
async function employeeFor(db,org,id){
 validId(id,'Invalid employee');
 const row=rows(await db.executeSql('SELECT id,name,email,position,area,estado FROM tenant_training_employees WHERE organization_id=? AND id=?',[org,id]))[0];
 if(!row)throw Error('Not found');
 return {id:row[0],name:row[1],email:row[2],position:row[3],area:row[4],estado:row[5]};
}
async function requestFor(db,org,id){
 validId(id,'Invalid request');
 const row=rows(await db.executeSql('SELECT id,employee_id,tipo,fecha_inicio,fecha_fin,motivo,estado,resuelta_por,resuelta_at,created_at,updated_at FROM tenant_hr_requests WHERE organization_id=? AND id=?',[org,id]))[0];
 if(!row)throw Error('Not found');
 return {id:row[0],employeeId:row[1],tipo:row[2],fechaInicio:row[3],fechaFin:row[4],motivo:row[5],
  estado:row[6],resueltaPor:row[7],resueltaAt:row[8],createdAt:row[9],updatedAt:row[10],
  days:requestDays(row[3],row[4])};
}
// ---- Jornada ----
export async function recordWorkday(token,slug,input,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T027',true);
 const data=normalizeWorkday(input);
 await employeeFor(db,tenant.id,data.employeeId);
 const id=randomUUID();
 await db.executeBatch([
  {sql:'UPDATE tenant_hr_attendance SET entrada=?,salida=?,notas=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND employee_id=? AND fecha=?',
   args:[data.entrada,data.salida,data.notas,tenant.id,data.employeeId,data.fecha]},
  {sql:`INSERT INTO tenant_hr_attendance(organization_id,id,employee_id,fecha,entrada,salida,notas,created_by)
   SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM tenant_hr_attendance WHERE organization_id=? AND employee_id=? AND fecha=?)`,
   args:[tenant.id,id,data.employeeId,data.fecha,data.entrada,data.salida,data.notas,session.userId,tenant.id,data.employeeId,data.fecha]}
 ]);
 const saved=rows(await db.executeSql('SELECT id FROM tenant_hr_attendance WHERE organization_id=? AND employee_id=? AND fecha=?',[tenant.id,data.employeeId,data.fecha]))[0];
 const minutes=workdayMinutes(data.entrada,data.salida);
 return {workday:{id:saved?.[0]??id,...data,minutes}};
}
export async function listWorkdays(token,slug,{employeeId=null,from=null,to=null}={},deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T027');
 const conds=['a.organization_id=?'],args=[tenant.id];
 if(employeeId){await employeeFor(db,tenant.id,employeeId);conds.push('a.employee_id=?');args.push(employeeId);}
 if(from){conds.push('a.fecha>=?');args.push(from);}
 if(to){conds.push('a.fecha<=?');args.push(to);}
 const r=await db.executeSql(`SELECT a.id,a.employee_id,a.fecha,a.entrada,a.salida,a.notas,a.created_at,e.name
  FROM tenant_hr_attendance a JOIN tenant_training_employees e ON e.organization_id=a.organization_id AND e.id=a.employee_id
  WHERE ${conds.join(' AND ')} ORDER BY a.fecha DESC LIMIT 500`,args);
 return {workdays:rows(r).map(x=>({id:x[0],employeeId:x[1],fecha:x[2],entrada:x[3],salida:x[4],notas:x[5],
  createdAt:x[6],employeeName:x[7],minutes:workdayMinutes(x[3],x[4])}))};
}
// ---- Solicitudes ----
export async function createRequest(token,slug,input,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T027',true);
 const data=normalizeRequest(input);
 await employeeFor(db,tenant.id,data.employeeId);
 const id=randomUUID();
 await db.executeSql('INSERT INTO tenant_hr_requests(organization_id,id,employee_id,tipo,fecha_inicio,fecha_fin,motivo,created_by) VALUES(?,?,?,?,?,?,?,?)',
  [tenant.id,id,data.employeeId,data.tipo,data.fechaInicio,data.fechaFin,data.motivo,session.userId]);
 return {request:{id,...data,estado:'pendiente'}};
}
export async function listRequests(token,slug,{employeeId=null,estado=null,tipo=null}={},deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T027');
 const conds=['r.organization_id=?'],args=[tenant.id];
 if(employeeId){await employeeFor(db,tenant.id,employeeId);conds.push('r.employee_id=?');args.push(employeeId);}
 if(estado){if(!['pendiente','aprobada','rechazada'].includes(estado))throw Error('Invalid request');conds.push('r.estado=?');args.push(estado);}
 if(tipo){if(!['vacaciones','permiso'].includes(tipo))throw Error('Invalid request');conds.push('r.tipo=?');args.push(tipo);}
 const r=await db.executeSql(`SELECT r.id,r.employee_id,r.tipo,r.fecha_inicio,r.fecha_fin,r.motivo,r.estado,r.resuelta_por,r.resuelta_at,r.created_at,e.name
  FROM tenant_hr_requests r JOIN tenant_training_employees e ON e.organization_id=r.organization_id AND e.id=r.employee_id
  WHERE ${conds.join(' AND ')} ORDER BY r.created_at DESC LIMIT 200`,args);
 return {requests:rows(r).map(x=>({id:x[0],employeeId:x[1],tipo:x[2],fechaInicio:x[3],fechaFin:x[4],motivo:x[5],
  estado:x[6],resueltaPor:x[7],resueltaAt:x[8],createdAt:x[9],employeeName:x[10],days:requestDays(x[3],x[4])}))};
}
// Solo dueño/admin resuelven. Un viewer/member NO puede aprobar vacaciones:
// authorize con write=true ya deja fuera al viewer; el member pasa el
// control de escritura pero aquí se le bloquea por rol.
export async function resolveRequest(token,slug,id,input,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T027',true);
 if(!['owner','admin'].includes(session?.role))throw Error('Forbidden');
 const {estado}=normalizeResolve(input);
 const current=await requestFor(db,tenant.id,id);
 if(current.estado!=='pendiente')throw Error('Invalid request');
 const r=await db.executeSql("UPDATE tenant_hr_requests SET estado=?,resuelta_por=?,resuelta_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND estado='pendiente'",
  [estado,session.userId,tenant.id,id]);
 if(!changed(r))throw Error('Not found');
 return {ok:true,estado};
}
// Días de vacaciones APROBADOS en el año por empleado (conteo, sin saldos
// ni políticas). Las solicitudes que cruzan el año se recortan al año.
export async function vacationSummary(token,slug,{year=null,employeeId=null}={},deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T027');
 const y=year||new Date().getFullYear();
 if(!Number.isInteger(y)||y<2000||y>2100)throw Error('Invalid request');
 if(employeeId)await employeeFor(db,tenant.id,employeeId);
 const r=await db.executeSql(`SELECT r.employee_id,r.fecha_inicio,r.fecha_fin,e.name
  FROM tenant_hr_requests r JOIN tenant_training_employees e ON e.organization_id=r.organization_id AND e.id=r.employee_id
  WHERE r.organization_id=? AND r.tipo='vacaciones' AND r.estado='aprobada'`+(employeeId?' AND r.employee_id=?':'')+` ORDER BY e.name`,
  employeeId?[tenant.id,employeeId]:[tenant.id]);
 const start=y+'-01-01',end=y+'-12-31';
 const byEmployee=new Map();
 for(const x of rows(r)){
  const from=x[1]<start?start:x[1],to=x[2]>end?end:x[2];
  if(to<from)continue;
  const days=requestDays(from,to);
  const cur=byEmployee.get(x[0])||{employeeId:x[0],employeeName:x[3],days:0};
  cur.days+=days;byEmployee.set(x[0],cur);
 }
 return {year:y,employees:[...byEmployee.values()]};
}
// ---- Tablero ----
export async function dashboard(token,slug,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T027');
 const org=tenant.id;
 const month=new Date().toISOString().slice(0,7);
 const [pending,workdays,employees]=await Promise.all([
  db.executeSql("SELECT COUNT(*) FROM tenant_hr_requests WHERE organization_id=? AND estado='pendiente'",[org]),
  db.executeSql('SELECT COUNT(*) FROM tenant_hr_attendance WHERE organization_id=? AND substr(fecha,1,7)=?',[org,month]),
  db.executeSql("SELECT COUNT(*) FROM tenant_training_employees WHERE organization_id=? AND estado='activo'",[org])
 ]);
 const summary=await vacationSummary(token,slug,{},deps);
 return {kpis:{pendingRequests:num(rows(pending)[0]?.[0]),workdaysThisMonth:num(rows(workdays)[0]?.[0]),
  activeEmployees:num(rows(employees)[0]?.[0]),
  approvedVacationDays:summary.employees.reduce((a,e)=>a+e.days,0)},vacationSummary:summary};
}
