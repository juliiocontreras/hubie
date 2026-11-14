// Commerce domain: cotizaciones (T013), catálogo (C006), gastos (C007),
// cobros manuales (T014), facturación administrativa sin CFDI (T015) y
// reportes/exportación (T020). Moneda siempre en centavos enteros.
// Sin dependencias de Node: validación pura, reutilizable en servidor y tests.
export const quoteStatuses=Object.freeze(['draft','sent','accepted','rejected']);
export const quoteStatusLabels=Object.freeze({draft:'Borrador',sent:'Enviada',accepted:'Aceptada',rejected:'Rechazada'});
export const vatRates=Object.freeze([0,8,16]);
export const expenseCategories=Object.freeze(['insumos','renta','servicios','transporte','marketing','personal','impuestos','otros']);
export const expenseCategoryLabels=Object.freeze({insumos:'Insumos',renta:'Renta',servicios:'Servicios',transporte:'Transporte',marketing:'Marketing',personal:'Personal',impuestos:'Impuestos',otros:'Otros'});
export const paymentMethods=Object.freeze(['efectivo','transferencia','tarjeta']);
export const paymentMethodLabels=Object.freeze({efectivo:'Efectivo',transferencia:'Transferencia',tarjeta:'Tarjeta'});
export const invoiceStatuses=Object.freeze(['draft','issued','cancelled']);
export const invoiceStatusLabels=Object.freeze({draft:'Borrador',issued:'Emitida',cancelled:'Cancelada'});
export const reportKinds=Object.freeze(['clients','quotes','payments','expenses']);

const clean=(value,max)=>typeof value==='string'&&value.trim().length<=max?value.trim():null;
const moneyOk=x=>Number.isSafeInteger(x)&&x>=0&&x<=100_000_000_000;
const moneyPositive=x=>Number.isSafeInteger(x)&&x>0&&x<=100_000_000_000;
const entityId=value=>value===undefined||value===null||value==='' ? null :
 typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)?value:undefined;
const dateOk=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const isoDateTime=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v)&&Number.isFinite(Date.parse(v));

export function quoteTotals(lines,vatRate=16){
 if(!Array.isArray(lines)||!lines.length)throw Error('Invalid quote');
 const subtotal=lines.reduce((sum,l)=>sum+l.lineTotalCents,0);
 const vat=Math.round(subtotal*vatRate/100);
 return {subtotalCents:subtotal,vatCents:vat,totalCents:subtotal+vat};
}
export function normalizeQuoteLine(input,position=0){
 const description=clean(input?.description,300);
 const quantity=input?.quantity;
 const unitPriceCents=input?.unitPriceCents;
 if(!description||!Number.isSafeInteger(quantity)||quantity<=0||quantity>100000||!moneyOk(unitPriceCents))throw Error('Invalid quote');
 return {description,quantity,unitPriceCents,lineTotalCents:quantity*unitPriceCents,position};
}
export function normalizeQuote(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid quote');
 const title=clean(input.title,180);
 const clientName=clean(input.clientName??'',160);
 const notes=clean(input.notes??'',2000);
 const vatRate=input.vatRate??16;
 const validUntil=input.validUntil??null;
 const clientId=entityId(input.clientId);
 const lines=Array.isArray(input.lines)?input.lines.map((l,i)=>normalizeQuoteLine(l,i)):[];
 if(!title||title.length<2||clientName===null||notes===null||!vatRates.includes(vatRate)||
   (validUntil!==null&&!dateOk(validUntil))||clientId===undefined||lines.length<1||lines.length>50)throw Error('Invalid quote');
 return {title,clientName,notes,vatRate,validUntil,clientId,lines,...quoteTotals(lines,vatRate)};
}
const quoteTransitions={draft:['sent','accepted','rejected'],sent:['accepted','rejected','draft'],accepted:[],rejected:['draft']};
export function nextQuoteStatus(current,next){
 if(!quoteStatuses.includes(current)||!quoteStatuses.includes(next))throw Error('Invalid quote status');
 if(!quoteTransitions[current].includes(next))throw Error('Invalid quote status');
 return next;
}
export function remainingBalance(totalCents,paidCents){
 if(!moneyOk(totalCents)||!moneyOk(paidCents))throw Error('Invalid payment');
 return Math.max(0,totalCents-paidCents);
}
export function normalizeCatalogItem(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid catalog item');
 const sku=clean(input.sku??'',48)?.toUpperCase();
 const name=clean(input.name,180);
 const description=clean(input.description??'',2000);
 const category=clean(input.category??'General',80);
 const priceCents=input.priceCents??0;
 const active=input.active??true;
 if(sku===null||(sku&&!/^[A-Z0-9][A-Z0-9._-]{0,47}$/.test(sku))||!name||name.length<2||
   description===null||!category||!moneyOk(priceCents)||typeof active!=='boolean')throw Error('Invalid catalog item');
 return {sku,name,description,priceCents,category,active};
}
export function normalizeExpense(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid expense');
 const description=clean(input.description,300);
 const vendor=clean(input.vendor??'',160);
 const amountCents=input.amountCents;
 const occurredOn=input.occurredOn;
 const category=input.category??'otros';
 if(!description||description.length<2||vendor===null||!moneyPositive(amountCents)||
   !dateOk(occurredOn)||!expenseCategories.includes(category))throw Error('Invalid expense');
 return {description,vendor,amountCents,occurredOn,category};
}
export function monthKey(dateStr){return typeof dateStr==='string'?dateStr.slice(0,7):'';}
export function summarizeExpenses(expenses){
 const byCategory={},byMonth={};
 let totalCents=0;
 for(const e of expenses||[]){
  totalCents+=e.amountCents;
  byCategory[e.category]=(byCategory[e.category]||0)+e.amountCents;
  const month=monthKey(e.occurredOn);
  byMonth[month]=(byMonth[month]||0)+e.amountCents;
 }
 return {totalCents,count:(expenses||[]).length,byCategory,byMonth};
}
export function normalizePayment(input,{quoteTotalCents=null,alreadyPaidCents=0}={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid payment');
 const clientName=clean(input.clientName??'',160);
 const reference=clean(input.reference??'',120);
 const notes=clean(input.notes??'',1000);
 const amountCents=input.amountCents;
 const paidOn=input.paidOn;
 const method=input.method??'efectivo';
 const quoteId=entityId(input.quoteId);
 const clientId=entityId(input.clientId);
 if(clientName===null||reference===null||notes===null||!moneyPositive(amountCents)||
   !dateOk(paidOn)||!paymentMethods.includes(method)||quoteId===undefined||clientId===undefined)throw Error('Invalid payment');
 if(!clientName&&!quoteId&&!clientId)throw Error('Invalid payment');
 if(quoteId&&quoteTotalCents!==null&&amountCents>remainingBalance(quoteTotalCents,alreadyPaidCents))throw Error('Invalid payment');
 return {clientName,reference,notes,amountCents,paidOn,method,quoteId,clientId};
}
export function normalizeInvoice(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid invoice');
 const clientName=clean(input.clientName??'',160);
 const rfc=clean(input.rfc??'',13)?.toUpperCase();
 const notes=clean(input.notes??'',1000);
 const vatRate=input.vatRate??16;
 const quoteId=entityId(input.quoteId);
 const lines=Array.isArray(input.lines)?input.lines.map((l,i)=>normalizeQuoteLine(l,i)):[];
 if(!clientName||rfc===null||(rfc&&!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(rfc))||notes===null||
   !vatRates.includes(vatRate)||quoteId===undefined||lines.length<1||lines.length>50)throw Error('Invalid invoice');
 return {clientName,rfc,notes,vatRate,quoteId,lines,...quoteTotals(lines,vatRate)};
}
export function nextFolio(maxFolio){
 const current=Number.isSafeInteger(maxFolio)&&maxFolio>=0?maxFolio:0;
 return current+1;
}
export function formatFolio(folio){return 'F-'+String(folio).padStart(4,'0');}
export function csvEscape(value){
 const text=value===null||value===undefined?'':String(value);
 return /[",\n\r]/.test(text)?'"'+text.replace(/"/g,'""')+'"':text;
}
export function buildCsv(columns,rows){
 const head=columns.map(c=>csvEscape(c.label)).join(',');
 const body=(rows||[]).map(row=>columns.map(c=>csvEscape(row[c.key]??'')).join(',')).join('\r\n');
 return head+(body?'\r\n'+body:'')+'\r\n';
}
export const reportColumns={
 clients:[
  {key:'name',label:'Nombre'},{key:'company',label:'Empresa'},{key:'email',label:'Correo'},
  {key:'phone',label:'Teléfono'},{key:'status',label:'Estatus'},{key:'createdAt',label:'Creado'}
 ],
 quotes:[
  {key:'title',label:'Cotización'},{key:'clientName',label:'Cliente'},{key:'status',label:'Estatus'},
  {key:'subtotal',label:'Subtotal MXN'},{key:'vat',label:'IVA MXN'},{key:'total',label:'Total MXN'},
  {key:'validUntil',label:'Vigencia'},{key:'createdAt',label:'Creado'}
 ],
 payments:[
  {key:'clientName',label:'Cliente'},{key:'quoteTitle',label:'Cotización'},{key:'amount',label:'Monto MXN'},
  {key:'method',label:'Método'},{key:'reference',label:'Referencia'},{key:'paidOn',label:'Fecha'}
 ],
 expenses:[
  {key:'description',label:'Concepto'},{key:'category',label:'Categoría'},{key:'vendor',label:'Proveedor'},
  {key:'amount',label:'Monto MXN'},{key:'occurredOn',label:'Fecha'}
 ]
};
export function moneyText(cents){return (Number(cents||0)/100).toFixed(2);}
export {isoDateTime};
