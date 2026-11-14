import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {normalizePayable,normalizePayableInstallment,nextPayableStatus,payableStatuses,payableStatusLabels} from './tools-p1b-domain.mjs';

const rows=r=>r?.rows?.map(row=>row.map(cell=>cell?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const audit=(org,user,action,id,type='payable')=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',args:[randomUUID(),org,user,action,type,id]});
const select=`SELECT p.id,p.supplier_id,s.name,p.purchase_order_id,p.description,p.total_cents,p.due_on,p.status,p.approved_by,p.approved_at,p.notes,p.created_at,p.updated_at,
 COALESCE((SELECT SUM(amount_cents) FROM tenant_payable_installments i WHERE i.organization_id=p.organization_id AND i.payable_id=p.id),0),
 (SELECT COUNT(*) FROM tenant_payable_installments i WHERE i.organization_id=p.organization_id AND i.payable_id=p.id)
 FROM tenant_payables p LEFT JOIN tenant_suppliers s ON s.organization_id=p.organization_id AND s.id=p.supplier_id`;
const toPayable=r=>({id:r[0],supplierId:r[1],supplierName:r[2]||null,purchaseOrderId:r[3]||null,description:r[4],
 totalCents:Number(r[5]),dueOn:r[6],status:r[7],approvedBy:r[8]||null,approvedAt:r[9]||null,notes:r[10],
 createdAt:r[11],updatedAt:r[12],paidCents:Number(r[13]||0),
 balanceCents:Math.max(0,Number(r[5])-Number(r[13]||0)),installments:Number(r[14]||0),
 overdue:r[6]&&r[7]!=='paid'&&r[7]!=='cancelled'?r[6]<new Date().toISOString().slice(0,10):false});

async function loadPayable(org,id){
 const found=rows(await executeSql(select+' WHERE p.organization_id=? AND p.id=? AND p.archived_at IS NULL',[org,id]))[0];
 if(!found)throw Error('Not found');
 return toPayable(found);
}
async function loadInstallments(org,payableId){
 const result=await executeSql('SELECT id,amount_cents,paid_on,method,reference,notes,created_at FROM tenant_payable_installments WHERE organization_id=? AND payable_id=? ORDER BY paid_on DESC LIMIT 100',[org,payableId]);
 return rows(result).map(i=>({id:i[0],amountCents:Number(i[1]),paidOn:i[2],method:i[3],reference:i[4],notes:i[5],createdAt:i[6]}));
}

export async function listPayables(token,slug){
 const {tenant}=await authorizeTool(token,slug,'T018');
 const [payables,suppliers,orders]=await Promise.all([
  executeSql(select+' WHERE p.organization_id=? AND p.archived_at IS NULL ORDER BY p.due_on ASC, p.created_at DESC LIMIT 250',[tenant.id]),
  executeSql('SELECT id,name FROM tenant_suppliers WHERE organization_id=? AND archived_at IS NULL ORDER BY name LIMIT 250',[tenant.id]),
  executeSql(`SELECT p.id,p.total_cents,s.name FROM tenant_purchase_orders p
   JOIN tenant_suppliers s ON s.organization_id=p.organization_id AND s.id=p.supplier_id
   WHERE p.organization_id=? AND p.archived_at IS NULL AND p.status IN ('sent','partially_received','received') ORDER BY p.created_at DESC LIMIT 100`,[tenant.id])
 ]);
 return {payables:rows(payables).map(toPayable),
  suppliers:rows(suppliers).map(s=>({id:s[0],name:s[1]})),
  purchaseOrders:rows(orders).map(o=>({id:o[0],totalCents:Number(o[1]),supplierName:o[2]})),
  statuses:payableStatuses,statusLabels:payableStatusLabels};
}
export async function getPayable(token,slug,id){
 const {tenant}=await authorizeTool(token,slug,'T018');
 const payable=await loadPayable(tenant.id,id);
 return {payable:{...payable,installmentList:await loadInstallments(tenant.id,id)}};
}
export async function createPayable(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'T018',true);
 const p=normalizePayable(input),id=randomUUID();
 const supplier=rows(await executeSql('SELECT id FROM tenant_suppliers WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,p.supplierId]));
 if(!supplier.length)throw Error('Supplier not found');
 if(p.purchaseOrderId){
  const order=rows(await executeSql('SELECT supplier_id FROM tenant_purchase_orders WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,p.purchaseOrderId]))[0];
  if(!order)throw Error('Purchase order not found');
  if(order[0]!==p.supplierId)throw Error('Purchase order supplier mismatch');
 }
 await executeBatch([
  {sql:'INSERT INTO tenant_payables(organization_id,id,supplier_id,purchase_order_id,description,total_cents,due_on,status,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)',
   args:[tenant.id,id,p.supplierId,p.purchaseOrderId,p.description,p.totalCents,p.dueOn,'pending',p.notes,session.userId]},
  audit(tenant.id,session.userId,'payables.created',id)
 ]);
 return {payable:{id,...p,status:'pending',paidCents:0,balanceCents:p.totalCents,approvedBy:null,approvedAt:null}};
}
export async function setPayableStatus(token,slug,id,next){
 const {tenant,session}=await authorizeTool(token,slug,'T018',true);
 const payable=await loadPayable(tenant.id,id);
 nextPayableStatus(payable.status,next);
 if(next==='paid'&&payable.balanceCents>0)throw Error('Payable has balance');
 const result=await executeSql(`UPDATE tenant_payables SET status=?,approved_by=?,approved_at=?,updated_at=CURRENT_TIMESTAMP
  WHERE organization_id=? AND id=? AND archived_at IS NULL`,
  [next,next==='approved'?session.userId:payable.approvedBy,next==='approved'?new Date().toISOString():payable.approvedAt,tenant.id,id]);
 if(!changed(result))throw Error('Not found');
 const a=audit(tenant.id,session.userId,'payables.'+next,id);
 await executeSql(a.sql,a.args);
 return {ok:true,status:next};
}
export async function recordPayableInstallment(token,slug,payableId,input){
 const {tenant,session}=await authorizeTool(token,slug,'T018',true);
 const payable=await loadPayable(tenant.id,payableId);
 if(!['pending','approved'].includes(payable.status))throw Error('Invalid payable status');
 const inst=normalizePayableInstallment(input,{totalCents:payable.totalCents,alreadyPaidCents:payable.paidCents});
 const id=randomUUID();
 await executeBatch([
  {sql:'INSERT INTO tenant_payable_installments(organization_id,payable_id,id,amount_cents,paid_on,method,reference,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?)',
   args:[tenant.id,payableId,id,inst.amountCents,inst.paidOn,inst.method,inst.reference,inst.notes,session.userId]},
  audit(tenant.id,session.userId,'payables.installment',id,'payable_installment')
 ]);
 return {installment:{id,payableId,...inst,balanceCents:payable.balanceCents-inst.amountCents}};
}
export async function archivePayable(token,slug,id){
 const {tenant,session}=await authorizeTool(token,slug,'T018',true);
 const payable=await loadPayable(tenant.id,id);
 if(!['pending','cancelled'].includes(payable.status)||payable.paidCents>0)throw Error('Invalid payable status');
 const result=await executeSql('UPDATE tenant_payables SET archived_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,id]);
 if(!changed(result))throw Error('Not found');
 const a=audit(tenant.id,session.userId,'payables.archived',id);
 await executeSql(a.sql,a.args);
 return {archived:true};
}
