import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {normalizeExpense,expenseCategories,expenseCategoryLabels,summarizeExpenses} from './commerce-domain.mjs';

const rows=r=>r?.rows?.map(row=>row.map(cell=>cell?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const audit=(org,user,action,id)=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',args:[randomUUID(),org,user,action,'expense',id]});
const select=`SELECT e.id,e.occurred_on,e.category,e.description,e.amount_cents,e.vendor,e.created_at,e.updated_at,
 (SELECT COUNT(*) FROM pwa_media m WHERE m.organization_id=e.organization_id AND m.kind='attachment' AND m.tool_id='C007' AND m.record_id=e.id)
 FROM tenant_expenses e`;
const toExpense=r=>({id:r[0],occurredOn:r[1],category:r[2],description:r[3],amountCents:Number(r[4]),
 vendor:r[5],createdAt:r[6],updatedAt:r[7],receiptCount:Number(r[8]||0)});

export async function listExpenses(token,slug,{from=null,to=null,category=null}={}){
 const {tenant}=await authorizeTool(token,slug,'C007');
 const where=['e.organization_id=? AND e.archived_at IS NULL'],args=[tenant.id];
 if(from){where.push('e.occurred_on>=?');args.push(from);}
 if(to){where.push('e.occurred_on<=?');args.push(to);}
 if(category){where.push('e.category=?');args.push(category);}
 const result=await executeSql(select+' WHERE '+where.join(' AND ')+' ORDER BY e.occurred_on DESC, e.created_at DESC LIMIT 250',args);
 const expenses=rows(result).map(toExpense);
 return {expenses,summary:summarizeExpenses(expenses),categories:expenseCategories,categoryLabels:expenseCategoryLabels};
}
export async function createExpense(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'C007',true);
 const e=normalizeExpense(input),id=randomUUID();
 await executeBatch([
  {sql:'INSERT INTO tenant_expenses(organization_id,id,occurred_on,category,description,amount_cents,vendor,created_by) VALUES(?,?,?,?,?,?,?,?)',
   args:[tenant.id,id,e.occurredOn,e.category,e.description,e.amountCents,e.vendor,session.userId]},
  audit(tenant.id,session.userId,'expenses.created',id)
 ]);
 return {expense:{id,...e,receiptCount:0}};
}
export async function updateExpense(token,slug,id,input){
 const {tenant,session}=await authorizeTool(token,slug,'C007',true);
 const e=normalizeExpense(input);
 const result=await executeSql('UPDATE tenant_expenses SET occurred_on=?,category=?,description=?,amount_cents=?,vendor=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',
  [e.occurredOn,e.category,e.description,e.amountCents,e.vendor,tenant.id,id]);
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
