import {randomUUID} from 'node:crypto';
import {executeSql} from '../database.mjs';
import {verifySession,requireTenantSession} from '../auth.mjs';
import {resolveTenant,getTenantSettings,getTenantTools} from '../tenant.mjs';
import {catalog,getSuite,getTool,validateRecord} from './catalog.mjs';
const unpack=r=>r?.rows?.map(row=>row.map(c=>c?.value??null))??[];
const readRoles=['owner','admin','member','viewer'];
const writeRoles=['owner','admin','member'];
export async function userOrganizations(token){
 const session=await verifySession(token);
 if(!session)throw Error('Unauthorized');
 const r=await executeSql("SELECT o.slug,o.name,m.role,s.suite_id FROM memberships m JOIN organizations o ON o.id=m.organization_id JOIN tenant_settings s ON s.organization_id=o.id WHERE m.user_id=? AND m.status='active' AND o.status='active' ORDER BY o.name",[session.userId]);
 return unpack(r).map(x=>({slug:x[0],name:x[1],role:x[2],suiteId:x[3]}));
}
export async function authorizeTool(token,slug,toolId,write=false){
 if(!getTool(toolId))throw Error('Not found');
 const tenant=await resolveTenant(slug);
 if(!tenant)throw Error('Not found');
 const session=await requireTenantSession(token,tenant.id,write?writeRoles:readRoles);
 const enabled=await getTenantTools(tenant.id);
 if(!enabled.includes(toolId))throw Error('Tool disabled');
 return {tenant,session};
}
export async function tenantConfig(token,slug){
 const tenant=await resolveTenant(slug);
 if(!tenant)throw Error('Not found');
 const session=await requireTenantSession(token,tenant.id);
 const settings=await getTenantSettings(tenant.id);
 const enabled=await getTenantTools(tenant.id);
 const members=unpack(await executeSql("SELECT u.email,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? AND m.status='active' ORDER BY u.email LIMIT 100",[tenant.id]));
 return {tenant:{id:tenant.id,slug:tenant.slug,name:tenant.name,role:session.role,displayName:settings?.displayName||tenant.name,logoUrl:settings?.logoUrl,primaryColor:settings?.primaryColor,secondaryColor:settings?.secondaryColor,timezone:settings?.timezone,suiteId:settings?.suiteId,suiteName:getSuite(settings?.suiteId)?.name||settings?.suiteId},tools:catalog.tools.filter(t=>enabled.includes(t.id)),members:members.map(x=>({email:x[0],role:x[1]}))};
}
export async function toolRecords(token,slug,toolId,{limit=80}={}){
 const {tenant}=await authorizeTool(token,slug,toolId);
 if(toolId==='C008'){
  const r=await executeSql("SELECT tool_id,count(*) FROM tenant_tool_records WHERE organization_id=? AND archived_at IS NULL GROUP BY tool_id",[tenant.id]);
  return {dashboard:true,counts:Object.fromEntries(unpack(r).map(x=>[x[0],Number(x[1])]))};
 }
 if(toolId==='C009')throw Error('Read members in tenant config');
 const r=await executeSql("SELECT id,title,status,fields_json,created_at,updated_at FROM tenant_tool_records WHERE organization_id=? AND tool_id=? AND archived_at IS NULL ORDER BY created_at DESC LIMIT ?",[tenant.id,toolId,Math.max(1,Math.min(100,Number(limit)||80))]);
 return {records:unpack(r).map(x=>({id:x[0],title:x[1],status:x[2],fields:safeJson(x[3]),createdAt:x[4],updatedAt:x[5]}))};
}
function safeJson(raw){try{const x=JSON.parse(raw);return x&&typeof x==='object'&&!Array.isArray(x)?x:{};}catch{return {};}}
export async function saveToolRecord(token,slug,toolId,body,id=null){
 if(['C008','C009'].includes(toolId))throw Error('Read only tool');
 const {tenant,session}=await authorizeTool(token,slug,toolId,true);
 const record=validateRecord(body);
 const updating=Boolean(id);
 if(id){
  const r=await executeSql('UPDATE tenant_tool_records SET title=?,status=?,fields_json=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND tool_id=? AND id=? AND archived_at IS NULL',[record.title,record.status,JSON.stringify(record.fields),tenant.id,toolId,id]);
  if(!Number(r?.affected_row_count))throw Error('Not found');
 }else{
  id=randomUUID();
  await executeSql('INSERT INTO tenant_tool_records(organization_id,id,tool_id,title,status,fields_json,created_by) VALUES(?,?,?,?,?,?,?)',[tenant.id,id,toolId,record.title,record.status,JSON.stringify(record.fields),session.userId]);
 }
 await executeSql('INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',[randomUUID(),tenant.id,session.userId,updating?'tenant.record_updated':'tenant.record_created','tool_record',id]);
 return {id,...record};
}
export async function archiveToolRecord(token,slug,toolId,id){
 if(['C008','C009'].includes(toolId))throw Error('Read only tool');
 const {tenant,session}=await authorizeTool(token,slug,toolId,true);
 const r=await executeSql('UPDATE tenant_tool_records SET archived_at=CURRENT_TIMESTAMP WHERE organization_id=? AND tool_id=? AND id=? AND archived_at IS NULL',[tenant.id,toolId,id]);
 if(!Number(r?.affected_row_count))throw Error('Not found');
 await executeSql('INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',[randomUUID(),tenant.id,session.userId,'tenant.record_archived','tool_record',id]);
 return {archived:true};
}
