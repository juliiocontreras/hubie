import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {normalizeSupplier,normalizeSupplierDocument,supplierPaymentTerms,supplierPaymentTermLabels} from './tools-p1b-domain.mjs';

const rows=r=>r?.rows?.map(row=>row.map(cell=>cell?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const audit=(org,user,action,id,type='supplier')=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',args:[randomUUID(),org,user,action,type,id]});
const select=`SELECT s.id,s.name,s.contact,s.email,s.phone,s.payment_terms,s.notes,s.created_at,s.updated_at,
 (SELECT COUNT(*) FROM tenant_purchase_orders p WHERE p.organization_id=s.organization_id AND p.supplier_id=s.id AND p.archived_at IS NULL),
 (SELECT COUNT(*) FROM tenant_supplier_documents d WHERE d.organization_id=s.organization_id AND d.supplier_id=s.id AND d.archived_at IS NULL),
 (SELECT COUNT(*) FROM tenant_payables p WHERE p.organization_id=s.organization_id AND p.supplier_id=s.id AND p.archived_at IS NULL)
 FROM tenant_suppliers s`;
const toSupplier=r=>({id:r[0],name:r[1],contact:r[2],email:r[3],phone:r[4],paymentTerms:r[5],notes:r[6],
 createdAt:r[7],updatedAt:r[8],purchaseOrders:Number(r[9]||0),documents:Number(r[10]||0),payables:Number(r[11]||0)});

export async function listSuppliers(token,slug){
 const {tenant}=await authorizeTool(token,slug,'T009');
 const result=await executeSql(select+' WHERE s.organization_id=? AND s.archived_at IS NULL ORDER BY s.name LIMIT 250',[tenant.id]);
 return {suppliers:rows(result).map(toSupplier),paymentTerms:supplierPaymentTerms,paymentTermLabels:supplierPaymentTermLabels};
}
export async function createSupplier(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'T009',true);
 const s=normalizeSupplier(input),id=randomUUID();
 await executeBatch([
  {sql:'INSERT INTO tenant_suppliers(organization_id,id,name,contact,email,phone,payment_terms,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?)',
   args:[tenant.id,id,s.name,s.contact,s.email,s.phone,s.paymentTerms,s.notes,session.userId]},
  audit(tenant.id,session.userId,'suppliers.created',id)
 ]);
 return {supplier:{id,...s,purchaseOrders:0,documents:0,payables:0}};
}
export async function updateSupplier(token,slug,id,input){
 const {tenant,session}=await authorizeTool(token,slug,'T009',true);
 const s=normalizeSupplier(input);
 const result=await executeSql('UPDATE tenant_suppliers SET name=?,contact=?,email=?,phone=?,payment_terms=?,notes=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',
  [s.name,s.contact,s.email,s.phone,s.paymentTerms,s.notes,tenant.id,id]);
 if(!changed(result))throw Error('Not found');
 const entry=audit(tenant.id,session.userId,'suppliers.updated',id);
 await executeSql(entry.sql,entry.args);
 return {ok:true};
}
export async function archiveSupplier(token,slug,id){
 const {tenant,session}=await authorizeTool(token,slug,'T009',true);
 const linked=rows(await executeSql('SELECT COUNT(*) FROM tenant_purchase_orders WHERE organization_id=? AND supplier_id=? AND archived_at IS NULL AND status IN (\'draft\',\'sent\',\'partially_received\')',[tenant.id,id]))[0]?.[0]||0;
 if(Number(linked)>0)throw Error('Supplier has open purchase orders');
 const result=await executeSql('UPDATE tenant_suppliers SET archived_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,id]);
 if(!changed(result))throw Error('Not found');
 const a=audit(tenant.id,session.userId,'suppliers.archived',id);
 await executeSql(a.sql,a.args);
 return {archived:true};
}
export async function listSupplierDocuments(token,slug,supplierId){
 const {tenant}=await authorizeTool(token,slug,'T009');
 const found=rows(await executeSql('SELECT id FROM tenant_suppliers WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,supplierId]));
 if(!found.length)throw Error('Not found');
 const result=await executeSql('SELECT d.id,d.media_id,d.document_type,d.notes,d.created_at,m.name,m.mime FROM tenant_supplier_documents d LEFT JOIN pwa_media m ON m.id=d.media_id WHERE d.organization_id=? AND d.supplier_id=? AND d.archived_at IS NULL ORDER BY d.created_at DESC LIMIT 100',[tenant.id,supplierId]);
 return {documents:rows(result).map(d=>({id:d[0],mediaId:d[1],documentType:d[2],notes:d[3],createdAt:d[4],fileName:d[5]||null,mime:d[6]||null}))};
}
export async function addSupplierDocument(token,slug,supplierId,input){
 const {tenant,session}=await authorizeTool(token,slug,'T009',true);
 const doc=normalizeSupplierDocument(input);
 const found=rows(await executeSql('SELECT id FROM tenant_suppliers WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,supplierId]));
 if(!found.length)throw Error('Not found');
 // El adjunto debe existir en pwa_media de este tenant (subido como C007/T009).
 const media=rows(await executeSql("SELECT id FROM pwa_media WHERE id=? AND organization_id=? AND kind='attachment'",[doc.mediaId,tenant.id]));
 if(!media.length)throw Error('Attachment not found');
 const id=randomUUID();
 await executeBatch([
  {sql:'INSERT INTO tenant_supplier_documents(organization_id,id,supplier_id,media_id,document_type,notes,created_by) VALUES(?,?,?,?,?,?,?)',
   args:[tenant.id,id,supplierId,doc.mediaId,doc.documentType,doc.notes,session.userId]},
  audit(tenant.id,session.userId,'suppliers.document_added',id,'supplier_document')
 ]);
 return {document:{id,supplierId,...doc}};
}
export async function archiveSupplierDocument(token,slug,supplierId,id){
 const {tenant,session}=await authorizeTool(token,slug,'T009',true);
 const result=await executeSql('UPDATE tenant_supplier_documents SET archived_at=CURRENT_TIMESTAMP WHERE organization_id=? AND supplier_id=? AND id=? AND archived_at IS NULL',[tenant.id,supplierId,id]);
 if(!changed(result))throw Error('Not found');
 const a=audit(tenant.id,session.userId,'suppliers.document_archived',id,'supplier_document');
 await executeSql(a.sql,a.args);
 return {archived:true};
}
