import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeQuote,normalizeQuoteLine,quoteTotals,nextQuoteStatus,remainingBalance,
 normalizeCatalogItem,normalizeExpense,summarizeExpenses,normalizePayment,
 normalizeInvoice,nextFolio,formatFolio,csvEscape,buildCsv,reportColumns,moneyText,
 quoteStatuses,expenseCategories,paymentMethods,invoiceStatuses} from '../platform/commerce-domain.mjs';

test('quote totals compute subtotal, 16% VAT and total in integer cents',()=>{
 const lines=[
  normalizeQuoteLine({description:'Instalación',quantity:2,unitPriceCents:150000},0),
  normalizeQuoteLine({description:'Material',quantity:1,unitPriceCents:50000},1)
 ];
 assert.deepEqual(quoteTotals(lines,16),{subtotalCents:350000,vatCents:56000,totalCents:406000});
 assert.deepEqual(quoteTotals(lines,8),{subtotalCents:350000,vatCents:28000,totalCents:378000});
 assert.deepEqual(quoteTotals(lines,0),{subtotalCents:350000,vatCents:0,totalCents:350000});
 // Redondeo: 16% de 333 centavos = 53.28 -> 53.
 assert.equal(quoteTotals([{lineTotalCents:333}],16).vatCents,53);
 assert.throws(()=>quoteTotals([],16),/Invalid quote/);
});
test('quote normalization requires title, client and at least one valid line',()=>{
 const q=normalizeQuote({title:'  Cotización taller ',clientName:'Cliente MX',vatRate:16,
  validUntil:'2026-12-31',lines:[{description:'Servicio',quantity:1,unitPriceCents:10000}]});
 assert.equal(q.title,'Cotización taller');
 assert.equal(q.totalCents,11600);
 assert.equal(q.status,undefined);
 assert.throws(()=>normalizeQuote({title:'X',clientName:'C',lines:[]}),/Invalid quote/);
 assert.throws(()=>normalizeQuote({title:'X',clientName:'C',lines:[{description:'A',quantity:1,unitPriceCents:1}],vatRate:21}),/Invalid quote/);
 assert.throws(()=>normalizeQuote({title:'X',clientName:'C',lines:[{description:'A',quantity:0,unitPriceCents:1}]}),/Invalid quote/);
 assert.throws(()=>normalizeQuote({title:'X',clientName:'C',lines:[{description:'A',quantity:1,unitPriceCents:-5}]}),/Invalid quote/);
 assert.throws(()=>normalizeQuote({title:'X',clientName:'C',validUntil:'2026-02-30',lines:[{description:'A',quantity:1,unitPriceCents:1}]}),/Invalid quote/);
 assert.throws(()=>normalizeQuote({title:'X',clientName:'C',lines:[{description:'A',quantity:1,unitPriceCents:1.5}]}),/Invalid quote/);
});
test('quote status transitions only allow the real lifecycle',()=>{
 assert.equal(nextQuoteStatus('draft','sent'),'sent');
 assert.equal(nextQuoteStatus('sent','accepted'),'accepted');
 assert.equal(nextQuoteStatus('rejected','draft'),'draft');
 assert.throws(()=>nextQuoteStatus('accepted','sent'),/Invalid quote status/);
 assert.throws(()=>nextQuoteStatus('accepted','rejected'),/Invalid quote status/);
 assert.throws(()=>nextQuoteStatus('draft','issued'),/Invalid quote status/);
 assert.deepEqual(quoteStatuses,['draft','sent','accepted','rejected']);
});
test('catalog items normalize SKU and require name and non-negative price',()=>{
 const item=normalizeCatalogItem({sku:' prod-01 ',name:'  Impresora térmica ',priceCents:618100,category:'Impresoras',description:'Zebra'});
 assert.deepEqual([item.sku,item.name,item.priceCents,item.active],['PROD-01','Impresora térmica',618100,true]);
 assert.equal(normalizeCatalogItem({name:'Servicio',priceCents:0}).sku,'');
 assert.throws(()=>normalizeCatalogItem({name:'X',priceCents:100}),/Invalid catalog item/);
 assert.throws(()=>normalizeCatalogItem({name:'Servicio',priceCents:-1}),/Invalid catalog item/);
 assert.throws(()=>normalizeCatalogItem({name:'Servicio',priceCents:1.5}),/Invalid catalog item/);
 assert.throws(()=>normalizeCatalogItem({name:'Servicio',priceCents:100,sku:'mal sku!'}),/Invalid catalog item/);
});
test('expenses validate date, category and positive amount; summary groups by category and month',()=>{
 const e=normalizeExpense({description:'Renta local',amountCents:850000,occurredOn:'2026-11-01',category:'renta',vendor:'Inmobiliaria'});
 assert.equal(e.category,'renta');
 assert.throws(()=>normalizeExpense({description:'X',amountCents:100,occurredOn:'2026-11-01',category:'renta'}),/Invalid expense/);
 assert.throws(()=>normalizeExpense({description:'Gasto',amountCents:0,occurredOn:'2026-11-01',category:'renta'}),/Invalid expense/);
 assert.throws(()=>normalizeExpense({description:'Gasto',amountCents:100,occurredOn:'2026-13-01',category:'renta'}),/Invalid expense/);
 assert.throws(()=>normalizeExpense({description:'Gasto',amountCents:100,occurredOn:'2026-11-01',category:'fiesta'}),/Invalid expense/);
 assert.deepEqual(expenseCategories,['insumos','renta','servicios','transporte','marketing','personal','impuestos','otros']);
 const summary=summarizeExpenses([
  {amountCents:10000,category:'renta',occurredOn:'2026-11-01'},
  {amountCents:5000,category:'renta',occurredOn:'2026-10-15'},
  {amountCents:7000,category:'insumos',occurredOn:'2026-11-20'}
 ]);
 assert.equal(summary.totalCents,22000);
 assert.deepEqual(summary.byCategory,{renta:15000,insumos:7000});
 assert.deepEqual(summary.byMonth,{'2026-11':17000,'2026-10':5000});
});
test('payments validate method and date and never exceed the quote balance',()=>{
 assert.equal(remainingBalance(406000,100000),306000);
 assert.equal(remainingBalance(100,150),0);
 const p=normalizePayment({clientName:'Cliente',amountCents:100000,paidOn:'2026-11-10',method:'transferencia',reference:'TR-1',quoteId:'11111111-1111-4111-8111-111111111111'},{quoteTotalCents:406000,alreadyPaidCents:100000});
 assert.equal(p.method,'transferencia');
 assert.throws(()=>normalizePayment({clientName:'C',amountCents:1,paidOn:'2026-11-10',method:'bitcoin'}),/Invalid payment/);
 assert.throws(()=>normalizePayment({amountCents:1,paidOn:'2026-11-10'}),/Invalid payment/);
 assert.throws(()=>normalizePayment({clientName:'C',amountCents:400000,paidOn:'2026-11-10',quoteId:'11111111-1111-4111-8111-111111111111'},{quoteTotalCents:406000,alreadyPaidCents:100000}),/Invalid payment/);
 assert.deepEqual(paymentMethods,['efectivo','transferencia','tarjeta']);
});
test('invoices validate RFC, compute totals and sequence folios without any CFDI data',()=>{
 const inv=normalizeInvoice({clientName:'Cliente MX',rfc:' abc123456t78 ',vatRate:16,
  lines:[{description:'Servicio',quantity:2,unitPriceCents:10000}]});
 assert.equal(inv.rfc,'ABC123456T78');
 assert.equal(inv.totalCents,23200);
 assert.throws(()=>normalizeInvoice({clientName:'C',rfc:'MALO',lines:[{description:'A',quantity:1,unitPriceCents:1}]}),/Invalid invoice/);
 assert.throws(()=>normalizeInvoice({clientName:'C',lines:[]}),/Invalid invoice/);
 assert.equal(nextFolio(0),1);
 assert.equal(nextFolio(41),42);
 assert.equal(formatFolio(1),'F-0001');
 assert.equal(formatFolio(128),'F-0128');
 assert.deepEqual(invoiceStatuses,['draft','issued','cancelled']);
});
test('CSV builder escapes commas, quotes and newlines',()=>{
 assert.equal(csvEscape('simple'),'simple');
 assert.equal(csvEscape('con, coma'),'"con, coma"');
 assert.equal(csvEscape('con "comillas"'),'"con ""comillas"""');
 assert.equal(csvEscape('línea\nnueva'),'"línea\nnueva"');
 assert.equal(csvEscape(null),'');
 const csv=buildCsv(reportColumns.expenses,[
  {description:'Renta, local "A"',category:'renta',vendor:'Inmob.',amount:'8500.00',occurredOn:'2026-11-01'},
  {description:'Luz',category:'servicios',vendor:'CFE',amount:'320.50',occurredOn:'2026-11-03'}
 ]);
 assert.ok(csv.startsWith('Concepto,Categoría,Proveedor,Monto MXN,Fecha\r\n'));
 assert.ok(csv.includes('"Renta, local ""A"""'));
 assert.equal(moneyText(406000),'4060.00');
 assert.equal(moneyText(0),'0.00');
});
