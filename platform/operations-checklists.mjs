// T003 Checklists reales: plantillas reutilizables, ítems verificables con
// responsable y fecha, evidencia (enlace a adjunto en pwa_media) y progreso.
// Patrón de inyección de dependencias como billing-store: `deps` permite
// probar con una base falsa sin tocar Turso.
import {randomUUID} from 'node:crypto';
import {executeSql as realExecuteSql,executeBatch as realExecuteBatch} from '../database.mjs';
import {authorizeTool as realAuthorize} from './records.mjs';
import {normalizeChecklistTemplate,normalizeChecklist,normalizeChecklistItem,checklistProgress} from './tools-p1a-domain.mjs';
import {assertTeamMember,listTeamMembers} from './team-members.mjs';

const rows=r=>r?.rows?.map(row=>row.map(c=>c?.value??null))??[];
const changed=r=>Number(r?.affected_row_count??r?.rowsAffected??0)>0;
const depsOf=d=>({executeSql:d?.executeSql||realExecuteSql,executeBatch:d?.executeBatch||realExecuteBatch,
 authorize:d?.authorize||realAuthorize});
const audit=(org,user,action,id)=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',
 args:[randomUUID(),org,user,action,'checklist',id]});
const itemRow=r=>({id:r[0],checklistId:r[1],title:r[2],assigneeUserId:r[3]||null,assigneeEmail:r[4]||null,
 dueOn:r[5]||null,checkedAt:r[6]||null,checkedBy:r[7]||null,evidenceMediaId:r[8]||null,
 evidenceName:r[9]||null,position:Number(r[10])});
const itemSelect=`SELECT i.id,i.checklist_id,i.title,i.assignee_user_id,u.email,i.due_on,i.checked_at,i.checked_by,
 i.evidence_media_id,m.name,i.position FROM tenant_checklist_items i
 LEFT JOIN users u ON u.id=i.assignee_user_id
 LEFT JOIN pwa_media m ON m.id=i.evidence_media_id`;
async function loadItems(executeSql,org,checklistId){
 const result=await executeSql(itemSelect+' WHERE i.organization_id=? AND i.checklist_id=? ORDER BY i.position, i.created_at',[org,checklistId]);
 return rows(result).map(itemRow);
}
async function assertEvidence(executeSql,org,mediaId){
 if(!mediaId)return;
 const found=rows(await executeSql(
  "SELECT id FROM pwa_media WHERE organization_id=? AND id=? AND kind='attachment'",[org,mediaId]));
 if(!found.length)throw Error('Evidence not found');
}

export async function listChecklistTemplates(token,slug,deps){
 const {executeSql,authorize}=depsOf(deps);
 const {tenant}=await authorize(token,slug,'T003');
 const [templates,items]=await Promise.all([
  executeSql('SELECT id,title,description,created_at,updated_at FROM tenant_checklist_templates WHERE organization_id=? AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 100',[tenant.id]),
  executeSql('SELECT template_id,title,position FROM tenant_checklist_template_items WHERE organization_id=? ORDER BY template_id,position',[tenant.id])
 ]);
 const byTemplate=new Map();
 for(const r of rows(items)){
  if(!byTemplate.has(r[0]))byTemplate.set(r[0],[]);
  byTemplate.get(r[0]).push({title:r[1],position:Number(r[2])});
 }
 return {templates:rows(templates).map(t=>({id:t[0],title:t[1],description:t[2],createdAt:t[3],updatedAt:t[4],
  items:byTemplate.get(t[0])||[]}))};
}
export async function createChecklistTemplate(token,slug,input,deps){
 const {executeSql,executeBatch,authorize}=depsOf(deps);
 const {tenant,session}=await authorize(token,slug,'T003',true);
 const data=normalizeChecklistTemplate(input),id=randomUUID();
 await executeBatch([
  {sql:'INSERT INTO tenant_checklist_templates(organization_id,id,title,description,created_by) VALUES(?,?,?,?,?)',
   args:[tenant.id,id,data.title,data.description,session.userId]},
  ...data.items.map(item=>({sql:'INSERT INTO tenant_checklist_template_items(organization_id,id,template_id,title,position) VALUES(?,?,?,?,?)',
   args:[tenant.id,randomUUID(),id,item.title,item.position]})),
  audit(tenant.id,session.userId,'checklists.template_created',id)]);
 return {template:{id,...data}};
}
export async function listChecklists(token,slug,deps){
 const {executeSql,authorize}=depsOf(deps);
 const {tenant}=await authorize(token,slug,'T003');
 const [checklists,templates,members]=await Promise.all([
  executeSql('SELECT id,template_id,title,source_tool_id,source_record_id,status,created_at,updated_at FROM tenant_checklists WHERE organization_id=? AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 100',[tenant.id]),
  executeSql('SELECT id,title FROM tenant_checklist_templates WHERE organization_id=? AND archived_at IS NULL',[tenant.id]),
  listTeamMembers(tenant.id,{executeSql})
 ]);
 const templateNames=Object.fromEntries(rows(templates).map(t=>[t[0],t[1]]));
 const out=[];
 for(const c of rows(checklists)){
  const items=await loadItems(executeSql,tenant.id,c[0]);
  out.push({id:c[0],templateId:c[1]||null,templateTitle:c[1]?templateNames[c[1]]||null:null,
   title:c[2],sourceToolId:c[3]||null,sourceRecordId:c[4]||null,status:c[5],
   createdAt:c[6],updatedAt:c[7],items,progress:checklistProgress(items)});
 }
 return {checklists:out,members};
}
export async function createChecklist(token,slug,input,deps){
 const {executeSql,executeBatch,authorize}=depsOf(deps);
 const {tenant,session}=await authorize(token,slug,'T003',true);
 const data=normalizeChecklist(input);
 let templateItems=[];
 if(data.templateId){
  const found=rows(await executeSql('SELECT title,position FROM tenant_checklist_template_items WHERE organization_id=? AND template_id=? ORDER BY position',[tenant.id,data.templateId]));
  if(!found.length)throw Error('Template not found');
  templateItems=found.map(f=>({title:f[0],position:Number(f[1]),assigneeUserId:null,dueOn:null}));
 }
 const items=data.items.length?data.items:templateItems;
 for(const item of items)if(item.assigneeUserId)await assertTeamMember(tenant.id,item.assigneeUserId,{executeSql});
 const id=randomUUID();
 await executeBatch([
  {sql:'INSERT INTO tenant_checklists(organization_id,id,template_id,title,source_tool_id,source_record_id,created_by) VALUES(?,?,?,?,?,?,?)',
   args:[tenant.id,id,data.templateId,data.title,data.sourceToolId,data.sourceRecordId,session.userId]},
  ...items.map(item=>({sql:'INSERT INTO tenant_checklist_items(organization_id,id,checklist_id,title,assignee_user_id,due_on,position) VALUES(?,?,?,?,?,?,?)',
   args:[tenant.id,randomUUID(),id,item.title,item.assigneeUserId,item.dueOn,item.position]})),
  audit(tenant.id,session.userId,'checklists.created',id)]);
 const created=await loadItems(executeSql,tenant.id,id);
 return {checklist:{id,title:data.title,templateId:data.templateId,status:'open',items:created,progress:checklistProgress(created)}};
}
export async function addChecklistItem(token,slug,checklistId,input,deps){
 const {executeSql,authorize}=depsOf(deps);
 const {tenant,session}=await authorize(token,slug,'T003',true);
 const data=normalizeChecklistItem(input);
 if(data.assigneeUserId)await assertTeamMember(tenant.id,data.assigneeUserId,{executeSql});
 await assertEvidence(executeSql,tenant.id,data.evidenceMediaId);
 const found=rows(await executeSql('SELECT id FROM tenant_checklists WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,checklistId]));
 if(!found.length)throw Error('Not found');
 const position=rows(await executeSql('SELECT COALESCE(MAX(position),-1)+1 FROM tenant_checklist_items WHERE organization_id=? AND checklist_id=?',[tenant.id,checklistId]))[0]?.[0]??0;
 const id=randomUUID();
 await executeSql('INSERT INTO tenant_checklist_items(organization_id,id,checklist_id,title,assignee_user_id,due_on,evidence_media_id,position) VALUES(?,?,?,?,?,?,?,?)',
  [tenant.id,id,checklistId,data.title,data.assigneeUserId,data.dueOn,data.evidenceMediaId,Number(position)]);
 await executeSql('UPDATE tenant_checklists SET updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',[tenant.id,checklistId]);
 await executeSql(audit(tenant.id,session.userId,'checklists.item_added',checklistId).sql,
  audit(tenant.id,session.userId,'checklists.item_added',checklistId).args);
 return {item:{id,checklistId,...data,checkedAt:null,checkedBy:null,position:Number(position)}};
}
export async function toggleChecklistItem(token,slug,checklistId,itemId,input,deps){
 const {executeSql,authorize}=depsOf(deps);
 const {tenant,session}=await authorize(token,slug,'T003',true);
 const checked=input?.checked===true;
 let mediaId=null;
 if(input&&'evidenceMediaId' in input){
  mediaId=input.evidenceMediaId||null;
  if(mediaId&&!/^[0-9a-f-]{36}$/i.test(mediaId))throw Error('Invalid checklist item');
  await assertEvidence(executeSql,tenant.id,mediaId);
 }
 await executeSql(
  'UPDATE tenant_checklist_items SET checked_at=?,checked_by=?,evidence_media_id=COALESCE(?,evidence_media_id),updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND checklist_id=? AND id=?',
  [checked?new Date().toISOString():null,checked?session.userId:null,mediaId,tenant.id,checklistId,itemId]);
 const found=rows(await executeSql('SELECT id FROM tenant_checklist_items WHERE organization_id=? AND checklist_id=? AND id=?',[tenant.id,checklistId,itemId]));
 if(!found.length)throw Error('Not found');
 const items=await loadItems(executeSql,tenant.id,checklistId);
 const progress=checklistProgress(items);
 await executeSql('UPDATE tenant_checklists SET status=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',
  [progress.done?'completed':'open',tenant.id,checklistId]);
 await executeSql(audit(tenant.id,session.userId,checked?'checklists.item_checked':'checklists.item_unchecked',checklistId).sql,
  audit(tenant.id,session.userId,checked?'checklists.item_checked':'checklists.item_unchecked',checklistId).args);
 return {ok:true,checked,progress};
}
export async function archiveChecklist(token,slug,id,deps){
 const {executeSql,authorize}=depsOf(deps);
 const {tenant,session}=await authorize(token,slug,'T003',true);
 const result=await executeSql('UPDATE tenant_checklists SET archived_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,id]);
 if(!changed(result))throw Error('Not found');
 const entry=audit(tenant.id,session.userId,'checklists.archived',id);
 await executeSql(entry.sql,entry.args);
 return {archived:true};
}
