import {executeSql} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {buildCsv,reportColumns,moneyText,reportKinds,summarizeExpenses,expenseCategoryLabels} from './commerce-domain.mjs';

const rows=r=>r?.rows?.map(row=>row.map(cell=>cell?.value??null))??[];
const num=r=>Number(r?.[0]||0);
const monthOf=(date=new Date())=>date.toISOString().slice(0,7);
const lastMonths=(count=6)=>{
 const out=[],d=new Date();d.setUTCDate(1);
 for(let i=0;i<count;i++){out.unshift(d.toISOString().slice(0,7));d.setUTCMonth(d.getUTCMonth()-1);}
 return out;
};

export async function reportSummary(token,slug,{month=null}={}){
 const {tenant}=await authorizeTool(token,slug,'T020');
 const target=/^\d{4}-\d{2}$/.test(month||'')?month:monthOf();
 const from=target+'-01',to=target+'-31';
 const [quotes,payments,expenses,clients,seriesP,seriesE,expList]=await Promise.all([
  executeSql("SELECT COUNT(*),COALESCE(SUM(total_cents),0) FROM tenant_quotes WHERE organization_id=? AND archived_at IS NULL AND status='accepted' AND substr(created_at,1,7)=?",[tenant.id,target]),
  executeSql('SELECT COUNT(*),COALESCE(SUM(amount_cents),0) FROM tenant_collections WHERE organization_id=? AND archived_at IS NULL AND substr(paid_on,1,7)=?',[tenant.id,target]),
  executeSql('SELECT id,occurred_on,category,description,amount_cents,vendor FROM tenant_expenses WHERE organization_id=? AND archived_at IS NULL AND occurred_on>=? AND occurred_on<=?',[tenant.id,from,to]),
  executeSql("SELECT COUNT(*) FROM tenant_client_profiles WHERE organization_id=? AND archived_at IS NULL AND substr(created_at,1,7)=?",[tenant.id,target]),
  executeSql("SELECT substr(paid_on,1,7),COALESCE(SUM(amount_cents),0) FROM tenant_collections WHERE organization_id=? AND archived_at IS NULL AND substr(paid_on,1,7)>=? GROUP BY 1",[tenant.id,lastMonths()[0]]),
  executeSql('SELECT substr(occurred_on,1,7),COALESCE(SUM(amount_cents),0) FROM tenant_expenses WHERE organization_id=? AND archived_at IS NULL AND substr(occurred_on,1,7)>=? GROUP BY 1',[tenant.id,lastMonths()[0]]),
  executeSql('SELECT id,occurred_on,category,description,amount_cents,vendor FROM tenant_expenses WHERE organization_id=? AND archived_at IS NULL AND occurred_on>=? AND occurred_on<=? ORDER BY occurred_on DESC',[tenant.id,from,to])
 ]);
 const months=lastMonths();
 const byMonth=months.map(m=>({
  month:m,
  paymentsCents:num(rows(seriesP).find(r=>r[0]===m)?.slice(1)||[0]),
  expensesCents:num(rows(seriesE).find(r=>r[0]===m)?.slice(1)||[0])
 }));
 const expSummary=summarizeExpenses(rows(expList).map(e=>({id:e[0],occurredOn:e[1],category:e[2],description:e[3],amountCents:Number(e[4]),vendor:e[5]})));
 return {month:target,
  totals:{acceptedQuotes:num(rows(quotes)[0]?.slice(0,1)),acceptedQuotesCents:num(rows(quotes)[0]?.slice(1)),
   payments:num(rows(payments)[0]?.slice(0,1)),paymentsCents:num(rows(payments)[0]?.slice(1)),
   expensesCents:expSummary.totalCents,expensesCount:expSummary.count,
   newClients:num(rows(clients)[0]),balanceCents:num(rows(payments)[0]?.slice(1))-expSummary.totalCents},
  expensesByCategory:Object.fromEntries(Object.entries(expSummary.byCategory).map(([k,v])=>[expenseCategoryLabels[k]||k,v])),
  byMonth};
}

export async function exportCsv(token,slug,kind){
 const {tenant}=await authorizeTool(token,slug,'T020');
 if(!reportKinds.includes(kind))throw Error('Not found');
 const org=tenant.id;
 if(kind==='clients'){
  const r=await executeSql('SELECT name,company,email,phone,status,created_at FROM tenant_client_profiles WHERE organization_id=? AND archived_at IS NULL ORDER BY name LIMIT 1000',[org]);
  return {filename:'hubie-clientes.csv',csv:buildCsv(reportColumns.clients,rows(r).map(c=>({name:c[0],company:c[1],email:c[2],phone:c[3],status:c[4],createdAt:c[5]})))};
 }
 if(kind==='quotes'){
  const r=await executeSql('SELECT title,client_name,status,subtotal_cents,vat_cents,total_cents,valid_until,created_at FROM tenant_quotes WHERE organization_id=? AND archived_at IS NULL ORDER BY created_at DESC LIMIT 1000',[org]);
  return {filename:'hubie-cotizaciones.csv',csv:buildCsv(reportColumns.quotes,rows(r).map(q=>({title:q[0],clientName:q[1],status:q[2],subtotal:moneyText(q[3]),vat:moneyText(q[4]),total:moneyText(q[5]),validUntil:q[6]||'',createdAt:q[7]})))};
 }
 if(kind==='payments'){
  const r=await executeSql(`SELECT p.client_name,q.title,p.amount_cents,p.method,p.reference,p.paid_on
   FROM tenant_collections p LEFT JOIN tenant_quotes q ON q.organization_id=p.organization_id AND q.id=p.quote_id
   WHERE p.organization_id=? AND p.archived_at IS NULL ORDER BY p.paid_on DESC LIMIT 1000`,[org]);
  return {filename:'hubie-cobros.csv',csv:buildCsv(reportColumns.payments,rows(r).map(p=>({clientName:p[0],quoteTitle:p[1]||'',amount:moneyText(p[2]),method:p[3],reference:p[4],paidOn:p[5]})))};
 }
 const r=await executeSql('SELECT description,category,vendor,amount_cents,occurred_on FROM tenant_expenses WHERE organization_id=? AND archived_at IS NULL ORDER BY occurred_on DESC LIMIT 1000',[org]);
 return {filename:'hubie-gastos.csv',csv:buildCsv(reportColumns.expenses,rows(r).map(e=>({description:e[0],category:e[1],vendor:e[2],amount:moneyText(e[3]),occurredOn:e[4]})))};
}
