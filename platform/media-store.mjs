import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {requireTenantSession} from '../auth.mjs';
import {resolveTenant} from '../tenant.mjs';
import {authorizeTool} from './records.mjs';
import {validateMediaUpload} from './media-policy.mjs';
const rows=r=>r?.rows?.map(row=>row.map(cell=>cell?.value??null))??[];
const bgKinds=['dashboard_bg','sidebar_bg'];
const kindMap={dashboard:'dashboard_bg',sidebar:'sidebar_bg'};
const tableForTool=id=>({'C001':'tenant_client_profiles','C002':'tenant_crm_deals','C003':'tenant_client_cases','C004':'tenant_schedule_events','C005':'tenant_inventory_items'})[id]||'tenant_tool_records';
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
 const r=await executeSql('SELECT id,name,mime,size_bytes,created_at FROM pwa_media WHERE scope=? AND organization_id=? AND kind=? AND tool_id=? AND record_id=? ORDER BY rowid DESC LIMIT 25',
 ['tenant',tenant.id,'attachment',toolId,recordId]);
 return {attachments:rows(r).map(a=>({id:a[0],filename:a[1],mime:a[2],bytes:Number(a[3]),createdAt:a[4],
  downloadUrl:'/api/app/'+encodeURIComponent(slug)+'/attachments/'+a[0]}))};
}
export async function addAttachment(token,slug,toolId,recordId,input){
 const {tenant,session}=await authorizeTool(token,slug,toolId,true);
 if(['C008','C009'].includes(toolId))throw Error('Read only tool');
 await checkRecord(tenant.id,toolId,recordId);
 const media=validateMediaUpload(input,'attachment');
 const count=rows(await executeSql('SELECT COUNT(*),COALESCE(SUM(size_bytes),0) FROM pwa_media WHERE organization_id=?',[tenant.id]))[0]||[0,0];
 if(Number(count[1])+media.bytes>60_000_000)throw Error('Storage quota exceeded');
 const existing=rows(await executeSql('SELECT COUNT(*) FROM pwa_media WHERE organization_id=? AND kind=? AND tool_id=? AND record_id=?',[tenant.id,'attachment',toolId,recordId]));
 if(Number(existing[0]?.[0]||0)>=12)throw Error('Storage quota exceeded');
 const id=randomUUID();
 await executeBatch([
  {sql:'INSERT INTO pwa_media(id,scope,organization_id,kind,tool_id,record_id,name,mime,size_bytes,content_b64,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
   args:[id,'tenant',tenant.id,'attachment',toolId,recordId,media.filename,media.mime,media.bytes,media.data,session.userId]},
  {sql:"INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,'media.attachment_uploaded','attachment',?)",
   args:[randomUUID(),tenant.id,session.userId,id]},
  ...(toolId==='C003'?[{sql:"INSERT INTO tenant_case_events(organization_id,id,case_id,action,description,actor_user_id) VALUES(?,?,?,'document_added',?,?)",
   args:[tenant.id,randomUUID(),recordId,media.filename,session.userId]}]:[])
 ]);
 return {id,filename:media.filename,bytes:media.bytes,downloadUrl:'/api/app/'+encodeURIComponent(slug)+'/attachments/'+id};
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
