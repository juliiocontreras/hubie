// T001 Portal de clientes. Acceso externo por email + contraseña fijada con
// enlace de activación (token con hash SHA-256, 24 h, un solo uso; mismo
// patrón que organization_invitations). El portal solo muestra los datos de
// ESE cliente (scope client_id + organization_id) y registra accesos en
// audit_events. Sin sesión de portal no hay datos: nunca es un portal abierto.
// PENDIENTE (etiquetado en la UI, no fingido): el envío del enlace por correo;
// el staff comparte el enlace por el canal que ya usa con el cliente.
import {randomUUID,randomBytes,createHash,scryptSync,timingSafeEqual} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {resolveTenant} from '../tenant.mjs';
import {normalizePortalEmail,normalizePortalPassword,normalizePortalRequest,nextPortalRequestStatus,portalTokenState,portalTokenExpiredAt,PORTAL_SESSION_TTL_HOURS} from './tools-p2-domain.mjs';

const rows=r=>r?.rows?.map(row=>row.map(c=>c?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const hashToken=t=>createHash('sha256').update(t).digest('hex');
const newToken=()=>randomBytes(32).toString('base64url');
function hashPassword(password){
 const salt=randomBytes(16).toString('hex');
 const hash=scryptSync(password,salt,64).toString('hex');
 return `scrypt$${salt}$${hash}`;
}
function verifyPassword(password,stored){
 if(typeof stored!=='string')return false;
 const parts=stored.split('$');
 if(parts.length!==3||parts[0]!=='scrypt')return false;
 const hash=scryptSync(password,parts[1],64);
 const expected=Buffer.from(parts[2],'hex');
 return hash.length===expected.length&&timingSafeEqual(hash,expected);
}
const audit=(org,actor,action,id,type='portal_access')=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',args:[randomUUID(),org,actor,action,type,id]});

async function ensureClient(org,clientId){
 const found=rows(await executeSql('SELECT id,name,email FROM tenant_client_profiles WHERE organization_id=? AND id=? AND archived_at IS NULL',[org,clientId]));
 if(!found.length)throw Error('Client not found');
 return {id:found[0][0],name:found[0][1],email:found[0][2]};
}

// --- staff: crea el acceso y devuelve el enlace de activación (una sola vez)
export async function createPortalAccess(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'T001',true);
 const client=await ensureClient(tenant.id,input?.clientId);
 const email=normalizePortalEmail(input?.email||client.email);
 if(!email)throw Error('Invalid portal email');
 const clash=rows(await executeSql("SELECT id FROM portal_client_access WHERE organization_id=? AND client_id=? AND status!='revoked' LIMIT 1",[tenant.id,client.id]));
 if(clash.length)throw Error('Duplicate portal access');
 const raw=newToken(),id=randomUUID(),expiresAt=portalTokenExpiredAt();
 await executeBatch([
  {sql:'INSERT INTO portal_client_access(organization_id,id,client_id,email,activation_token_hash,activation_expires_at,created_by) VALUES(?,?,?,?,?,?,?)',
   args:[tenant.id,id,client.id,email,hashToken(raw),expiresAt,session.userId]},
  audit(tenant.id,session.userId,'portal.access_created',id)
 ]);
 return {access:{id,clientId:client.id,email,status:'pending'},
  activationUrl:`/portal.html?org=${encodeURIComponent(slug)}&token=${raw}`,
  activationExpiresAt:expiresAt};
}
export async function listPortalAccess(token,slug){
 const {tenant}=await authorizeTool(token,slug,'T001');
 const result=await executeSql("SELECT a.id,a.client_id,p.name,a.email,a.status,a.last_login_at,a.created_at FROM portal_client_access a JOIN tenant_client_profiles p ON p.organization_id=a.organization_id AND p.id=a.client_id WHERE a.organization_id=? ORDER BY a.created_at DESC LIMIT 250",[tenant.id]);
 return {access:rows(result).map(a=>({id:a[0],clientId:a[1],clientName:a[2],email:a[3],status:a[4],lastLoginAt:a[5],createdAt:a[6]}))};
}
export async function revokePortalAccess(token,slug,id){
 const {tenant,session}=await authorizeTool(token,slug,'T001',true);
 const result=await executeBatch([
  {sql:"UPDATE portal_client_access SET status='revoked',activation_token_hash=NULL,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND status!='revoked'",args:[tenant.id,id]},
  {sql:'UPDATE portal_client_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE organization_id=? AND access_id=? AND revoked_at IS NULL',args:[tenant.id,id]},
  audit(tenant.id,session.userId,'portal.access_revoked',id)
 ]);
 if(!changed(result?.[0]))throw Error('Not found');
 return {revoked:true};
}
export async function listPortalRequestsStaff(token,slug){
 const {tenant}=await authorizeTool(token,slug,'T001');
 const result=await executeSql('SELECT r.id,r.client_id,p.name,r.subject,r.message,r.status,r.created_at FROM portal_requests r JOIN tenant_client_profiles p ON p.organization_id=r.organization_id AND p.id=r.client_id WHERE r.organization_id=? ORDER BY r.created_at DESC LIMIT 250',[tenant.id]);
 return {requests:rows(result).map(a=>({id:a[0],clientId:a[1],clientName:a[2],subject:a[3],message:a[4],status:a[5],createdAt:a[6]}))};
}
export async function setPortalRequestStatus(token,slug,id,status){
 const {tenant,session}=await authorizeTool(token,slug,'T001',true);
 const current=rows(await executeSql('SELECT status FROM portal_requests WHERE organization_id=? AND id=?',[tenant.id,id]))[0];
 if(!current)throw Error('Not found');
 nextPortalRequestStatus(current[0],status);
 const result=await executeSql('UPDATE portal_requests SET status=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',[status,tenant.id,id]);
 if(!changed(result))throw Error('Not found');
 const a=audit(tenant.id,session.userId,'portal.request_status',id,'portal_request');
 await executeSql(a.sql,a.args);
 return {ok:true};
}

// --- público: activación, login y sesión del portal (sin sesión staff)
async function findAccessByToken(org,rawToken){
 if(typeof rawToken!=='string'||rawToken.length<20)return null;
 const row=rows(await executeSql('SELECT id,client_id,email,password_hash,activation_token_hash,activation_expires_at,activation_consumed_at,status FROM portal_client_access WHERE organization_id=? AND activation_token_hash=?',[org,hashToken(rawToken)]))[0];
 if(!row)return null;
 return {id:row[0],clientId:row[1],email:row[2],passwordHash:row[3],tokenHash:row[4],expiresAt:row[5],consumedAt:row[6],status:row[7]};
}
export async function activatePortalAccess(slug,rawToken,input){
 const tenant=await resolveTenant(slug);
 if(!tenant)throw Error('Not found');
 const access=await findAccessByToken(tenant.id,rawToken);
 const state=portalTokenState(access?{tokenHash:access.tokenHash,expiresAt:access.expiresAt,consumedAt:access.consumedAt}:{tokenHash:null});
 if(!access||!state.valid||access.status==='revoked')throw Error(state.reason==='consumed'?'Token consumed':state.reason==='expired'?'Token expired':'Not found');
 const password=normalizePortalPassword(input?.password);
 const sessionToken=newToken(),sessionId=randomUUID();
 const expiresAt=new Date(Date.now()+PORTAL_SESSION_TTL_HOURS*3600000).toISOString();
 await executeBatch([
  {sql:"UPDATE portal_client_access SET password_hash=?,activation_token_hash=NULL,activation_consumed_at=CURRENT_TIMESTAMP,status='active',updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND activation_consumed_at IS NULL",
   args:[hashPassword(password),tenant.id,access.id]},
  {sql:'INSERT INTO portal_client_sessions(organization_id,id,access_id,token_hash,expires_at) VALUES(?,?,?,?,?)',
   args:[tenant.id,sessionId,access.id,hashToken(sessionToken),expiresAt]},
  audit(tenant.id,null,'portal.activated',access.id)
 ]);
 return {sessionToken,expiresAt,clientId:access.clientId};
}
export async function loginPortal(slug,input){
 const tenant=await resolveTenant(slug);
 if(!tenant)throw Error('Not found');
 const email=normalizePortalEmail(input?.email);
 const password=typeof input?.password==='string'?input.password:'';
 const row=rows(await executeSql("SELECT id,client_id,password_hash,status FROM portal_client_access WHERE organization_id=? AND email=? AND status='active'",[tenant.id,email]))[0];
 if(!row||!verifyPassword(password,row[2]))throw Error('Unauthorized');
 const sessionToken=newToken(),sessionId=randomUUID();
 const expiresAt=new Date(Date.now()+PORTAL_SESSION_TTL_HOURS*3600000).toISOString();
 await executeBatch([
  {sql:'INSERT INTO portal_client_sessions(organization_id,id,access_id,token_hash,expires_at) VALUES(?,?,?,?,?)',
   args:[tenant.id,sessionId,row[0],hashToken(sessionToken),expiresAt]},
  {sql:'UPDATE portal_client_access SET last_login_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',args:[tenant.id,row[0]]},
  audit(tenant.id,null,'portal.login',row[0])
 ]);
 return {sessionToken,expiresAt,clientId:row[1]};
}
export async function verifyPortalSession(slug,sessionToken){
 const tenant=await resolveTenant(slug);
 if(!tenant||typeof sessionToken!=='string'||sessionToken.length<20)return null;
 const row=rows(await executeSql('SELECT s.access_id,a.client_id,a.email,s.expires_at,s.revoked_at,a.status FROM portal_client_sessions s JOIN portal_client_access a ON a.organization_id=s.organization_id AND a.id=s.access_id WHERE s.organization_id=? AND s.token_hash=?',[tenant.id,hashToken(sessionToken)]))[0];
 if(!row||row[4]||row[5]!=='active'||Date.parse(row[3])<=Date.now())return null;
 return {tenant,accessId:row[0],clientId:row[1],email:row[2]};
}
// Solo los datos de ESE cliente: expedientes, cotizaciones, puntos y solicitudes.
export async function getPortalData(slug,sessionToken){
 const session=await verifyPortalSession(slug,sessionToken);
 if(!session)throw Error('Unauthorized');
 const {tenant,clientId}=session;
 const [cases,quotes,ledger,requests,profile]=await Promise.all([
  executeSql('SELECT id,title,kind,status,created_at,updated_at FROM tenant_client_cases WHERE organization_id=? AND client_id=? AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 100',[tenant.id,clientId]),
  executeSql("SELECT id,title,status,total_cents,valid_until,created_at FROM tenant_quotes WHERE organization_id=? AND client_id=? AND archived_at IS NULL ORDER BY created_at DESC LIMIT 100",[tenant.id,clientId]),
  executeSql('SELECT delta_points FROM loyalty_ledger WHERE organization_id=? AND client_id=?',[tenant.id,clientId]),
  executeSql('SELECT id,subject,message,status,created_at FROM portal_requests WHERE organization_id=? AND client_id=? ORDER BY created_at DESC LIMIT 100',[tenant.id,clientId]),
  executeSql('SELECT name,company,email,phone FROM tenant_client_profiles WHERE organization_id=? AND id=?',[tenant.id,clientId])
 ]);
 const a=audit(tenant.id,null,'portal.access',session.accessId);
 await executeSql(a.sql,a.args);
 const p=rows(profile)[0]||[];
 return {client:{id:clientId,name:p[0]||'',company:p[1]||'',email:p[2]||'',phone:p[3]||''},
  cases:rows(cases).map(c=>({id:c[0],title:c[1],kind:c[2],status:c[3],createdAt:c[4],updatedAt:c[5]})),
  quotes:rows(quotes).map(q=>({id:q[0],title:q[1],status:q[2],totalCents:Number(q[3]),validUntil:q[4],createdAt:q[5]})),
  loyaltyPoints:rows(ledger).reduce((sum,r)=>sum+Number(r[0]||0),0),
  requests:rows(requests).map(r=>({id:r[0],subject:r[1],message:r[2],status:r[3],createdAt:r[4]}))};
}
export async function createPortalRequest(slug,sessionToken,input){
 const session=await verifyPortalSession(slug,sessionToken);
 if(!session)throw Error('Unauthorized');
 const data=normalizePortalRequest(input);
 const id=randomUUID();
 await executeBatch([
  {sql:'INSERT INTO portal_requests(organization_id,id,client_id,access_id,subject,message) VALUES(?,?,?,?,?,?)',
   args:[session.tenant.id,id,session.clientId,session.accessId,data.subject,data.message]},
  audit(session.tenant.id,null,'portal.request_created',id,'portal_request')
 ]);
 return {request:{id,...data,status:'open'}};
}
export async function logoutPortal(slug,sessionToken){
 const session=await verifyPortalSession(slug,sessionToken);
 if(!session)return {loggedOut:true};
 await executeSql('UPDATE portal_client_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE organization_id=? AND token_hash=?',[session.tenant.id,hashToken(sessionToken)]);
 return {loggedOut:true};
}
