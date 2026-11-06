import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from './database.mjs';
import {verifySession} from './auth.mjs';
import {catalog,getSuite,getTool,normalizeTenantInput,resolveEnabledTools} from './platform/catalog.mjs';
import {getTenantAppearance} from './platform/appearance-store.mjs';
const rows=r=>r?.rows?.map(row=>row.map(x=>x?.value??null))??[];
const audited=(actorId,orgId,action,targetType,targetId)=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',args:[randomUUID(),orgId,actorId,action,targetType,targetId]});
export async function requireSuperAdmin(token){
 const session=await verifySession(token);
 if(!session)throw Error('Unauthorized');
 const r=await executeSql('SELECT user_id FROM platform_admins WHERE user_id=?',[session.userId]);
 if(!rows(r).length)throw Error('Forbidden');
 return session.userId;
}
export function getAdminCatalog(){return {version:catalog.version,currency:catalog.currency,complete:catalog.complete,rules:catalog.rules,suites:catalog.suites,tools:catalog.tools,extras:catalog.extras};}
export async function createTenant(input,actorId){
 const data=normalizeTenantInput(input);
 const id=randomUUID();
 const statements=[
  {sql:'INSERT INTO organizations(id,slug,name) VALUES(?,?,?)',args:[id,data.slug,data.name]},
  {sql:'INSERT INTO tenant_settings(organization_id,suite_id,display_name,primary_color,secondary_color) VALUES(?,?,?,?,?)',args:[id,data.suiteId,data.displayName,data.primaryColor,data.secondaryColor]},
  {sql:"INSERT INTO memberships(organization_id,user_id,role,status) VALUES(?,?,'owner','active')",args:[id,actorId]},
  ...resolveEnabledTools(data.toolIds).map(t=>({sql:'INSERT INTO tenant_tools(organization_id,tool_id,enabled) VALUES(?,?,?)',args:[id,t.toolId,t.enabled]})),
  audited(actorId,id,'tenant.created','organization',id)
 ];
 await executeBatch(statements);
 return {id,slug:data.slug,name:data.name,suiteId:data.suiteId,enabledTools:data.toolIds};
}
export async function listTenants(){
 const r=await executeSql('SELECT o.id,o.slug,o.name,o.status,s.suite_id FROM organizations o LEFT JOIN tenant_settings s ON s.organization_id=o.id ORDER BY o.created_at DESC LIMIT 200');
 return rows(r).map(x=>({id:x[0],slug:x[1],name:x[2],status:x[3],suiteId:x[4]}));
}
export async function getTenantAdmin(id){
 const org=rows(await executeSql('SELECT o.id,o.slug,o.name,o.status,s.suite_id,s.display_name,s.logo_url,s.primary_color,s.secondary_color,s.timezone FROM organizations o JOIN tenant_settings s ON s.organization_id=o.id WHERE o.id=?',[id]))[0];
 if(!org)throw Error('Not found');
 const selected=rows(await executeSql('SELECT tool_id,enabled FROM tenant_tools WHERE organization_id=?',[id]));
 const enabledMap=new Map(selected.map(r=>[r[0],Number(r[1])===1]));
 return {
  id:org[0],slug:org[1],name:org[2],status:org[3],suiteId:org[4],displayName:org[5],
  logoUrl:org[6],primaryColor:org[7],secondaryColor:org[8],timezone:org[9],
  tools:catalog.tools.map(t=>({...t,enabled:enabledMap.get(t.id)===true})),
  appearance:await getTenantAppearance(id)
 };
}
export async function setTenantTool(id,toolId,enabled,actorId){
 if(!getTool(toolId)||typeof enabled!=='boolean')throw Error('Invalid tenant data');
 await getTenantAdmin(id);
 await executeBatch([
  {sql:'INSERT INTO tenant_tools(organization_id,tool_id,enabled) VALUES(?,?,?) ON CONFLICT(organization_id,tool_id) DO UPDATE SET enabled=excluded.enabled',args:[id,toolId,enabled?1:0]},
  audited(actorId,id,enabled?'tenant.tool_enabled':'tenant.tool_disabled','tool',toolId)
 ]);
 return {toolId,enabled};
}
export async function updateTenant(id,input,actorId){
 const current=await getTenantAdmin(id);
 const name=input?.name===undefined?current.name:String(input.name).trim();
 const suiteId=input?.suiteId??current.suiteId;
 const displayName=input?.displayName===undefined?current.displayName:String(input.displayName).trim();
 const primaryColor=input?.primaryColor??current.primaryColor;
 const secondaryColor=input?.secondaryColor??current.secondaryColor;
 const status=input?.status??current.status;
 const logoUrl=input?.logoUrl===undefined?current.logoUrl:input.logoUrl;
 if(name.length<2||name.length>160||displayName.length<2||displayName.length>160||!getSuite(suiteId)||!/^#[0-9a-fA-F]{6}$/.test(primaryColor)||!/^#[0-9a-fA-F]{6}$/.test(secondaryColor)||!['active','suspended'].includes(status)||!(logoUrl===null||logoUrl===''||typeof logoUrl==='string'&&logoUrl.length<=1024&&(/^https:\/\//i.test(logoUrl)||/^\/assets\/[a-z0-9/_-]+\.(?:png|jpe?g|webp|svg)$/i.test(logoUrl))))throw Error('Invalid tenant data');
 await executeBatch([
  {sql:'UPDATE organizations SET name=?,status=? WHERE id=?',args:[name,status,id]},
  {sql:'UPDATE tenant_settings SET suite_id=?,display_name=?,primary_color=?,secondary_color=?,logo_url=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=?',args:[suiteId,displayName,primaryColor,secondaryColor,logoUrl||null,id]},
  audited(actorId,id,'tenant.updated','organization',id)
 ]);
 return getTenantAdmin(id);
}
export async function listTenantMembers(id){
 await getTenantAdmin(id);
 const r=await executeSql('SELECT u.id,u.email,m.role,m.status FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? ORDER BY m.role,u.email',[id]);
 return rows(r).map(x=>({id:x[0],email:x[1],role:x[2],status:x[3]}));
}
export async function addTenantMember(id,input,actorId){
 await getTenantAdmin(id);
 const email=String(input?.email||'').trim().toLowerCase();
 const role=input?.role||'member';
 if(email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!['admin','member','viewer'].includes(role))throw Error('Invalid tenant data');
 const idForNewUser=randomUUID();
 await executeBatch([
  {sql:'INSERT OR IGNORE INTO users(id,email) VALUES(?,?)',args:[idForNewUser,email]},
  {sql:"INSERT INTO memberships(organization_id,user_id,role,status) SELECT ?,id,?,'active' FROM users WHERE email=? ON CONFLICT(organization_id,user_id) DO UPDATE SET role=CASE WHEN memberships.role='owner' THEN 'owner' ELSE excluded.role END,status='active'",args:[id,role,email]},
  audited(actorId,id,'tenant.member_added','membership',email)
 ]);
 return listTenantMembers(id);
}

export async function setTenantMemberStatus(id,userId,status,actorId){
 await getTenantAdmin(id);
 if(!['active','suspended'].includes(status)||typeof userId!=='string'||!/^[0-9a-f-]{36}$/.test(userId))throw Error('Invalid tenant data');
 const result=await executeBatch([
  {sql:"UPDATE memberships SET status=? WHERE organization_id=? AND user_id=? AND role!='owner'",args:[status,id,userId]},
  {sql:"INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) SELECT ?,?,?,?,?,? FROM memberships WHERE organization_id=? AND user_id=? AND role!='owner' AND status=?",args:[randomUUID(),id,actorId,status==='active'?'tenant.member_activated':'tenant.member_suspended','membership',userId,id,userId,status]}
 ]);
 if(!Number(result?.[0]?.rowsAffected??result?.[0]?.affected_row_count??0)){
  const existing=rows(await executeSql('SELECT role FROM memberships WHERE organization_id=? AND user_id=?',[id,userId]))[0];
  throw Error(existing?.[0]==='owner'?'Forbidden':'Not found');
 }
 return listTenantMembers(id);
}
