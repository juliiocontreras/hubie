// C003 (P0): búsqueda de documentos, vencimientos con alerta, control de
// acceso por expediente y por documento, y vínculos del expediente con
// CRM/Agenda/Cotizaciones (derivados del client_id, sin recaptura).
// El historial usa las acciones que ya permite tenant_case_events; los eventos
// nuevos (versión, acceso, vínculo) se registran como 'document_added' o
// 'updated' con descripción explícita, porque el CHECK de la tabla no se toca.
import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {getTenantTools} from '../tenant.mjs';
import {checkMemberToolAccess} from './member-tools-p0.mjs';
import {documentTypes,documentExpiryStatus} from './case-document-domain.mjs';

const rows=r=>r?.rows?.map(row=>row.map(cell=>cell?.value??null))??[];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const documentVisibilities=Object.freeze(['team','restricted']);
export const caseAccessLevels=Object.freeze(['read','write']);
const audit=(org,actor,action,type,id)=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',
 args:[randomUUID(),org,actor,action,type,id]});
const caseEvent=(org,caseId,actor,action,description)=>({sql:
 `INSERT INTO tenant_case_events(organization_id,id,case_id,action,description,actor_user_id)
  SELECT ?,?,?,?,?,? FROM tenant_client_cases WHERE organization_id=? AND id=? AND archived_at IS NULL`,
 args:[org,randomUUID(),caseId,action,description,actor,org,caseId]});

async function requireCase(tenantId,caseId){
 if(!uuid.test(caseId||''))throw Error('Not found');
 const found=rows(await executeSql(
  `SELECT c.id,c.client_id,p.name FROM tenant_client_cases c JOIN tenant_client_profiles p
   ON p.organization_id=c.organization_id AND p.id=c.client_id
   WHERE c.organization_id=? AND c.id=? AND c.archived_at IS NULL`,[tenantId,caseId]))[0];
 if(!found)throw Error('Not found');
 return {id:found[0],clientId:found[1],clientName:found[2]};
}
// Un miembro solo ve el expediente si su rol lo permite y no hay una concesión
// 'restricted' que lo excluya: owner/admin siempre; member con acceso explícito
// en tenant_case_access; viewer solo lectura y nunca documentos 'restricted'
// sin concesión. La negación por defecto es: sin concesión de expediente y sin
// ser owner/admin, el expediente es visible pero sus documentos 'restricted'
// quedan ocultos (el expediente en sí es del equipo; el documento es el
// restringido). Las concesiones de expediente solo endurecen la escritura.
export async function caseWriteAllowed(orgId,userId,role,caseId){
 if(['owner','admin'].includes(role))return true;
 const grant=rows(await executeSql(
  'SELECT access FROM tenant_case_access WHERE organization_id=? AND case_id=? AND user_id=?',
  [orgId,caseId,userId]))[0];
 return grant?.[0]==='write';
}
export async function documentVisible(orgId,userId,role,documentId){
 const doc=rows(await executeSql(
  `SELECT COALESCE(s.visibility,'team') FROM tenant_case_documents d
   LEFT JOIN tenant_case_document_settings s ON s.organization_id=d.organization_id AND s.document_id=d.id
   WHERE d.organization_id=? AND d.id=?`,[orgId,documentId]))[0];
 if(!doc)throw Error('Not found');
 if(doc[0]!=='restricted')return true;
 if(['owner','admin'].includes(role))return true;
 return Boolean(rows(await executeSql(
  'SELECT access FROM tenant_case_document_access WHERE organization_id=? AND document_id=? AND user_id=?',
  [orgId,documentId,userId]))[0]);
}

// Búsqueda de documentos en TODOS los expedientes del tenant: por nombre de
// archivo, tipo, expediente o cliente; con filtro de vencimiento. Respeta la
// visibilidad 'restricted' (los documentos restringidos sin concesión no se
// devuelven a member/viewer).
export async function searchCaseDocuments(token,slug,{q='',documentType='',expiry='',caseId=''}={}){
 const {tenant,session}=await authorizeTool(token,slug,'C003');
 await checkMemberToolAccess(tenant.id,session.userId,session.role,'C003',false);
 const term=typeof q==='string'?q.trim().toLowerCase():'';
 if(term.length>120||documentType&&!documentTypes.some(([t])=>t===documentType)
  ||expiry&&!['expired','soon','valid','none'].includes(expiry)
  ||caseId&&!uuid.test(caseId))throw Error('Invalid document');
 const found=rows(await executeSql(
  `SELECT d.id,d.case_id,d.document_type,d.expires_on,d.latest_version,c.title,c.client_id,p.name,
    (SELECT m.name FROM pwa_media m JOIN tenant_case_document_versions v
      ON v.organization_id=m.organization_id AND v.media_id=m.id
     WHERE v.organization_id=d.organization_id AND v.document_id=d.id
     ORDER BY v.version DESC LIMIT 1)
   FROM tenant_case_documents d
   JOIN tenant_client_cases c ON c.organization_id=d.organization_id AND c.id=d.case_id
   JOIN tenant_client_profiles p ON p.organization_id=c.organization_id AND p.id=c.client_id
   WHERE d.organization_id=? AND c.archived_at IS NULL
   AND (?='' OR d.case_id=?) AND (?='' OR d.document_type=?)
   ORDER BY d.updated_at DESC LIMIT 100`,
  [tenant.id,caseId,caseId,documentType,documentType]));
 const results=[];
 for(const [id,docCaseId,type,expiresOn,latestVersion,caseTitle,clientId,clientName,filename] of found){
  const status=documentExpiryStatus(expiresOn);
  if(expiry&&status!==expiry)continue;
  if(term&&!(String(filename||'').toLowerCase().includes(term)
   ||caseTitle.toLowerCase().includes(term)||clientName.toLowerCase().includes(term)))continue;
  if(!await documentVisible(tenant.id,session.userId,session.role,id))continue;
  results.push({documentId:id,caseId:docCaseId,caseTitle,clientId,clientName,filename:filename||'',
   documentType:type,expiresOn:expiresOn||null,expiryStatus:status,latestVersion:Number(latestVersion)});
 }
 return {documents:results.slice(0,100)};
}

// Documentos vencidos o por vencer (≤30 días) en todo el tenant: la alerta
// P0 es esta lista consultable + el estado en cada ficha; no hay todavía
// envío programado de mensajes o tareas automáticas (C010).
export async function listExpiringDocuments(token,slug){
 const {tenant,session}=await authorizeTool(token,slug,'C003');
 await checkMemberToolAccess(tenant.id,session.userId,session.role,'C003',false);
 const {documents}=await searchCaseDocuments(token,slug,{expiry:'expired'});
 const soon=(await searchCaseDocuments(token,slug,{expiry:'soon'})).documents;
 return {expired:documents,expiringSoon:soon,
  counts:{expired:documents.length,expiringSoon:soon.length}};
}

// Vinculados del expediente: todo lo del mismo cliente (tratos, citas,
// cotizaciones) + enlaces explícitos de entity_links. Sin recaptura.
export async function getCaseLinks(token,slug,caseId){
 const {tenant,session}=await authorizeTool(token,slug,'C003');
 await checkMemberToolAccess(tenant.id,session.userId,session.role,'C003',false);
 const dossier=await requireCase(tenant.id,caseId);
 const enabled=new Set(await getTenantTools(tenant.id));
 const linked={client:{id:dossier.clientId,name:dossier.clientName},deals:[],appointments:[],quotes:[],explicit:[]};
 if(enabled.has('C002'))linked.deals=rows(await executeSql(
  `SELECT d.id,d.title,d.stage FROM tenant_crm_deals d JOIN tenant_deal_clients l
   ON l.organization_id=d.organization_id AND l.deal_id=d.id
   WHERE d.organization_id=? AND l.client_id=? AND d.archived_at IS NULL ORDER BY d.updated_at DESC LIMIT 30`,
  [tenant.id,dossier.clientId])).map(([id,title,stage])=>({id,title,stage}));
 if(enabled.has('C004'))linked.appointments=rows(await executeSql(
  `SELECT e.id,e.title,e.starts_at,e.status FROM tenant_schedule_events e
   JOIN tenant_appointment_links l ON l.organization_id=e.organization_id AND l.appointment_id=e.id
   WHERE e.organization_id=? AND l.client_id=? ORDER BY e.starts_at DESC LIMIT 30`,
  [tenant.id,dossier.clientId])).map(([id,title,startsAt,status])=>({id,title,startsAt,status}));
 if(enabled.has('T013'))linked.quotes=rows(await executeSql(
  `SELECT id,title,status,total_cents FROM tenant_quotes
   WHERE organization_id=? AND client_id=? AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 30`,
  [tenant.id,dossier.clientId])).map(([id,title,status,total])=>({id,title,status,totalCents:Number(total)}));
 linked.explicit=rows(await executeSql(
  `SELECT id,left_tool_id,left_record_id,right_tool_id,right_record_id,relation_type FROM tenant_entity_links
   WHERE organization_id=? AND ((left_tool_id='C003' AND left_record_id=?) OR (right_tool_id='C003' AND right_record_id=?)) LIMIT 40`,
  [tenant.id,caseId,caseId])).map(([id,lTool,lId,rTool,rId,type])=>({id,
   targetToolId:lTool==='C003'?rTool:lTool,targetRecordId:lTool==='C003'?rId:lId,relationType:type}));
 return linked;
}

// --- Control de acceso ---
export async function listCaseAccess(token,slug,caseId){
 const {tenant,session}=await authorizeTool(token,slug,'C003');
 await checkMemberToolAccess(tenant.id,session.userId,session.role,'C003',false);
 await requireCase(tenant.id,caseId);
 const grants=rows(await executeSql(
  `SELECT a.user_id,u.email,a.access FROM tenant_case_access a JOIN users u ON u.id=a.user_id
   WHERE a.organization_id=? AND a.case_id=? ORDER BY u.email`,[tenant.id,caseId]));
 return {grants:grants.map(([userId,email,access])=>({userId,email,access}))};
}
export async function setCaseAccess(token,slug,caseId,userId,access){
 const {tenant,session}=await authorizeTool(token,slug,'C003',true);
 await checkMemberToolAccess(tenant.id,session.userId,session.role,'C003',true);
 if(!['owner','admin'].includes(session.role))throw Error('Forbidden');
 await requireCase(tenant.id,caseId);
 if(access!==null&&!caseAccessLevels.includes(access))throw Error('Invalid document');
 if(!uuid.test(userId||''))throw Error('Not found');
 const member=rows(await executeSql(
  'SELECT user_id FROM memberships WHERE organization_id=? AND user_id=? AND status=\'active\'',
  [tenant.id,userId]))[0];
 if(!member)throw Error('Not found');
 if(access===null){
  await executeSql('DELETE FROM tenant_case_access WHERE organization_id=? AND case_id=? AND user_id=?',
   [tenant.id,caseId,userId]);
 }else{
  await executeSql(`INSERT INTO tenant_case_access(organization_id,case_id,user_id,access,created_by)
   VALUES(?,?,?,?,?) ON CONFLICT(organization_id,case_id,user_id) DO UPDATE SET access=excluded.access`,
   [tenant.id,caseId,userId,access,session.userId]);
 }
 const event=caseEvent(tenant.id,caseId,session.userId,'updated','Acceso del expediente actualizado');
 await executeBatch([event,audit(tenant.id,session.userId,'cases.access_changed','case',caseId)]);
 return {ok:true};
}
export async function setDocumentVisibility(token,slug,documentId,visibility){
 const {tenant,session}=await authorizeTool(token,slug,'C003',true);
 await checkMemberToolAccess(tenant.id,session.userId,session.role,'C003',true);
 if(!['owner','admin'].includes(session.role))throw Error('Forbidden');
 if(!documentVisibilities.includes(visibility))throw Error('Invalid document');
 if(!uuid.test(documentId||''))throw Error('Not found');
 const doc=rows(await executeSql(
  `SELECT d.case_id FROM tenant_case_documents d JOIN tenant_client_cases c
   ON c.organization_id=d.organization_id AND c.id=d.case_id
   WHERE d.organization_id=? AND d.id=? AND c.archived_at IS NULL`,[tenant.id,documentId]))[0];
 if(!doc)throw Error('Not found');
 await executeBatch([
  {sql:`INSERT INTO tenant_case_document_settings(organization_id,document_id,visibility,updated_by) VALUES(?,?,?,?)
   ON CONFLICT(organization_id,document_id) DO UPDATE SET visibility=excluded.visibility,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`,
   args:[tenant.id,documentId,visibility,session.userId]},
  caseEvent(tenant.id,doc[0],session.userId,'updated','Visibilidad del documento: '+visibility),
  audit(tenant.id,session.userId,'cases.document_access','case_document',documentId)
 ]);
 return {ok:true,visibility};
}
export async function listDocumentAccess(token,slug,documentId){
 const {tenant,session}=await authorizeTool(token,slug,'C003');
 await checkMemberToolAccess(tenant.id,session.userId,session.role,'C003',false);
 if(!uuid.test(documentId||''))throw Error('Not found');
 const doc=rows(await executeSql(
  `SELECT COALESCE(s.visibility,'team'),d.case_id FROM tenant_case_documents d
   LEFT JOIN tenant_case_document_settings s ON s.organization_id=d.organization_id AND s.document_id=d.id
   WHERE d.organization_id=? AND d.id=?`,[tenant.id,documentId]))[0];
 if(!doc)throw Error('Not found');
 const grants=rows(await executeSql(
  `SELECT a.user_id,u.email,a.access FROM tenant_case_document_access a JOIN users u ON u.id=a.user_id
   WHERE a.organization_id=? AND a.document_id=? ORDER BY u.email`,[tenant.id,documentId]));
 return {visibility:doc[0],caseId:doc[1],
  grants:grants.map(([userId,email,access])=>({userId,email,access}))};
}
export async function setDocumentAccess(token,slug,documentId,userId,access){
 const {tenant,session}=await authorizeTool(token,slug,'C003',true);
 await checkMemberToolAccess(tenant.id,session.userId,session.role,'C003',true);
 if(!['owner','admin'].includes(session.role))throw Error('Forbidden');
 if(access!==null&&!caseAccessLevels.includes(access))throw Error('Invalid document');
 if(!uuid.test(documentId||'')||!uuid.test(userId||''))throw Error('Not found');
 const doc=rows(await executeSql(
  `SELECT d.case_id FROM tenant_case_documents d JOIN tenant_client_cases c
   ON c.organization_id=d.organization_id AND c.id=d.case_id
   WHERE d.organization_id=? AND d.id=? AND c.archived_at IS NULL`,[tenant.id,documentId]))[0];
 if(!doc)throw Error('Not found');
 const member=rows(await executeSql(
  'SELECT user_id FROM memberships WHERE organization_id=? AND user_id=? AND status=\'active\'',
  [tenant.id,userId]))[0];
 if(!member)throw Error('Not found');
 if(access===null){
  await executeSql('DELETE FROM tenant_case_document_access WHERE organization_id=? AND document_id=? AND user_id=?',
   [tenant.id,documentId,userId]);
 }else{
  await executeSql(`INSERT INTO tenant_case_document_access(organization_id,document_id,user_id,access,created_by)
   VALUES(?,?,?,?,?) ON CONFLICT(organization_id,document_id,user_id) DO UPDATE SET access=excluded.access`,
   [tenant.id,documentId,userId,access,session.userId]);
 }
 const event=caseEvent(tenant.id,doc[0],session.userId,'updated','Acceso del documento actualizado');
 await executeBatch([event,audit(tenant.id,session.userId,'cases.document_access','case_document',documentId)]);
 return {ok:true};
}
