import {paymentMethods,paymentMethodLabels} from './commerce-domain.mjs';
// T030 Punto de venta: validación/normalización pura, sin acceso a BD.
// Estilo de training-domain.mjs: funciones puras que lanzan 'Invalid ...'
// con claves estrictas (sin campos extra).
//
// Precios base SIN IVA: el IVA (16%) se agrega al cobrar, como en
// T013/billing. El precio de cada línea SIEMPRE se toma del catálogo
// (C006) en el store; el cliente nunca fija precios.
export const VAT_RATE=16;
export const POS_MODES=new Set(['para_llevar','en_local','a_domicilio']);
export const POS_MODE_LABELS=Object.freeze({para_llevar:'Para llevar',en_local:'En local',a_domicilio:'A domicilio'});
export const SALE_STATUSES=new Set(['completada','cancelada']);
export {paymentMethods as posPaymentMethods,paymentMethodLabels as posPaymentMethodLabels};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
export function saleTotals(lines,vatRate=VAT_RATE){
 if(!Array.isArray(lines)||!lines.length)throw Error('Invalid sale');
 const subtotal=lines.reduce((sum,l)=>sum+l.lineTotalCents,0);
 const vat=Math.round(subtotal*vatRate/100);
 return {subtotalCents:subtotal,vatCents:vat,totalCents:subtotal+vat};
}
export function normalizeSaleLine(input){
 strictKeys(input,['catalogItemId','variantId','quantity'],'Invalid sale');
 if(typeof input.catalogItemId!=='string'||!uuid.test(input.catalogItemId))throw Error('Invalid sale');
 let variantId=null;
 if(input.variantId!==undefined&&input.variantId!==null&&input.variantId!==''){
  if(typeof input.variantId!=='string'||!uuid.test(input.variantId))throw Error('Invalid sale');
  variantId=input.variantId;
 }
 if(!Number.isInteger(input.quantity)||input.quantity<1||input.quantity>10000)throw Error('Invalid sale');
 return {catalogItemId:input.catalogItemId,variantId,quantity:input.quantity};
}
export function normalizeSale(input){
 strictKeys(input,['lines','method','mode','clientId','clientName','notes'],'Invalid sale');
 if(!Array.isArray(input.lines)||input.lines.length<1||input.lines.length>50)throw Error('Invalid sale');
 const lines=input.lines.map(normalizeSaleLine);
 const method=input.method===undefined?'efectivo':input.method;
 if(!paymentMethods.includes(method))throw Error('Invalid sale');
 const mode=input.mode===undefined?'para_llevar':input.mode;
 if(!POS_MODES.has(mode))throw Error('Invalid sale');
 let clientId=null;
 if(input.clientId!==undefined&&input.clientId!==null&&input.clientId!==''){
  if(typeof input.clientId!=='string'||!uuid.test(input.clientId))throw Error('Invalid sale');
  clientId=input.clientId;
 }
 return {lines,method,mode,clientId,clientName:str(input.clientName,160),notes:str(input.notes,1000)};
}
export function formatPosFolio(folio){
 if(!Number.isSafeInteger(folio)||folio<1)throw Error('Invalid sale');
 return 'POS-'+String(folio).padStart(4,'0');
}
