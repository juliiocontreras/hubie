import {randomUUID} from 'node:crypto';
import {executeSql as realExecuteSql,executeBatch as realExecuteBatch} from '../database.mjs';
import {authorizeTool as realAuthorize} from './records.mjs';
import {normalizePeriod,normalizeConcept,computeReceipt,periodBaseCents} from './payroll-domain.mjs';
// T031 Nómina: periodos, conceptos configurables y recibos por empleado.
// LÍMITE HONESTO: cálculo básico, sin timbrado CFDI de nómina ni cálculo
// real de IMSS/ISR. El salario base se toma de
// tenant_training_employees.salario_mensual_cents (T026); un periodo
// quincenal usa la mitad del mensual. El neto se calcula SIEMPRE en
// servidor (computeReceipt), nunca se confía en el del cliente.
// El estado del periodo solo avanza por calcular (borrador→calculado) y
// marcar pagado (calculado→pagado): no hay edición manual del estado.
// Patrón de inyección de dependencias como training-store.
const depsOf=d=>({executeSql:d?.executeSql||realExecuteSql,executeBatch:d?.executeBatch||realExecuteBatch,authorize:d?.authorize||realAuthorize});
const rows=r=>r?.rows?.map(a=>a.map(c=>c?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validId(id,label){if(typeof id!=='string'||!uuid.test(id))throw Error(label);}
const num=v=>Number(v||0);
async function periodFor(db,org,id){
 validId(id,'Invalid period');
 const row=rows(await db.executeSql('SELECT id,tipo,fecha_inicio,fecha_fin,estado,created_at,updated_at FROM tenant_payroll_periods WHERE organization_id=? AND id=?',[org,id]))[0];
 if(!row)throw Error('Not found');
 return {id:row[0],tipo:row[1],fechaInicio:row[2],fechaFin:row[3],estado:row[4],createdAt:row[5],updatedAt:row[6]};
}
async function conceptFor(db,org,id){
 validId(id,'Invalid concept');
 const row=rows(await db.executeSql('SELECT id,nombre,tipo,modo,monto_cents,porcentaje,activo,created_at,updated_at FROM tenant_payroll_concepts WHERE organization_id=? AND id=?',[org,id]))[0];
 if(!row)throw Error('Not found');
 return {id:row[0],nombre:row[1],tipo:row[2],modo:row[3],montoCents:row[4]===null?null:num(row[4]),
  porcentaje:row[5]===null?null:num(row[5]),activo:row[6]===1,createdAt:row[7],updatedAt:row[8]};
}
function conceptView(c){
 return {id:c.id,nombre:c.nombre,tipo:c.tipo,modo:c.modo,montoCents:c.montoCents,porcentaje:c.porcentaje,activo:c.activo};
}
// ---- Periodos ----
export async function listPeriods(token,slug,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T031');
 const r=await db.executeSql(`SELECT p.id,p.tipo,p.fecha_inicio,p.fecha_fin,p.estado,p.created_at,
  (SELECT COUNT(*) FROM tenant_payroll_receipts x WHERE x.organization_id=p.organization_id AND x.period_id=p.id),
  (SELECT COALESCE(SUM(neto_cents),0) FROM tenant_payroll_receipts x WHERE x.organization_id=p.organization_id AND x.period_id=p.id)
  FROM tenant_payroll_periods p WHERE p.organization_id=? ORDER BY p.fecha_inicio DESC LIMIT 100`,[tenant.id]);
 return {periods:rows(r).map(x=>({id:x[0],tipo:x[1],fechaInicio:x[2],fechaFin:x[3],estado:x[4],createdAt:x[5],receipts:num(x[6]),totalNetoCents:num(x[7])}))};
}
export async function createPeriod(token,slug,input,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T031',true);
 const data=normalizePeriod(input);
 const id=randomUUID();
 try{
  await db.executeSql('INSERT INTO tenant_payroll_periods(organization_id,id,tipo,fecha_inicio,fecha_fin,created_by) VALUES(?,?,?,?,?,?)',
   [tenant.id,id,data.tipo,data.fechaInicio,data.fechaFin,session.userId]);
 }catch(e){
  if(/UNIQUE constraint failed/i.test(e?.message||''))throw Error('Duplicate period');
  throw e;
 }
 return {period:{id,...data,estado:'borrador'}};
}
// ---- Conceptos ----
export async function listConcepts(token,slug,{activo=null}={},deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T031');
 const r=await db.executeSql('SELECT id,nombre,tipo,modo,monto_cents,porcentaje,activo,created_at,updated_at FROM tenant_payroll_concepts WHERE organization_id=?'+(activo===null?'':' AND activo=?')+' ORDER BY nombre LIMIT 200',
  activo===null?[tenant.id]:[tenant.id,activo?1:0]);
 return {concepts:rows(r).map(x=>({id:x[0],nombre:x[1],tipo:x[2],modo:x[3],montoCents:x[4]===null?null:num(x[4]),
  porcentaje:x[5]===null?null:num(x[5]),activo:x[6]===1,createdAt:x[7],updatedAt:x[8]}))};
}
export async function createConcept(token,slug,input,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T031',true);
 const data=normalizeConcept(input);
 const id=randomUUID();
 await db.executeSql('INSERT INTO tenant_payroll_concepts(organization_id,id,nombre,tipo,modo,monto_cents,porcentaje,activo,created_by) VALUES(?,?,?,?,?,?,?,?,?)',
  [tenant.id,id,data.nombre,data.tipo,data.modo,data.montoCents,data.porcentaje,data.activo?1:0,session.userId]);
 return {concept:{id,...data}};
}
export async function updateConcept(token,slug,id,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T031',true);
 const current=await conceptFor(db,tenant.id,id);
 const base={nombre:current.nombre,tipo:current.tipo,modo:current.modo,montoCents:current.montoCents,porcentaje:current.porcentaje,activo:current.activo};
 const next=normalizeConcept({...base,...input});
 const r=await db.executeSql('UPDATE tenant_payroll_concepts SET nombre=?,tipo=?,modo=?,monto_cents=?,porcentaje=?,activo=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',
  [next.nombre,next.tipo,next.modo,next.montoCents,next.porcentaje,next.activo?1:0,tenant.id,id]);
 if(!changed(r))throw Error('Not found');
 return {concept:{id,...next}};
}
export async function deleteConcept(token,slug,id,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T031',true);
 await conceptFor(db,tenant.id,id);
 const used=num(rows(await db.executeSql('SELECT COUNT(*) FROM tenant_payroll_receipt_items WHERE organization_id=? AND concept_id=?',[tenant.id,id]))[0]?.[0]);
 if(used>0)throw Error('Invalid concept');
 const r=await db.executeSql('DELETE FROM tenant_payroll_concepts WHERE organization_id=? AND id=?',[tenant.id,id]);
 if(!changed(r))throw Error('Not found');
 return {ok:true};
}
// ---- Cálculo ----
export async function calculatePayroll(token,slug,periodId,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T031',true);
 const period=await periodFor(db,tenant.id,periodId);
 if(period.estado!=='borrador')throw Error('Invalid period');
 const employees=rows(await db.executeSql("SELECT id,name,salario_mensual_cents FROM tenant_training_employees WHERE organization_id=? AND estado='activo' ORDER BY name",[tenant.id]));
 const concepts=(await listConcepts(token,slug,{activo:true},deps)).concepts;
 const receipts=[],skipped=[],statements=[
  {sql:'DELETE FROM tenant_payroll_receipt_items WHERE organization_id=? AND receipt_id IN (SELECT id FROM tenant_payroll_receipts WHERE organization_id=? AND period_id=?)',args:[tenant.id,tenant.id,period.id]},
  {sql:'DELETE FROM tenant_payroll_receipts WHERE organization_id=? AND period_id=?',args:[tenant.id,period.id]}
 ];
 for(const e of employees){
  const salary=e[2];
  if(salary===null||salary===undefined||num(salary)<=0){skipped.push({employeeId:e[0],employeeName:e[1],reason:'sin salario'});continue;}
  const base=periodBaseCents(num(salary),period.tipo);
  const calc=computeReceipt(base,concepts.map(conceptView));
  const receiptId=randomUUID();
  receipts.push({id:receiptId,employeeId:e[0],employeeName:e[1],salarioBaseCents:base,
   percepcionesCents:calc.percepcionesCents,deduccionesCents:calc.deduccionesCents,netoCents:calc.netoCents});
  statements.push({sql:'INSERT INTO tenant_payroll_receipts(organization_id,id,period_id,employee_id,salario_base_cents,percepciones_cents,deducciones_cents,neto_cents,created_by) VALUES(?,?,?,?,?,?,?,?,?)',
   args:[tenant.id,receiptId,period.id,e[0],base,calc.percepcionesCents,calc.deduccionesCents,calc.netoCents,session.userId]});
  for(const item of calc.items){
   statements.push({sql:'INSERT INTO tenant_payroll_receipt_items(organization_id,id,receipt_id,concept_id,nombre,tipo,monto_cents) VALUES(?,?,?,?,?,?,?)',
    args:[tenant.id,randomUUID(),receiptId,item.conceptId,item.nombre,item.tipo,item.montoCents]});
  }
 }
 statements.push({sql:"UPDATE tenant_payroll_periods SET estado='calculado',updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?",args:[tenant.id,period.id]});
 await db.executeBatch(statements);
 return {period:{...period,estado:'calculado'},receipts,skipped};
}
export async function markPeriodPaid(token,slug,periodId,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T031',true);
 const period=await periodFor(db,tenant.id,periodId);
 if(period.estado!=='calculado')throw Error('Invalid period');
 await db.executeBatch([
  {sql:"UPDATE tenant_payroll_receipts SET estado='pagado',updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND period_id=?",args:[tenant.id,period.id]},
  {sql:"UPDATE tenant_payroll_periods SET estado='pagado',updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?",args:[tenant.id,period.id]}
 ]);
 const count=num(rows(await db.executeSql('SELECT COUNT(*) FROM tenant_payroll_receipts WHERE organization_id=? AND period_id=?',[tenant.id,period.id]))[0]?.[0]);
 return {ok:true,estado:'pagado',receipts:count};
}
// ---- Recibos ----
async function itemsForReceipts(db,org,receiptIds){
 if(!receiptIds.length)return new Map();
 const out=new Map(receiptIds.map(id=>[id,[]]));
 for(const id of receiptIds){
  const r=await db.executeSql('SELECT id,nombre,tipo,monto_cents FROM tenant_payroll_receipt_items WHERE organization_id=? AND receipt_id=? ORDER BY created_at',[org,id]);
  out.set(id,rows(r).map(x=>({id:x[0],nombre:x[1],tipo:x[2],montoCents:num(x[3])})));
 }
 return out;
}
export async function listReceipts(token,slug,{periodId=null,employeeId=null}={},deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T031');
 const conds=['r.organization_id=?'],args=[tenant.id];
 if(periodId){await periodFor(db,tenant.id,periodId);conds.push('r.period_id=?');args.push(periodId);}
 if(employeeId){conds.push('r.employee_id=?');args.push(employeeId);}
 const r=await db.executeSql(`SELECT r.id,r.period_id,r.employee_id,r.salario_base_cents,r.percepciones_cents,r.deducciones_cents,r.neto_cents,r.estado,r.created_at,e.name,p.tipo,p.fecha_inicio,p.fecha_fin
  FROM tenant_payroll_receipts r
  JOIN tenant_training_employees e ON e.organization_id=r.organization_id AND e.id=r.employee_id
  JOIN tenant_payroll_periods p ON p.organization_id=r.organization_id AND p.id=r.period_id
  WHERE ${conds.join(' AND ')} ORDER BY r.created_at DESC LIMIT 200`,args);
 const list=rows(r);
 const items=await itemsForReceipts(db,tenant.id,list.map(x=>x[0]));
 return {receipts:list.map(x=>({id:x[0],periodId:x[1],employeeId:x[2],salarioBaseCents:num(x[3]),
  percepcionesCents:num(x[4]),deduccionesCents:num(x[5]),netoCents:num(x[6]),estado:x[7],createdAt:x[8],
  employeeName:x[9],periodTipo:x[10],periodInicio:x[11],periodFin:x[12],items:items.get(x[0])||[]}))};
}
export async function getReceipt(token,slug,id,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T031');
 validId(id,'Invalid receipt');
 const row=rows(await db.executeSql(`SELECT r.id,r.period_id,r.employee_id,r.salario_base_cents,r.percepciones_cents,r.deducciones_cents,r.neto_cents,r.estado,r.created_at,e.name,p.tipo,p.fecha_inicio,p.fecha_fin
  FROM tenant_payroll_receipts r
  JOIN tenant_training_employees e ON e.organization_id=r.organization_id AND e.id=r.employee_id
  JOIN tenant_payroll_periods p ON p.organization_id=r.organization_id AND p.id=r.period_id
  WHERE r.organization_id=? AND r.id=?`,[tenant.id,id]))[0];
 if(!row)throw Error('Not found');
 const items=await itemsForReceipts(db,tenant.id,[row[0]]);
 return {receipt:{id:row[0],periodId:row[1],employeeId:row[2],salarioBaseCents:num(row[3]),
  percepcionesCents:num(row[4]),deduccionesCents:num(row[5]),netoCents:num(row[6]),estado:row[7],createdAt:row[8],
  employeeName:row[9],periodTipo:row[10],periodInicio:row[11],periodFin:row[12],items:items.get(row[0])||[]}};
}
// ---- Tablero ----
export async function dashboard(token,slug,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T031');
 const org=tenant.id;
 const [periods,concepts,withSalary,last]=await Promise.all([
  db.executeSql('SELECT COUNT(*) FROM tenant_payroll_periods WHERE organization_id=?',[org]),
  db.executeSql('SELECT COUNT(*) FROM tenant_payroll_concepts WHERE organization_id=? AND activo=1',[org]),
  db.executeSql("SELECT COUNT(*) FROM tenant_training_employees WHERE organization_id=? AND estado='activo' AND salario_mensual_cents IS NOT NULL AND salario_mensual_cents>0",[org]),
  db.executeSql('SELECT id,tipo,fecha_inicio,fecha_fin,estado FROM tenant_payroll_periods WHERE organization_id=? ORDER BY fecha_inicio DESC LIMIT 1',[org])
 ]);
 const lastRow=rows(last)[0];
 let lastTotal=0;
 if(lastRow){
  lastTotal=num(rows(await db.executeSql('SELECT COALESCE(SUM(neto_cents),0) FROM tenant_payroll_receipts WHERE organization_id=? AND period_id=?',[org,lastRow[0]]))[0]?.[0]);
 }
 return {kpis:{periods:num(rows(periods)[0]?.[0]),activeConcepts:num(rows(concepts)[0]?.[0]),
  employeesWithSalary:num(rows(withSalary)[0]?.[0]),lastPeriodNetoCents:lastTotal},
  lastPeriod:lastRow?{id:lastRow[0],tipo:lastRow[1],fechaInicio:lastRow[2],fechaFin:lastRow[3],estado:lastRow[4],totalNetoCents:lastTotal}:null};
}
