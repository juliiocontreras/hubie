// Tools P1-B domain: proveedores (T009), compras (T008), almacenes (T010),
// caja (T016), cuentas por cobrar (T017), cuentas por pagar (T018) y
// presupuestos de gastos (C007). Validación pura, sin dependencias de Node:
// reutilizable en servidor y tests. Moneda siempre en centavos enteros.
export const supplierPaymentTerms=Object.freeze(['contado','credito_7','credito_15','credito_30','credito_60']);
export const supplierPaymentTermLabels=Object.freeze({contado:'Contado',credito_7:'Crédito 7 días',credito_15:'Crédito 15 días',credito_30:'Crédito 30 días',credito_60:'Crédito 60 días'});
export const purchaseOrderStatuses=Object.freeze(['draft','sent','partially_received','received','cancelled']);
export const purchaseOrderStatusLabels=Object.freeze({draft:'Borrador',sent:'Enviada',partially_received:'Recibida parcialmente',received:'Recibida',cancelled:'Cancelada'});
export const payableStatuses=Object.freeze(['pending','approved','paid','cancelled']);
export const payableStatusLabels=Object.freeze({pending:'Pendiente',approved:'Aprobada',paid:'Pagada',cancelled:'Cancelada'});
export const cashboxStatuses=Object.freeze(['open','closed']);
export const cashboxDirections=Object.freeze(['in','out']);
export const agingBuckets=Object.freeze(['corriente','vencido_30','vencido_60','vencido_90','vencido_mas_90']);
export const agingBucketLabels=Object.freeze({corriente:'Corriente',vencido_30:'Vencido 1–30 días',vencido_60:'Vencido 31–60 días',vencido_90:'Vencido 61–90 días',vencido_mas_90:'Vencido más de 90 días'});

const clean=(value,max)=>typeof value==='string'&&value.trim().length<=max?value.trim():null;
const moneyOk=x=>Number.isSafeInteger(x)&&x>=0&&x<=100_000_000_000;
const moneyPositive=x=>Number.isSafeInteger(x)&&x>0&&x<=100_000_000_000;
const entityId=value=>value===undefined||value===null||value==='' ? null :
 typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)?value:undefined;
const dateOk=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const monthOk=v=>typeof v==='string'&&/^\d{4}-\d{2}$/.test(v)&&Number(v.slice(5,7))>=1&&Number(v.slice(5,7))<=12;
const emailOk=v=>v===''||/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

export function normalizeSupplier(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid supplier');
 const name=clean(input.name,160);
 const contact=clean(input.contact??'',160);
 const email=clean(input.email??'',160);
 const phone=clean(input.phone??'',40);
 const paymentTerms=input.paymentTerms??'contado';
 const notes=clean(input.notes??'',2000);
 if(!name||name.length<2||contact===null||email===null||!emailOk(email)||phone===null||
   !supplierPaymentTerms.includes(paymentTerms)||notes===null)throw Error('Invalid supplier');
 return {name,contact,email,phone,paymentTerms,notes};
}
export function normalizeSupplierDocument(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid supplier document');
 const mediaId=entityId(input.mediaId);
 const documentType=clean(input.documentType??'',80);
 const notes=clean(input.notes??'',1000);
 if(mediaId===undefined||!mediaId||documentType===null||!documentType||notes===null)throw Error('Invalid supplier document');
 return {mediaId,documentType,notes};
}
export function normalizePurchaseOrderLine(input,position=0){
 const description=clean(input?.description,300);
 const quantity=input?.quantity;
 const unitPriceCents=input?.unitPriceCents;
 const itemId=entityId(input?.itemId);
 if(!description||!Number.isSafeInteger(quantity)||quantity<=0||quantity>100000||
   !moneyOk(unitPriceCents)||itemId===undefined)throw Error('Invalid purchase order');
 return {description,quantity,unitPriceCents,lineTotalCents:quantity*unitPriceCents,itemId,position};
}
export function purchaseOrderTotals(lines){
 if(!Array.isArray(lines)||!lines.length)throw Error('Invalid purchase order');
 const total=lines.reduce((sum,l)=>sum+l.lineTotalCents,0);
 return {totalCents:total};
}
export function normalizePurchaseOrder(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid purchase order');
 const supplierId=entityId(input.supplierId);
 const notes=clean(input.notes??'',2000);
 const expectedOn=input.expectedOn??null;
 const lines=Array.isArray(input.lines)?input.lines.map((l,i)=>normalizePurchaseOrderLine(l,i)):[];
 if(supplierId===undefined||!supplierId||notes===null||
   (expectedOn!==null&&!dateOk(expectedOn))||lines.length<1||lines.length>50)throw Error('Invalid purchase order');
 return {supplierId,notes,expectedOn,lines,...purchaseOrderTotals(lines)};
}
const purchaseOrderTransitions={draft:['sent','cancelled'],sent:['partially_received','received','cancelled'],
 partially_received:['received','cancelled'],received:[],cancelled:[]};
export function nextPurchaseOrderStatus(current,next){
 if(!purchaseOrderStatuses.includes(current)||!purchaseOrderStatuses.includes(next))throw Error('Invalid purchase order status');
 if(!purchaseOrderTransitions[current].includes(next))throw Error('Invalid purchase order status');
 return next;
}
export function normalizeReceipt(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid receipt');
 const lineId=entityId(input.lineId);
 const quantity=input.quantity;
 const warehouseId=entityId(input.warehouseId);
 if(lineId===undefined||!lineId||!Number.isSafeInteger(quantity)||quantity<=0||quantity>100000||
   warehouseId===undefined)throw Error('Invalid receipt');
 return {lineId,quantity,warehouseId};
}
export function normalizeWarehouse(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid warehouse');
 const name=clean(input.name,120);
 const location=clean(input.location??'',200);
 const responsible=clean(input.responsible??'',160);
 if(!name||name.length<2||location===null||responsible===null)throw Error('Invalid warehouse');
 return {name,location,responsible};
}
export function normalizeTransfer(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid transfer');
 const fromWarehouseId=entityId(input.fromWarehouseId);
 const toWarehouseId=entityId(input.toWarehouseId);
 const itemId=entityId(input.itemId);
 const quantity=input.quantity;
 const note=clean(input.note??'',500);
 if(fromWarehouseId===undefined||!fromWarehouseId||toWarehouseId===undefined||!toWarehouseId||
   itemId===undefined||!itemId||fromWarehouseId===toWarehouseId||
   !Number.isSafeInteger(quantity)||quantity<=0||quantity>1000000||note===null)throw Error('Invalid transfer');
 return {fromWarehouseId,toWarehouseId,itemId,quantity,note};
}
export function normalizeCashboxOpen(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid cashbox');
 const openingCents=input.openingCents;
 const responsible=clean(input.responsible,160);
 const shift=clean(input.shift??'',80);
 const notes=clean(input.notes??'',1000);
 if(!moneyOk(openingCents)||!responsible||responsible.length<2||shift===null||notes===null)throw Error('Invalid cashbox');
 return {openingCents,responsible,shift,notes};
}
export function normalizeCashboxMovement(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid cashbox movement');
 const direction=input.direction;
 const amountCents=input.amountCents;
 const kind=clean(input.kind??'',80);
 const notes=clean(input.notes??'',1000);
 const sourceType=input.sourceType??null;
 const sourceId=entityId(input.sourceId);
 if(!cashboxDirections.includes(direction)||!moneyPositive(amountCents)||kind===null||notes===null||
   (sourceType!==null&&!['collection','expense','manual'].includes(sourceType))||sourceId===undefined)throw Error('Invalid cashbox movement');
 return {direction,amountCents,kind,notes,sourceType,sourceId};
}
export function normalizeCashboxCount(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid cashbox count');
 const countedCents=input.countedCents;
 const notes=clean(input.notes??'',1000);
 if(!moneyOk(countedCents)||notes===null)throw Error('Invalid cashbox count');
 return {countedCents,notes};
}
// Arqueo: lo que el sistema espera contra lo que se contó físicamente.
export function cashboxBalance(openingCents,movements){
 const ins=(movements||[]).filter(m=>m.direction==='in').reduce((s,m)=>s+m.amountCents,0);
 const outs=(movements||[]).filter(m=>m.direction==='out').reduce((s,m)=>s+m.amountCents,0);
 return {openingCents,inCents:ins,outCents:outs,expectedCents:openingCents+ins-outs};
}
export function cashboxDifference(expectedCents,countedCents){
 if(!moneyOk(expectedCents)||!moneyOk(countedCents))throw Error('Invalid cashbox count');
 return countedCents-expectedCents;
}
export function normalizeReceivable(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid receivable');
 const quoteId=entityId(input.quoteId);
 const dueOn=input.dueOn??null;
 const notes=clean(input.notes??'',1000);
 if(quoteId===undefined||!quoteId||(dueOn!==null&&!dateOk(dueOn))||notes===null)throw Error('Invalid receivable');
 return {quoteId,dueOn,notes};
}
// Antigüedad por días vencidos desde dueOn hasta today (YYYY-MM-DD, UTC).
export function daysOverdue(dueOn,today){
 if(!dateOk(dueOn)||!dateOk(today))throw Error('Invalid date');
 return Math.floor((Date.parse(today+'T00:00:00Z')-Date.parse(dueOn+'T00:00:00Z'))/86400000);
}
export function agingBucket(dueOn,today){
 const overdue=daysOverdue(dueOn,today);
 if(overdue<=0)return 'corriente';
 if(overdue<=30)return 'vencido_30';
 if(overdue<=60)return 'vencido_60';
 if(overdue<=90)return 'vencido_90';
 return 'vencido_mas_90';
}
export function summarizeAging(receivables,today){
 const byBucket={corriente:0,vencido_30:0,vencido_60:0,vencido_90:0,vencido_mas_90:0};
 let totalCents=0,overdueCents=0;
 for(const r of receivables||[]){
  const balance=Math.max(0,Number(r.totalCents||0)-Number(r.paidCents||0));
  if(balance<=0)continue;
  totalCents+=balance;
  const bucket=agingBucket(r.dueOn,today);
  byBucket[bucket]+=balance;
  if(bucket!=='corriente')overdueCents+=balance;
 }
 return {totalCents,overdueCents,byBucket};
}
export function normalizePayable(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid payable');
 const supplierId=entityId(input.supplierId);
 const purchaseOrderId=entityId(input.purchaseOrderId);
 const description=clean(input.description,300);
 const totalCents=input.totalCents;
 const dueOn=input.dueOn;
 const notes=clean(input.notes??'',2000);
 if(supplierId===undefined||!supplierId||purchaseOrderId===undefined||
   !description||description.length<2||!moneyPositive(totalCents)||!dateOk(dueOn)||notes===null)throw Error('Invalid payable');
 return {supplierId,purchaseOrderId,description,totalCents,dueOn,notes};
}
const payableTransitions={pending:['approved','cancelled'],approved:['paid','cancelled'],paid:[],cancelled:[]};
export function nextPayableStatus(current,next){
 if(!payableStatuses.includes(current)||!payableStatuses.includes(next))throw Error('Invalid payable status');
 if(!payableTransitions[current].includes(next))throw Error('Invalid payable status');
 return next;
}
export function normalizePayableInstallment(input,{totalCents=null,alreadyPaidCents=0}={}){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid payable installment');
 const amountCents=input.amountCents;
 const paidOn=input.paidOn;
 const method=input.method??'transferencia';
 const reference=clean(input.reference??'',120);
 const notes=clean(input.notes??'',1000);
 if(!moneyPositive(amountCents)||!dateOk(paidOn)||!['efectivo','transferencia','tarjeta'].includes(method)||
   reference===null||notes===null)throw Error('Invalid payable installment');
 if(totalCents!==null&&amountCents>Math.max(0,totalCents-alreadyPaidCents))throw Error('Invalid payable installment');
 return {amountCents,paidOn,method,reference,notes};
}
export function normalizeExpenseBudget(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid expense budget');
 const category=input.category;
 const month=input.month;
 const limitCents=input.limitCents;
 if(!['insumos','renta','servicios','transporte','marketing','personal','impuestos','otros'].includes(category)||
   !monthOk(month)||!moneyPositive(limitCents))throw Error('Invalid expense budget');
 return {category,month,limitCents};
}
export function budgetStatus(spentCents,limitCents){
 if(!moneyOk(spentCents)||!moneyOk(limitCents))throw Error('Invalid expense budget');
 return {spentCents,limitCents,remainingCents:limitCents-spentCents,over:spentCents>limitCents};
}
// Reporte mensual de gastos: totales por categoría contra su presupuesto.
export function monthlyExpenseReport(expenses,budgets,month){
 if(!monthOk(month))throw Error('Invalid expense budget');
 const inMonth=(expenses||[]).filter(e=>(e.occurredOn||'').slice(0,7)===month);
 const byCategory={};
 let totalCents=0;
 for(const e of inMonth){totalCents+=Number(e.amountCents||0);byCategory[e.category]=(byCategory[e.category]||0)+Number(e.amountCents||0);}
 const budgetByCategory=Object.fromEntries((budgets||[]).filter(b=>b.month===month).map(b=>[b.category,Number(b.limitCents||0)]));
 const categories=Object.keys(byCategory).sort();
 return {month,totalCents,count:inMonth.length,
  byCategory:categories.map(category=>{
   const limit=budgetByCategory[category]??null;
   const status=budgetStatus(byCategory[category],limit??byCategory[category]);
   return {category,spentCents:byCategory[category],limitCents:limit,
    remainingCents:limit===null?null:status.remainingCents,over:limit!==null&&status.over};
  }),
  overBudget:categories.filter(c=>budgetByCategory[c]!==undefined&&byCategory[c]>budgetByCategory[c])};
}
export {dateOk,monthOk};
