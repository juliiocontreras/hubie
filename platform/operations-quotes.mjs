import {randomUUID,randomBytes} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {normalizeQuote,nextQuoteStatus,quoteStatuses,quoteStatusLabels,vatRates} from './commerce-domain.mjs';

const rows=r=>r?.rows?.map(row=>row.map(cell=>cell?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const audit=(org,user,action,id)=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',args:[randomUUID(),org,user,action,'quote',id]});
const select=`SELECT q.id,q.client_id,q.client_name,q.title,q.notes,q.vat_rate,q.status,q.valid_until,
 q.subtotal_cents,q.vat_cents,q.total_cents,q.public_token,q.accepted_at,q.created_at,q.updated_at,
 COALESCE((SELECT SUM(amount_cents) FROM tenant_collections p WHERE p.organization_id=q.organization_id AND p.quote_id=q.id AND p.archived_at IS NULL),0),
 (SELECT COUNT(*) FROM tenant_quote_lines l WHERE l.organization_id=q.organization_id AND l.quote_id=q.id)
 FROM tenant_quotes q`;
const toQuote=r=>({id:r[0],clientId:r[1],clientName:r[2],title:r[3],notes:r[4],vatRate:r[5],status:r[6],
 validUntil:r[7]||null,subtotalCents:Number(r[8]),vatCents:Number(r[9]),totalCents:Number(r[10]),
 publicToken:r[11],acceptedAt:r[12]||null,createdAt:r[13],updatedAt:r[14],
 paidCents:Number(r[15]||0),balanceCents:Math.max(0,Number(r[10])-Number(r[15]||0)),linesCount:Number(r[16])});
const toLine=r=>({id:r[0],description:r[1],quantity:Number(r[2]),unitPriceCents:Number(r[3]),lineTotalCents:Number(r[4]),position:Number(r[5])});

async function ensureClient(org,id){
 if(!id)return;
 const found=rows(await executeSql('SELECT id FROM tenant_client_profiles WHERE organization_id=? AND id=? AND archived_at IS NULL',[org,id]));
 if(!found.length)throw Error('Client not found');
}
async function loadLines(org,id){
 return rows(await executeSql('SELECT id,description,quantity,unit_price_cents,line_total_cents,position FROM tenant_quote_lines WHERE organization_id=? AND quote_id=? ORDER BY position',[org,id])).map(toLine);
}
export async function listQuotes(token,slug){
 const {tenant}=await authorizeTool(token,slug,'T013');
 const result=await executeSql(select+' WHERE q.organization_id=? AND q.archived_at IS NULL ORDER BY q.updated_at DESC LIMIT 200',[tenant.id]);
 const clients=rows(await executeSql('SELECT id,name,company FROM tenant_client_profiles WHERE organization_id=? AND archived_at IS NULL ORDER BY name LIMIT 250',[tenant.id]));
 return {quotes:rows(result).map(toQuote),clients:clients.map(c=>({id:c[0],name:c[1],company:c[2]})),statuses:quoteStatuses,statusLabels:quoteStatusLabels,vatRates};
}
export async function getQuote(token,slug,id){
 const {tenant}=await authorizeTool(token,slug,'T013');
 const result=await executeSql(select+' WHERE q.organization_id=? AND q.id=? AND q.archived_at IS NULL',[tenant.id,id]);
 const found=rows(result)[0];
 if(!found)throw Error('Not found');
 const quote=toQuote(found);
 return {quote:{...quote,lines:await loadLines(tenant.id,id)}};
}
export async function createQuote(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'T013',true);
 const q=normalizeQuote(input),id=randomUUID(),tokenValue=randomBytes(16).toString('hex');
 await ensureClient(tenant.id,q.clientId);
 const commands=[
  {sql:'INSERT INTO tenant_quotes(organization_id,id,client_id,client_name,title,notes,vat_rate,status,valid_until,subtotal_cents,vat_cents,total_cents,public_token,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
   args:[tenant.id,id,q.clientId,q.clientName,q.title,q.notes,q.vatRate,'draft',q.validUntil,q.subtotalCents,q.vatCents,q.totalCents,tokenValue,session.userId]},
  ...q.lines.map(l=>({sql:'INSERT INTO tenant_quote_lines(organization_id,quote_id,id,description,quantity,unit_price_cents,line_total_cents,position) VALUES(?,?,?,?,?,?,?,?)',
   args:[tenant.id,id,randomUUID(),l.description,l.quantity,l.unitPriceCents,l.lineTotalCents,l.position]})),
  audit(tenant.id,session.userId,'quotes.created',id)
 ];
 await executeBatch(commands);
 return {quote:{id,...q,status:'draft',publicToken:tokenValue,paidCents:0,balanceCents:q.totalCents}};
}
export async function updateQuote(token,slug,id,input){
 const {tenant,session}=await authorizeTool(token,slug,'T013',true);
 const q=normalizeQuote(input);
 await ensureClient(tenant.id,q.clientId);
 const current=rows(await executeSql('SELECT status FROM tenant_quotes WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,id]))[0];
 if(!current)throw Error('Not found');
 if(!['draft','rejected'].includes(current[0]))throw Error('Invalid quote status');
 await executeBatch([
  {sql:'UPDATE tenant_quotes SET client_id=?,client_name=?,title=?,notes=?,vat_rate=?,valid_until=?,subtotal_cents=?,vat_cents=?,total_cents=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',
   args:[q.clientId,q.clientName,q.title,q.notes,q.vatRate,q.validUntil,q.subtotalCents,q.vatCents,q.totalCents,tenant.id,id]},
  {sql:'DELETE FROM tenant_quote_lines WHERE organization_id=? AND quote_id=?',args:[tenant.id,id]},
  ...q.lines.map(l=>({sql:'INSERT INTO tenant_quote_lines(organization_id,quote_id,id,description,quantity,unit_price_cents,line_total_cents,position) VALUES(?,?,?,?,?,?,?,?)',
   args:[tenant.id,id,randomUUID(),l.description,l.quantity,l.unitPriceCents,l.lineTotalCents,l.position]})),
  audit(tenant.id,session.userId,'quotes.updated',id)
 ]);
 return {ok:true};
}
export async function setQuoteStatus(token,slug,id,next){
 const {tenant,session}=await authorizeTool(token,slug,'T013',true);
 const current=rows(await executeSql('SELECT status FROM tenant_quotes WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,id]))[0];
 if(!current)throw Error('Not found');
 nextQuoteStatus(current[0],next);
 const result=await executeSql(`UPDATE tenant_quotes SET status=?,accepted_at=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL`,
  [next,next==='accepted'?new Date().toISOString():null,tenant.id,id]);
 if(!changed(result))throw Error('Not found');
 const a=audit(tenant.id,session.userId,'quotes.'+next,id);
 await executeSql(a.sql,a.args);
 return {ok:true,status:next};
}
export async function archiveQuote(token,slug,id){
 const {tenant,session}=await authorizeTool(token,slug,'T013',true);
 const result=await executeSql('UPDATE tenant_quotes SET archived_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,id]);
 if(!changed(result))throw Error('Not found');
 const a=audit(tenant.id,session.userId,'quotes.archived',id);
 await executeSql(a.sql,a.args);
 return {archived:true};
}
// Aceptación del cliente por enlace: el token es el secreto; no requiere sesión.
export async function publicQuote(tokenValue){
 const orgRow=rows(await executeSql('SELECT organization_id FROM tenant_quotes WHERE public_token=? AND archived_at IS NULL',[tokenValue]))[0];
 if(!orgRow)throw Error('Not found');
 const org=orgRow[0];
 const found=rows(await executeSql(select+' WHERE q.organization_id=? AND q.public_token=? AND q.archived_at IS NULL',[org,tokenValue]))[0];
 if(!found)throw Error('Not found');
 const quote=toQuote(found);
 const tenantName=rows(await executeSql('SELECT name FROM organizations WHERE id=?',[org]))[0]?.[0]||'';
 const {publicToken:_,...publicView}=quote;
 return {quote:{...publicView,lines:await loadLines(org,quote.id)},tenantName};
}
export async function publicQuoteDecision(tokenValue,action){
 if(!['accept','reject'].includes(action))throw Error('Invalid quote status');
 const found=rows(await executeSql('SELECT organization_id,id,status FROM tenant_quotes WHERE public_token=? AND archived_at IS NULL',[tokenValue]))[0];
 if(!found)throw Error('Not found');
 const next=action==='accept'?'accepted':'rejected';
 nextQuoteStatus(found[2],next);
 const result=await executeSql(`UPDATE tenant_quotes SET status=?,accepted_at=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL`,
  [next,next==='accepted'?new Date().toISOString():null,found[0],found[1]]);
 if(!changed(result))throw Error('Not found');
 return {ok:true,status:next};
}
