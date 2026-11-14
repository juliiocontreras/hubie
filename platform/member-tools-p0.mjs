// C009 (P0): permisos por módulo y por miembro.
// Una fila en tenant_member_tools es una excepción explícita al permiso por
// defecto del rol; sin fila manda el rol. La suspensión del miembro NO vive
// aquí: requireMembership (tenant.mjs) ya exige memberships.status='active',
// así que una sesión suspendida no autoriza ninguna Tool (verificado en
// tests/test_tools_p0_schema.py con el predicado exacto).
import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {getTenantTools,resolveTenant} from '../tenant.mjs';
import {requireTenantSession} from '../auth.mjs';
import {getTool} from './catalog.mjs';

export const toolAccessLevels=Object.freeze(['none','read','write']);
const rows=r=>r?.rows?.map(row=>row.map(cell=>cell?.value??null))??[];
// Por defecto: viewer solo lee; member/admin/owner escriben. C009 (Usuarios)
// solo la leen owner/admin: esa regla vive en tenantConfig y no se relaja aquí.
export function defaultToolAccess(role,toolId){
 if(toolId==='C009')return ['owner','admin'].includes(role)?'read':'none';
 if(role==='viewer')return 'read';
 return ['owner','admin','member'].includes(role)?'write':'none';
}
export async function getEffectiveToolAccess(orgId,userId,role,toolId){
 if(!getTool(toolId))throw Error('Not found');
 const found=rows(await executeSql(
  'SELECT access FROM tenant_member_tools WHERE organization_id=? AND user_id=? AND tool_id=?',
  [orgId,userId,toolId]))[0];
 if(found&&toolAccessLevels.includes(found[0]))return found[0];
 return defaultToolAccess(role,toolId);
}
// Guardia que se llama DESPUÉS de authorizeTool en los operations del frente:
// un 'none' explícito bloquea incluso al owner; un 'read' explícito bloquea
// la escritura. Sin fila, manda el rol (authorizeTool ya lo comprobó).
export async function checkMemberToolAccess(orgId,userId,role,toolId,write=false){
 const access=await getEffectiveToolAccess(orgId,userId,role,toolId);
 if(access==='none'||write&&access==='read')throw Error('Forbidden');
 return access;
}
// Mapa de acceso efectivo del miembro actual (para ocultar Tools en la UI).
export async function listMyToolAccess(token,slug){
 const tenant=await resolveTenant(slug);
 if(!tenant)throw Error('Not found');
 // Sin Tool de arranque: el mapa cubre las Tools habilitadas del tenant y la
 // sesión ya exige membresía activa (un suspendido no llega aquí).
 const session=await requireTenantSession(token,tenant.id);
 const enabled=await getTenantTools(tenant.id);
 const overrides=new Map(rows(await executeSql(
  'SELECT tool_id,access FROM tenant_member_tools WHERE organization_id=? AND user_id=?',
  [tenant.id,session.userId])).map(([tool,access])=>[tool,access]));
 const access={};
 for(const toolId of enabled)access[toolId]=overrides.get(toolId)||defaultToolAccess(session.role,toolId);
 return {role:session.role,access};
}
async function requireMemberManager(token,slug){
 const tenant=await resolveTenant(slug);
 if(!tenant)throw Error('Not found');
 // Solo owner/admin del tenant gestionan permisos de su equipo.
 const session=await requireTenantSession(token,tenant.id,['owner','admin']);
 if(!(await getTenantTools(tenant.id)).includes('C009'))throw Error('Tool disabled');
 return {tenant,session};
}
async function listMembers(orgId){
 return rows(await executeSql(
  'SELECT u.id,u.email,m.role,m.status FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? ORDER BY u.email',
  [orgId])).map(([id,email,role,status])=>({id,email,role,status}));
}
export async function listMemberToolPermissions(token,slug){
 const {tenant}=await requireMemberManager(token,slug);
 const [members,overrides]=await Promise.all([
  listMembers(tenant.id),
  executeSql('SELECT user_id,tool_id,access FROM tenant_member_tools WHERE organization_id=?',[tenant.id])
 ]);
 const map=new Map();
 for(const [userId,toolId,access] of rows(overrides))map.set(userId+':'+toolId,access);
 return {members:members.map(m=>({...m,tools:Object.fromEntries(
  ['C001','C002','C003','C004','C005','C006','C007','T013','T014','T015','T020'].map(toolId=>
   [toolId,map.get(m.id+':'+toolId)||defaultToolAccess(m.role,toolId)]))}))};
}
export async function setMemberToolPermission(token,slug,userId,toolId,access){
 const {tenant,session}=await requireMemberManager(token,slug);
 if(!getTool(toolId)||!toolAccessLevels.includes(access))throw Error('Invalid tenant data');
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId))throw Error('Not found');
 const member=rows(await executeSql(
  'SELECT role FROM memberships WHERE organization_id=? AND user_id=?',[tenant.id,userId]))[0];
 if(!member)throw Error('Not found');
 // El permiso por defecto del rol se restaura borrando la excepción.
 if(access===defaultToolAccess(member[0],toolId)){
  await executeSql('DELETE FROM tenant_member_tools WHERE organization_id=? AND user_id=? AND tool_id=?',
   [tenant.id,userId,toolId]);
 }else{
  await executeSql(`INSERT INTO tenant_member_tools(organization_id,user_id,tool_id,access,updated_by)
   VALUES(?,?,?,?,?) ON CONFLICT(organization_id,user_id,tool_id) DO UPDATE SET access=excluded.access,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP`,
   [tenant.id,userId,toolId,access,session.userId]);
 }
 await executeSql('INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',
  [randomUUID(),tenant.id,session.userId,'members.tool_access','membership',userId]);
 return {ok:true,toolId,access};
}
export async function setMemberToolPermissionsBulk(token,slug,userId,permissions){
 // Sustituye TODAS las excepciones del miembro por el mapa dado (solo claves válidas).
 const {tenant,session}=await requireMemberManager(token,slug);
 await setMemberToolPermissionsForOrg(tenant.id,userId,permissions,session.userId);
 return listMemberToolPermissions(token,slug);
}
// Variantes de superadmin (la consola /admin ya verificó requireSuperAdmin;
// no hay sesión de tenant aquí). Reutilizan la misma escritura + auditoría.
export async function adminListMemberTools(orgId){
 const members=await listMembers(orgId);
 const overrides=rows(await executeSql(
  'SELECT user_id,tool_id,access FROM tenant_member_tools WHERE organization_id=?',[orgId]));
 const map=new Map(overrides.map(([userId,toolId,access])=>[userId+':'+toolId,access]));
 return {members:members.map(m=>({...m,tools:Object.fromEntries(
  ['C001','C002','C003','C004','C005','C006','C007','T013','T014','T015','T020'].map(toolId=>
   [toolId,map.get(m.id+':'+toolId)||defaultToolAccess(m.role,toolId)]))}))};
}
export async function adminSetMemberTools(orgId,userId,permissions,actorId){
 await setMemberToolPermissionsForOrg(orgId,userId,permissions,actorId);
 return adminListMemberTools(orgId);
}
async function setMemberToolPermissionsForOrg(orgId,userId,permissions,actorId){
 if(!permissions||typeof permissions!=='object'||Array.isArray(permissions))throw Error('Invalid tenant data');
 const entries=Object.entries(permissions);
 if(entries.some(([tool,access])=>!getTool(tool)||!toolAccessLevels.includes(access)))throw Error('Invalid tenant data');
 const member=rows(await executeSql(
  'SELECT role FROM memberships WHERE organization_id=? AND user_id=?',[orgId,userId]))[0];
 if(!member)throw Error('Not found');
 const statements=[{sql:'DELETE FROM tenant_member_tools WHERE organization_id=? AND user_id=?',args:[orgId,userId]}];
 for(const [toolId,access] of entries){
  if(access!==defaultToolAccess(member[0],toolId))statements.push(
   {sql:'INSERT INTO tenant_member_tools(organization_id,user_id,tool_id,access,updated_by) VALUES(?,?,?,?,?)',
    args:[orgId,userId,toolId,access,actorId]});
 }
 statements.push({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',
  args:[randomUUID(),orgId,actorId,'members.tool_access','membership',userId]});
 await executeBatch(statements);
}
