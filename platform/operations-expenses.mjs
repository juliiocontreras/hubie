import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {normalizeExpense,expenseCategories,expenseCategoryLabels,summarizeExpenses,buildCsv,reportColumns,moneyText} from './commerce-domain.mjs';
import {normalizeExpenseBudget,monthlyExpenseReport as monthlyExpenseReportDomain} from './tools-p1b-domain.mjs';

const rows=r=>r?.rows?.map(row=>row.map(cell=>cell?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const audit=(org,user,action,id)=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',args:[randomUUID(),org,user,action,'expense',id]});
const select=`SELECT e.id,e.occurred_on,e.category,e.description,e.amount_cents,e.vendor,e.supplier_id,s.name,e.created_at,e.updated_at,
 (SELECT COUNT(*) FROM pwa_media m WHERE m.organization_id=e.organization_id AND m.kind='attachment' AND m.tool_id='C007' AND m.record_id=e.id)
 FROM tenant_expenses e LEFT JOIN tenant_suppliers s ON s.organization_id=e.organization_id AND s.id=e.supplier_id`;
const toExpense=r=>({id:r[0],occurredOn:r[1],category:r[2],description:r[3],amountCents:Number(r[4]),
 vendor:r[5],supplierId:r[6]||null,supplierName:r[7]||null,createdAt:r[8],updatedAt:r[9],receiptCount:Number(r[10]||0)});
const uuidOk=v=>v===null||v===undefined||v===''||/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
async function ensureSupplier(org,supplierId){
 if(!supplierId)return null;
 if(!uuidOk(supplierId))throw Error('Invalid expense');
 const found=rows(await executeSql('SELECT id FROM tenant_suppliers WHERE organization_id=? AND id=? AND archived_at IS NULL',[org,supplierId]));
 if(!found.length)throw Error('Supplier not found');
 return supplierId;
}

export async function listExpenses(token,slug,{from=null,to=null,category=null}={}){
 const {tenant}=await authorizeTool(token,slug,'C007');
 const where=['e.organization_id=? AND e.archived_at IS NULL'],args=[tenant.id];
 if(from){where.push('e.occurred_on>=?');args.push(from);}
 if(to){where.push('e.occurred_on<=?');args.push(to);}
 if(category){where.push('e.category=?');args.push(category);}
 const result=await executeSql(select+' WHERE '+where.join(' AND ')+' ORDER BY e.occurred_on DESC, e.created_at DESC LIMIT 250',args);
 const expenses=rows(result).map(toExpense);
 const suppliers=rows(await executeSql('SELECT id,name FROM tenant_suppliers WHERE organization_id=? AND archived_at IS NULL ORDER BY name LIMIT 250',[tenant.id]));
 return {expenses,summary:summarizeExpenses(expenses),categories:expenseCategories,categoryLabels:expenseCategoryLabels,
  suppliers:suppliers.map(s=>({id:s[0],name:s[1]}))};
}
export async function createExpense(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'C007',true);
 const e=normalizeExpense(input),id=randomUUID();
 const supplierId=await ensureSupplier(tenant.id,input?.supplierId);
 await executeBatch([
  {sql:'INSERT INTO tenant_expenses(organization_id,id,occurred_on,category,description,amount_cents,vendor,supplier_id,created_by) VALUES(?,?,?,?,?,?,?,?,?)',
   args:[tenant.id,id,e.occurredOn,e.category,e.description,e.amountCents,e.vendor,supplierId,session.userId]},
  audit(tenant.id,session.userId,'expenses.created',id)
 ]);
 return {expense:{id,...e,supplierId,receiptCount:0}};
}
export async function updateExpense(token,slug,id,input){
 const {tenant,session}=await authorizeTool(token,slug,'C007',true);
 const e=normalizeExpense(input);
 const supplierId=await ensureSupplier(tenant.id,input?.supplierId);
 const result=await executeSql('UPDATE tenant_expenses SET occurred_on=?,category=?,description=?,amount_cents=?,vendor=?,supplier_id=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',
  [e.occurredOn,e.category,e.description,e.amountCents,e.vendor,supplierId,tenant.id,id]);
 if(!changed(result))throw Error('Not found');
 const a=audit(tenant.id,session.userId,'expenses.updated',id);
 await executeSql(a.sql,a.args);
 return {ok:true};
}
export async function archiveExpense(token,slug,id){
 const {tenant,session}=await authorizeTool(token,slug,'C007',true);
 const result=await executeSql('UPDATE tenant_expenses SET archived_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,id]);
 if(!changed(result))throw Error('Not found');
 const a=audit(tenant.id,session.userId,'expenses.archived',id);
 await executeSql(a.sql,a.args);
 return {archived:true};
}
// Presupuestos por categoría y mes (límite + alerta al superarlo).
export async function listExpenseBudgets(token,slug,{month=null}={}){
 const {tenant}=await authorizeTool(token,slug,'C007');
 const target=/^\d{4}-\d{2}$/.test(month||'')?month:new Date().toISOString().slice(0,7);
 const result=await executeSql('SELECT id,category,month,limit_cents,created_at,updated_at FROM tenant_expense_budgets WHERE organization_id=? AND month=? ORDER BY category',[tenant.id,target]);
 const spent=rows(await executeSql('SELECT category,COALESCE(SUM(amount_cents),0) FROM tenant_expenses WHERE organization_id=? AND archived_at IS NULL AND substr(occurred_on,1,7)=? GROUP BY category',[tenant.id,target]));
 const spentByCategory=Object.fromEntries(spent.map(s=>[s[0],Number(s[1])]));
 return {month:target,categories:expenseCategories,categoryLabels:expenseCategoryLabels,
  budgets:rows(result).map(b=>({id:b[0],category:b[1],month:b[2],limitCents:Number(b[3]),
   spentCents:spentByCategory[b[1]]||0,over:(spentByCategory[b[1]]||0)>Number(b[3]),createdAt:b[4],updatedAt:b[5]}))};
}
export async function setExpenseBudget(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'C007',true);
 const b=normalizeExpenseBudget(input);
 const id=randomUUID();
 await executeBatch([
  {sql:`INSERT INTO tenant_expense_budgets(organization_id,id,category,month,limit_cents,created_by) VALUES(?,?,?,?,?,?)
   ON CONFLICT(organization_id,category,month) DO UPDATE SET limit_cents=excluded.limit_cents,updated_at=CURRENT_TIMESTAMP`,
   args:[tenant.id,id,b.category,b.month,b.limitCents,session.userId]},
  audit(tenant.id,session.userId,'expenses.budget_set',id)
 ]);
 return {budget:{id,...b}};
}
// Reporte mensual: totales por categoría contra presupuesto + CSV (patrón T020).
export async function monthlyExpenseReport(token,slug,{month=null}={}){
 const {tenant}=await authorizeTool(token,slug,'C007');
 const target=/^\d{4}-\d{2}$/.test(month||'')?month:new Date().toISOString().slice(0,7);
 const from=target+'-01',to=target+'-31';
 const [expenses,budgets]=await Promise.all([
  executeSql(select+' WHERE e.organization_id=? AND e.archived_at IS NULL AND e.occurred_on>=? AND e.occurred_on<=? ORDER BY e.occurred_on DESC',[tenant.id,from,to]),
  executeSql('SELECT category,limit_cents FROM tenant_expense_budgets WHERE organization_id=? AND month=?',[tenant.id,target])
 ]);
 const list=rows(expenses).map(toExpense);
 const report=monthlyExpenseReportDomain(list,rows(budgets).map(b=>({category:b[0],month:target,limitCents:Number(b[1])})),target);
 const csv=buildCsv(reportColumns.expenses,list.map(e=>({description:e.description,category:expenseCategoryLabels[e.category]||e.category,
  vendor:e.supplierName||e.vendor,amount:moneyText(e.amountCents),occurredOn:e.occurredOn})));
 return {...report,expenses:list,csv,filename:'hubie-gastos-'+target+'.csv'};
}
