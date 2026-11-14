import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {requireTenantSession} from '../auth.mjs';
import {resolveTenant} from '../tenant.mjs';
import {authorizeTool} from './records.mjs';
import {validateMediaUpload} from './media-policy.mjs';
import {normalizeCaseDocumentMetadata} from './case-document-domain.mjs';
const rows=r=>r?.rows?.map(row=>row.map(cell=>cell?.value??null))??[];
const bgKinds=['dashboard_bg','sidebar_bg'];
const kindMap={dashboard:'dashboard_bg',sidebar:'sidebar_bg'};
const tableForTool=id=>({'C001':'tenant_client_profiles','C002':'tenant_crm_deals','C003':'tenant_client_cases','C004':'tenant_schedule_events','C005':'tenant_inventory_items','C006':'tenant_catalog_items','C007':'tenant_expenses'})[id]||'tenant_tool_records';
const mediaPublic=(scope,key,kind)=>scope==='madre'?'/api/admin/media/'+kind:scope==='admin'?'/api/admin/tenants/'+key+'/media/'+kind:'/api/app/'+key+'/media/'+kind;
export async function latestBackground(scope,key,kind){
 const realKind=kindMap[kind];
 if(!realKind)throw Error('Invalid media');
 const q=scope==='madre'?
  ['SELECT id FROM pwa_media WHERE scope=? AND organization_id IS NULL AND kind=? ORDER BY rowid DESC LIMIT 1',['madre',realKind]]:
  ['SELECT id FROM pwa_media WHERE scope=? AND organization_id=? AND kind=? ORDER BY rowid DESC LIMIT 1',['tenant',key,realKind]];
 return rows(await executeSql(...q))[0]?.[0]||null;
}
export async function mediaBackgroundUrls(scope,key,slug=key){
 const [dashboard,sidebar]=await Promise.all(['dashboard','sidebar'].map(k=>latestBackground(scope,key,k)));
 return {
  dashboard:dashboard?mediaPublic(scope==='madre'?'madre':scope==='admin'?'admin':'app',scope==='admin'?key:slug,'dashboard')+'?v='+dashboard:null,
  sidebar:sidebar?mediaPublic(scope==='madre'?'madre':scope==='admin'?'admin':'app',scope==='admin'?key:slug,'sidebar')+'?v='+sidebar:null
 };
}
export async function uploadBackground(scope,key,kind,input,actorId){
 if(!kindMap[kind])throw Error('Invalid media');
 const media=validateMediaUpload(input,'background');
 const id=randomUUID();
 const organizationId=scope==='madre'?null:key;
 const scopeValue=scope==='madre'?'madre':'tenant';
 await executeBatch([
  {sql:`INSERT INTO pwa_media(id,scope,organization_id,kind,name,mime,size_bytes,content_b64,created_by) VALUES(?,?,?,?,?,?,?,?,?)`,
   args:[id,scopeValue,organizationId,kindMap[kind],media.filename,media.mime,media.bytes,media.data,actorId]},
  {sql:'DELETE FROM pwa_media WHERE scope=? AND kind=? AND id!=? AND '+(scopeValue==='madre'?'organization_id IS NULL':'organization_id=?'),
   args:scopeValue==='madre'?[scopeValue,kindMap[kind],id]:[scopeValue,kindMap[kind],id,key]}
 ]);
 return {id,bytes:media.bytes};
}
export async function clearBackground(scope,key,kind){
 if(!kindMap[kind])throw Error('Invalid media');
 const org=scope==='madre'?'organization_id IS NULL':'organization_id=?';
 const args=scope==='madre'?['madre',kindMap[kind]]:['tenant',kindMap[kind],key];
 await executeSql('DELETE FROM pwa_media WHERE scope=? AND kind=? AND '+org,args);
 return {removed:true};
}
export async function findBackground(scope,key,kind){
 const id=await latestBackground(scope,key,kind);
 if(!id)throw Error('Not found');
 const r=await executeSql('SELECT name,mime,content_b64,size_bytes FROM pwa_media WHERE id=?',[id]);
 return asDownload(rows(r)[0],'inline');
}
function asDownload(row,disposition='attachment'){
 if(!row)throw Error('Not found');
 const [name,mime,b64,size]=row;
 const buffer=Buffer.from(b64,'base64');
 if(buffer.length!==Number(size))throw Error('Invalid media');
 return {filename:name,mime,buffer,disposition};
}
export async function authorizeOwnBackground(token,slug,write=false){
 const tenant=await resolveTenant(slug);
 if(!tenant)throw Error('Not found');
 const session=await requireTenantSession(token,tenant.id,write?['owner','admin']:['owner','admin','member','viewer']);
 return {tenant,session};
}
async function checkRecord(org,toolId,recordId){
 if(!/^[0-9a-f-]{36}$/.test(recordId))throw Error('Invalid media');
 const table=tableForTool(toolId);
 const query=table==='tenant_tool_records'?
  'SELECT id FROM '+table+' WHERE organization_id=? AND id=? AND tool_id=? AND archived_at IS NULL':
  'SELECT id FROM '+table+' WHERE organization_id=? AND id=? AND '+(table==='tenant_schedule_events'?'1=1':'archived_at IS NULL');
 const args=table==='tenant_tool_records'?[org,recordId,toolId]:[org,recordId];
 if(!rows(await executeSql(query,args)).length)throw Error('Not found');
}
export async function listAttachments(token,slug,toolId,recordId){
 const {tenant}=await authorizeTool(token,slug,toolId);
 if(['C008','C009'].includes(toolId))throw Error('Read only tool');
 await checkRecord(tenant.id,toolId,recordId);
 const caseMode=toolId==='C003';
 const statement=caseMode?
  `SELECT m.id,m.name,m.mime,m.size_bytes,m.created_at,d.id,d.document_type,d.expires_on,v.version,
    (SELECT MAX(v2.version) FROM tenant_case_document_versions v2 WHERE v2.organization_id=m.organization_id AND v2.document_id=d.id)
   FROM pwa_media m
   LEFT JOIN tenant_case_document_versions v ON v.organization_id=m.organization_id AND v.media_id=m.id
   LEFT JOIN tenant_case_documents d ON d.organization_id=v.organization_id AND d.id=v.document_id AND d.case_id=m.record_id
   WHERE m.scope=? AND m.organization_id=? AND m.kind=? AND m.tool_id=? AND m.record_id=?
   ORDER BY m.rowid DESC LIMIT 100`:
  'SELECT id,name,mime,size_bytes,created_at FROM pwa_media WHERE scope=? AND organization_id=? AND kind=? AND tool_id=? AND record_id=? ORDER BY rowid DESC LIMIT 25';
 const r=await executeSql(statement,['tenant',tenant.id,'attachment',toolId,recordId]);
 return {attachments:rows(r).map(a=>({
   id:a[0],filename:a[1],mime:a[2],bytes:Number(a[3]),createdAt:a[4],
   downloadUrl:'/api/app/'+encodeURIComponent(slug)+'/attachments/'+a[0],
   ...(caseMode?{
    documentId:a[5]||a[0],managed:!!a[5],documentType:a[6]||'other',expiresOn:a[7]||null,
    version:Number(a[8]||1),isLatest:a[8]==null?true:Number(a[8])===Number(a[9])
   }:{})
 }))};
}
export async function addAttachment(token,slug,toolId,recordId,input){
 const {tenant,session}=await authorizeTool(token,slug,toolId,true);
 if(['C008','C009'].includes(toolId))throw Error('Read only tool');
 await checkRecord(tenant.id,toolId,recordId);
 const media=validateMediaUpload(input,'attachment');
 const caseMode=toolId==='C003';
 const meta=caseMode?normalizeCaseDocumentMetadata({
  documentType:input.documentType,expiresOn:input.expiresOn,replaceDocumentId:input.replaceDocumentId
 }):null;
 const count=rows(await executeSql('SELECT COUNT(*),COALESCE(SUM(size_bytes),0) FROM pwa_media WHERE organization_id=?',[tenant.id]))[0]||[0,0];
 if(Number(count[1])+media.bytes>60_000_000)throw Error('Storage quota exceeded');
 const existing=rows(await executeSql('SELECT COUNT(*) FROM pwa_media WHERE organization_id=? AND kind=? AND tool_id=? AND record_id=?',[tenant.id,'attachment',toolId,recordId]));
 if(Number(existing[0]?.[0]||0)>=12)throw Error('Storage quota exceeded');
 const id=randomUUID();
 const commands=[
  {sql:'INSERT INTO pwa_media(id,scope,organization_id,kind,tool_id,record_id,name,mime,size_bytes,content_b64,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
   args:[id,'tenant',tenant.id,'attachment',toolId,recordId,media.filename,media.mime,media.bytes,media.data,session.userId]},
  {sql:"INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,'media.attachment_uploaded','attachment',?)",
   args:[randomUUID(),tenant.id,session.userId,id]},
 ];
 let documentId=null;
 if(caseMode){
  let legacy=false;
  if(meta.replaceDocumentId){
   documentId=meta.replaceDocumentId;
   const matches=rows(await executeSql('SELECT id FROM tenant_case_documents WHERE organization_id=? AND case_id=? AND id=?',[tenant.id,recordId,documentId]));
   if(!matches.length){
    const old=rows(await executeSql('SELECT id FROM pwa_media WHERE scope=? AND organization_id=? AND kind=? AND tool_id=? AND record_id=? AND id=?',['tenant',tenant.id,'attachment','C003',recordId,documentId]));
    if(!old.length)throw Error('Not found');
    legacy=true;
   }
  }else documentId=randomUUID();
  if(!meta.replaceDocumentId){
   commands.push({sql:'INSERT INTO tenant_case_documents(organization_id,id,case_id,document_type,expires_on,latest_version,created_by) VALUES(?,?,?,?,?,1,?)',
    args:[tenant.id,documentId,recordId,meta.documentType,meta.expiresOn,session.userId]});
  }else if(legacy){
   commands.push({sql:'INSERT INTO tenant_case_documents(organization_id,id,case_id,document_type,expires_on,latest_version,created_by) VALUES(?,?,?,?,?,2,?)',
    args:[tenant.id,documentId,recordId,meta.documentType,meta.expiresOn,session.userId]});
   commands.push({sql:'INSERT INTO tenant_case_document_versions(organization_id,document_id,media_id,version) VALUES(?,?,?,1)',
    args:[tenant.id,documentId,documentId]});
  }else{
   commands.push({sql:'UPDATE tenant_case_documents SET latest_version=latest_version+1,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND case_id=? AND id=?',
    args:[tenant.id,recordId,documentId]});
  }
  commands.push({sql:`INSERT INTO tenant_case_document_versions(organization_id,document_id,media_id,version)
   SELECT organization_id,id,?,latest_version FROM tenant_case_documents WHERE organization_id=? AND case_id=? AND id=?`,
   args:[id,tenant.id,recordId,documentId]});
  commands.push({sql:"INSERT INTO tenant_case_events(organization_id,id,case_id,action,description,actor_user_id) VALUES(?,?,?,'document_added',?,?)",
   args:[tenant.id,randomUUID(),recordId,(meta.replaceDocumentId?'Nueva versión: ':'Documento añadido: ')+media.filename,session.userId]});
 }
 await executeBatch(commands);
 return {id,filename:media.filename,bytes:media.bytes,downloadUrl:'/api/app/'+encodeURIComponent(slug)+'/attachments/'+id,
  ...(caseMode?{documentId}:{})};
}
export async function updateCaseDocument(token,slug,documentId,input){
 const {tenant,session}=await authorizeTool(token,slug,'C003',true);
 const meta=normalizeCaseDocumentMetadata(input);
 if(meta.replaceDocumentId)throw Error('Invalid document');
 const item=rows(await executeSql(`SELECT d.case_id FROM tenant_case_documents d
   JOIN tenant_client_cases c ON c.organization_id=d.organization_id AND c.id=d.case_id
   WHERE d.organization_id=? AND d.id=? AND c.archived_at IS NULL`,[tenant.id,documentId]))[0];
 if(!item)throw Error('Not found');
 await executeBatch([
  {sql:'UPDATE tenant_case_documents SET document_type=?,expires_on=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND case_id=?',
   args:[meta.documentType,meta.expiresOn,tenant.id,documentId,item[0]]},
  {sql:"INSERT INTO tenant_case_events(organization_id,id,case_id,action,description,actor_user_id) VALUES(?,?,?,'updated',?,?)",
   args:[tenant.id,randomUUID(),item[0],'Documento actualizado · '+meta.documentType+(meta.expiresOn?' · vence '+meta.expiresOn:''),session.userId]},
  {sql:"INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,'cases.document_updated','case_document',?)",
   args:[randomUUID(),tenant.id,session.userId,documentId]}
 ]);
 return {documentId,documentType:meta.documentType,expiresOn:meta.expiresOn};
}
export async function getAttachment(token,slug,id){
 const tenant=await resolveTenant(slug);
 if(!tenant)throw Error('Not found');
 const q=rows(await executeSql('SELECT tool_id,record_id,name,mime,content_b64,size_bytes FROM pwa_media WHERE scope=? AND organization_id=? AND kind=? AND id=?',['tenant',tenant.id,'attachment',id]))[0];
 if(!q)throw Error('Not found');
 await authorizeTool(token,slug,q[0]);
 await checkRecord(tenant.id,q[0],q[1]);
 return asDownload([q[2],q[3],q[4],q[5]]);
}
export async function removeAttachment(token,slug,id){
 const tenant=await resolveTenant(slug);
 if(!tenant)throw Error('Not found');
 const found=rows(await executeSql('SELECT tool_id,record_id,name FROM pwa_media WHERE scope=? AND organization_id=? AND kind=? AND id=?',['tenant',tenant.id,'attachment',id]))[0];
 if(!found)throw Error('Not found');
 const {session}=await authorizeTool(token,slug,found[0],true);
 await executeBatch([
  {sql:'DELETE FROM pwa_media WHERE organization_id=? AND id=? AND kind=?',args:[tenant.id,id,'attachment']},
  {sql:"INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,'media.attachment_removed','attachment',?)",args:[randomUUID(),tenant.id,session.userId,id]},
  ...(found[0]==='C003'?[{sql:"INSERT INTO tenant_case_events(organization_id,id,case_id,action,description,actor_user_id) VALUES(?,?,?,'document_removed',?,?)",
   args:[tenant.id,randomUUID(),found[1],found[2],session.userId]}]:[])
 ]);
 return {removed:true};
}
