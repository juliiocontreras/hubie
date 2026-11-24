import {randomUUID} from 'node:crypto';
import {executeSql as realExecuteSql,executeBatch as realExecuteBatch} from '../database.mjs';
import {authorizeTool as realAuthorize} from './records.mjs';
import {buildCsv} from './commerce-domain.mjs';
import {normalizeAccount,normalizeEntry,nextEntryStatus,DEFAULT_CHART,trialBalance,incomeStatement,balanceSheet,formatAccountFolio} from './accounting-domain.mjs';
// T023 Contabilidad: plan de cuentas, pólizas con partida doble balanceada,
// balanza de comprobación, estado de resultados y balance general.
// Patrón de inyección de dependencias como training-store: `deps` permite
// probar el store con una base falsa sin tocar Turso; sin deps usa los
// clientes reales. SIN conexión al SAT ni timbrado.
const depsOf=d=>({executeSql:d?.executeSql||realExecuteSql,executeBatch:d?.executeBatch||realExecuteBatch,authorize:d?.authorize||realAuthorize});
const rows=r=>r?.rows?.map(a=>a.map(c=>c?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validId(id,label){if(typeof id!=='string'||!uuid.test(id))throw Error(label);}
const num=v=>Number(v||0);
const today=()=>new Date().toISOString().slice(0,10);
const monthStart=()=>new Date().toISOString().slice(0,8)+'01';
const accountSelect='SELECT id,code,name,type,nature,parent_id,active,created_at,updated_at FROM tenant_accounting_accounts';
const toAccount=r=>({id:r[0],code:r[1],name:r[2],type:r[3],nature:r[4],parentId:r[5]||null,active:r[6]===1,createdAt:r[7],updatedAt:r[8]});
async function accountFor(db,org,id){
 validId(id,'Invalid account');
 const row=rows(await db.executeSql(accountSelect+' WHERE organization_id=? AND id=?',[org,id]))[0];
 if(!row)throw Error('Not found');
 return toAccount(row);
}
async function accountsOf(db,org,{type=null,activeOnly=false}={}){
 const conds=['organization_id=?'],args=[org];
 if(type){if(!['activo','pasivo','capital','ingreso','gasto'].includes(type))throw Error('Invalid account');conds.push('type=?');args.push(type);}
 if(activeOnly)conds.push('active=1');
 const r=await db.executeSql(accountSelect+' WHERE '+conds.join(' AND ')+' ORDER BY code ASC LIMIT 500',args);
 return rows(r).map(toAccount);
}
// Movimientos de pólizas REGISTRADAS en el rango [from,to] (fechas
// 'YYYY-MM-DD'; por defecto todo el historial). Agrupados por cuenta para
// que el cálculo viva en el dominio (accounting-domain.mjs).
async function movementsByAccount(db,org,from,to){
 const r=await db.executeSql(`SELECT l.account_id,COALESCE(SUM(l.debit_cents),0),COALESCE(SUM(l.credit_cents),0)
  FROM tenant_accounting_entry_lines l
  JOIN tenant_accounting_entries e ON e.organization_id=l.organization_id AND e.id=l.entry_id
  WHERE l.organization_id=? AND e.status='registrada' AND e.entry_date>=? AND e.entry_date<=? GROUP BY l.account_id`,
  [org,from||'0000-01-01',to||'9999-12-31']);
 const map={};
 for(const x of rows(r))map[x[0]]={debitCents:num(x[1]),creditCents:num(x[2])};
 return map;
}
async function entryLines(db,org,entryId){
 const r=await db.executeSql(`SELECT l.id,l.account_id,l.debit_cents,l.credit_cents,l.memo,a.code,a.name
  FROM tenant_accounting_entry_lines l
  JOIN tenant_accounting_accounts a ON a.organization_id=l.organization_id AND a.id=l.account_id
  WHERE l.organization_id=? AND l.entry_id=? ORDER BY l.created_at ASC`,[org,entryId]);
 return rows(r).map(x=>({id:x[0],accountId:x[1],debitCents:num(x[2]),creditCents:num(x[3]),memo:x[4],accountCode:x[5],accountName:x[6]}));
}
async function entryFor(db,org,id){
 validId(id,'Invalid entry');
 const row=rows(await db.executeSql('SELECT id,folio,entry_date,concept,source_type,source_id,status,created_at,updated_at FROM tenant_accounting_entries WHERE organization_id=? AND id=?',[org,id]))[0];
 if(!row)throw Error('Not found');
 return {id:row[0],folio:num(row[1]),folioLabel:formatAccountFolio(num(row[1])),entryDate:row[2],concept:row[3],sourceType:row[4],sourceId:row[5]||null,status:row[6],createdAt:row[7],updatedAt:row[8]};
}
async function entryWithLines(db,org,id){
 const entry=await entryFor(db,org,id);
 const lines=await entryLines(db,org,id);
 return {...entry,lines,totalDebitCents:lines.reduce((a,l)=>a+l.debitCents,0),totalCreditCents:lines.reduce((a,l)=>a+l.creditCents,0)};
}
// ---- Plan de cuentas ----
export async function listAccounts(token,slug,{type=null,activeOnly=false}={},deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T023');
 return {accounts:await accountsOf(db,tenant.id,{type,activeOnly})};
}
export async function createAccount(token,slug,input,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T023',true);
 const account=normalizeAccount(input);
 if(account.parentId)await accountFor(db,tenant.id,account.parentId);
 const id=randomUUID();
 try{
  await db.executeSql('INSERT INTO tenant_accounting_accounts(organization_id,id,code,name,type,nature,parent_id,active,created_by) VALUES(?,?,?,?,?,?,?,?,?)',
   [tenant.id,id,account.code,account.name,account.type,account.nature,account.parentId,account.active?1:0,session.userId]);
 }catch(e){
  if(/UNIQUE constraint failed/i.test(e?.message||''))throw Error('Duplicate account code');
  throw e;
 }
 return {account:{id,...account}};
}
export async function updateAccount(token,slug,id,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T023',true);
 const current=await accountFor(db,tenant.id,id);
 const base={code:current.code,name:current.name,type:current.type,nature:current.nature,parentId:current.parentId,active:current.active};
 const next=normalizeAccount({...base,...input});
 if(next.code!==current.code)throw Error('Invalid account');
 if(next.parentId===id)throw Error('Invalid account');
 if(next.parentId)await accountFor(db,tenant.id,next.parentId);
 // El tipo no se cambia si la cuenta ya tiene movimientos registrados.
 const used=num(rows(await db.executeSql('SELECT COUNT(*) FROM tenant_accounting_entry_lines WHERE organization_id=? AND account_id=?',[tenant.id,id]))[0]?.[0]);
 if(used>0&&(next.type!==current.type||next.nature!==current.nature))throw Error('Invalid account');
 const r=await db.executeSql('UPDATE tenant_accounting_accounts SET name=?,type=?,nature=?,parent_id=?,active=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',
  [next.name,next.type,next.nature,next.parentId,next.active?1:0,tenant.id,id]);
 if(!changed(r))throw Error('Not found');
 return {account:{id,...next}};
}
export async function setAccountActive(token,slug,id,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T023',true);
 if(!input||Object.keys(input).length!==1||typeof input.active!=='boolean')throw Error('Invalid account');
 validId(id,'Invalid account');
 const r=await db.executeSql('UPDATE tenant_accounting_accounts SET active=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',
  [input.active?1:0,tenant.id,id]);
 if(!changed(r))throw Error('Not found');
 return {ok:true,active:input.active};
}
// Carga el catálogo base (DEFAULT_CHART) solo con los códigos que faltan:
// idempotente, se puede correr de nuevo tras crear cuentas propias.
export async function seedChart(token,slug,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T023',true);
 const commands=DEFAULT_CHART.map(a=>({sql:`INSERT INTO tenant_accounting_accounts(organization_id,id,code,name,type,nature,created_by)
  SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM tenant_accounting_accounts WHERE organization_id=? AND code=?)`,
  args:[tenant.id,randomUUID(),a.code,a.name,a.type,a.type==='activo'||a.type==='gasto'?'deudora':'acreedora',session.userId,tenant.id,a.code]}));
 await db.executeBatch(commands);
 return {accounts:await accountsOf(db,tenant.id)};
}
// ---- Pólizas / asientos ----
export async function listEntries(token,slug,{status=null,from=null,to=null}={},deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T023');
 const conds=['e.organization_id=?'],args=[tenant.id];
 if(status){if(!['borrador','registrada','cancelada'].includes(status))throw Error('Invalid entry');conds.push('e.status=?');args.push(status);}
 if(from){conds.push('e.entry_date>=?');args.push(from);}
 if(to){conds.push('e.entry_date<=?');args.push(to);}
 const r=await db.executeSql(`SELECT e.id,e.folio,e.entry_date,e.concept,e.source_type,e.source_id,e.status,e.created_at,
  (SELECT COUNT(*) FROM tenant_accounting_entry_lines l WHERE l.organization_id=e.organization_id AND l.entry_id=e.id),
  (SELECT COALESCE(SUM(l.debit_cents),0) FROM tenant_accounting_entry_lines l WHERE l.organization_id=e.organization_id AND l.entry_id=e.id),
  (SELECT COALESCE(SUM(l.credit_cents),0) FROM tenant_accounting_entry_lines l WHERE l.organization_id=e.organization_id AND l.entry_id=e.id)
  FROM tenant_accounting_entries e WHERE ${conds.join(' AND ')} ORDER BY e.entry_date DESC,e.folio DESC LIMIT 100`,args);
 return {entries:rows(r).map(x=>({id:x[0],folio:num(x[1]),folioLabel:formatAccountFolio(num(x[1])),entryDate:x[2],concept:x[3],
  sourceType:x[4],sourceId:x[5]||null,status:x[6],createdAt:x[7],lines:num(x[8]),totalDebitCents:num(x[9]),totalCreditCents:num(x[10])}))};
}
export async function getEntry(token,slug,id,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T023');
 return {entry:await entryWithLines(db,tenant.id,id)};
}
export async function createEntry(token,slug,input,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T023',true);
 const entry=normalizeEntry(input);
 // Todas las cuentas deben existir, pertenecer al tenant y estar activas.
 for(const line of entry.lines){
  const account=await accountFor(db,tenant.id,line.accountId);
  if(!account.active)throw Error('Invalid entry');
 }
 const maxFolio=num(rows(await db.executeSql('SELECT COALESCE(MAX(folio),0) FROM tenant_accounting_entries WHERE organization_id=?',[tenant.id]))[0]?.[0]);
 const folio=maxFolio+1,id=randomUUID();
 await db.executeBatch([
  {sql:'INSERT INTO tenant_accounting_entries(organization_id,id,folio,entry_date,concept,source_type,source_id,status,created_by) VALUES(?,?,?,?,?,?,?,?,?)',
   args:[tenant.id,id,folio,entry.entryDate,entry.concept,entry.sourceType,entry.sourceId,'borrador',session.userId]},
  ...entry.lines.map(l=>({sql:'INSERT INTO tenant_accounting_entry_lines(organization_id,id,entry_id,account_id,debit_cents,credit_cents,memo) VALUES(?,?,?,?,?,?,?)',
   args:[tenant.id,randomUUID(),id,l.accountId,l.debitCents,l.creditCents,l.memo]}))
 ]);
 return {entry:{id,folio,folioLabel:formatAccountFolio(folio),entryDate:entry.entryDate,concept:entry.concept,
  sourceType:entry.sourceType,sourceId:entry.sourceId,status:'borrador',totalDebitCents:entry.totalDebitCents,totalCreditCents:entry.totalCreditCents}};
}
export async function setEntryStatus(token,slug,id,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T023',true);
 if(!input||Object.keys(input).length!==1||!['borrador','registrada','cancelada'].includes(input.status))throw Error('Invalid entry');
 const current=await entryFor(db,tenant.id,id);
 nextEntryStatus(current.status,input.status);
 const r=await db.executeSql('UPDATE tenant_accounting_entries SET status=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',
  [input.status,tenant.id,id]);
 if(!changed(r))throw Error('Not found');
 return {ok:true,status:input.status};
}
// ---- Reportes (solo pólizas registradas) ----
export async function getTrialBalance(token,slug,{from=null,to=null}={},deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T023');
 const accounts=await accountsOf(db,tenant.id);
 const movements=await movementsByAccount(db,tenant.id,from,to);
 return {from:from||null,to:to||null,...trialBalance(accounts,movements)};
}
export async function getIncomeStatement(token,slug,{from=null,to=null}={},deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T023');
 const accounts=await accountsOf(db,tenant.id);
 const movements=await movementsByAccount(db,tenant.id,from,to);
 return {from:from||null,to:to||null,...incomeStatement(accounts,movements)};
}
export async function getBalanceSheet(token,slug,{asOf=null}={},deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T023');
 const accounts=await accountsOf(db,tenant.id);
 const movements=await movementsByAccount(db,tenant.id,null,asOf||today());
 return {asOf:asOf||today(),...balanceSheet(accounts,movements)};
}
export async function exportTrialBalanceCsv(token,slug,{from=null,to=null}={},deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T023');
 const accounts=await accountsOf(db,tenant.id);
 const movements=await movementsByAccount(db,tenant.id,from,to);
 const report=trialBalance(accounts,movements);
 const columns=[{key:'code',label:'Código'},{key:'name',label:'Cuenta'},{key:'type',label:'Tipo'},
  {key:'debit',label:'Debe MXN'},{key:'credit',label:'Haber MXN'},{key:'balance',label:'Saldo MXN'}];
 const money=c=>(Number(c||0)/100).toFixed(2);
 return {filename:'hubie-contabilidad-balanza.csv',csv:buildCsv(columns,report.rows.map(r=>({code:r.code,name:r.name,type:r.type,
  debit:money(r.debitCents),credit:money(r.creditCents),balance:money(r.balanceCents)})))};
}
// ---- Tablero (composición ref ecommerce: KPIs con delta, serie de
// ingresos, alertas reales, movimientos recientes y top clientes) ----
function prevMonthRange(){
 const d=new Date();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()-1);
 const from=d.toISOString().slice(0,8)+'01';
 const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0));
 return {from,to:end.toISOString().slice(0,10)};
}
const pctDelta=(now,prev)=>prev>0?Math.round(100*(now-prev)/prev):null;
export async function dashboard(token,slug,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T023');
 const org=tenant.id,from=monthStart(),to=today(),prev=prevMonthRange();
 const [activeAccounts,entries,registered,draftEntries]=await Promise.all([
  db.executeSql('SELECT COUNT(*) FROM tenant_accounting_accounts WHERE organization_id=? AND active=1',[org]),
  db.executeSql('SELECT COUNT(*) FROM tenant_accounting_entries WHERE organization_id=?',[org]),
  db.executeSql("SELECT COUNT(*) FROM tenant_accounting_entries WHERE organization_id=? AND status='registrada'",[org]),
  db.executeSql("SELECT COUNT(*) FROM tenant_accounting_entries WHERE organization_id=? AND status='borrador'",[org])
 ]);
 const accounts=await accountsOf(db,org);
 const [movements,prevMovements,incomeDaily,receivables,topClients]=await Promise.all([
  movementsByAccount(db,org,from,to),
  movementsByAccount(db,org,prev.from,prev.to),
  db.executeSql(`SELECT e.entry_date,COALESCE(SUM(l.credit_cents-l.debit_cents),0)
   FROM tenant_accounting_entry_lines l
   JOIN tenant_accounting_entries e ON e.organization_id=l.organization_id AND e.id=l.entry_id
   JOIN tenant_accounting_accounts a ON a.organization_id=l.organization_id AND a.id=l.account_id
   WHERE l.organization_id=? AND e.status='registrada' AND a.type='ingreso' AND e.entry_date>=? AND e.entry_date<=?
   GROUP BY e.entry_date ORDER BY e.entry_date ASC`,[org,from,to]),
  db.executeSql(`SELECT r.id,r.client_name,r.total_cents,r.due_on,
   (SELECT COALESCE(SUM(amount_cents),0) FROM tenant_collections p WHERE p.organization_id=r.organization_id AND p.quote_id=r.quote_id AND p.archived_at IS NULL)
   FROM tenant_receivables r WHERE r.organization_id=? AND r.archived_at IS NULL`,[org]),
  db.executeSql(`SELECT client_name,SUM(total_cents),COUNT(*) FROM tenant_sales_orders
   WHERE organization_id=? AND status!='cancelado' GROUP BY client_name ORDER BY SUM(total_cents) DESC LIMIT 5`,[org])
 ]);
 const income=incomeStatement(accounts,movements);
 const prevIncome=incomeStatement(accounts,prevMovements);
 const balance=trialBalance(accounts,movements);
 const recs=rows(receivables).map(x=>({id:x[0],clientName:x[1],totalCents:num(x[2]),dueOn:x[3]||null,
  paidCents:num(x[4]),balanceCents:Math.max(0,num(x[2])-num(x[4]))}));
 const overdue=recs.filter(r=>r.balanceCents>0&&r.dueOn&&r.dueOn<to);
 return {kpis:{activeAccounts:num(rows(activeAccounts)[0]?.[0]),totalEntries:num(rows(entries)[0]?.[0]),
  registeredEntries:num(rows(registered)[0]?.[0]),
  monthIncomeCents:income.incomeCents,monthIncomeDelta:pctDelta(income.incomeCents,prevIncome.incomeCents),
  monthExpenseCents:income.expenseCents,monthExpenseDelta:pctDelta(income.expenseCents,prevIncome.expenseCents),
  monthProfitCents:income.profitCents,monthProfitDelta:pctDelta(income.profitCents,prevIncome.profitCents),
  receivablesCents:recs.reduce((a,r)=>a+r.balanceCents,0),receivablesCount:recs.filter(r=>r.balanceCents>0).length,
  monthDebitCents:balance.totalDebitCents,monthCreditCents:balance.totalCreditCents},
  month:{from,to},prevMonth:prev,prevMonthIncomeCents:prevIncome.incomeCents,prevMonthExpenseCents:prevIncome.expenseCents,
  incomeDaily:rows(incomeDaily).map(x=>({day:x[0],cents:num(x[1])})),
  alerts:{overdueReceivables:overdue,draftEntries:num(rows(draftEntries)[0]?.[0])},
  topClients:rows(topClients).map(x=>({clientName:x[0],totalCents:num(x[1]),orders:num(x[2])}))};
}
