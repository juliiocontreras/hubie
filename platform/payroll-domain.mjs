// T031 Nómina: validación/normalización pura y cálculo básico, sin acceso
// a BD. LÍMITE HONESTO: cálculo básico, sin timbrado CFDI de nómina ni
// cálculo real de IMSS/ISR. Las percepciones/deducciones son conceptos
// configurables de monto fijo o porcentaje del salario base del periodo.
// Un periodo quincenal usa la mitad del salario mensual (T026).
export const PERIOD_TYPES=new Set(['quincenal','mensual']);
export const PERIOD_STATUSES=new Set(['borrador','calculado','pagado']);
export const CONCEPT_TYPES=new Set(['percepcion','deduccion']);
export const CONCEPT_MODES=new Set(['fijo','porcentaje']);
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
function reqStr(v,min,max,label='Invalid concept'){
 const t=str(v,max);
 if(t.length<min)throw Error(label);
 return t;
}
function validDate(v,label='Invalid period'){
 if(v===undefined||v===null)return null;
 if(typeof v!=='string'||!dateOnly.test(v)||Number.isNaN(Date.parse(v+'T00:00:00Z')))throw Error(label);
 return v;
}
export function normalizePeriod(input){
 strictKeys(input,['tipo','fechaInicio','fechaFin'],'Invalid period');
 if(!PERIOD_TYPES.has(input.tipo))throw Error('Invalid period');
 const fechaInicio=validDate(input.fechaInicio),fechaFin=validDate(input.fechaFin);
 if(!fechaInicio||!fechaFin||fechaFin<fechaInicio)throw Error('Invalid period');
 return {tipo:input.tipo,fechaInicio,fechaFin};
}
export function normalizeConcept(input){
 strictKeys(input,['nombre','tipo','modo','montoCents','porcentaje','activo'],'Invalid concept');
 if(!CONCEPT_TYPES.has(input.tipo))throw Error('Invalid concept');
 if(!CONCEPT_MODES.has(input.modo))throw Error('Invalid concept');
 let montoCents=null,porcentaje=null;
 if(input.modo==='fijo'){
  if(!Number.isInteger(input.montoCents)||input.montoCents<0||input.montoCents>100000000000)throw Error('Invalid concept');
  montoCents=input.montoCents;
 }else{
  if(typeof input.porcentaje!=='number'||!Number.isFinite(input.porcentaje)||input.porcentaje<0||input.porcentaje>100)throw Error('Invalid concept');
  porcentaje=input.porcentaje;
 }
 return {nombre:reqStr(input.nombre,2,120),tipo:input.tipo,modo:input.modo,montoCents,porcentaje,
  activo:input.activo===undefined?true:input.activo===true};
}
export function normalizePeriodStatus(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1||!PERIOD_STATUSES.has(input.estado))throw Error('Invalid period');
 return {estado:input.estado};
}
// Salario base del periodo: mensual completo, quincenal la mitad.
export function periodBaseCents(salarioMensualCents,tipo){
 if(!Number.isInteger(salarioMensualCents)||salarioMensualCents<0)throw Error('Invalid payroll');
 return tipo==='quincenal'?Math.round(salarioMensualCents/2):salarioMensualCents;
}
// Cálculo SIEMPRE en servidor: nunca se confía en el neto del cliente.
// Concepto fijo: su monto. Concepto porcentaje: % del salario base.
export function computeReceipt(baseCents,concepts){
 if(!Number.isInteger(baseCents)||baseCents<0)throw Error('Invalid payroll');
 const items=[];
 let percepcionesCents=0,deduccionesCents=0;
 for(const c of concepts||[]){
  if(!c||typeof c!=='object'||!CONCEPT_TYPES.has(c.tipo))throw Error('Invalid payroll');
  const montoCents=c.modo==='porcentaje'?Math.round(baseCents*Number(c.porcentaje)/100):
   Number.isInteger(c.montoCents)?c.montoCents:(()=>{throw Error('Invalid payroll');})();
  if(montoCents<0)throw Error('Invalid payroll');
  items.push({conceptId:c.id??null,nombre:c.nombre,tipo:c.tipo,montoCents});
  if(c.tipo==='percepcion')percepcionesCents+=montoCents;
  else deduccionesCents+=montoCents;
 }
 const netoCents=Math.max(0,baseCents+percepcionesCents-deduccionesCents);
 return {baseCents,items,percepcionesCents,deduccionesCents,netoCents};
}
export function validPeriodId(id){
 if(typeof id!=='string'||!uuid.test(id))throw Error('Invalid period');
}
