import {normalizeEmployee as normalizeBaseEmployee} from './training-domain.mjs';
// T026 Empleados: validación/normalización pura, sin acceso a BD.
// Reutiliza normalizeEmployee de T022 (nombre, correo, puesto, área) y
// añade los campos propios del directorio: fecha de ingreso, tipo de
// contrato, salario mensual (centavos) y estado. Los empleados creados en
// T022 aparecen aquí y viceversa: es la misma tabla
// tenant_training_employees (migración 031).
export const CONTRACT_TYPES=new Set(['indefinido','temporal','por obra','prácticas']);
export const EMPLOYEE_STATUSES=new Set(['activo','inactivo']);
export const DOCUMENT_TYPES=new Set(['contrato','identificación','comprobante','certificado','otro']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dateOnly=/^\d{4}-\d{2}-\d{2}$/;
function strictKeys(input,allowed,label){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!allowed.includes(k)))throw Error(label);
}
function str(v,max,def=''){
 if(v===undefined||v===null)return def;
 if(typeof v!=='string')throw Error('Invalid value');
 const t=v.trim();
 if(t.length>max)throw Error('Invalid value');
 return t;
}
function reqStr(v,min,max,label='Invalid employee'){
 const t=str(v,max);
 if(t.length<min)throw Error(label);
 return t;
}
function validDate(v,label='Invalid employee'){
 if(v===undefined||v===null)return null;
 if(typeof v!=='string'||!dateOnly.test(v)||Number.isNaN(Date.parse(v+'T00:00:00Z')))throw Error(label);
 return v;
}
function validMoneyCents(v){
 if(v===undefined||v===null)return null;
 if(!Number.isInteger(v)||v<0||v>100000000000)throw Error('Invalid employee');
 return v;
}
export function normalizeEmployeeFull(input){
 strictKeys(input,['name','email','position','area','fechaIngreso','tipoContrato','salarioMensualCents','estado'],'Invalid employee');
 const base=normalizeBaseEmployee({name:input.name,email:input.email,position:input.position,area:input.area});
 return {...base,
  fechaIngreso:validDate(input.fechaIngreso),
  tipoContrato:input.tipoContrato===undefined||input.tipoContrato===null?null:
   CONTRACT_TYPES.has(input.tipoContrato)?input.tipoContrato:(()=>{throw Error('Invalid employee');})(),
  salarioMensualCents:validMoneyCents(input.salarioMensualCents),
  estado:input.estado===undefined?'activo':EMPLOYEE_STATUSES.has(input.estado)?input.estado:(()=>{throw Error('Invalid employee');})()
 };
}
export function normalizeDocument(input){
 strictKeys(input,['employeeId','tipo','nombre','fecha','notas'],'Invalid document');
 if(typeof input.employeeId!=='string'||!uuid.test(input.employeeId))throw Error('Invalid document');
 if(!DOCUMENT_TYPES.has(input.tipo))throw Error('Invalid document');
 return {employeeId:input.employeeId,tipo:input.tipo,nombre:reqStr(input.nombre,2,160,'Invalid document'),
  fecha:validDate(input.fecha,'Invalid document'),notas:str(input.notas,2000)};
}
export function normalizeEmployeeStatus(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||!EMPLOYEE_STATUSES.has(input.estado))throw Error('Invalid employee');
 return {estado:input.estado};
}
