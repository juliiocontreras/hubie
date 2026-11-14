import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {normalizeInvoice,normalizeQuoteLine,quoteTotals,nextFolio,formatFolio,invoiceStatuses,invoiceStatusLabels,vatRates} from './commerce-domain.mjs';

const rows=r=>r?.rows?.map(row=>row.map(cell=>cell?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const audit=(org,user,action,id)=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',args:[randomUUID(),org,user,action,'invoice',id]});
const select='SELECT id,folio,quote_id,client_name,rfc,items_json,subtotal_cents,vat_cents,total_cents,vat_rate,status,notes,created_at,updated_at FROM tenant_invoices';
const safeItems=raw=>{try{const x=JSON.parse(raw);return Array.isArray(x)?x:[];}catch{return [];}};
const toInvoice=r=>({id:r[0],folio:Number(r[1]),folioLabel:formatFolio(Number(r[1])),quoteId:r[2],
 clientName:r[3],rfc:r[4],items:safeItems(r[5]).map((l,i)=>normalizeQuoteLine(l,i)),
 subtotalCents:Number(r[6]),vatCents:Number(r[7]),totalCents:Number(r[8]),vatRate:Number(r[9]),
 status:r[10],notes:r[11],createdAt:r[12],updatedAt:r[13],
 // Facturación administrativa: documento interno, SIN timbrado CFDI (pendiente PAC).
 cfdi:false,cfdiNote:'Sin CFDI (pendiente PAC)'});

export async function listInvoices(token,slug){
 const {tenant}=await authorizeTool(token,slug,'T015');
 const [result,quotes]=await Promise.all([
  executeSql(select+' WHERE organization_id=? AND archived_at IS NULL ORDER BY folio DESC LIMIT 200',[tenant.id]),
  executeSql("SELECT id,title,client_name,total_cents FROM tenant_quotes WHERE organization_id=? AND archived_at IS NULL AND status='accepted' ORDER BY updated_at DESC LIMIT 100",[tenant.id])
 ]);
 return {invoices:rows(result).map(toInvoice),
  acceptedQuotes:rows(quotes).map(q=>({id:q[0],title:q[1],clientName:q[2],totalCents:Number(q[3])})),
  statuses:invoiceStatuses,statusLabels:invoiceStatusLabels,vatRates};
}
export async function createInvoice(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'T015',true);
 let data;
 if(input?.quoteId){
  // Factura a partir de una cotización aceptada: copia sus partidas y totales.
  const q=rows(await executeSql('SELECT client_id,client_name,vat_rate,subtotal_cents,vat_cents,total_cents,status FROM tenant_quotes WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,input.quoteId]))[0];
  if(!q)throw Error('Not found');
  if(q[6]!=='accepted')throw Error('Invalid invoice');
  const lines=rows(await executeSql('SELECT description,quantity,unit_price_cents FROM tenant_quote_lines WHERE organization_id=? AND quote_id=? ORDER BY position',[tenant.id,input.quoteId]))
   .map(l=>({description:l[0],quantity:Number(l[1]),unitPriceCents:Number(l[2])}));
  data={clientName:q[1],rfc:input?.rfc??'',notes:input?.notes??'',vatRate:q[2],quoteId:input.quoteId,lines};
  const totals=quoteTotals(lines.map((l,i)=>normalizeQuoteLine(l,i)),q[2]);
  if(totals.totalCents!==Number(q[5]))throw Error('Invalid invoice');
 }else{
  data=normalizeInvoice(input);
 }
 const inv=normalizeInvoice(data);
 const maxFolio=rows(await executeSql('SELECT COALESCE(MAX(folio),0) FROM tenant_invoices WHERE organization_id=?',[tenant.id]))[0]?.[0]||0;
 const folio=nextFolio(Number(maxFolio)),id=randomUUID();
 await executeBatch([
  {sql:'INSERT INTO tenant_invoices(organization_id,id,folio,quote_id,client_name,rfc,items_json,subtotal_cents,vat_cents,total_cents,vat_rate,status,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
   args:[tenant.id,id,folio,inv.quoteId,inv.clientName,inv.rfc,JSON.stringify(inv.lines),inv.subtotalCents,inv.vatCents,inv.totalCents,inv.vatRate,'draft',inv.notes,session.userId]},
  audit(tenant.id,session.userId,'invoices.created',id)
 ]);
 return {invoice:{id,folio,folioLabel:formatFolio(folio),...inv,status:'draft',cfdi:false,cfdiNote:'Sin CFDI (pendiente PAC)'}};
}
export async function setInvoiceStatus(token,slug,id,next){
 const {tenant,session}=await authorizeTool(token,slug,'T015',true);
 if(!invoiceStatuses.includes(next))throw Error('Invalid invoice');
 const current=rows(await executeSql('SELECT status FROM tenant_invoices WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,id]))[0];
 if(!current)throw Error('Not found');
 const allowed={draft:['issued','cancelled'],issued:['cancelled'],cancelled:[]};
 if(!allowed[current[0]].includes(next))throw Error('Invalid invoice');
 const result=await executeSql('UPDATE tenant_invoices SET status=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',[next,tenant.id,id]);
 if(!changed(result))throw Error('Not found');
 const a=audit(tenant.id,session.userId,'invoices.'+next,id);
 await executeSql(a.sql,a.args);
 return {ok:true,status:next};
}
export async function archiveInvoice(token,slug,id){
 const {tenant,session}=await authorizeTool(token,slug,'T015',true);
 const result=await executeSql('UPDATE tenant_invoices SET archived_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,id]);
 if(!changed(result))throw Error('Not found');
 const a=audit(tenant.id,session.userId,'invoices.archived',id);
 await executeSql(a.sql,a.args);
 return {archived:true};
}
