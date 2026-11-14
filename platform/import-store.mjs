// Importación CSV + migración JSON contra Turso (P0, E004).
// La validación vive en platform/import.mjs (pura y testeable); aquí solo se
// autoriza por tenant/herramienta, se deduplica contra lo ya guardado y se
// inserta por lotes. Importación parcial: cada fila válida entra aunque otras
// fallen; el resumen (importados/omitidos/errores) siempre vuelve al cliente.
import {randomUUID,randomBytes} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {validateClientsCsv,validateCatalogCsv,validateMigrationPayload} from './import.mjs';

const rows=r=>r?.rows?.map(row=>row.map(cell=>cell?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const CHUNK=20;

async function ensureOrg(orgId){
 const found=rows(await executeSql('SELECT id FROM organizations WHERE id=?',[orgId]));
 if(!found.length)throw Error('Not found');
}
async function existingEmails(orgId){
 const r=await executeSql("SELECT email FROM tenant_client_profiles WHERE organization_id=? AND archived_at IS NULL AND email<>'' LIMIT 10000",[orgId]);
 return new Set(rows(r).map(x=>String(x[0]).toLowerCase()));
}
async function existingSkus(orgId){
 const r=await executeSql("SELECT sku FROM tenant_catalog_items WHERE organization_id=? AND archived_at IS NULL AND sku<>'' LIMIT 10000",[orgId]);
 return new Set(rows(r).map(x=>String(x[0]).toUpperCase()));
}
async function insertInChunks(commands){
 // executeBatch devuelve un resultado por sentencia; las inserciones van en
 // posiciones pares (inserción, auditoría). Contar solo esas evita contar la
 // auditoría como fila importada.
 let imported=0;
 for(let i=0;i<commands.length;i+=CHUNK){
  const slice=commands.slice(i,i+CHUNK);
  const results=await executeBatch(slice);
  slice.forEach((_,j)=>{if(j%2===0&&changed(results?.[j]))imported++;});
 }
 return imported;
}
const audit=(org,user,action,target,id)=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',args:[randomUUID(),org,user,action,target,id]});

export async function importClientsForOrg(orgId,userId,csvText){
 if(typeof csvText!=='string'||!csvText.trim())throw Error('Invalid import');
 await ensureOrg(orgId);
 const {records,errors,summary}=validateClientsCsv(csvText,await existingEmails(orgId));
 const commands=records.flatMap(c=>{
  const id=randomUUID();
  return [
   {sql:'INSERT INTO tenant_client_profiles(organization_id,id,name,company,email,phone,status,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING',
    args:[orgId,id,c.name,c.company,c.email,c.phone,c.status,c.notes,userId]},
   audit(orgId,userId,'clients.imported','client',id)];
 });
 const imported=await insertInChunks(commands);
 return {summary:{...summary,imported},errors};
}
export async function importCatalogForOrg(orgId,userId,csvText){
 if(typeof csvText!=='string'||!csvText.trim())throw Error('Invalid import');
 await ensureOrg(orgId);
 const {records,errors,summary}=validateCatalogCsv(csvText,await existingSkus(orgId));
 const commands=records.flatMap(item=>{
  const id=randomUUID();
  return [
   {sql:'INSERT INTO tenant_catalog_items(organization_id,id,sku,name,description,price_cents,category,active,created_by) VALUES(?,?,?,?,?,?,?,?,?)',
    args:[orgId,id,item.sku,item.name,item.description,item.priceCents,item.category,item.active?1:0,userId]},
   audit(orgId,userId,'catalog.imported','catalog_item',id)];
 });
 const imported=await insertInChunks(commands);
 return {summary:{...summary,imported},errors};
}

export async function importMigrationForOrg(orgId,userId,payload){
 await ensureOrg(orgId);
 const {clients,catalogItems,quotes,expenses,errors,summary}=validateMigrationPayload(payload);
 const emailToId=new Map(),nameToId=new Map();
 const existing=rows(await executeSql('SELECT id,name,email FROM tenant_client_profiles WHERE organization_id=? AND archived_at IS NULL LIMIT 10000',[orgId]));
 for(const [id,name,email] of existing){
  if(email)emailToId.set(String(email).toLowerCase(),id);
  nameToId.set(String(name).toLowerCase(),id);
 }
 const clientCommands=clients.records.flatMap(c=>{
  const id=randomUUID();
  if(c.email)emailToId.set(c.email,id);
  nameToId.set(c.name.toLowerCase(),id);
  return [
   {sql:'INSERT INTO tenant_client_profiles(organization_id,id,name,company,email,phone,status,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING',
    args:[orgId,id,c.name,c.company,c.email,c.phone,c.status,c.notes,userId]},
   audit(orgId,userId,'clients.imported','client',id)];
 });
 const clientImported=await insertInChunks(clientCommands);
 const catalogCommands=catalogItems.records.flatMap(item=>{
  const id=randomUUID();
  return [
   {sql:'INSERT INTO tenant_catalog_items(organization_id,id,sku,name,description,price_cents,category,active,created_by) VALUES(?,?,?,?,?,?,?,?,?)',
    args:[orgId,id,item.sku,item.name,item.description,item.priceCents,item.category,item.active?1:0,userId]},
   audit(orgId,userId,'catalog.imported','catalog_item',id)];
 });
 const catalogImported=await insertInChunks(catalogCommands);
 let quoteImported=0;
 for(const q of quotes.records){
  const id=randomUUID(),token=randomBytes(16).toString('hex');
  const clientId=q.clientId||(q.clientName?nameToId.get(q.clientName.toLowerCase())||null:null);
  const commands=[
   {sql:'INSERT INTO tenant_quotes(organization_id,id,client_id,client_name,title,notes,vat_rate,status,valid_until,subtotal_cents,vat_cents,total_cents,public_token,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    args:[orgId,id,clientId,q.clientName,q.title,q.notes,q.vatRate,'draft',q.validUntil,q.subtotalCents,q.vatCents,q.totalCents,token,userId]},
   ...q.lines.map(l=>({sql:'INSERT INTO tenant_quote_lines(organization_id,quote_id,id,description,quantity,unit_price_cents,line_total_cents,position) VALUES(?,?,?,?,?,?,?,?)',
    args:[orgId,id,randomUUID(),l.description,l.quantity,l.unitPriceCents,l.lineTotalCents,l.position]})),
   audit(orgId,userId,'quotes.imported','quote',id)];
  const results=await executeBatch(commands);
  if(changed(results?.[0]))quoteImported++;
 }
 let expenseImported=0;
 for(const e of expenses.records){
  const id=randomUUID();
  const results=await executeBatch([
   {sql:'INSERT INTO tenant_expenses(organization_id,id,occurred_on,category,description,amount_cents,vendor,created_by) VALUES(?,?,?,?,?,?,?,?)',
    args:[orgId,id,e.occurredOn,e.category,e.description,e.amountCents,e.vendor,userId]},
   audit(orgId,userId,'expenses.imported','expense',id)]);
  if(changed(results?.[0]))expenseImported++;
 }
 return {summary:{...summary,imported:clientImported+catalogImported+quoteImported+expenseImported,
   bySection:{...summary.bySection,
    clients:{...summary.bySection.clients,imported:clientImported},
    catalogItems:{...summary.bySection.catalogItems,imported:catalogImported},
    quotes:{...summary.bySection.quotes,imported:quoteImported},
    expenses:{...summary.bySection.expenses,imported:expenseImported}}},errors};
}

// Envoltorios con autorización por tenant (misma puerta que el resto de
// módulos operativos: authorizeTool exige membresía activa y herramienta
// habilitada; la escritura excluye al viewer).
export async function importClientsCsv(token,slug,csvText){
 const {tenant,session}=await authorizeTool(token,slug,'C001',true);
 return importClientsForOrg(tenant.id,session.userId,csvText);
}
export async function importCatalogCsv(token,slug,csvText){
 const {tenant,session}=await authorizeTool(token,slug,'C006',true);
 return importCatalogForOrg(tenant.id,session.userId,csvText);
}
export async function importMigrationJson(token,slug,payload){
 let data=payload;
 if(typeof payload==='string'){try{data=JSON.parse(payload);}catch{throw Error('Invalid import');}}
 const tools=[];
 if(Array.isArray(data?.clients)&&data.clients.length)tools.push('C001');
 if(Array.isArray(data?.catalogItems)&&data.catalogItems.length)tools.push('C006');
 if(Array.isArray(data?.quotes)&&data.quotes.length)tools.push('T013');
 if(Array.isArray(data?.expenses)&&data.expenses.length)tools.push('C007');
 if(!tools.length)throw Error('Invalid import');
 let tenant=null,session=null;
 for(const tool of tools){
  const auth=await authorizeTool(token,slug,tool,true);
  tenant??=auth.tenant;session??=auth.session;
 }
 return importMigrationForOrg(tenant.id,session.userId,data);
}
