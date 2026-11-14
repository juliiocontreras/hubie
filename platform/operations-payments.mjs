import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {getTenantTools} from '../tenant.mjs';
import {normalizePayment,paymentMethods,paymentMethodLabels,remainingBalance} from './commerce-domain.mjs';

const rows=r=>r?.rows?.map(row=>row.map(cell=>cell?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const audit=(org,user,action,id)=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',args:[randomUUID(),org,user,action,'payment',id]});
const select=`SELECT p.id,p.quote_id,p.client_id,p.client_name,p.amount_cents,p.paid_on,p.method,p.reference,p.notes,p.created_at,p.updated_at,
 q.title,q.total_cents,
 COALESCE((SELECT SUM(amount_cents) FROM tenant_collections p2 WHERE p2.organization_id=p.organization_id AND p2.quote_id=p.quote_id AND p2.archived_at IS NULL),0)
 FROM tenant_collections p LEFT JOIN tenant_quotes q ON q.organization_id=p.organization_id AND q.id=p.quote_id AND q.archived_at IS NULL`;
const toPayment=r=>({id:r[0],quoteId:r[1],clientId:r[2],clientName:r[3],amountCents:Number(r[4]),paidOn:r[5],
 method:r[6],reference:r[7],notes:r[8],createdAt:r[9],updatedAt:r[10],quoteTitle:r[11]||null,
 quoteTotalCents:r[12]===null?null:Number(r[12]),
 quotePaidCents:r[1]?Number(r[13]||0):null,
 quoteBalanceCents:r[1]&&r[12]!==null?remainingBalance(Number(r[12]),Number(r[13]||0)):null});

async function quoteBalance(org,quoteId){
 const q=rows(await executeSql('SELECT total_cents FROM tenant_quotes WHERE organization_id=? AND id=? AND archived_at IS NULL',[org,quoteId]))[0];
 if(!q)throw Error('Not found');
 const paid=rows(await executeSql('SELECT COALESCE(SUM(amount_cents),0) FROM tenant_collections WHERE organization_id=? AND quote_id=? AND archived_at IS NULL',[org,quoteId]))[0]?.[0]||0;
 return {totalCents:Number(q[0]),paidCents:Number(paid)};
}
async function ensureClient(org,id){
 if(!id)return;
 const found=rows(await executeSql('SELECT id FROM tenant_client_profiles WHERE organization_id=? AND id=? AND archived_at IS NULL',[org,id]));
 if(!found.length)throw Error('Client not found');
}

export async function listPayments(token,slug){
 const {tenant}=await authorizeTool(token,slug,'T014');
 const canReadQuotes=(await getTenantTools(tenant.id)).includes('T013');
 const [payments,quotes,clients]=await Promise.all([
  executeSql(select+' WHERE p.organization_id=? AND p.archived_at IS NULL ORDER BY p.paid_on DESC, p.created_at DESC LIMIT 250',[tenant.id]),
  canReadQuotes?executeSql(`SELECT q.id,q.title,q.client_name,q.total_cents,
    COALESCE((SELECT SUM(amount_cents) FROM tenant_collections p WHERE p.organization_id=q.organization_id AND p.quote_id=q.id AND p.archived_at IS NULL),0)
    FROM tenant_quotes q WHERE q.organization_id=? AND q.archived_at IS NULL AND q.status IN ('sent','accepted') ORDER BY q.updated_at DESC LIMIT 100`,[tenant.id]):Promise.resolve({rows:[]}),
  executeSql('SELECT id,name,company FROM tenant_client_profiles WHERE organization_id=? AND archived_at IS NULL ORDER BY name LIMIT 250',[tenant.id])
 ]);
 return {payments:rows(payments).map(toPayment),
  quotes:rows(quotes).map(q=>({id:q[0],title:q[1],clientName:q[2],totalCents:Number(q[3]),paidCents:Number(q[4]),balanceCents:remainingBalance(Number(q[3]),Number(q[4]))})),
  clients:rows(clients).map(c=>({id:c[0],name:c[1],company:c[2]})),
  methods:paymentMethods,methodLabels:paymentMethodLabels,canReadQuotes};
}
export async function createPayment(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'T014',true);
 let quoteTotal=null,alreadyPaid=0;
 if(input?.quoteId){
  const balance=await quoteBalance(tenant.id,input.quoteId);
  quoteTotal=balance.totalCents;alreadyPaid=balance.paidCents;
 }
 const p=normalizePayment(input,{quoteTotalCents:quoteTotal,alreadyPaidCents:alreadyPaid});
 await ensureClient(tenant.id,p.clientId);
 const id=randomUUID();
 await executeBatch([
  {sql:'INSERT INTO tenant_collections(organization_id,id,quote_id,client_id,client_name,amount_cents,paid_on,method,reference,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
   args:[tenant.id,id,p.quoteId,p.clientId,p.clientName,p.amountCents,p.paidOn,p.method,p.reference,p.notes,session.userId]},
  audit(tenant.id,session.userId,'payments.created',id)
 ]);
 return {payment:{id,...p}};
}
export async function updatePayment(token,slug,id,input){
 // El monto no se edita: un cobro registrado es un hecho; si fue un error se
 // archiva y se registra de nuevo. Solo se corrigen método, referencia, notas y fecha.
 const {tenant,session}=await authorizeTool(token,slug,'T014',true);
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['paidOn','method','reference','notes'].includes(k)))throw Error('Invalid payment');
 const clean=(v,max)=>typeof v==='string'&&v.trim().length<=max?v.trim():null;
 const paidOn=input.paidOn,method=input.method??'efectivo',reference=clean(input.reference??'',120),notes=clean(input.notes??'',1000);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(paidOn||'')||!paymentMethods.includes(method)||reference===null||notes===null)throw Error('Invalid payment');
 const result=await executeSql('UPDATE tenant_collections SET paid_on=?,method=?,reference=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',
  [paidOn,method,reference,notes,tenant.id,id]);
 if(!changed(result))throw Error('Not found');
 const a=audit(tenant.id,session.userId,'payments.updated',id);
 await executeSql(a.sql,a.args);
 return {ok:true};
}
export async function archivePayment(token,slug,id){
 const {tenant,session}=await authorizeTool(token,slug,'T014',true);
 const result=await executeSql('UPDATE tenant_collections SET archived_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,id]);
 if(!changed(result))throw Error('Not found');
 const a=audit(tenant.id,session.userId,'payments.archived',id);
 await executeSql(a.sql,a.args);
 return {archived:true};
}
