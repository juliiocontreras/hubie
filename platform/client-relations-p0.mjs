// C001 (P0): línea de tiempo del cliente y deduplicación por email.
// La línea de tiempo se DERIVA de las relaciones reales por client_id (tratos,
// expedientes, citas, cotizaciones y eventos de auditoría); nunca se adivina
// por nombre de cliente. La fusión reasigna relaciones y archiva el duplicado.
import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {getTenantTools} from '../tenant.mjs';
import {checkMemberToolAccess} from './member-tools-p0.mjs';

const rows=r=>r?.rows?.map(row=>row.map(cell=>cell?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const audit=(org,actor,action,type,id)=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',
 args:[randomUUID(),org,actor,action,type,id]});

export async function getClientTimeline(token,slug,clientId){
 const {tenant,session}=await authorizeTool(token,slug,'C001');
 await checkMemberToolAccess(tenant.id,session.userId,session.role,'C001',false);
 if(!uuid.test(clientId||''))throw Error('Not found');
 const client=rows(await executeSql(
  'SELECT id,name,company,email,phone,status FROM tenant_client_profiles WHERE organization_id=? AND id=? AND archived_at IS NULL',
  [tenant.id,clientId]))[0];
 if(!client)throw Error('Not found');
 const enabled=new Set(await getTenantTools(tenant.id));
 const timeline=[];
 const push=(kind,toolId,recordId,title,detail,at)=>{if(at)timeline.push({kind,toolId,recordId,title,detail:detail||'',at});};
 if(enabled.has('C002'))for(const [id,title,stage,amount,at] of rows(await executeSql(
  `SELECT d.id,d.title,d.stage,d.amount_cents,d.updated_at FROM tenant_crm_deals d
   JOIN tenant_deal_clients l ON l.organization_id=d.organization_id AND l.deal_id=d.id
   WHERE d.organization_id=? AND l.client_id=? AND d.archived_at IS NULL ORDER BY d.updated_at DESC LIMIT 50`,
  [tenant.id,clientId])))push('deal','C002',id,title,'Etapa: '+stage+' · '+(Number(amount)/100).toFixed(2)+' MXN',at);
 if(enabled.has('C003')){
  for(const [id,title,kind,status,at] of rows(await executeSql(
   `SELECT id,title,kind,status,updated_at FROM tenant_client_cases
    WHERE organization_id=? AND client_id=? AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 50`,
   [tenant.id,clientId])))push('case','C003',id,title,kind+' · '+status,at);
  for(const [id,action,description,at,caseId,caseTitle] of rows(await executeSql(
   `SELECT e.id,e.action,e.description,e.created_at,e.case_id,c.title FROM tenant_case_events e
    JOIN tenant_client_cases c ON c.organization_id=e.organization_id AND c.id=e.case_id
    WHERE e.organization_id=? AND c.client_id=? ORDER BY e.created_at DESC LIMIT 50`,
   [tenant.id,clientId])))push('case_event','C003',caseId,caseTitle,action+': '+description,at);
 }
 if(enabled.has('C004'))for(const [id,title,startsAt,status] of rows(await executeSql(
  `SELECT e.id,e.title,e.starts_at,e.status FROM tenant_schedule_events e
   JOIN tenant_appointment_links l ON l.organization_id=e.organization_id AND l.appointment_id=e.id
   WHERE e.organization_id=? AND l.client_id=? ORDER BY e.starts_at DESC LIMIT 50`,
  [tenant.id,clientId])))push('appointment','C004',id,title,status,startsAt);
 if(enabled.has('T013'))for(const [id,title,status,total,at] of rows(await executeSql(
  `SELECT id,title,status,total_cents,updated_at FROM tenant_quotes
   WHERE organization_id=? AND client_id=? AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 50`,
  [tenant.id,clientId])))push('quote','T013',id,title,status+' · '+(Number(total)/100).toFixed(2)+' MXN',at);
 for(const [action,at] of rows(await executeSql(
  `SELECT action,occurred_at FROM audit_events WHERE organization_id=? AND target_type='client' AND target_id=?
   ORDER BY occurred_at DESC LIMIT 20`,[tenant.id,clientId])))
  push('client_event','C001',clientId,client[1],action,at);
 timeline.sort((a,b)=>String(b.at).localeCompare(String(a.at)));
 return {client:{id:client[0],name:client[1],company:client[2],email:client[3],phone:client[4],status:client[5]},
  timeline:timeline.slice(0,100),
  counts:Object.fromEntries(['deal','case','appointment','quote','case_event','client_event']
   .map(kind=>[kind,timeline.filter(e=>e.kind===kind).length]))};
}

// Grupos de posibles duplicados: mismo email normalizado (sin importar
// mayúsculas/espacios). Solo clientes activos; el grupo incluye el conteo de
// relaciones de cada candidato para que la fusión sea una decisión informada.
export async function findDuplicateClients(token,slug){
 const {tenant,session}=await authorizeTool(token,slug,'C001');
 await checkMemberToolAccess(tenant.id,session.userId,session.role,'C001',false);
 const all=rows(await executeSql(
  `SELECT id,name,company,email,phone,status FROM tenant_client_profiles
   WHERE organization_id=? AND archived_at IS NULL AND email<>'' ORDER BY email,name`,
  [tenant.id]));
 const groups=new Map();
 for(const [id,name,company,email,phone,status] of all){
  const key=email.trim().toLowerCase();
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push({id,name,company,email,phone,status});
 }
 const duplicates=[];
 for(const [email,members] of groups){
  if(members.length<2)continue;
  for(const m of members){
   const [deals]=rows(await executeSql(
    'SELECT COUNT(*) FROM tenant_deal_clients WHERE organization_id=? AND client_id=?',[tenant.id,m.id]));
   const [cases]=rows(await executeSql(
    'SELECT COUNT(*) FROM tenant_client_cases WHERE organization_id=? AND client_id=? AND archived_at IS NULL',[tenant.id,m.id]));
   const [quotes]=rows(await executeSql(
    'SELECT COUNT(*) FROM tenant_quotes WHERE organization_id=? AND client_id=? AND archived_at IS NULL',[tenant.id,m.id]));
   m.relations={deals:Number(deals?.[0]||0),cases:Number(cases?.[0]||0),quotes:Number(quotes?.[0]||0)};
  }
  duplicates.push({email,clients:members});
 }
 return {duplicates};
}

export function normalizeMerge(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid merge');
 const {keptClientId,mergedClientId,reason}=input;
 if(!uuid.test(keptClientId||'')||!uuid.test(mergedClientId||'')||keptClientId===mergedClientId)throw Error('Invalid merge');
 if(reason!==undefined&&(typeof reason!=='string'||reason.length>500))throw Error('Invalid merge');
 return {keptClientId,mergedClientId,reason:typeof reason==='string'?reason.trim():''};
}

// Fusiona merged → kept: reasigna tratos, citas, expedientes, cotizaciones y
// cobros; archiva el duplicado; deja constancia en tenant_client_merges y en
// audit_events. Requiere confirmación explícita del cliente (la UI pide
// confirm() con ambos nombres); sin kept/merged válidos no hace nada.
export async function mergeClients(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'C001',true);
 await checkMemberToolAccess(tenant.id,session.userId,session.role,'C001',true);
 const {keptClientId,mergedClientId,reason}=normalizeMerge(input);
 const found=rows(await executeSql(
  `SELECT id,email FROM tenant_client_profiles WHERE organization_id=? AND id IN (?,?) AND archived_at IS NULL`,
  [tenant.id,keptClientId,mergedClientId]));
 if(found.length!==2)throw Error('Not found');
 const kept=found.find(r=>r[0]===keptClientId),merged=found.find(r=>r[0]===mergedClientId);
 if(kept[1].trim().toLowerCase()!==merged[1].trim().toLowerCase())throw Error('Invalid merge');
 const mergeId=randomUUID();
 const statements=[
  // Tratos: si el conservado ya está en el mismo trato, se borra la fila duplicada.
  {sql:`DELETE FROM tenant_deal_clients WHERE organization_id=? AND client_id=? AND deal_id IN
    (SELECT deal_id FROM tenant_deal_clients WHERE organization_id=? AND client_id=?)`,
   args:[tenant.id,mergedClientId,tenant.id,keptClientId]},
  {sql:'UPDATE tenant_deal_clients SET client_id=? WHERE organization_id=? AND client_id=?',
   args:[keptClientId,tenant.id,mergedClientId]},
  {sql:'UPDATE tenant_appointment_links SET client_id=? WHERE organization_id=? AND client_id=?',
   args:[keptClientId,tenant.id,mergedClientId]},
  {sql:'UPDATE tenant_client_cases SET client_id=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND client_id=?',
   args:[keptClientId,tenant.id,mergedClientId]},
  {sql:'UPDATE tenant_quotes SET client_id=? WHERE organization_id=? AND client_id=?',
   args:[keptClientId,tenant.id,mergedClientId]},
  {sql:'UPDATE tenant_collections SET client_id=? WHERE organization_id=? AND client_id=?',
   args:[keptClientId,tenant.id,mergedClientId]},
  {sql:'UPDATE tenant_client_profiles SET archived_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',
   args:[tenant.id,mergedClientId]},
  {sql:`INSERT INTO tenant_client_merges(organization_id,id,kept_client_id,merged_client_id,merged_by,reason)
    VALUES(?,?,?,?,?,?)`,args:[tenant.id,mergeId,keptClientId,mergedClientId,session.userId,reason]},
  audit(tenant.id,session.userId,'clients.merged','client',keptClientId),
  audit(tenant.id,session.userId,'clients.merged_from','client',mergedClientId)
 ];
 const results=await executeBatch(statements);
 if(!changed(results?.[6]))throw Error('Not found');
 return {merged:true,mergeId,keptClientId,mergedClientId};
}
