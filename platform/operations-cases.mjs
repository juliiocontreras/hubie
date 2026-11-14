import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {normalizeCase,normalizeCaseUpdate,caseKinds,caseStatuses} from './cases-domain.mjs';
import {checkMemberToolAccess} from './member-tools-p0.mjs';
const rows=r=>r?.rows?.map(row=>row.map(cell=>cell?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const caseFields=`SELECT c.id,c.client_id,p.name,c.title,c.kind,c.status,c.notes,c.created_at,c.updated_at,
 (SELECT COUNT(DISTINCT COALESCE(v.document_id,m.id)) FROM pwa_media m
  LEFT JOIN tenant_case_document_versions v ON v.organization_id=m.organization_id AND v.media_id=m.id
  WHERE m.organization_id=c.organization_id AND m.tool_id='C003' AND m.record_id=c.id AND m.kind='attachment')
 FROM tenant_client_cases c JOIN tenant_client_profiles p ON p.organization_id=c.organization_id AND p.id=c.client_id`;
const convert=r=>({id:r[0],clientId:r[1],clientName:r[2],title:r[3],kind:r[4],status:r[5],notes:r[6],createdAt:r[7],updatedAt:r[8],documentsCount:Number(r[9])});
const audit=(org,actor,action,id)=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',
 args:[randomUUID(),org,actor,'cases.'+action,'case',id]});
const activity=(org,id,actor,action,description='')=>({sql:`INSERT INTO tenant_case_events(organization_id,id,case_id,action,description,actor_user_id)
 SELECT ?,?,?,?,?,? FROM tenant_client_cases WHERE organization_id=? AND id=?`,
 args:[org,randomUUID(),id,action,description,actor,org,id]});
async function getCase(tenantId,id){
 const r=await executeSql(caseFields+' WHERE c.organization_id=? AND c.id=? AND c.archived_at IS NULL',[tenantId,id]);
 const record=rows(r)[0];if(!record)throw Error('Not found');
 return convert(record);
}
export async function listCases(token,slug){
 const {tenant,session}=await authorizeTool(token,slug,'C003');
 await checkMemberToolAccess(tenant.id,session.userId,session.role,'C003',false);
 const [cases,clients]=await Promise.all([
  executeSql(caseFields+' WHERE c.organization_id=? AND c.archived_at IS NULL ORDER BY c.updated_at DESC LIMIT 250',[tenant.id]),
  executeSql("SELECT id,name,company,email FROM tenant_client_profiles WHERE organization_id=? AND archived_at IS NULL ORDER BY name LIMIT 250",[tenant.id])
 ]);
 return {cases:rows(cases).map(convert),clients:rows(clients).map(a=>({id:a[0],name:a[1],company:a[2],email:a[3]})),kinds:caseKinds,statuses:caseStatuses};
}
export async function createCase(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'C003',true);
 await checkMemberToolAccess(tenant.id,session.userId,session.role,'C003',true);
 const data=normalizeCase(input),id=randomUUID();
 const batch=[
  {sql:`INSERT INTO tenant_client_cases(organization_id,id,client_id,title,kind,status,notes,created_by)
    SELECT ?,?,?,?,?,?,?,? FROM tenant_client_profiles WHERE organization_id=? AND id=? AND archived_at IS NULL`,
   args:[tenant.id,id,data.clientId,data.title,data.kind,data.status,data.notes,session.userId,tenant.id,data.clientId]},
  activity(tenant.id,id,session.userId,'created','Expediente registrado'),
  {sql:`INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id)
   SELECT ?,?,?,?,'case',? FROM tenant_client_cases WHERE organization_id=? AND id=?`,
   args:[randomUUID(),tenant.id,session.userId,'cases.created',id,tenant.id,id]}
 ];
 const results=await executeBatch(batch);
 if(!changed(results?.[0]))throw Error('Client not found');
 return {case:await getCase(tenant.id,id)};
}
export async function updateCase(token,slug,id,input){
 const {tenant,session}=await authorizeTool(token,slug,'C003',true);
 await checkMemberToolAccess(tenant.id,session.userId,session.role,'C003',true);
 const data=normalizeCaseUpdate(input);
 const result=await executeBatch([
  {sql:`UPDATE tenant_client_cases SET title=?,kind=?,status=?,notes=?,updated_at=CURRENT_TIMESTAMP
   WHERE organization_id=? AND id=? AND archived_at IS NULL`,
   args:[data.title,data.kind,data.status,data.notes,tenant.id,id]},
  {sql:`INSERT INTO tenant_case_events(organization_id,id,case_id,action,description,actor_user_id)
   SELECT ?,? ,id,'updated','Expediente actualizado',? FROM tenant_client_cases WHERE organization_id=? AND id=? AND archived_at IS NULL`,
   args:[tenant.id,randomUUID(),session.userId,tenant.id,id]},
  {sql:`INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id)
   SELECT ?,?,?,?,'case',? FROM tenant_client_cases WHERE organization_id=? AND id=? AND archived_at IS NULL`,
   args:[randomUUID(),tenant.id,session.userId,'cases.updated',id,tenant.id,id]}
 ]);
 if(!changed(result?.[0]))throw Error('Not found');
 return {case:await getCase(tenant.id,id)};
}
export async function archiveCase(token,slug,id){
 const {tenant,session}=await authorizeTool(token,slug,'C003',true);
 await checkMemberToolAccess(tenant.id,session.userId,session.role,'C003',true);
 const result=await executeBatch([
  {sql:'UPDATE tenant_client_cases SET archived_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',args:[tenant.id,id]},
  activity(tenant.id,id,session.userId,'archived','Expediente archivado'),
  audit(tenant.id,session.userId,'archived',id)
 ]);
 if(!changed(result?.[0]))throw Error('Not found');
 return {archived:true};
}
export async function caseHistory(token,slug,id){
 const {tenant,session}=await authorizeTool(token,slug,'C003');
 await checkMemberToolAccess(tenant.id,session.userId,session.role,'C003',false);
 const found=rows(await executeSql('SELECT id FROM tenant_client_cases WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,id]));
 if(!found.length)throw Error('Not found');
 const result=await executeSql('SELECT id,action,description,created_at FROM tenant_case_events WHERE organization_id=? AND case_id=? ORDER BY created_at DESC,id DESC LIMIT 150',[tenant.id,id]);
 return {events:rows(result).map(a=>({id:a[0],action:a[1],description:a[2],createdAt:a[3]}))};
}
