// T027 Asistencia y vacaciones: validación/normalización pura, sin acceso
// a BD. Solo registro y aprobación: jornada por día y solicitudes de
// vacaciones o permiso. Las horas se calculan (entrada/salida), no se
// guardan. NO hay saldos ni políticas: los días aprobados en el año son un
// conteo de solicitudes aprobadas, nada más.
export const REQUEST_TYPES=new Set(['vacaciones','permiso']);
export const REQUEST_STATUSES=new Set(['pendiente','aprobada','rechazada']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dateOnly=/^\d{4}-\d{2}-\d{2}$/;
const timeOnly=/^([01]\d|2[0-3]):[0-5]\d$/;
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
function reqStr(v,min,max,label='Invalid request'){
 const t=str(v,max);
 if(t.length<min)throw Error(label);
 return t;
}
function validDate(v,label='Invalid workday'){
 if(v===undefined||v===null)return null;
 if(typeof v!=='string'||!dateOnly.test(v)||Number.isNaN(Date.parse(v+'T00:00:00Z')))throw Error(label);
 return v;
}
function validTime(v){
 if(v===undefined||v===null||v==='')return null;
 if(typeof v!=='string'||!timeOnly.test(v))throw Error('Invalid workday');
 return v;
}
export function timeToMinutes(t){
 const [h,m]=t.split(':').map(Number);
 return h*60+m;
}
export function workdayMinutes(entrada,salida){
 if(!entrada||!salida)return null;
 const diff=timeToMinutes(salida)-timeToMinutes(entrada);
 return diff>0?diff:null;
}
export function formatHours(minutes){
 if(minutes===null||minutes===undefined)return '—';
 const h=Math.floor(minutes/60),m=minutes%60;
 return h+' h '+(m<10?'0':'')+m+' min';
}
export function normalizeWorkday(input){
 strictKeys(input,['employeeId','fecha','entrada','salida','notas'],'Invalid workday');
 if(typeof input.employeeId!=='string'||!uuid.test(input.employeeId))throw Error('Invalid workday');
 const fecha=validDate(input.fecha);
 if(!fecha)throw Error('Invalid workday');
 const entrada=validTime(input.entrada),salida=validTime(input.salida);
 if(entrada&&salida&&timeToMinutes(salida)<=timeToMinutes(entrada))throw Error('Invalid workday');
 return {employeeId:input.employeeId,fecha,entrada,salida,notas:str(input.notas,2000)};
}
export function requestDays(fechaInicio,fechaFin){
 return Math.round((Date.parse(fechaFin+'T00:00:00Z')-Date.parse(fechaInicio+'T00:00:00Z'))/86400000)+1;
}
export function normalizeRequest(input){
 strictKeys(input,['employeeId','tipo','fechaInicio','fechaFin','motivo'],'Invalid request');
 if(typeof input.employeeId!=='string'||!uuid.test(input.employeeId))throw Error('Invalid request');
 if(!REQUEST_TYPES.has(input.tipo))throw Error('Invalid request');
 const fechaInicio=validDate(input.fechaInicio,'Invalid request'),fechaFin=validDate(input.fechaFin,'Invalid request');
 if(!fechaInicio||!fechaFin||fechaFin<fechaInicio)throw Error('Invalid request');
 return {employeeId:input.employeeId,tipo:input.tipo,fechaInicio,fechaFin,
  motivo:reqStr(input.motivo,2,500),days:requestDays(fechaInicio,fechaFin)};
}
export function normalizeResolve(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||!['aprobada','rechazada'].includes(input.estado))throw Error('Invalid request');
 return {estado:input.estado};
}
