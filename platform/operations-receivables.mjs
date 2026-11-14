import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {normalizeReceivable,agingBucket,agingBucketLabels,summarizeAging} from './tools-p1b-domain.mjs';
import {normalizePayment as normalizeT014Payment} from './commerce-domain.mjs';

const rows=r=>r?.rows?.map(row=>row.map(cell=>cell?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const today=()=>new Date().toISOString().slice(0,10);
const audit=(org,user,action,id,type='receivable')=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',args:[randomUUID(),org,user,action,type,id]});
// Saldo real: total de la cotización aceptada menos cobros registrados (T014).
const select=`SELECT r.id,r.quote_id,r.client_id,r.client_name,r.total_cents,r.due_on,r.notes,r.created_at,
 q.status,q.title,
 COALESCE((SELECT SUM(amount_cents) FROM tenant_collections p WHERE p.organization_id=r.organization_id AND p.quote_id=r.quote_id AND p.archived_at IS NULL),0)
 FROM tenant_receivables r JOIN tenant_quotes q ON q.organization_id=r.organization_id AND q.id=r.quote_id`;
const toReceivable=(r,day)=>({id:r[0],quoteId:r[1],clientId:r[2]||null,clientName:r[3],totalCents:Number(r[4]),
 dueOn:r[5]||null,notes:r[6],createdAt:r[7],quoteStatus:r[8],quoteTitle:r[9]||null,
 paidCents:Number(r[10]||0),balanceCents:Math.max(0,Number(r[4])-Number(r[10]||0)),
 bucket:r[5]?agingBucket(r[5],day):'corriente',daysOverdue:r[5]?Math.max(0,Math.floor((Date.parse(day+'T00:00:00Z')-Date.parse(r[5]+'T00:00:00Z'))/86400000)):0});

export async function listReceivables(token,slug){
 const {tenant}=await authorizeTool(token,slug,'T017');
 const day=today();
 const [result,available]=await Promise.all([
  executeSql(select+' WHERE r.organization_id=? AND r.archived_at IS NULL ORDER BY r.due_on ASC, r.created_at DESC LIMIT 250',[tenant.id]),
  executeSql(`SELECT q.id,q.title,q.client_id,q.client_name,q.total_cents FROM tenant_quotes q
   WHERE q.organization_id=? AND q.archived_at IS NULL AND q.status='accepted'
   AND NOT EXISTS (SELECT 1 FROM tenant_receivables r WHERE r.organization_id=q.organization_id AND r.quote_id=q.id AND r.archived_at IS NULL)
   ORDER BY q.updated_at DESC LIMIT 100`,[tenant.id])
 ]);
 const receivables=rows(result).map(r=>toReceivable(r,day));
 return {receivables,
  availableQuotes:rows(available).map(q=>({id:q[0],title:q[1],clientId:q[2]||null,clientName:q[3],totalCents:Number(q[4])})),
  aging:summarizeAging(receivables,day),agingLabels:agingBucketLabels};
}
// Abre la cuenta por cobrar de una cotización aceptada real (una por cotización).
export async function openReceivable(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'T017',true);
 const data=normalizeReceivable(input);
 const quote=rows(await executeSql('SELECT client_id,client_name,total_cents,status FROM tenant_quotes WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,data.quoteId]))[0];
 if(!quote)throw Error('Not found');
 if(quote[3]!=='accepted')throw Error('Quote is not accepted');
 const existing=rows(await executeSql('SELECT id FROM tenant_receivables WHERE organization_id=? AND quote_id=? AND archived_at IS NULL',[tenant.id,data.quoteId]));
 if(existing.length)throw Error('Receivable already exists');
 const id=randomUUID();
 await executeBatch([
  {sql:'INSERT INTO tenant_receivables(organization_id,id,quote_id,client_id,client_name,total_cents,due_on,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?)',
   args:[tenant.id,id,data.quoteId,quote[0],quote[1],Number(quote[2]),data.dueOn,data.notes,session.userId]},
  audit(tenant.id,session.userId,'receivables.opened',id)
 ]);
 return {receivable:{id,quoteId:data.quoteId,clientId:quote[0]||null,clientName:quote[1],totalCents:Number(quote[2]),dueOn:data.dueOn,paidCents:0,balanceCents:Number(quote[2]),bucket:'corriente'}};
}
// Abono: un cobro parcial (T014) aplicado a la cotización; descuenta del saldo.
export async function recordReceivableInstallment(token,slug,receivableId,input){
 const {tenant,session}=await authorizeTool(token,slug,'T017',true);
 const found=rows(await executeSql(select+' WHERE r.organization_id=? AND r.id=? AND r.archived_at IS NULL',[tenant.id,receivableId]))[0];
 if(!found)throw Error('Not found');
 const receivable=toReceivable(found,today());
 if(receivable.balanceCents<=0)throw Error('Receivable is paid');
 const p=normalizeT014Payment({...input,quoteId:receivable.quoteId,clientId:receivable.clientId,clientName:receivable.clientName},
  {quoteTotalCents:receivable.totalCents,alreadyPaidCents:receivable.paidCents});
 const id=randomUUID();
 await executeBatch([
  {sql:'INSERT INTO tenant_collections(organization_id,id,quote_id,client_id,client_name,amount_cents,paid_on,method,reference,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
   args:[tenant.id,id,p.quoteId,p.clientId,p.clientName,p.amountCents,p.paidOn,p.method,p.reference,p.notes,session.userId]},
  audit(tenant.id,session.userId,'receivables.installment',id,'payment')
 ]);
 return {installment:{id,receivableId,...p,balanceCents:receivable.balanceCents-p.amountCents}};
}
export async function archiveReceivable(token,slug,id){
 const {tenant,session}=await authorizeTool(token,slug,'T017',true);
 const found=rows(await executeSql(select+' WHERE r.organization_id=? AND r.id=? AND r.archived_at IS NULL',[tenant.id,id]))[0];
 if(!found)throw Error('Not found');
 if(toReceivable(found,today()).balanceCents>0)throw Error('Receivable has balance');
 const result=await executeSql('UPDATE tenant_receivables SET archived_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,id]);
 if(!changed(result))throw Error('Not found');
 const a=audit(tenant.id,session.userId,'receivables.archived',id);
 await executeSql(a.sql,a.args);
 return {archived:true};
}
