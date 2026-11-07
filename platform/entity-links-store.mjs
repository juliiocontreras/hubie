import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {getTenantTools,resolveTenant} from '../tenant.mjs';
import {requireTenantSession} from '../auth.mjs';
import {getTool} from './catalog.mjs';
import {normalizeEntityLink,canonicalPair,validEntityId} from './entity-relations.mjs';
import {implicitRelations} from './implicit-relations.mjs';
const values=r=>r?.rows?.map(x=>x.map(c=>c?.value??null))??[];
const entities={
 C001:{table:'tenant_client_profiles',name:'name'},
 C002:{table:'tenant_crm_deals',name:'title'},
 C003:{table:'tenant_client_cases',name:'title'},
 C004:{table:'tenant_schedule_events',name:'title',archive:false},
 C005:{table:'tenant_inventory_items',name:'title'}
};
function resolveSource(toolId){
 if(!getTool(toolId)||['C008','C009'].includes(toolId))throw Error('Not found');
 return entities[toolId]||null;
}
async function getEntity(org,toolId,id){
 if(!validEntityId(id))throw Error('Not found');
 const model=resolveSource(toolId);
 const sql=model?
 `SELECT ${model.name} FROM ${model.table} WHERE organization_id=? AND id=?${model.archive===false?'':' AND archived_at IS NULL'}`:
 'SELECT title FROM tenant_tool_records WHERE organization_id=? AND tool_id=? AND id=? AND archived_at IS NULL';
 const row=values(await executeSql(sql,model?[org,id]:[org,toolId,id]))[0];
 if(!row)throw Error('Not found');
 return {id,title:row[0],toolId,toolName:getTool(toolId).name};
}
export async function listEntityLinks(token,slug,toolId,recordId){
 const {tenant}=await authorizeTool(token,slug,toolId);
 await getEntity(tenant.id,toolId,recordId);
 const enabled=new Set(await getTenantTools(tenant.id));
 const data=values(await executeSql(`SELECT id,left_tool_id,left_record_id,right_tool_id,right_record_id,relation_type,created_at
 FROM tenant_entity_links WHERE organization_id=? AND
 ((left_tool_id=? AND left_record_id=?) OR (right_tool_id=? AND right_record_id=?))
 ORDER BY created_at DESC LIMIT 80`,[tenant.id,toolId,recordId,toolId,recordId]));
 const links=[];
 for(const row of data){
  const [id,lTool,lId,rTool,rId,relationType,createdAt]=row;
  const targetToolId=lTool===toolId&&lId===recordId?rTool:lTool;
  const targetRecordId=lTool===toolId&&lId===recordId?rId:lId;
  if(!enabled.has(targetToolId))continue;
  try{
   const target=await getEntity(tenant.id,targetToolId,targetRecordId);
   links.push({id,targetToolId,targetRecordId,title:target.title,toolName:target.toolName,relationType,createdAt});
  }catch{ /* target archived; omit dead link until maintenance */ }
 }
 for(const implied of await implicitRelations(tenant.id,toolId,recordId)){
  if(!enabled.has(implied.targetToolId)||links.some(x=>x.targetToolId===implied.targetToolId&&x.targetRecordId===implied.targetRecordId))continue;
  try{
   const target=await getEntity(tenant.id,implied.targetToolId,implied.targetRecordId);
   links.push({id:null,targetToolId:target.toolId,targetRecordId:target.id,
    title:target.title,toolName:target.toolName,relationType:'related',builtIn:true});
  }catch{ /* archived references do not disclose hidden records */ }
 }
 return {links};
}
export async function linkEntities(token,slug,toolId,recordId,input){
 const {tenant,session}=await authorizeTool(token,slug,toolId,true);
 await getEntity(tenant.id,toolId,recordId);
 const target=normalizeEntityLink(input);
 await authorizeTool(token,slug,target.targetToolId,true);
 await getEntity(tenant.id,target.targetToolId,target.targetRecordId);
 const pair=canonicalPair(toolId,recordId,target.targetToolId,target.targetRecordId);
 const id=randomUUID();
 const result=await executeBatch([
  {sql:`INSERT INTO tenant_entity_links(organization_id,id,left_tool_id,left_record_id,right_tool_id,right_record_id,relation_type,created_by)
   VALUES(?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING`,
   args:[tenant.id,id,pair.leftToolId,pair.leftRecordId,pair.rightToolId,pair.rightRecordId,target.relationType,session.userId]},
  {sql:`INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id)
   SELECT ?,?,?,'entities.linked','entity_link',? FROM tenant_entity_links WHERE organization_id=? AND id=?`,
   args:[randomUUID(),tenant.id,session.userId,id,tenant.id,id]}
 ]);
 if(!Number(result?.[0]?.affected_row_count??result?.[0]?.rowsAffected??0))throw Error('Duplicate relation');
 return {link:{id,...pair,relationType:target.relationType}};
}
export async function unlinkEntities(token,slug,id){
 if(!validEntityId(id))throw Error('Not found');
 const tenant=await resolveTenant(slug);
 if(!tenant)throw Error('Not found');
 await requireTenantSession(token,tenant.id,['owner','admin','member']);
 const pair=values(await executeSql('SELECT left_tool_id,left_record_id,right_tool_id,right_record_id FROM tenant_entity_links WHERE organization_id=? AND id=?',[tenant.id,id]))[0];
 if(!pair)throw Error('Not found');
 const allowed=await Promise.all([authorizeTool(token,slug,pair[0],true),authorizeTool(token,slug,pair[2],true)]);
 await executeBatch([
  {sql:'DELETE FROM tenant_entity_links WHERE organization_id=? AND id=?',args:[tenant.id,id]},
  {sql:"INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,'entities.unlinked','entity_link',?)",
   args:[randomUUID(),tenant.id,allowed[0].session.userId,id]}
 ]);
 return {removed:true};
}
export async function relationCandidates(token,slug,toolId){
 const {tenant}=await authorizeTool(token,slug,toolId);
 const model=resolveSource(toolId);
 const sql=model?
  `SELECT id,${model.name} FROM ${model.table} WHERE organization_id=?${model.archive===false?'':' AND archived_at IS NULL'} ORDER BY ${model.name} LIMIT 120`:
  'SELECT id,title FROM tenant_tool_records WHERE organization_id=? AND tool_id=? AND archived_at IS NULL ORDER BY title LIMIT 120';
 const rows=values(await executeSql(sql,model?[tenant.id]:[tenant.id,toolId]));
 return {records:rows.map(([id,title])=>({id,title}))};
}
