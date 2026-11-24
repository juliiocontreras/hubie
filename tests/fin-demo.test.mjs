import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoStore} from '../assets/demo-backend.js';
import {catalog} from '../platform/catalog.mjs';

const req=(demo,path,body,method='POST')=>demo.request(path,{method,body:JSON.stringify(body)});
async function finTenant(demo,toolIds){
 const created=await demo.request('/api/admin/tenants',{method:'POST',body:JSON.stringify({
  name:'Comercio Finanzas',slug:'comercio-fin',suiteId:'S004',
  toolIds:[...catalog.tools.filter(t=>t.included).map(t=>t.id),...toolIds]})});
 return created.tenant.slug;
}
const today=()=>new Date().toISOString().slice(0,10);

test('demo T023: catálogo base, póliza balanceada, registro y reportes',async()=>{
 const demo=createDemoStore(catalog),slug=await finTenant(demo,['T023']);
 const base='/api/app/'+slug+'/accounting';
 const seeded=await req(demo,base+'/accounts/seed',{});
 assert.equal(seeded.accounts.length,11);
 const byCode=Object.fromEntries(seeded.accounts.map(a=>[a.code,a]));
 const entry=await req(demo,base+'/entries',{entryDate:today(),concept:'Venta del día',lines:[
  {accountId:byCode['1000'].id,debitCents:11600,creditCents:0},
  {accountId:byCode['4000'].id,debitCents:0,creditCents:10000},
  {accountId:byCode['2100'].id,debitCents:0,creditCents:1600}]});
 assert.equal(entry.entry.folioLabel,'P-0001');
 assert.equal(entry.entry.status,'borrador');
 // La póliza en borrador no entra en los reportes.
 assert.equal((await demo.request(base+'/trial-balance')).totalDebitCents,0);
 await req(demo,base+'/entries/'+entry.entry.id+'/status',{status:'registrada'},'PATCH');
 const balanza=await demo.request(base+'/trial-balance');
 assert.equal(balanza.totalDebitCents,11600);
 assert.equal(balanza.totalCreditCents,11600);
 assert.equal(balanza.balanced,true);
 const income=await demo.request(base+'/income-statement');
 assert.equal(income.incomeCents,10000);
 assert.equal(income.profitCents,10000);
 const sheet=await demo.request(base+'/balance-sheet');
 assert.equal(sheet.balanced,true);
 assert.equal(sheet.assetsCents,11600);
 const csv=await demo.request(base+'/export?kind=trial-balance');
 assert.equal(csv.filename,'hubie-contabilidad-balanza.csv');
 assert.match(csv.csv,/1000,Caja,activo,116\.00,0\.00,116\.00/);
 const dash=await demo.request(base+'/dashboard');
 assert.equal(dash.kpis.monthIncomeCents,10000);
 assert.equal(dash.kpis.activeAccounts,11);
});

test('demo T023: el tenant comercio-demo trae el catálogo y una póliza registrada',async()=>{
 const demo=createDemoStore(catalog);
 const dash=await demo.request('/api/app/comercio-demo/accounting/dashboard');
 assert.equal(dash.kpis.activeAccounts,11);
 assert.equal(dash.kpis.monthIncomeCents,10000);
 assert.equal(dash.kpis.registeredEntries,1);
});

test('demo T024: pedido desde cotización aceptada hasta cobro, factura y CxC',async()=>{
 const demo=createDemoStore(catalog),slug=await finTenant(demo,['T013','T014','T015','T017','T024']);
 const qbase='/api/app/'+slug+'/workflows/quotes';
 const quote=await req(demo,qbase,{title:'Cotización de empaque',clientName:'Negocio ficticio',vatRate:16,
  lines:[{description:'Caja 16x12x12',quantity:2,unitPriceCents:5000}]});
 assert.equal(quote.quote.totalCents,11600);
 await req(demo,qbase+'/'+quote.quote.id+'/accept',{});
 const base='/api/app/'+slug+'/sales-orders';
 const listed=await demo.request(base+'/orders');
 assert.equal(listed.availableQuotes.length,1);
 const created=await req(demo,base+'/orders',{quoteId:quote.quote.id});
 assert.equal(created.order.folioLabel,'PV-0001');
 assert.equal(created.order.status,'borrador');
 assert.equal(created.order.lines.length,1);
 await req(demo,base+'/orders/'+created.order.id+'/status',{status:'confirmado'},'PATCH');
 const delivery=await req(demo,base+'/orders/'+created.order.id+'/delivery',
  {deliveryDate:today(),carrier:'Estafeta',trackingCode:'ABC123'},'PATCH');
 assert.equal(delivery.carrier,'Estafeta');
 const payment=await req(demo,base+'/orders/'+created.order.id+'/payment',
  {amountCents:5000,paidOn:today(),method:'transferencia',reference:'TR-1'});
 assert.equal(payment.balanceCents,6600);
 const invoice=await req(demo,base+'/orders/'+created.order.id+'/invoice',{});
 assert.equal(invoice.existing,false);
 assert.equal(invoice.invoice.folioLabel,'F-0001');
 assert.equal(invoice.invoice.status,'draft');
 const again=await req(demo,base+'/orders/'+created.order.id+'/invoice',{});
 assert.equal(again.existing,true);
 const receivable=await req(demo,base+'/orders/'+created.order.id+'/receivable',{dueOn:'2026-12-20'});
 assert.equal(receivable.receivable.balanceCents,6600);
 assert.equal(receivable.receivable.dueOn,'2026-12-20');
 const detail=await demo.request(base+'/orders/'+created.order.id);
 assert.equal(detail.order.invoice.folio,1);
 assert.equal(detail.order.receivable.totalCents,11600);
 assert.equal(detail.order.paidCents,5000);
 const dash=await demo.request(base+'/dashboard');
 assert.equal(dash.kpis.total,1);
 assert.equal(dash.kpis.monthOrders,1);
 assert.equal(dash.daily.reduce((s,d)=>s+d.count,0),1);
});
