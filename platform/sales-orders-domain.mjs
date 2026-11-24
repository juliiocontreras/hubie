// T024 Pedidos de venta: validación/normalización pura, sin acceso a BD.
// Estilo de training-domain.mjs: funciones puras que lanzan 'Invalid ...'
// con claves estrictas (sin campos extra).
// El pedido NO duplica cotizaciones ni facturación: copia las partidas de
// una cotización aceptada de T013 (como createInvoice) y orquesta lo que ya
// existe (cobro T014, factura T015, CxC T017).
export const ORDER_STATUSES=new Set(['borrador','confirmado','en preparación','enviado','entregado','cancelado']);
export const ORDER_STATUS_LABELS={borrador:'Borrador',confirmado:'Confirmado','en preparación':'En preparación',enviado:'Enviado',entregado:'Entregado',cancelado:'Cancelado'};
const ORDER_TRANSITIONS={
 borrador:['confirmado','cancelado'],
 confirmado:['en preparación','cancelado'],
 'en preparación':['enviado','cancelado'],
 enviado:['entregado','cancelado'],
 entregado:[],
 cancelado:[]
};
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
function validDate(v){
 if(v===undefined||v===null)return null;
 if(typeof v!=='string'||!dateOnly.test(v)||Number.isNaN(Date.parse(v+'T00:00:00Z')))throw Error('Invalid value');
 return v;
}
export function nextOrderStatus(current,next){
 if(!ORDER_STATUSES.has(current)||!ORDER_STATUSES.has(next))throw Error('Invalid order status');
 if(!ORDER_TRANSITIONS[current].includes(next))throw Error('Invalid order status');
 return next;
}
// Crear un pedido es solo elegir la cotización aceptada: las partidas,
// totales y cliente se copian de ella en el store.
export function normalizeOrderCreate(input){
 strictKeys(input,['quoteId'],'Invalid order');
 if(typeof input.quoteId!=='string'||!uuid.test(input.quoteId))throw Error('Invalid order');
 return {quoteId:input.quoteId};
}
// Entrega: fecha, guía y paquetería. Se registra cuando el pedido ya está
// confirmado (o más avanzado); no mueve el estatus por sí sola.
export function normalizeDelivery(input){
 strictKeys(input,['deliveryDate','carrier','trackingCode'],'Invalid order');
 return {deliveryDate:validDate(input.deliveryDate),
  carrier:str(input.carrier,80),trackingCode:str(input.trackingCode,80)};
}
export function normalizeOrderNotes(input){
 strictKeys(input,['notes'],'Invalid order');
 return {notes:str(input.notes,2000)};
}
// La factura del pedido puede llevar RFC distinto al de la cotización;
// si no se pasa, queda vacío (factura administrativa sin CFDI, como T015).
export function normalizeOrderInvoice(input){
 strictKeys(input,['rfc','notes'],'Invalid invoice');
 const rfc=str(input.rfc,13).toUpperCase();
 if(rfc&&!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc))throw Error('Invalid invoice');
 return {rfc,notes:str(input.notes,1000)};
}
export function normalizeOrderReceivable(input){
 strictKeys(input,['dueOn','notes'],'Invalid receivable');
 return {dueOn:validDate(input.dueOn),notes:str(input.notes,1000)};
}
export function formatOrderFolio(folio){return 'PV-'+String(folio).padStart(4,'0');}
