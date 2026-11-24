import {randomUUID} from 'node:crypto';
import {executeSql as realExecuteSql,executeBatch as realExecuteBatch} from '../database.mjs';
import {authorizeTool as realAuthorize} from './records.mjs';
import {normalizeQuoteLine,quoteTotals,normalizePayment,nextFolio,formatFolio} from './commerce-domain.mjs';
import {normalizeReceivable} from './tools-p1b-domain.mjs';
import {normalizeOrderCreate,normalizeDelivery,normalizeOrderNotes,normalizeOrderInvoice,normalizeOrderReceivable,nextOrderStatus,formatOrderFolio} from './sales-orders-domain.mjs';
// T024 Pedidos de venta: pedidos desde cotización aceptada de T013, con
// entrega, conversión a cobro (T014), a factura (T015) y opcionalmente a
// CxC (T017). NO duplica cotizaciones ni facturación: copia las partidas
// de la cotización (como createInvoice en operations-invoices.mjs) y
// orquesta lo que ya existe.
// Patrón de inyección de dependencias como training-store: `deps` permite
// probar el store con una base falsa sin tocar Turso; sin deps usa los
// clientes reales. Las conversiones se insertan en las mismas tablas que
// T014/T015/T017 (tenant_collections, tenant_invoices, tenant_receivables)
// con la misma validación (normalizePayment, quoteTotals, normalizeReceivable)
// porque esos stores ligan el cliente real de BD y no aceptan `deps`.
const depsOf=d=>({executeSql:d?.executeSql||realExecuteSql,executeBatch:d?.executeBatch||realExecuteBatch,authorize:d?.authorize||realAuthorize});
const rows=r=>r?.rows?.map(a=>a.map(c=>c?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validId(id,label){if(typeof id!=='string'||!uuid.test(id))throw Error(label);}
const num=v=>Number(v||0);
const today=()=>new Date().toISOString().slice(0,10);
const monthStart=()=>new Date().toISOString().slice(0,8)+'01';
const orderSelect='SELECT id,folio,quote_id,client_id,client_name,title,subtotal_cents,vat_cents,total_cents,vat_rate,status,delivery_date,carrier,tracking_code,notes,invoice_id,receivable_id,created_at,updated_at FROM tenant_sales_orders';
const toOrder=r=>({id:r[0],folio:num(r[1]),folioLabel:formatOrderFolio(num(r[1])),quoteId:r[2],clientId:r[3]||null,
 clientName:r[4],title:r[5],subtotalCents:num(r[6]),vatCents:num(r[7]),totalCents:num(r[8]),vatRate:num(r[9]),
 status:r[10],deliveryDate:r[11]||null,carrier:r[12],trackingCode:r[13],notes:r[14],invoiceId:r[15]||null,
 receivableId:r[16]||null,createdAt:r[17],updatedAt:r[18]});
async function orderFor(db,org,id){
 validId(id,'Invalid order');
 const row=rows(await db.executeSql(orderSelect+' WHERE organization_id=? AND id=?',[org,id]))[0];
 if(!row)throw Error('Not found');
 return toOrder(row);
}
async function orderLines(db,org,orderId){
 const r=await db.executeSql('SELECT id,description,quantity,unit_price_cents,line_total_cents,position FROM tenant_sales_order_lines WHERE organization_id=? AND order_id=? ORDER BY position',[org,orderId]);
 return rows(r).map(x=>({id:x[0],description:x[1],quantity:num(x[2]),unitPriceCents:num(x[3]),lineTotalCents:num(x[4]),position:num(x[5])}));
}
async function paidForQuote(db,org,quoteId){
 const row=rows(await db.executeSql('SELECT COALESCE(SUM(amount_cents),0) FROM tenant_collections WHERE organization_id=? AND quote_id=? AND archived_at IS NULL',[org,quoteId]))[0];
 return num(row?.[0]);
}
async function orderWithDetail(db,org,order){
 const [lines,paidCents]=await Promise.all([orderLines(db,org,order.id),paidForQuote(db,org,order.quoteId)]);
 let invoice=null,receivable=null;
 if(order.invoiceId){
  const inv=rows(await db.executeSql('SELECT id,folio,quote_id,client_name,rfc,items_json,subtotal_cents,vat_cents,total_cents,vat_rate,status,notes,created_at FROM tenant_invoices WHERE organization_id=? AND id=? AND archived_at IS NULL',[org,order.invoiceId]))[0];
  if(inv)invoice={id:inv[0],folio:num(inv[1]),folioLabel:formatFolio(num(inv[1])),quoteId:inv[2],clientName:inv[3],rfc:inv[4],
   items:JSON.parse(inv[5]||'[]'),subtotalCents:num(inv[6]),vatCents:num(inv[7]),totalCents:num(inv[8]),vatRate:num(inv[9]),status:inv[10],notes:inv[11],createdAt:inv[12]};
 }
 if(order.receivableId){
  const rec=rows(await db.executeSql('SELECT id,quote_id,client_id,client_name,total_cents,due_on,notes,created_at FROM tenant_receivables WHERE organization_id=? AND id=? AND archived_at IS NULL',[org,order.receivableId]))[0];
  if(rec)receivable={id:rec[0],quoteId:rec[1],clientId:rec[2]||null,clientName:rec[3],totalCents:num(rec[4]),dueOn:rec[5]||null,notes:rec[6],createdAt:rec[7],paidCents,balanceCents:Math.max(0,num(rec[4])-paidCents)};
 }
 return {...order,lines,paidCents,balanceCents:Math.max(0,order.totalCents-paidCents),invoice,receivable};
}
const CONVERTIBLE=['confirmado','en preparación','enviado','entregado'];
// ---- Pedidos ----
export async function listOrders(token,slug,{status=null}={},deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T024');
 const conds=['o.organization_id=?'],args=[tenant.id];
 if(status){if(!['borrador','confirmado','en preparación','enviado','entregado','cancelado'].includes(status))throw Error('Invalid order');conds.push('o.status=?');args.push(status);}
 const [result,available]=await Promise.all([
  db.executeSql(`SELECT o.id,o.folio,o.quote_id,o.client_id,o.client_name,o.title,o.subtotal_cents,o.vat_cents,o.total_cents,o.vat_rate,o.status,o.delivery_date,o.carrier,o.tracking_code,o.notes,o.invoice_id,o.receivable_id,o.created_at,o.updated_at,
   (SELECT COALESCE(SUM(amount_cents),0) FROM tenant_collections p WHERE p.organization_id=o.organization_id AND p.quote_id=o.quote_id AND p.archived_at IS NULL)
   FROM tenant_sales_orders o WHERE ${conds.join(' AND ')} ORDER BY o.folio DESC LIMIT 100`,args),
  db.executeSql(`SELECT q.id,q.title,q.client_name,q.total_cents FROM tenant_quotes q
   WHERE q.organization_id=? AND q.archived_at IS NULL AND q.status='accepted'
   AND NOT EXISTS (SELECT 1 FROM tenant_sales_orders o WHERE o.organization_id=q.organization_id AND o.quote_id=q.id AND o.status!='cancelado')
   ORDER BY q.updated_at DESC LIMIT 100`,[tenant.id])
 ]);
 return {orders:rows(result).map(x=>({...toOrder(x.slice(0,19)),paidCents:num(x[19]),balanceCents:Math.max(0,num(x[8])-num(x[19]))})),
  availableQuotes:rows(available).map(q=>({id:q[0],title:q[1],clientName:q[2],totalCents:num(q[3])}))};
}
export async function getOrder(token,slug,id,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T024');
 return {order:await orderWithDetail(db,tenant.id,await orderFor(db,tenant.id,id))};
}
// Pedido desde cotización aceptada: copia sus partidas y totales, como
// hace createInvoice (operations-invoices.mjs). Un pedido activo por
// cotización: si ya existe uno no cancelado, se rechaza.
export async function createOrder(token,slug,input,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T024',true);
 const data=normalizeOrderCreate(input);
 const q=rows(await db.executeSql('SELECT client_id,client_name,title,vat_rate,subtotal_cents,vat_cents,total_cents,status FROM tenant_quotes WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,data.quoteId]))[0];
 if(!q)throw Error('Not found');
 if(q[7]!=='accepted')throw Error('Invalid order');
 const lines=rows(await db.executeSql('SELECT description,quantity,unit_price_cents FROM tenant_quote_lines WHERE organization_id=? AND quote_id=? ORDER BY position',[tenant.id,data.quoteId]))
  .map(l=>({description:l[0],quantity:num(l[1]),unitPriceCents:num(l[2])}));
 if(!lines.length)throw Error('Invalid order');
 const normalized=lines.map((l,i)=>normalizeQuoteLine(l,i));
 const totals=quoteTotals(normalized,num(q[3]));
 if(totals.totalCents!==num(q[6]))throw Error('Invalid order');
 const existing=rows(await db.executeSql("SELECT id FROM tenant_sales_orders WHERE organization_id=? AND quote_id=? AND status!='cancelado'",[tenant.id,data.quoteId]));
 if(existing.length)throw Error('Duplicate order');
 const maxFolio=num(rows(await db.executeSql('SELECT COALESCE(MAX(folio),0) FROM tenant_sales_orders WHERE organization_id=?',[tenant.id]))[0]?.[0]);
 const folio=maxFolio+1,id=randomUUID();
 await db.executeBatch([
  {sql:'INSERT INTO tenant_sales_orders(organization_id,id,folio,quote_id,client_id,client_name,title,subtotal_cents,vat_cents,total_cents,vat_rate,status,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
   args:[tenant.id,id,folio,data.quoteId,q[0],q[1],q[2],totals.subtotalCents,totals.vatCents,totals.totalCents,num(q[3]),'borrador',session.userId]},
  ...normalized.map(l=>({sql:'INSERT INTO tenant_sales_order_lines(organization_id,order_id,id,description,quantity,unit_price_cents,line_total_cents,position) VALUES(?,?,?,?,?,?,?,?)',
   args:[tenant.id,id,randomUUID(),l.description,l.quantity,l.unitPriceCents,l.lineTotalCents,l.position]}))
 ]);
 return {order:{id,folio,folioLabel:formatOrderFolio(folio),quoteId:data.quoteId,clientId:q[0]||null,clientName:q[1],title:q[2],
  subtotalCents:totals.subtotalCents,vatCents:totals.vatCents,totalCents:totals.totalCents,vatRate:num(q[3]),status:'borrador',
  deliveryDate:null,carrier:'',trackingCode:'',notes:'',invoiceId:null,receivableId:null,
  lines:normalized,paidCents:0,balanceCents:totals.totalCents}};
}
export async function updateOrderNotes(token,slug,id,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T024',true);
 const order=await orderFor(db,tenant.id,id);
 if(order.status==='cancelado')throw Error('Invalid order');
 const data=normalizeOrderNotes(input);
 const r=await db.executeSql('UPDATE tenant_sales_orders SET notes=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',
  [data.notes,tenant.id,id]);
 if(!changed(r))throw Error('Not found');
 return {ok:true};
}
export async function setOrderStatus(token,slug,id,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T024',true);
 if(!input||Object.keys(input).length!==1||!['borrador','confirmado','en preparación','enviado','entregado','cancelado'].includes(input.status))throw Error('Invalid order');
 const current=await orderFor(db,tenant.id,id);
 nextOrderStatus(current.status,input.status);
 const r=await db.executeSql('UPDATE tenant_sales_orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',
  [input.status,tenant.id,id]);
 if(!changed(r))throw Error('Not found');
 return {ok:true,status:input.status};
}
// Entrega: fecha, guía y paquetería. No cambia el estatus por sí sola.
export async function setDelivery(token,slug,id,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T024',true);
 const order=await orderFor(db,tenant.id,id);
 if(!['confirmado','en preparación','enviado'].includes(order.status))throw Error('Invalid order');
 const data=normalizeDelivery(input);
 const r=await db.executeSql('UPDATE tenant_sales_orders SET delivery_date=?,carrier=?,tracking_code=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',
  [data.deliveryDate,data.carrier,data.trackingCode,tenant.id,id]);
 if(!changed(r))throw Error('Not found');
 return {ok:true,deliveryDate:data.deliveryDate,carrier:data.carrier,trackingCode:data.trackingCode};
}
// ---- Conversiones (orquestan T014 / T015 / T017) ----
// Cobro (T014): un cobro parcial o total aplicado a la cotización del
// pedido; descuenta del saldo como en operations-payments.mjs.
export async function createOrderPayment(token,slug,id,input,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T024',true);
 const order=await orderFor(db,tenant.id,id);
 if(!CONVERTIBLE.includes(order.status))throw Error('Invalid order');
 const paidCents=await paidForQuote(db,tenant.id,order.quoteId);
 const p=normalizePayment({...input,quoteId:order.quoteId,clientId:order.clientId,clientName:order.clientName},
  {quoteTotalCents:order.totalCents,alreadyPaidCents:paidCents});
 const paymentId=randomUUID();
 await db.executeSql('INSERT INTO tenant_collections(organization_id,id,quote_id,client_id,client_name,amount_cents,paid_on,method,reference,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
  [tenant.id,paymentId,p.quoteId,p.clientId,p.clientName,p.amountCents,p.paidOn,p.method,p.reference,p.notes,session.userId]);
 return {payment:{id:paymentId,...p},balanceCents:order.totalCents-paidCents-p.amountCents};
}
// Factura (T015): desde las partidas del pedido (copia de la cotización).
// Idempotente: si el pedido ya tiene factura, devuelve la existente.
export async function createOrderInvoice(token,slug,id,input,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T024',true);
 const order=await orderFor(db,tenant.id,id);
 if(!CONVERTIBLE.includes(order.status))throw Error('Invalid order');
 if(order.invoiceId){
  const existing=await orderWithDetail(db,tenant.id,order);
  return {invoice:existing.invoice,existing:true};
 }
 const data=normalizeOrderInvoice(input||{});
 const lines=(await orderLines(db,tenant.id,id)).map((l,i)=>normalizeQuoteLine(l,i));
 const totals=quoteTotals(lines,order.vatRate);
 if(totals.totalCents!==order.totalCents)throw Error('Invalid invoice');
 const maxFolio=num(rows(await db.executeSql('SELECT COALESCE(MAX(folio),0) FROM tenant_invoices WHERE organization_id=?',[tenant.id]))[0]?.[0]);
 const folio=nextFolio(maxFolio),invoiceId=randomUUID();
 await db.executeBatch([
  {sql:'INSERT INTO tenant_invoices(organization_id,id,folio,quote_id,client_name,rfc,items_json,subtotal_cents,vat_cents,total_cents,vat_rate,status,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
   args:[tenant.id,invoiceId,folio,order.quoteId,order.clientName,data.rfc,JSON.stringify(lines),totals.subtotalCents,totals.vatCents,totals.totalCents,order.vatRate,'draft',data.notes,session.userId]},
  {sql:'UPDATE tenant_sales_orders SET invoice_id=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',
   args:[invoiceId,tenant.id,id]}
 ]);
 return {invoice:{id:invoiceId,folio,folioLabel:formatFolio(folio),quoteId:order.quoteId,clientName:order.clientName,rfc:data.rfc,
  items:lines,subtotalCents:totals.subtotalCents,vatCents:totals.vatCents,totalCents:totals.totalCents,vatRate:order.vatRate,
  status:'draft',notes:data.notes,cfdi:false,cfdiNote:'Sin CFDI (pendiente PAC)'},existing:false};
}
// CxC (T017): abre la cuenta por cobrar de la cotización del pedido.
// Idempotente por pedido; una sola CxC por cotización.
export async function createOrderReceivable(token,slug,id,input,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T024',true);
 const order=await orderFor(db,tenant.id,id);
 if(!CONVERTIBLE.includes(order.status))throw Error('Invalid order');
 if(order.receivableId){
  const existing=await orderWithDetail(db,tenant.id,order);
  return {receivable:existing.receivable,existing:true};
 }
 const data=normalizeOrderReceivable(input||{});
 const quote=rows(await db.executeSql('SELECT client_id,client_name,total_cents,status FROM tenant_quotes WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,order.quoteId]))[0];
 if(!quote||quote[3]!=='accepted')throw Error('Invalid order');
 const already=rows(await db.executeSql('SELECT id FROM tenant_receivables WHERE organization_id=? AND quote_id=? AND archived_at IS NULL',[tenant.id,order.quoteId]));
 if(already.length)throw Error('Receivable already exists');
 const receivableId=randomUUID();
 await db.executeBatch([
  {sql:'INSERT INTO tenant_receivables(organization_id,id,quote_id,client_id,client_name,total_cents,due_on,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?)',
   args:[tenant.id,receivableId,order.quoteId,quote[0],quote[1],num(quote[2]),data.dueOn,data.notes,session.userId]},
  {sql:'UPDATE tenant_sales_orders SET receivable_id=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',
   args:[receivableId,tenant.id,id]}
 ]);
 const paidCents=await paidForQuote(db,tenant.id,order.quoteId);
 return {receivable:{id:receivableId,quoteId:order.quoteId,clientId:quote[0]||null,clientName:quote[1],
  totalCents:num(quote[2]),dueOn:data.dueOn,paidCents,balanceCents:Math.max(0,num(quote[2])-paidCents),bucket:'corriente'},existing:false};
}
// ---- Tablero (composición Dropify: KPIs del mes + serie diaria real) ----
export async function dashboard(token,slug,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T024');
 const org=tenant.id,from=monthStart(),to=today();
 const {orders}=await listOrders(token,slug,{},deps);
 const monthOrders=orders.filter(o=>(o.createdAt||'').slice(0,10)>=from&&(o.createdAt||'').slice(0,10)<=to);
 const byStatus={};
 for(const o of orders)byStatus[o.status]=(byStatus[o.status]||0)+1;
 const dailyMap={};
 for(const o of monthOrders){const day=(o.createdAt||'').slice(0,10);dailyMap[day]=(dailyMap[day]||0)+1;}
 const daily=[];
 const cursor=new Date(from+'T00:00:00Z');
 while(cursor.toISOString().slice(0,10)<=to){const day=cursor.toISOString().slice(0,10);daily.push({day,count:dailyMap[day]||0});cursor.setUTCDate(cursor.getUTCDate()+1);}
 const openOrders=orders.filter(o=>!['entregado','cancelado'].includes(o.status));
 return {kpis:{monthOrders:monthOrders.length,preparing:byStatus['en preparación']||0,shipped:byStatus['enviado']||0,
  delivered:byStatus['entregado']||0,total:orders.length,
  openCents:openOrders.reduce((a,o)=>a+o.totalCents,0),
  openBalanceCents:openOrders.reduce((a,o)=>a+o.balanceCents,0)},
  byStatus,daily,month:{from,to}};
}
