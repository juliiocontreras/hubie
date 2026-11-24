import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeAccount,normalizeEntry,nextEntryStatus,DEFAULT_CHART,trialBalance,incomeStatement,balanceSheet,accountBalance,formatAccountFolio} from '../platform/accounting-domain.mjs';

const account=(over={})=>({id:'a1',code:'1000',name:'Caja',type:'activo',nature:'deudora',...over});
const line=(over={})=>({accountId:'11111111-1111-4111-8111-111111111111',debitCents:11600,creditCents:0,...over});
const otherLine=(over={})=>({accountId:'22222222-2222-4222-8222-222222222222',debitCents:0,creditCents:11600,...over});

test('cuentas: defaults por tipo, naturaleza forzada y claves estrictas',()=>{
 assert.equal(normalizeAccount({code:'1000',name:'Caja',type:'activo'}).nature,'deudora');
 assert.equal(normalizeAccount({code:'4000',name:'Ventas',type:'ingreso'}).nature,'acreedora');
 assert.equal(normalizeAccount({code:'5000',name:'Gastos',type:'gasto'}).nature,'deudora');
 assert.throws(()=>normalizeAccount({code:'1000',name:'Caja',type:'activo',nature:'acreedora'}),/Invalid account/);
 assert.throws(()=>normalizeAccount({code:'1000',name:'Caja',type:'banco'}),/Invalid account/);
 assert.throws(()=>normalizeAccount({code:'1000',name:'Caja',extra:1}),/Invalid account/);
 assert.throws(()=>normalizeAccount({code:'1000',name:'X'}),/Invalid/);
});

test('catálogo base: 11 cuentas con códigos únicos y naturaleza por tipo',()=>{
 assert.equal(DEFAULT_CHART.length,11);
 assert.equal(new Set(DEFAULT_CHART.map(a=>a.code)).size,11);
 for(const a of DEFAULT_CHART)assert.doesNotThrow(()=>normalizeAccount(a));
});

test('pólizas: partida doble balanceada, línea con debe o haber, y folio',()=>{
 const entry=normalizeEntry({entryDate:'2026-11-10',concept:'Venta del día',lines:[line(),otherLine()]});
 assert.equal(entry.totalDebitCents,11600);
 assert.equal(entry.totalCreditCents,11600);
 assert.throws(()=>normalizeEntry({concept:'Desbalanceada',lines:[line(),otherLine({creditCents:100})]}),/Invalid entry/);
 assert.throws(()=>normalizeEntry({concept:'Una línea',lines:[line()]}),/Invalid entry/);
 assert.throws(()=>normalizeEntry({concept:'Ambos lados',lines:[line({debitCents:100,creditCents:100}),otherLine()]}),/Invalid entry/);
 assert.throws(()=>normalizeEntry({concept:'Sin monto',lines:[line({debitCents:0}),otherLine({creditCents:0})]}),/Invalid entry/);
 assert.equal(formatAccountFolio(3),'P-0003');
});

test('transiciones de póliza: borrador → registrada → cancelada, sin retorno',()=>{
 assert.equal(nextEntryStatus('borrador','registrada'),'registrada');
 assert.equal(nextEntryStatus('borrador','cancelada'),'cancelada');
 assert.equal(nextEntryStatus('registrada','cancelada'),'cancelada');
 assert.throws(()=>nextEntryStatus('registrada','borrador'),/Invalid entry status/);
 assert.throws(()=>nextEntryStatus('cancelada','registrada'),/Invalid entry status/);
});

test('reportes: balanza, estado de resultados y balance general cuadran',()=>{
 const accounts=[account(),account({id:'a2',code:'4000',name:'Ventas',type:'ingreso',nature:'acreedora'}),
  account({id:'a3',code:'5000',name:'Gastos',type:'gasto',nature:'deudora'}),
  account({id:'a4',code:'2100',name:'IVA por pagar',type:'pasivo',nature:'acreedora'})];
 // Venta 10000 + IVA 1600 cobrada en caja (debe caja 11600; haber ventas 10000,
 // haber IVA 1600) y gasto de operación 2000 pagado en efectivo
 // (debe gastos 2000; haber caja 2000).
 const movements={a1:{debitCents:11600,creditCents:2000},a2:{debitCents:0,creditCents:10000},
  a3:{debitCents:2000,creditCents:0},a4:{debitCents:0,creditCents:1600}};
 const balanza=trialBalance(accounts,movements);
 assert.equal(balanza.totalDebitCents,13600);
 assert.equal(balanza.totalCreditCents,13600);
 assert.equal(balanza.balanced,true);
 assert.equal(balanza.rows.find(r=>r.code==='1000').balanceCents,9600);
 const income=incomeStatement(accounts,movements);
 assert.equal(income.incomeCents,10000);
 assert.equal(income.expenseCents,2000);
 assert.equal(income.profitCents,8000);
 const sheet=balanceSheet(accounts,movements);
 assert.equal(sheet.assetsCents,9600);
 assert.equal(sheet.liabilitiesCents,1600);
 assert.equal(sheet.profitCents,8000);
 assert.equal(sheet.totalLiabilitiesEquityCents,9600);
 assert.equal(sheet.balanced,true);
 assert.equal(accountBalance(account(),{debitCents:500,creditCents:200}),300);
 assert.equal(accountBalance(account({nature:'acreedora'}),{debitCents:200,creditCents:500}),300);
});
