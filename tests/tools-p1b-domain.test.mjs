import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSupplier,normalizeSupplierDocument,normalizePurchaseOrder,normalizePurchaseOrderLine,
 nextPurchaseOrderStatus,purchaseOrderStatuses,normalizeReceipt,normalizeWarehouse,normalizeTransfer,
 normalizeCashboxOpen,normalizeCashboxMovement,normalizeCashboxCount,cashboxBalance,cashboxDifference,
 normalizeReceivable,daysOverdue,agingBucket,summarizeAging,normalizePayable,nextPayableStatus,
 normalizePayableInstallment,normalizeExpenseBudget,budgetStatus,monthlyExpenseReport,
 supplierPaymentTerms,payableStatuses} from '../platform/tools-p1b-domain.mjs';

const uuid='11111111-1111-4111-8111-111111111111';
const uuid2='22222222-2222-4222-8222-222222222222';

test('T009 suppliers validate name, email and payment terms',()=>{
 const s=normalizeSupplier({name:'  Papelería Central ',contact:'Ana',email:'ana@papel.mx',phone:'844 000 0000',paymentTerms:'credito_30',notes:''});
 assert.equal(s.name,'Papelería Central');
 assert.equal(s.paymentTerms,'credito_30');
 assert.equal(normalizeSupplier({name:'Proveedor'}).paymentTerms,'contado');
 assert.throws(()=>normalizeSupplier({name:'X'}),/Invalid supplier/);
 assert.throws(()=>normalizeSupplier({name:'Proveedor',email:'no-es-correo'}),/Invalid supplier/);
 assert.throws(()=>normalizeSupplier({name:'Proveedor',paymentTerms:'credito_90'}),/Invalid supplier/);
 assert.deepEqual(supplierPaymentTerms,['contado','credito_7','credito_15','credito_30','credito_60']);
 const doc=normalizeSupplierDocument({mediaId:uuid,documentType:'Contrato',notes:''});
 assert.equal(doc.mediaId,uuid);
 assert.throws(()=>normalizeSupplierDocument({mediaId:'no-uuid',documentType:'Contrato'}),/Invalid supplier document/);
 assert.throws(()=>normalizeSupplierDocument({mediaId:uuid,documentType:''}),/Invalid supplier document/);
});

test('T008 purchase orders total lines and only allow the real lifecycle',()=>{
 const po=normalizePurchaseOrder({supplierId:uuid,notes:'',expectedOn:'2026-11-30',
  lines:[{description:'Resma papel',quantity:10,unitPriceCents:8500,itemId:uuid2},{description:'Tóner',quantity:2,unitPriceCents:150000}]});
 assert.equal(po.totalCents,10*8500+2*150000);
 assert.equal(po.lines[1].itemId,null);
 assert.throws(()=>normalizePurchaseOrder({supplierId:uuid,lines:[]}),/Invalid purchase order/);
 assert.throws(()=>normalizePurchaseOrder({supplierId:'mal',lines:[{description:'A',quantity:1,unitPriceCents:1}]}),/Invalid purchase order/);
 assert.throws(()=>normalizePurchaseOrder({supplierId:uuid,lines:[{description:'A',quantity:0,unitPriceCents:1}]}),/Invalid purchase order/);
 assert.throws(()=>normalizePurchaseOrder({supplierId:uuid,expectedOn:'2026-02-30',lines:[{description:'A',quantity:1,unitPriceCents:1}]}),/Invalid purchase order/);
 assert.equal(nextPurchaseOrderStatus('draft','sent'),'sent');
 assert.equal(nextPurchaseOrderStatus('sent','partially_received'),'partially_received');
 assert.equal(nextPurchaseOrderStatus('partially_received','received'),'received');
 assert.throws(()=>nextPurchaseOrderStatus('received','sent'),/Invalid purchase order status/);
 assert.throws(()=>nextPurchaseOrderStatus('draft','received'),/Invalid purchase order status/);
 assert.throws(()=>nextPurchaseOrderStatus('cancelled','draft'),/Invalid purchase order status/);
 assert.deepEqual(purchaseOrderStatuses,['draft','sent','partially_received','received','cancelled']);
 const line=normalizePurchaseOrderLine({description:'Caja',quantity:3,unitPriceCents:1000},0);
 assert.equal(line.lineTotalCents,3000);
 const receipt=normalizeReceipt({lineId:uuid,quantity:2,warehouseId:uuid2});
 assert.equal(receipt.quantity,2);
 assert.throws(()=>normalizeReceipt({lineId:uuid,quantity:0}),/Invalid receipt/);
 assert.throws(()=>normalizeReceipt({lineId:uuid,quantity:1,warehouseId:'x'}),/Invalid receipt/);
});

test('T010 warehouses validate data and transfers require distinct warehouses with stock',()=>{
 const w=normalizeWarehouse({name:'  Bodega norte ',location:'Saltillo',responsible:'Luis'});
 assert.equal(w.name,'Bodega norte');
 assert.throws(()=>normalizeWarehouse({name:'X'}),/Invalid warehouse/);
 const t=normalizeTransfer({fromWarehouseId:uuid,toWarehouseId:uuid2,itemId:uuid,quantity:5,note:'Reposición'});
 assert.equal(t.quantity,5);
 assert.throws(()=>normalizeTransfer({fromWarehouseId:uuid,toWarehouseId:uuid,itemId:uuid,quantity:5}),/Invalid transfer/);
 assert.throws(()=>normalizeTransfer({fromWarehouseId:uuid,toWarehouseId:uuid2,itemId:uuid,quantity:0}),/Invalid transfer/);
 assert.throws(()=>normalizeTransfer({fromWarehouseId:uuid,toWarehouseId:uuid2,itemId:uuid,quantity:-1}),/Invalid transfer/);
});

test('T016 cashbox balances opening plus movements and counts the difference',()=>{
 const open=normalizeCashboxOpen({openingCents:50000,responsible:'María',shift:'Matutino',notes:''});
 assert.equal(open.openingCents,50000);
 assert.throws(()=>normalizeCashboxOpen({openingCents:-1,responsible:'María'}),/Invalid cashbox/);
 assert.throws(()=>normalizeCashboxOpen({openingCents:100,responsible:'X'}),/Invalid cashbox/);
 const balance=cashboxBalance(50000,[
  {direction:'in',amountCents:120000},{direction:'in',amountCents:30000},{direction:'out',amountCents:45000}]);
 assert.deepEqual(balance,{openingCents:50000,inCents:150000,outCents:45000,expectedCents:155000});
 assert.equal(cashboxDifference(155000,154500),-500);
 assert.equal(cashboxDifference(155000,155000),0);
 const movement=normalizeCashboxMovement({direction:'out',amountCents:10000,kind:'Gasto',notes:'',sourceType:'expense',sourceId:uuid});
 assert.equal(movement.sourceType,'expense');
 assert.throws(()=>normalizeCashboxMovement({direction:'side',amountCents:100}),/Invalid cashbox movement/);
 assert.throws(()=>normalizeCashboxMovement({direction:'in',amountCents:0}),/Invalid cashbox movement/);
 assert.throws(()=>normalizeCashboxMovement({direction:'in',amountCents:100,sourceType:'venta'}),/Invalid cashbox movement/);
 const count=normalizeCashboxCount({countedCents:155000,notes:''});
 assert.equal(count.countedCents,155000);
 assert.throws(()=>normalizeCashboxCount({countedCents:-5}),/Invalid cashbox count/);
});

test('T017 aging buckets split balances by days overdue',()=>{
 assert.equal(daysOverdue('2026-11-10','2026-11-13'),3);
 assert.equal(daysOverdue('2026-11-13','2026-11-13'),0);
 assert.equal(daysOverdue('2026-11-20','2026-11-13'),-7);
 assert.equal(agingBucket('2026-11-20','2026-11-13'),'corriente');
 assert.equal(agingBucket('2026-11-13','2026-11-13'),'corriente');
 assert.equal(agingBucket('2026-10-14','2026-11-13'),'vencido_30');
 assert.equal(agingBucket('2026-09-14','2026-11-13'),'vencido_60');
 assert.equal(agingBucket('2026-08-15','2026-11-13'),'vencido_90');
 assert.equal(agingBucket('2026-07-01','2026-11-13'),'vencido_mas_90');
 assert.throws(()=>agingBucket('2026-13-01','2026-11-13'),/Invalid date/);
 const summary=summarizeAging([
  {totalCents:100000,paidCents:40000,dueOn:'2026-11-20'},
  {totalCents:50000,paidCents:0,dueOn:'2026-10-20'},
  {totalCents:80000,paidCents:80000,dueOn:'2026-01-01'}
 ],'2026-11-13');
 assert.equal(summary.totalCents,60000+50000);
 assert.equal(summary.overdueCents,50000);
 assert.equal(summary.byBucket.corriente,60000);
 assert.equal(summary.byBucket.vencido_30,50000);
 assert.equal(summary.byBucket.vencido_mas_90,0);
 const r=normalizeReceivable({quoteId:uuid,dueOn:'2026-12-01',notes:''});
 assert.equal(r.quoteId,uuid);
 assert.throws(()=>normalizeReceivable({quoteId:'x'}),/Invalid receivable/);
 assert.throws(()=>normalizeReceivable({quoteId:uuid,dueOn:'2026-02-30'}),/Invalid receivable/);
});

test('T018 payables validate supplier and order, lifecycle and installments',()=>{
 const p=normalizePayable({supplierId:uuid,purchaseOrderId:uuid2,description:'Compra de insumos',totalCents:250000,dueOn:'2026-12-15',notes:''});
 assert.equal(p.totalCents,250000);
 assert.equal(normalizePayable({supplierId:uuid,description:'Renta',totalCents:1000,dueOn:'2026-12-01'}).purchaseOrderId,null);
 assert.throws(()=>normalizePayable({supplierId:uuid,description:'X',totalCents:0,dueOn:'2026-12-01'}),/Invalid payable/);
 assert.throws(()=>normalizePayable({description:'X',totalCents:100,dueOn:'2026-12-01'}),/Invalid payable/);
 assert.throws(()=>normalizePayable({supplierId:uuid,description:'X',totalCents:100,dueOn:'2026-12-32'}),/Invalid payable/);
 assert.equal(nextPayableStatus('pending','approved'),'approved');
 assert.equal(nextPayableStatus('approved','paid'),'paid');
 assert.throws(()=>nextPayableStatus('pending','paid'),/Invalid payable status/);
 assert.throws(()=>nextPayableStatus('paid','approved'),/Invalid payable status/);
 assert.deepEqual(payableStatuses,['pending','approved','paid','cancelled']);
 const inst=normalizePayableInstallment({amountCents:100000,paidOn:'2026-11-13',method:'transferencia',reference:'TR-1',notes:''},{totalCents:250000,alreadyPaidCents:100000});
 assert.equal(inst.amountCents,100000);
 assert.throws(()=>normalizePayableInstallment({amountCents:200000,paidOn:'2026-11-13'},{totalCents:250000,alreadyPaidCents:100000}),/Invalid payable installment/);
 assert.throws(()=>normalizePayableInstallment({amountCents:100,paidOn:'2026-11-13',method:'cheque'}),/Invalid payable installment/);
});

test('C007 budgets validate month and report flags over-budget categories',()=>{
 const b=normalizeExpenseBudget({category:'renta',month:'2026-11',limitCents:850000});
 assert.equal(b.limitCents,850000);
 assert.throws(()=>normalizeExpenseBudget({category:'renta',month:'2026-13',limitCents:100}),/Invalid expense budget/);
 assert.throws(()=>normalizeExpenseBudget({category:'fiesta',month:'2026-11',limitCents:100}),/Invalid expense budget/);
 assert.throws(()=>normalizeExpenseBudget({category:'renta',month:'2026-11',limitCents:0}),/Invalid expense budget/);
 assert.deepEqual(budgetStatus(900000,850000),{spentCents:900000,limitCents:850000,remainingCents:-50000,over:true});
 assert.equal(budgetStatus(100,850000).over,false);
 const report=monthlyExpenseReport([
  {amountCents:900000,category:'renta',occurredOn:'2026-11-01'},
  {amountCents:120000,category:'insumos',occurredOn:'2026-11-05'},
  {amountCents:50000,category:'renta',occurredOn:'2026-10-20'}
 ],[{category:'renta',month:'2026-11',limitCents:850000}],'2026-11');
 assert.equal(report.totalCents,1020000);
 assert.equal(report.count,2);
 assert.deepEqual(report.overBudget,['renta']);
 const renta=report.byCategory.find(c=>c.category==='renta');
 assert.equal(renta.spentCents,900000);
 assert.equal(renta.over,true);
 const insumos=report.byCategory.find(c=>c.category==='insumos');
 assert.equal(insumos.limitCents,null);
 assert.equal(insumos.over,false);
 assert.throws(()=>monthlyExpenseReport([],[],'2026-13'),/Invalid expense budget/);
});
