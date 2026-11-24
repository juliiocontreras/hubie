import test from 'node:test';
import assert from 'node:assert/strict';
import {createSalesOrdersFakeDb,salesOrdersDeps} from './sales-orders-fake-db.mjs';
import {listOrders,getOrder,createOrder,updateOrderNotes,setOrderStatus,setDelivery,
 createOrderPayment,createOrderInvoice,createOrderReceivable,dashboard} from '../platform/sales-orders-store.mjs';

const token='<redacted>',slug='demo',otherSlug='demo-b';
const setup=()=>{const fake=createSalesOrdersFakeDb();return {fake,deps:salesOrdersDeps(fake)};};
const QUOTE_ID='11111111-1111-4111-8111-111111111111';
function seedQuote(fake,over={}){
 fake.tables.quotes.push({organization_id:fake.orgA,id:QUOTE_ID,client_id:null,client_name:'Negocio ficticio',
  title:'Cotización de empaque',vat_rate:16,subtotal_cents:10000,vat_cents:1600,total_cents:11600,
  status:'accepted',updated_at:'2026-11-15T00:00:00.000Z',archived_at:null,
  lines:[{description:'Caja 16x12x12',quantity:2,unit_price_cents:5000}],...over});
 return QUOTE_ID;
}
async function confirmedOrder(deps,quoteId=QUOTE_ID){
 const order=(await createOrder(token,slug,{quoteId},deps)).order;
 await setOrderStatus(token,slug,order.id,{status:'confirmado'},deps);
 return order;
}

test('pedidos: crear desde cotización aceptada copia partidas y totales',async()=>{
 const {fake,deps}=setup();
 seedQuote(fake);
 const created=await createOrder(token,slug,{quoteId:QUOTE_ID},deps);
 assert.equal(created.order.folio,1);
 assert.equal(created.order.folioLabel,'PV-0001');
 assert.equal(created.order.status,'borrador');
 assert.equal(created.order.totalCents,11600);
 assert.equal(created.order.lines.length,1);
 assert.equal(created.order.lines[0].description,'Caja 16x12x12');
 assert.equal(created.order.lines[0].lineTotalCents,10000);
 assert.equal(created.order.balanceCents,11600);
 await assert.rejects(()=>createOrder(token,slug,{quoteId:QUOTE_ID},deps),/Duplicate order/);
 const listed=await listOrders(token,slug,{},deps);
 assert.equal(listed.orders.length,1);
 assert.equal(listed.availableQuotes.length,0,'la cotización ya tiene pedido activo');
 assert.equal(fake.tables.orders.length,1);
});

test('pedidos: cotización inexistente, no aceptada o sin partidas se rechaza',async()=>{
 const {deps}=setup();
 await assert.rejects(()=>createOrder(token,slug,{quoteId:QUOTE_ID},deps),/Not found/);
 const {fake}=setup();
 seedQuote(fake,{status:'sent'});
 await assert.rejects(()=>createOrder(token,slug,{quoteId:QUOTE_ID},salesOrdersDeps(fake)),/Invalid order/);
 const {fake:fake2}=setup();
 seedQuote(fake2,{lines:[]});
 await assert.rejects(()=>createOrder(token,slug,{quoteId:QUOTE_ID},salesOrdersDeps(fake2)),/Invalid order/);
});

test('pedidos: flujo de estatus lineal y entrega solo desde confirmado',async()=>{
 const {fake,deps:deps2}=setup();
 seedQuote(fake);
 const order=(await createOrder(token,slug,{quoteId:QUOTE_ID},deps2)).order;
 await assert.rejects(()=>setOrderStatus(token,slug,order.id,{status:'enviado'},deps2),/Invalid order status/);
 await assert.rejects(()=>setDelivery(token,slug,order.id,{carrier:'Estafeta'},deps2),/Invalid order/);
 const confirmed=await setOrderStatus(token,slug,order.id,{status:'confirmado'},deps2);
 assert.equal(confirmed.status,'confirmado');
 const delivery=await setDelivery(token,slug,order.id,{deliveryDate:'2026-11-20',carrier:'Estafeta',trackingCode:'ABC123'},deps2);
 assert.equal(delivery.carrier,'Estafeta');
 assert.equal(delivery.trackingCode,'ABC123');
 await setOrderStatus(token,slug,order.id,{status:'en preparación'},deps2);
 await setOrderStatus(token,slug,order.id,{status:'enviado'},deps2);
 const delivered=await setOrderStatus(token,slug,order.id,{status:'entregado'},deps2);
 assert.equal(delivered.status,'entregado');
 await assert.rejects(()=>setOrderStatus(token,slug,order.id,{status:'cancelado'},deps2),/Invalid order status/);
 await assert.rejects(()=>setDelivery(token,slug,order.id,{carrier:'DHL'},deps2),/Invalid order/);
});

test('pedidos: notas solo editables si no está cancelado',async()=>{
 const {fake,deps}=setup();
 seedQuote(fake);
 const order=(await createOrder(token,slug,{quoteId:QUOTE_ID},deps)).order;
 const ok=await updateOrderNotes(token,slug,order.id,{notes:'Entregar en recepción.'},deps);
 assert.equal(ok.ok,true);
 await setOrderStatus(token,slug,order.id,{status:'cancelado'},deps);
 await assert.rejects(()=>updateOrderNotes(token,slug,order.id,{notes:'Tarde'},deps),/Invalid order/);
});

test('conversión a cobro: parcial válido, sobrepago y borrador rechazados',async()=>{
 const {fake,deps}=setup();
 seedQuote(fake);
 const order=await confirmedOrder(deps);
 const payment=await createOrderPayment(token,slug,order.id,
  {amountCents:5000,paidOn:'2026-11-20',method:'transferencia',reference:'TR-1'},deps);
 assert.equal(payment.payment.amountCents,5000);
 assert.equal(payment.balanceCents,6600);
 assert.equal(fake.tables.collections.length,1);
 assert.equal(fake.tables.collections[0].quote_id,QUOTE_ID);
 await assert.rejects(()=>createOrderPayment(token,slug,order.id,
  {amountCents:6601,paidOn:'2026-11-21',method:'efectivo'},deps),/Invalid payment/);
 const rest=await createOrderPayment(token,slug,order.id,
  {amountCents:6600,paidOn:'2026-11-21',method:'efectivo'},deps);
 assert.equal(rest.balanceCents,0);
 const {fake:fake2,deps:deps2}=setup();
 seedQuote(fake2);
 const draft=(await createOrder(token,slug,{quoteId:QUOTE_ID},deps2)).order;
 await assert.rejects(()=>createOrderPayment(token,slug,draft.id,
  {amountCents:100,paidOn:'2026-11-20',method:'efectivo'},deps2),/Invalid order/);
});

test('conversión a factura: desde las partidas del pedido, idempotente',async()=>{
 const {fake,deps}=setup();
 seedQuote(fake);
 const order=await confirmedOrder(deps);
 const first=await createOrderInvoice(token,slug,order.id,{},deps);
 assert.equal(first.existing,false);
 assert.equal(first.invoice.folio,1);
 assert.equal(first.invoice.folioLabel,'F-0001');
 assert.equal(first.invoice.status,'draft');
 assert.equal(first.invoice.totalCents,11600);
 assert.equal(first.invoice.cfdi,false);
 assert.equal(first.invoice.items.length,1);
 assert.equal(fake.tables.invoices.length,1);
 const second=await createOrderInvoice(token,slug,order.id,{},deps);
 assert.equal(second.existing,true);
 assert.equal(second.invoice.id,first.invoice.id);
 assert.equal(fake.tables.invoices.length,1,'segunda conversión no duplica la factura');
 const detail=await getOrder(token,slug,order.id,deps);
 assert.equal(detail.order.invoice.folio,1);
 assert.equal(detail.order.paidCents,0);
});

test('conversión a CxC: abre la cuenta, idempotente y una por cotización',async()=>{
 const {fake,deps}=setup();
 seedQuote(fake);
 const order=await confirmedOrder(deps);
 const first=await createOrderReceivable(token,slug,order.id,{dueOn:'2026-12-20'},deps);
 assert.equal(first.existing,false);
 assert.equal(first.receivable.totalCents,11600);
 assert.equal(first.receivable.dueOn,'2026-12-20');
 assert.equal(first.receivable.balanceCents,11600);
 const second=await createOrderReceivable(token,slug,order.id,{},deps);
 assert.equal(second.existing,true);
 assert.equal(second.receivable.id,first.receivable.id);
 assert.equal(fake.tables.receivables.length,1);
 // Otra CxC directa para la misma cotización bloquea la conversión.
 const {fake:fake2,deps:deps2}=setup();
 seedQuote(fake2);
 const order2=await confirmedOrder(deps2);
 fake2.tables.receivables.push({organization_id:fake2.orgA,id:'r-x',quote_id:QUOTE_ID,client_id:null,
  client_name:'Negocio ficticio',total_cents:11600,due_on:null,notes:'',archived_at:null});
 await assert.rejects(()=>createOrderReceivable(token,slug,order2.id,{},deps2),/Receivable already exists/);
});

test('tablero: KPIs por estatus y serie diaria del mes',async()=>{
 const {fake,deps}=setup();
 seedQuote(fake);
 const order=await confirmedOrder(deps);
 await setOrderStatus(token,slug,order.id,{status:'en preparación'},deps);
 const dash=await dashboard(token,slug,deps);
 assert.equal(dash.kpis.total,1);
 assert.equal(dash.kpis.preparing,1);
 assert.equal(dash.kpis.shipped,0);
 assert.equal(dash.kpis.monthOrders,1);
 assert.equal(dash.kpis.openCents,11600);
 assert.equal(dash.byStatus['en preparación'],1);
 assert.ok(Array.isArray(dash.daily)&&dash.daily.length>=1);
 assert.equal(dash.daily.reduce((a,d)=>a+d.count,0),1);
});

test('aislamiento entre tenants: pedidos y cotizaciones no se ven en el otro tenant',async()=>{
 const {fake,deps}=setup();
 seedQuote(fake);
 const order=(await createOrder(token,slug,{quoteId:QUOTE_ID},deps)).order;
 assert.equal((await listOrders(token,otherSlug,{},deps)).orders.length,0);
 assert.equal((await listOrders(token,otherSlug,{},deps)).availableQuotes.length,0);
 await assert.rejects(()=>getOrder(token,otherSlug,order.id,deps),/Not found/);
 await assert.rejects(()=>createOrder(token,otherSlug,{quoteId:QUOTE_ID},deps),/Not found/);
 await assert.rejects(()=>listOrders('bad-token',slug,{},deps),/Unauthorized/);
});
