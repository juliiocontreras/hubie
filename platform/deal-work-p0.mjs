// C002 (P0): tareas ligadas al trato y cotizaciones ligadas al trato.
// Un trato se asigna a un miembro real del equipo (tenant_deal_assignments,
// migración 021); las tareas viven en tenant_crm_deal_tasks y el vínculo
// trato↔cotización en tenant_deal_quotes.
import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {checkMemberToolAccess} from './member-tools-p0.mjs';

const rows=r=>r?.rows?.map(row=>row.map(cell=>cell?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dateTime=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v)&&Number.isFinite(Date.parse(v));
export const taskStatuses=Object.freeze(['todo','doing','done']);
const audit=(org,actor,action,type,id)=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',
 args:[randomUUID(),org,actor,action,type,id]});

async function requireDeal(tenantId,dealId){
 if(!uuid.test(dealId||''))throw Error('Not found');
 const deal=rows(await executeSql(
  'SELECT id,title FROM tenant_crm_deals WHERE organization_id=? AND id=? AND archived_at IS NULL',
  [tenantId,dealId]))[0];
 if(!deal)throw Error('Not found');
 return deal;
}
async function requireActiveMember(tenantId,userId){
 if(userId===null||userId===undefined)return null;
 if(!uuid.test(userId))throw Error('Invalid deal');
 const member=rows(await executeSql(
  `SELECT u.id,u.email FROM memberships m JOIN users u ON u.id=m.user_id
   WHERE m.organization_id=? AND m.user_id=? AND m.status='active'`,[tenantId,userId]))[0];
 if(!member)throw Error('Invalid deal');
 return {id:member[0],email:member[1]};
}
// La asignación se valida aquí y la usan create/update de operations-crm.mjs.
export async function validateAssignee(tenantId,assignedUserId){
 return requireActiveMember(tenantId,assignedUserId??null);
}
export function normalizeDealTask(input){
 if(!input||typeof input!=='object'||Array.isArray(input)
  ||Object.keys(input).some(k=>!['title','dueAt','status','assignedUserId'].includes(k)))throw Error('Invalid deal task');
 const title=typeof input.title==='string'?input.title.trim():'';
 const dueAt=input.dueAt??null;
 const status=input.status??'todo';
 const assignedUserId=input.assignedUserId??null;
 if(title.length<2||title.length>180||!taskStatuses.includes(status)
  ||dueAt!==null&&!dateTime(dueAt)||assignedUserId!==null&&!uuid.test(assignedUserId))throw Error('Invalid deal task');
 return {title,dueAt,status,assignedUserId};
}
const toTask=r=>({id:r[0],dealId:r[1],title:r[2],dueAt:r[3]||null,status:r[4],
 assignedUserId:r[5]||null,assignedUserEmail:r[6]||null,createdAt:r[7],updatedAt:r[8],
 completedAt:r[9]||null});
const taskSelect=`SELECT t.id,t.deal_id,t.title,t.due_at,t.status,t.assigned_user_id,u.email,t.created_at,t.updated_at,t.completed_at
 FROM tenant_crm_deal_tasks t LEFT JOIN users u ON u.id=t.assigned_user_id`;
export async function listDealTasks(token,slug,dealId){
 const {tenant,session}=await authorizeTool(token,slug,'C002');
 await checkMemberToolAccess(tenant.id,session.userId,session.role,'C002',false);
 await requireDeal(tenant.id,dealId);
 const result=await executeSql(taskSelect+' WHERE t.organization_id=? AND t.deal_id=? AND t.archived_at IS NULL ORDER BY t.due_at IS NULL,t.due_at,t.created_at',
  [tenant.id,dealId]);
 return {tasks:rows(result).map(toTask),statuses:taskStatuses};
}
export async function createDealTask(token,slug,dealId,input){
 const {tenant,session}=await authorizeTool(token,slug,'C002',true);
 await checkMemberToolAccess(tenant.id,session.userId,session.role,'C002',true);
 await requireDeal(tenant.id,dealId);
 const task=normalizeDealTask(input);
 await requireActiveMember(tenant.id,task.assignedUserId);
 const id=randomUUID();
 await executeBatch([
  {sql:`INSERT INTO tenant_crm_deal_tasks(organization_id,id,deal_id,title,due_at,status,assigned_user_id,created_by,completed_at)
    VALUES(?,?,?,?,?,?,?,?,?)`,
   args:[tenant.id,id,dealId,task.title,task.dueAt,task.status,task.assignedUserId,session.userId,
    task.status==='done'?new Date().toISOString():null]},
  audit(tenant.id,session.userId,'crm.task_created','crm_deal',dealId)
 ]);
 return {task:{id,dealId,...task,createdAt:new Date().toISOString()}};
}
export async function updateDealTask(token,slug,dealId,taskId,input){
 const {tenant,session}=await authorizeTool(token,slug,'C002',true);
 await checkMemberToolAccess(tenant.id,session.userId,session.role,'C002',true);
 await requireDeal(tenant.id,dealId);
 const task=normalizeDealTask(input);
 await requireActiveMember(tenant.id,task.assignedUserId);
 const result=await executeSql(
  `UPDATE tenant_crm_deal_tasks SET title=?,due_at=?,status=?,assigned_user_id=?,
   completed_at=CASE WHEN ?= 'done' THEN COALESCE(completed_at,CURRENT_TIMESTAMP) ELSE NULL END,
   updated_at=CURRENT_TIMESTAMP
   WHERE organization_id=? AND deal_id=? AND id=? AND archived_at IS NULL`,
  [task.title,task.dueAt,task.status,task.assignedUserId,task.status,tenant.id,dealId,taskId]);
 if(!changed(result))throw Error('Not found');
 const record=audit(tenant.id,session.userId,'crm.task_updated','crm_deal',dealId);
 await executeSql(record.sql,record.args);
 return {ok:true};
}
export async function archiveDealTask(token,slug,dealId,taskId){
 const {tenant,session}=await authorizeTool(token,slug,'C002',true);
 await checkMemberToolAccess(tenant.id,session.userId,session.role,'C002',true);
 await requireDeal(tenant.id,dealId);
 const result=await executeSql(
  'UPDATE tenant_crm_deal_tasks SET archived_at=CURRENT_TIMESTAMP WHERE organization_id=? AND deal_id=? AND id=? AND archived_at IS NULL',
  [tenant.id,dealId,taskId]);
 if(!changed(result))throw Error('Not found');
 return {archived:true};
}

// --- Cotizaciones del trato ---
const quoteSelect=`SELECT q.id,q.client_id,q.client_name,q.title,q.status,q.total_cents,q.created_at,q.updated_at
 FROM tenant_quotes q JOIN tenant_deal_quotes l ON l.organization_id=q.organization_id AND l.quote_id=q.id`;
export async function listDealQuotes(token,slug,dealId){
 const {tenant,session}=await authorizeTool(token,slug,'C002');
 await checkMemberToolAccess(tenant.id,session.userId,session.role,'C002',false);
 await requireDeal(tenant.id,dealId);
 const result=await executeSql(quoteSelect+' WHERE l.organization_id=? AND l.deal_id=? AND q.archived_at IS NULL ORDER BY q.updated_at DESC',
  [tenant.id,dealId]);
 return {quotes:rows(result).map(([id,clientId,clientName,title,status,total,createdAt,updatedAt])=>({
  id,clientId:clientId||null,clientName,title,status,totalCents:Number(total),createdAt,updatedAt}))};
}
export async function linkDealQuote(token,slug,dealId,quoteId){
 const {tenant,session}=await authorizeTool(token,slug,'C002',true);
 await checkMemberToolAccess(tenant.id,session.userId,session.role,'C002',true);
 await authorizeTool(token,slug,'T013',true);
 await requireDeal(tenant.id,dealId);
 if(!uuid.test(quoteId||''))throw Error('Not found');
 const quote=rows(await executeSql(
  'SELECT id,client_id FROM tenant_quotes WHERE organization_id=? AND id=? AND archived_at IS NULL',
  [tenant.id,quoteId]))[0];
 if(!quote)throw Error('Not found');
 // Si trato y cotización tienen cliente, debe ser el mismo.
 const dealClient=rows(await executeSql(
  'SELECT client_id FROM tenant_deal_clients WHERE organization_id=? AND deal_id=?',[tenant.id,dealId]))[0];
 if(dealClient?.[0]&&quote[1]&&dealClient[0]!==quote[1])throw Error('Relation mismatch');
 const results=await executeBatch([
  {sql:'INSERT INTO tenant_deal_quotes(organization_id,deal_id,quote_id,created_by) VALUES(?,?,?,?) ON CONFLICT DO NOTHING',
   args:[tenant.id,dealId,quoteId,session.userId]},
  audit(tenant.id,session.userId,'crm.quote_linked','crm_deal',dealId)
 ]);
 if(!changed(results?.[0]))throw Error('Duplicate relation');
 return {linked:true,dealId,quoteId};
}
export async function unlinkDealQuote(token,slug,dealId,quoteId){
 const {tenant,session}=await authorizeTool(token,slug,'C002',true);
 await checkMemberToolAccess(tenant.id,session.userId,session.role,'C002',true);
 await requireDeal(tenant.id,dealId);
 const result=await executeSql(
  'DELETE FROM tenant_deal_quotes WHERE organization_id=? AND deal_id=? AND quote_id=?',
  [tenant.id,dealId,quoteId]);
 if(!changed(result))throw Error('Not found');
 return {removed:true};
}
// Viceversa: desde una cotización, saber a qué trato pertenece (sin tocar
// operations-quotes.mjs más allá del dealId que ya expone su SELECT).
export async function getQuoteDeal(token,slug,quoteId){
 const {tenant,session}=await authorizeTool(token,slug,'T013');
 await checkMemberToolAccess(tenant.id,session.userId,session.role,'T013',false);
 if(!uuid.test(quoteId||''))throw Error('Not found');
 const row=rows(await executeSql(
  `SELECT d.id,d.title FROM tenant_crm_deals d JOIN tenant_deal_quotes l
   ON l.organization_id=d.organization_id AND l.deal_id=d.id
   WHERE l.organization_id=? AND l.quote_id=? AND d.archived_at IS NULL`,
  [tenant.id,quoteId]))[0];
 return {deal:row?{id:row[0],title:row[1]}:null};
}
