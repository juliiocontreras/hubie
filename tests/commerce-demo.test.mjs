import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoStore} from '../assets/demo-backend.js';
import {catalog} from '../platform/catalog.mjs';

const month=new Date().toISOString().slice(0,7);
const prevMonth=(()=>{const d=new Date();d.setUTCMonth(d.getUTCMonth()-1);return d.toISOString().slice(0,7);})();
const quoteBody=(over={})=>({title:'Cotización taller',clientName:'Cliente MX',vatRate:16,validUntil:month+'-28',
 lines:[{description:'Instalación',quantity:2,unitPriceCents:150000},{description:'Material',quantity:1,unitPriceCents:50000}],...over});

async function commerceTenant(demo){
 const created=await demo.request('/api/app/organizations');
 assert.ok(created.organizations.length>=2);
 const tenant=await demo.request('/api/admin/tenants',{method:'POST',body:JSON.stringify({
  name:'Comercio real',slug:'comercio-real',suiteId:'S004',
  toolIds:[...catalog.tools.filter(t=>t.included).map(t=>t.id),'C006','C007','T013','T014','T015','T020']})});
 return tenant.tenant.slug;
}
async function otherTenant(demo){
 const tenant=await demo.request('/api/admin/tenants',{method:'POST',body:JSON.stringify({
  name:'Otro comercio',slug:'otro-comercio',suiteId:'S004',
  toolIds:[...catalog.tools.filter(t=>t.included).map(t=>t.id),'C006','C007','T013','T014','T015','T020']})});
 return tenant.tenant.slug;
}

test('T013 quotes: totals with VAT, lifecycle, public token and tenant isolation',async()=>{
 const demo=createDemoStore(catalog);
 const slug=await commerceTenant(demo),other=await otherTenant(demo);
 const base='/api/app/'+slug+'/workflows/quotes';
 await assert.rejects(()=>demo.request(base,{method:'POST',body:JSON.stringify({title:'X',clientName:'C',lines:[]})}),/Invalid quote/);
 const created=await demo.request(base,{method:'POST',body:JSON.stringify(quoteBody())});
 const q=created.quote;
 assert.equal(q.status,'draft');
 assert.deepEqual([q.subtotalCents,q.vatCents,q.totalCents],[350000,56000,406000]);
 assert.match(q.publicToken,/^[0-9a-f]{32}$/);
 assert.equal(q.balanceCents,406000);
 // Aceptar desde borrador es válido; enviar una aceptada ya no.
 const second=await demo.request(base,{method:'POST',body:JSON.stringify(quoteBody({title:'Segunda'}))});
 await demo.request(base+'/'+second.quote.id+'/accept',{method:'POST',body:'{}'});
 assert.equal((await demo.request(base)).quotes.find(x=>x.id===second.quote.id).status,'accepted');
 await assert.rejects(()=>demo.request(base+'/'+second.quote.id+'/send',{method:'POST',body:'{}'}),/Invalid quote status/);
 // Rechazada -> borrador -> enviada -> aceptada.
 const third=await demo.request(base,{method:'POST',body:JSON.stringify(quoteBody({title:'Tercera'}))});
 await demo.request(base+'/'+third.quote.id+'/reject',{method:'POST',body:'{}'});
 await demo.request(base+'/'+third.quote.id+'/draft',{method:'POST',body:'{}'});
 await demo.request(base+'/'+third.quote.id+'/send',{method:'POST',body:'{}'});
 const detail=await demo.request(base+'/'+third.quote.id);
 assert.equal(detail.quote.status,'sent');
 assert.equal(detail.quote.lines.length,2);
 assert.equal(detail.quote.lines[0].lineTotalCents,300000);
 // Editar solo en borrador.
 await assert.rejects(()=>demo.request(base+'/'+second.quote.id,{method:'PATCH',body:JSON.stringify(quoteBody({title:'No editable'}))}),/Invalid quote status/);
 await demo.request(base+'/'+q.id,{method:'PATCH',body:JSON.stringify(quoteBody({title:'Cotización taller v2'}))});
 assert.equal((await demo.request(base)).quotes.find(x=>x.id===q.id).title,'Cotización taller v2');
 // Aislamiento por tenant.
 assert.equal((await demo.request('/api/app/'+other+'/workflows/quotes')).quotes.length,0);
 await assert.rejects(()=>demo.request('/api/app/'+other+'/workflows/quotes/'+q.id),/Not found/);
});

test('C006 catalog: SKU uniqueness, active flag and C007 expenses with summary and date filter',async()=>{
 const demo=createDemoStore(catalog);
 const slug=await commerceTenant(demo);
 const cat='/api/app/'+slug+'/workflows/catalog';
 const item=await demo.request(cat,{method:'POST',body:JSON.stringify({sku:'prod-01',name:'Impresora térmica',priceCents:618100,category:'Impresoras',description:'Zebra'})});
 assert.equal(item.item.sku,'PROD-01');
 await assert.rejects(()=>demo.request(cat,{method:'POST',body:JSON.stringify({sku:'PROD-01',name:'Otra',priceCents:100})}),/Duplicate SKU/);
 await demo.request(cat+'/'+item.item.id,{method:'PATCH',body:JSON.stringify({sku:'PROD-01',name:'Impresora térmica',priceCents:600000,category:'Impresoras',active:false})});
 const listed=(await demo.request(cat)).items;
 assert.equal(listed.find(x=>x.id===item.item.id).active,false);
 assert.equal(listed.find(x=>x.id===item.item.id).priceCents,600000);
 const exp='/api/app/'+slug+'/workflows/expenses';
 await demo.request(exp,{method:'POST',body:JSON.stringify({description:'Renta local',amountCents:850000,occurredOn:month+'-01',category:'renta',vendor:'Inmobiliaria'})});
 await demo.request(exp,{method:'POST',body:JSON.stringify({description:'Papel térmico',amountCents:120000,occurredOn:month+'-05',category:'insumos',vendor:'Proveedor MX'})});
 await demo.request(exp,{method:'POST',body:JSON.stringify({description:'Renta anterior',amountCents:800000,occurredOn:prevMonth+'-01',category:'renta'})});
 await assert.rejects(()=>demo.request(exp,{method:'POST',body:JSON.stringify({description:'X',amountCents:100,occurredOn:month+'-01',category:'fiesta'})}),/Invalid expense/);
 const all=await demo.request(exp);
 assert.equal(all.expenses.length,3);
 assert.equal(all.summary.totalCents,1770000);
 assert.equal(all.summary.byCategory.renta,1650000);
 const filtered=await demo.request(exp+'?from='+month+'-01&to='+month+'-31');
 assert.equal(filtered.expenses.length,2);
 assert.equal(filtered.summary.totalCents,970000);
 const byCat=await demo.request(exp+'?category=insumos');
 assert.equal(byCat.expenses.length,1);
});

test('T014 payments reconcile against accepted quotes and never overpay',async()=>{
 const demo=createDemoStore(catalog);
 const slug=await commerceTenant(demo);
 const qbase='/api/app/'+slug+'/workflows/quotes';
 const pbase='/api/app/'+slug+'/workflows/payments';
 const created=await demo.request(qbase,{method:'POST',body:JSON.stringify(quoteBody())});
 const q=created.quote;
 // Sin aceptar también se puede conciliar (sent/accepted); aquí se acepta primero.
 await demo.request(qbase+'/'+q.id+'/accept',{method:'POST',body:'{}'});
 await assert.rejects(()=>demo.request(pbase,{method:'POST',body:JSON.stringify({clientName:'Cliente MX',quoteId:q.id,amountCents:500000,paidOn:month+'-10',method:'transferencia'})}),/Invalid payment/);
 const first=await demo.request(pbase,{method:'POST',body:JSON.stringify({clientName:'Cliente MX',quoteId:q.id,amountCents:100000,paidOn:month+'-10',method:'transferencia',reference:'TR-1'})});
 assert.equal(first.payment.amountCents,100000);
 let list=await demo.request(pbase);
 assert.equal(list.payments[0].quoteBalanceCents,306000);
 assert.equal(list.quotes[0].balanceCents,306000);
 await demo.request(pbase,{method:'POST',body:JSON.stringify({clientName:'Cliente MX',quoteId:q.id,amountCents:306000,paidOn:month+'-11',method:'efectivo'})});
 list=await demo.request(pbase);
 assert.equal(list.quotes[0].balanceCents,0);
 // Cobro sin cotización también es válido.
 await demo.request(pbase,{method:'POST',body:JSON.stringify({clientName:'Venta mostrador',amountCents:5000,paidOn:month+'-12',method:'tarjeta'})});
 assert.equal((await demo.request(pbase)).payments.length,3);
 // El monto no se edita; solo método/referencia/notas/fecha.
 await assert.rejects(()=>demo.request(pbase+'/'+first.payment.id,{method:'PATCH',body:JSON.stringify({amountCents:1,paidOn:month+'-10',method:'efectivo'})}),/Invalid payment/);
 await demo.request(pbase+'/'+first.payment.id,{method:'PATCH',body:JSON.stringify({paidOn:month+'-10',method:'tarjeta',reference:'TR-1B',notes:'Corregido'})});
 assert.equal((await demo.request(pbase)).payments.find(x=>x.id===first.payment.id).method,'tarjeta');
});

test('T015 invoices from an accepted quote: sequential folio, totals copied, no CFDI',async()=>{
 const demo=createDemoStore(catalog);
 const slug=await commerceTenant(demo);
 const qbase='/api/app/'+slug+'/workflows/quotes';
 const ibase='/api/app/'+slug+'/workflows/invoices';
 const draft=await demo.request(qbase,{method:'POST',body:JSON.stringify(quoteBody())});
 await assert.rejects(()=>demo.request(ibase,{method:'POST',body:JSON.stringify({quoteId:draft.quote.id})}),/Invalid invoice/);
 await demo.request(qbase+'/'+draft.quote.id+'/accept',{method:'POST',body:'{}'});
 const inv=await demo.request(ibase,{method:'POST',body:JSON.stringify({quoteId:draft.quote.id,rfc:'ABC123456T78'})});
 assert.equal(inv.invoice.folio,1);
 assert.equal(inv.invoice.folioLabel,'F-0001');
 assert.equal(inv.invoice.totalCents,406000);
 assert.equal(inv.invoice.cfdi,false);
 assert.equal(inv.invoice.cfdiNote,'Sin CFDI (pendiente PAC)');
 assert.equal(inv.invoice.items.length,2);
 const second=await demo.request(ibase,{method:'POST',body:JSON.stringify({clientName:'Cliente manual',rfc:'',lines:[{description:'Servicio',quantity:1,unitPriceCents:10000}]})});
 assert.equal(second.invoice.folio,2);
 assert.equal(second.invoice.folioLabel,'F-0002');
 await demo.request(ibase+'/'+inv.invoice.id+'/issued',{method:'POST',body:'{}'});
 assert.equal((await demo.request(ibase)).invoices.find(x=>x.id===inv.invoice.id).status,'issued');
 await assert.rejects(()=>demo.request(ibase+'/'+inv.invoice.id+'/issued',{method:'POST',body:'{}'}),/Invalid invoice/);
 await demo.request(ibase+'/'+inv.invoice.id+'/cancelled',{method:'POST',body:'{}'});
 assert.equal((await demo.request(ibase)).invoices.find(x=>x.id===inv.invoice.id).status,'cancelled');
});

test('T020 reports: monthly summary and real CSV exports with escaping',async()=>{
 const demo=createDemoStore(catalog);
 const slug=await commerceTenant(demo);
 const qbase='/api/app/'+slug+'/workflows/quotes';
 const pbase='/api/app/'+slug+'/workflows/payments';
 const ebase='/api/app/'+slug+'/workflows/expenses';
 const rbase='/api/app/'+slug+'/workflows/reports';
 const q=await demo.request(qbase,{method:'POST',body:JSON.stringify(quoteBody())});
 await demo.request(qbase+'/'+q.quote.id+'/accept',{method:'POST',body:'{}'});
 await demo.request(pbase,{method:'POST',body:JSON.stringify({clientName:'Cliente MX',quoteId:q.quote.id,amountCents:200000,paidOn:month+'-10',method:'transferencia'})});
 await demo.request(ebase,{method:'POST',body:JSON.stringify({description:'Renta, local "A"',amountCents:850000,occurredOn:month+'-01',category:'renta'})});
 const summary=await demo.request(rbase+'?month='+month);
 assert.equal(summary.totals.paymentsCents,200000);
 assert.equal(summary.totals.expensesCents,850000);
 assert.equal(summary.totals.balanceCents,-650000);
 assert.equal(summary.totals.acceptedQuotes,1);
 assert.equal(summary.totals.acceptedQuotesCents,406000);
 assert.equal(summary.byMonth.length,6);
 assert.equal(summary.byMonth.find(m=>m.month===month).paymentsCents,200000);
 const csv=await demo.request(rbase+'/export?kind=expenses');
 assert.equal(csv.filename,'hubie-gastos.csv');
 assert.ok(csv.csv.startsWith('Concepto,Categoría,Proveedor,Monto MXN,Fecha\r\n'));
 assert.ok(csv.csv.includes('"Renta, local ""A"""'));
 assert.ok(csv.csv.includes('8500.00'));
 const clients=await demo.request(rbase+'/export?kind=clients');
 assert.ok(clients.csv.startsWith('Nombre,Empresa,Correo,Teléfono,Estatus\r\n'));
 const quotes=await demo.request(rbase+'/export?kind=quotes');
 assert.ok(quotes.csv.includes('Cotización taller'));
 const pays=await demo.request(rbase+'/export?kind=payments');
 assert.ok(pays.csv.includes('2000.00'));
 await assert.rejects(()=>demo.request(rbase+'/export?kind=inventario'),/Not found/);
});
