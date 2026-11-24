import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountingFakeDb,accountingDeps} from './accounting-fake-db.mjs';
import {listAccounts,createAccount,updateAccount,setAccountActive,seedChart,listEntries,getEntry,createEntry,setEntryStatus,
 getTrialBalance,getIncomeStatement,getBalanceSheet,exportTrialBalanceCsv,dashboard} from '../platform/accounting-store.mjs';

const token='<redacted>',slug='demo',otherSlug='demo-b';
const setup=()=>{const fake=createAccountingFakeDb();return {fake,deps:accountingDeps(fake)};};
// Fecha dentro del mes en curso (o del anterior): los KPIs del tablero son
// por mes real, así el test no depende del día en que se corre.
const monthDate=(offsetMonths,day)=>{
 const d=new Date();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+offsetMonths);d.setUTCDate(day);
 return d.toISOString().slice(0,10);
};
const accountInput=(over={})=>({code:'1000',name:'Caja',type:'activo',...over});
async function seededChart(deps){
 const {accounts}=await seedChart(token,slug,deps);
 return Object.fromEntries(accounts.map(a=>[a.code,a]));
}
async function registeredEntry(deps,accounts,{date,concept='Venta',lines}){
 const entry=(await createEntry(token,slug,{entryDate:date,concept,lines},deps)).entry;
 await setEntryStatus(token,slug,entry.id,{status:'registrada'},deps);
 return entry;
}

test('cuentas: crear con defaults, código duplicado, actualizar y desactivar',async()=>{
 const {fake,deps}=setup();
 const created=await createAccount(token,slug,accountInput(),deps);
 assert.equal(created.account.nature,'deudora');
 assert.equal(created.account.active,true);
 await assert.rejects(()=>createAccount(token,slug,accountInput({name:'Otra caja'}),deps),/Duplicate account code/);
 await assert.rejects(()=>createAccount(token,slug,{code:'4000',name:'Ventas',type:'activo',nature:'acreedora'},deps),/Invalid account/);
 const listed=await listAccounts(token,slug,{},deps);
 assert.equal(listed.accounts.length,1);
 const updated=await updateAccount(token,slug,created.account.id,{name:'Caja principal'},deps);
 assert.equal(updated.account.name,'Caja principal');
 assert.equal(updated.account.code,'1000');
 await assert.rejects(()=>updateAccount(token,slug,created.account.id,{code:'1001'},deps),/Invalid account/);
 const off=await setAccountActive(token,slug,created.account.id,{active:false},deps);
 assert.equal(off.active,false);
 assert.equal((await listAccounts(token,slug,{activeOnly:true},deps)).accounts.length,0);
 await assert.rejects(()=>listAccounts('bad-token',slug,{},deps),/Unauthorized/);
 await assert.rejects(()=>listAccounts(token,'sin-tenant',{},deps),/Not found/);
 assert.equal(fake.tables.accounts.length,1);
});

test('cuentas: el catálogo base carga 11 cuentas y es idempotente',async()=>{
 const {deps}=setup();
 const first=await seedChart(token,slug,deps);
 assert.equal(first.accounts.length,11);
 assert.equal(first.accounts.find(a=>a.code==='4000').name,'Ventas');
 const second=await seedChart(token,slug,deps);
 assert.equal(second.accounts.length,11,'segunda carga no duplica códigos');
});

test('pólizas: crear balanceada con folio, rechazar desbalanceada y cuentas inválidas',async()=>{
 const {deps}=setup();
 const accounts=await seededChart(deps);
 const caja=accounts['1000'],ventas=accounts['4000'],iva=accounts['2100'];
 const entry=await createEntry(token,slug,{entryDate:monthDate(0,10),concept:'Venta del día',lines:[
  {accountId:caja.id,debitCents:11600,creditCents:0},
  {accountId:ventas.id,debitCents:0,creditCents:10000},
  {accountId:iva.id,debitCents:0,creditCents:1600}]},deps);
 assert.equal(entry.entry.folio,1);
 assert.equal(entry.entry.folioLabel,'P-0001');
 assert.equal(entry.entry.status,'borrador');
 await assert.rejects(()=>createEntry(token,slug,{entryDate:monthDate(0,10),concept:'Desbalanceada',lines:[
  {accountId:caja.id,debitCents:11600,creditCents:0},
  {accountId:ventas.id,debitCents:0,creditCents:9000}]},deps),/Invalid entry/);
 await assert.rejects(()=>createEntry(token,slug,{entryDate:monthDate(0,10),concept:'Cuenta ajena',lines:[
  {accountId:'00000000-0000-4000-8000-000000000000',debitCents:100,creditCents:0},
  {accountId:ventas.id,debitCents:0,creditCents:100}]},deps),/Not found/);
 await setAccountActive(token,slug,ventas.id,{active:false},deps);
 await assert.rejects(()=>createEntry(token,slug,{entryDate:monthDate(0,10),concept:'Cuenta inactiva',lines:[
  {accountId:caja.id,debitCents:100,creditCents:0},
  {accountId:ventas.id,debitCents:0,creditCents:100}]},deps),/Invalid entry/);
 const listed=await listEntries(token,slug,{},deps);
 assert.equal(listed.entries.length,1);
 assert.equal(listed.entries[0].totalDebitCents,11600);
 assert.equal(listed.entries[0].totalCreditCents,11600);
 const detail=await getEntry(token,slug,entry.entry.id,deps);
 assert.equal(detail.entry.lines.length,3);
 assert.equal(detail.entry.lines[0].accountCode,'1000');
});

test('pólizas: transiciones de estatus y tipo no editable con movimientos',async()=>{
 const {deps}=setup();
 const accounts=await seededChart(deps);
 const entry=await createEntry(token,slug,{entryDate:monthDate(0,10),concept:'Venta',lines:[
  {accountId:accounts['1000'].id,debitCents:11600,creditCents:0},
  {accountId:accounts['4000'].id,debitCents:0,creditCents:11600}]},deps);
 await assert.rejects(()=>setEntryStatus(token,slug,entry.entry.id,{status:'borrador'},deps),/Invalid entry status/);
 const reg=await setEntryStatus(token,slug,entry.entry.id,{status:'registrada'},deps);
 assert.equal(reg.status,'registrada');
 await assert.rejects(()=>setEntryStatus(token,slug,entry.entry.id,{status:'borrador'},deps),/Invalid entry status/);
 const cancelled=await setEntryStatus(token,slug,entry.entry.id,{status:'cancelada'},deps);
 assert.equal(cancelled.status,'cancelada');
 await assert.rejects(()=>setEntryStatus(token,slug,entry.entry.id,{status:'registrada'},deps),/Invalid entry status/);
 await assert.rejects(()=>updateAccount(token,slug,accounts['1000'].id,{type:'pasivo'},deps),/Invalid account/);
});

test('reportes: solo pólizas registradas entran; balanza, resultados, balance y CSV',async()=>{
 const {deps}=setup();
 const accounts=await seededChart(deps);
 // Mes en curso: venta 10000 + IVA 1600 cobrada, gasto 2000 pagado.
 await registeredEntry(deps,accounts,{date:monthDate(0,10),lines:[
  {accountId:accounts['1000'].id,debitCents:11600,creditCents:0},
  {accountId:accounts['4000'].id,debitCents:0,creditCents:10000},
  {accountId:accounts['2100'].id,debitCents:0,creditCents:1600}]});
 await registeredEntry(deps,accounts,{date:monthDate(0,12),concept:'Gasto de operación',lines:[
  {accountId:accounts['5100'].id,debitCents:2000,creditCents:0},
  {accountId:accounts['1000'].id,debitCents:0,creditCents:2000}]});
 // Borrador: no debe entrar en ningún reporte.
 await createEntry(token,slug,{entryDate:monthDate(0,13),concept:'Borrador grande',lines:[
  {accountId:accounts['1000'].id,debitCents:999900,creditCents:0},
  {accountId:accounts['4000'].id,debitCents:0,creditCents:999900}]},deps);
 const balanza=await getTrialBalance(token,slug,{},deps);
 assert.equal(balanza.totalDebitCents,13600);
 assert.equal(balanza.totalCreditCents,13600);
 assert.equal(balanza.balanced,true);
 assert.equal(balanza.rows.find(r=>r.code==='1000').balanceCents,9600);
 const income=await getIncomeStatement(token,slug,{},deps);
 assert.equal(income.incomeCents,10000);
 assert.equal(income.expenseCents,2000);
 assert.equal(income.profitCents,8000);
 const sheet=await getBalanceSheet(token,slug,{},deps);
 assert.equal(sheet.assetsCents,9600);
 assert.equal(sheet.totalLiabilitiesEquityCents,9600);
 assert.equal(sheet.balanced,true);
 // Rango: solo la venta del día 10.
 const range=await getTrialBalance(token,slug,{from:monthDate(0,10),to:monthDate(0,10)},deps);
 assert.equal(range.totalDebitCents,11600);
 const csv=await exportTrialBalanceCsv(token,slug,{},deps);
 assert.equal(csv.filename,'hubie-contabilidad-balanza.csv');
 assert.match(csv.csv,/Código,Cuenta,Tipo,Debe MXN,Haber MXN,Saldo MXN/);
 assert.match(csv.csv,/1000,Caja,activo,116\.00,20\.00,96\.00/);
});

test('tablero: KPIs con delta vs mes anterior, alertas de CxC y top clientes',async()=>{
 const {fake,deps}=setup();
 const accounts=await seededChart(deps);
 // Mes anterior: ingreso 500000; mes en curso: ingreso 1000000 → delta +100%.
 await registeredEntry(deps,accounts,{date:monthDate(-1,10),lines:[
  {accountId:accounts['1000'].id,debitCents:500000,creditCents:0},
  {accountId:accounts['4000'].id,debitCents:0,creditCents:500000}]});
 await registeredEntry(deps,accounts,{date:monthDate(0,10),lines:[
  {accountId:accounts['1000'].id,debitCents:1000000,creditCents:0},
  {accountId:accounts['4000'].id,debitCents:0,creditCents:1000000}]});
 // CxC vencida real (sin cobros) y pedido para el top de clientes.
 fake.tables.receivables.push({organization_id:fake.orgA,id:'r1',quote_id:'q1',client_name:'Cliente A',
  total_cents:11600,due_on:'2026-01-01',archived_at:null});
 fake.tables.orders.push({organization_id:fake.orgA,client_name:'Cliente A',total_cents:11600,status:'entregado'});
 const dash=await dashboard(token,slug,deps);
 assert.equal(dash.kpis.activeAccounts,11);
 assert.equal(dash.kpis.registeredEntries,2);
 assert.equal(dash.kpis.monthIncomeCents,1000000);
 assert.equal(dash.kpis.monthIncomeDelta,100);
 assert.equal(dash.kpis.monthProfitCents,1000000);
 assert.equal(dash.kpis.receivablesCents,11600);
 assert.equal(dash.kpis.receivablesCount,1);
 assert.equal(dash.alerts.overdueReceivables.length,1);
 assert.equal(dash.alerts.overdueReceivables[0].clientName,'Cliente A');
 assert.equal(dash.topClients.length,1);
 assert.equal(dash.topClients[0].clientName,'Cliente A');
 assert.ok(dash.incomeDaily.some(d=>d.cents===1000000));
});

test('aislamiento entre tenants: cuentas y pólizas no se ven en el otro tenant',async()=>{
 const {fake,deps}=setup();
 const accounts=await seededChart(deps);
 await createEntry(token,slug,{entryDate:monthDate(0,10),concept:'Solo demo',lines:[
  {accountId:accounts['1000'].id,debitCents:100,creditCents:0},
  {accountId:accounts['4000'].id,debitCents:0,creditCents:100}]},deps);
 assert.equal((await listAccounts(token,otherSlug,{},deps)).accounts.length,0);
 assert.equal((await listEntries(token,otherSlug,{},deps)).entries.length,0);
 assert.equal((await getTrialBalance(token,otherSlug,{},deps)).rows.length,0);
 await assert.rejects(()=>getEntry(token,otherSlug,fake.tables.entries[0].id,deps),/Not found/);
});
