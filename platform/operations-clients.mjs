import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {normalizeClient,clientStatuses} from './clients-domain.mjs';
import {checkMemberToolAccess} from './member-tools-p0.mjs';

const rows=result=>result?.rows?.map(row=>row.map(cell=>cell?.value??null))??[];
const changed=result=>Number(result?.rowsAffected??result?.affected_row_count??0)>0;
const toClient=r=>({id:r[0],name:r[1],company:r[2],email:r[3],phone:r[4],status:r[5],notes:r[6],createdAt:r[7],updatedAt:r[8]});
const recordAudit=(org,user,action,id)=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',args:[randomUUID(),org,user,action,'client',id]});

export async function listClients(token,slug){
 const {tenant,session}=await authorizeTool(token,slug,'C001');
 await checkMemberToolAccess(tenant.id,session.userId,session.role,'C001',false);
 const result=await executeSql('SELECT id,name,company,email,phone,status,notes,created_at,updated_at FROM tenant_client_profiles WHERE organization_id=? AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 250',[tenant.id]);
 return {clients:rows(result).map(toClient),statuses:clientStatuses};
}
export async function createClient(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'C001',true);
 await checkMemberToolAccess(tenant.id,session.userId,session.role,'C001',true);
 const data=normalizeClient(input),id=randomUUID();
 const a=recordAudit(tenant.id,session.userId,'clients.created',id);
 const results=await executeBatch([
  {sql:'INSERT INTO tenant_client_profiles(organization_id,id,name,company,email,phone,status,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING',args:[tenant.id,id,data.name,data.company,data.email,data.phone,data.status,data.notes,session.userId]},
  {sql:`INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id)
  SELECT ?,?,?,?,?,? FROM tenant_client_profiles WHERE organization_id=? AND id=?`,
  args:[...a.args,tenant.id,id]}
 ]);
 if(!changed(results?.[0]))throw Error('Duplicate client email');
 return {client:{id,...data}};
}
export async function updateClient(token,slug,id,input){
 const {tenant,session}=await authorizeTool(token,slug,'C001',true);
 await checkMemberToolAccess(tenant.id,session.userId,session.role,'C001',true);
 const data=normalizeClient(input);
 const update=await executeSql(`UPDATE tenant_client_profiles SET name=?,company=?,email=?,phone=?,status=?,notes=?,updated_at=CURRENT_TIMESTAMP
  WHERE organization_id=? AND id=? AND archived_at IS NULL
  AND (?='' OR NOT EXISTS(
   SELECT 1 FROM tenant_client_profiles another WHERE another.organization_id=? AND another.id!=? AND another.email=? AND another.archived_at IS NULL
  ))`,
 [data.name,data.company,data.email,data.phone,data.status,data.notes,tenant.id,id,data.email,tenant.id,id,data.email]);
 if(!changed(update)){
  const found=await executeSql('SELECT id FROM tenant_client_profiles WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,id]);
  throw Error(rows(found).length?'Duplicate client email':'Not found');
 }
 const a=recordAudit(tenant.id,session.userId,'clients.updated',id);
 await executeSql(a.sql,a.args);
 return {ok:true};
}
export async function archiveClient(token,slug,id){
 const {tenant,session}=await authorizeTool(token,slug,'C001',true);
 await checkMemberToolAccess(tenant.id,session.userId,session.role,'C001',true);
 const result=await executeSql('UPDATE tenant_client_profiles SET archived_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,id]);
 if(!changed(result))throw Error('Not found');
 const a=recordAudit(tenant.id,session.userId,'clients.archived',id);
 await executeSql(a.sql,a.args);
 return {archived:true};
}
