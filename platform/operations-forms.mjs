// T007 Formularios personalizados reales: constructor (texto, número, fecha,
// selección, casilla; obligatorio o no), validación al responder y respuestas
// que crean registros reales en tenant_form_submissions (form_id + JSON),
// con listado y exportación CSV.
import {randomUUID} from 'node:crypto';
import {executeSql as realExecuteSql,executeBatch as realExecuteBatch} from '../database.mjs';
import {authorizeTool as realAuthorize} from './records.mjs';
import {normalizeCustomForm,validateFormSubmission,formSubmissionsCsv} from './tools-p1a-domain.mjs';

const rows=r=>r?.rows?.map(row=>row.map(c=>c?.value??null))??[];
const changed=r=>Number(r?.affected_row_count??r?.rowsAffected??0)>0;
const depsOf=d=>({executeSql:d?.executeSql||realExecuteSql,executeBatch:d?.executeBatch||realExecuteBatch,
 authorize:d?.authorize||realAuthorize});
const audit=(org,user,action,id)=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',
 args:[randomUUID(),org,user,action,'custom_form',id]});
const safeJson=raw=>{try{const x=JSON.parse(raw);return x&&typeof x==='object'?x:{};}catch{return {};}};
const safeFields=raw=>{const x=safeJson(raw);return Array.isArray(x)?x:[];};
const formRow=r=>({id:r[0],title:r[1],description:r[2],fields:safeFields(r[3]),createdAt:r[4],updatedAt:r[5]});

export async function listForms(token,slug,deps){
 const {executeSql,authorize}=depsOf(deps);
 const {tenant}=await authorize(token,slug,'T007');
 const [forms,counts]=await Promise.all([
  executeSql('SELECT id,title,description,fields_json,created_at,updated_at FROM tenant_forms WHERE organization_id=? AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 100',[tenant.id]),
  executeSql('SELECT form_id,COUNT(*) FROM tenant_form_submissions WHERE organization_id=? GROUP BY form_id',[tenant.id])
 ]);
 const byForm=Object.fromEntries(rows(counts).map(c=>[c[0],Number(c[1])]));
 return {forms:rows(forms).map(f=>({...formRow(f),submissions:byForm[f[0]]||0}))};
}
export async function createForm(token,slug,input,deps){
 const {executeSql,authorize}=depsOf(deps);
 const {tenant,session}=await authorize(token,slug,'T007',true);
 const data=normalizeCustomForm(input),id=randomUUID();
 await executeSql('INSERT INTO tenant_forms(organization_id,id,title,description,fields_json,created_by) VALUES(?,?,?,?,?,?)',
  [tenant.id,id,data.title,data.description,JSON.stringify(data.fields),session.userId]);
 const entry=audit(tenant.id,session.userId,'forms.created',id);
 await executeSql(entry.sql,entry.args);
 return {form:{id,...data}};
}
export async function updateForm(token,slug,id,input,deps){
 const {executeSql,authorize}=depsOf(deps);
 const {tenant,session}=await authorize(token,slug,'T007',true);
 const data=normalizeCustomForm(input);
 const r=await executeSql('UPDATE tenant_forms SET title=?,description=?,fields_json=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',
  [data.title,data.description,JSON.stringify(data.fields),tenant.id,id]);
 if(!changed(r))throw Error('Not found');
 const entry=audit(tenant.id,session.userId,'forms.updated',id);
 await executeSql(entry.sql,entry.args);
 return {ok:true};
}
export async function archiveForm(token,slug,id,deps){
 const {executeSql,authorize}=depsOf(deps);
 const {tenant,session}=await authorize(token,slug,'T007',true);
 const r=await executeSql('UPDATE tenant_forms SET archived_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,id]);
 if(!changed(r))throw Error('Not found');
 const entry=audit(tenant.id,session.userId,'forms.archived',id);
 await executeSql(entry.sql,entry.args);
 return {archived:true};
}
async function loadForm(executeSql,org,formId){
 const found=rows(await executeSql('SELECT id,title,description,fields_json,created_at,updated_at FROM tenant_forms WHERE organization_id=? AND id=? AND archived_at IS NULL',[org,formId]));
 if(!found.length)throw Error('Not found');
 return formRow(found[0]);
}
export async function submitForm(token,slug,formId,answers,deps){
 const {executeSql,authorize}=depsOf(deps);
 const {tenant,session}=await authorize(token,slug,'T007',true);
 const form=await loadForm(executeSql,tenant.id,formId);
 const clean=validateFormSubmission(form,answers);
 const id=randomUUID();
 await executeSql('INSERT INTO tenant_form_submissions(organization_id,id,form_id,answers_json,submitted_by) VALUES(?,?,?,?,?)',
  [tenant.id,id,formId,JSON.stringify(clean),session.userId]);
 return {submission:{id,formId,answers:clean,submittedBy:session.userId}};
}
export async function listSubmissions(token,slug,formId,deps){
 const {executeSql,authorize}=depsOf(deps);
 const {tenant}=await authorize(token,slug,'T007');
 const form=await loadForm(executeSql,tenant.id,formId);
 const result=await executeSql(
  'SELECT s.id,s.answers_json,s.submitted_by,s.created_at,u.email FROM tenant_form_submissions s '+
  'LEFT JOIN users u ON u.id=s.submitted_by WHERE s.organization_id=? AND s.form_id=? ORDER BY s.created_at DESC LIMIT 500',
  [tenant.id,formId]);
 return {form,submissions:rows(result).map(r=>({id:r[0],answers:safeJson(r[1]),
  submittedBy:r[2]||null,submittedByEmail:r[4]||null,createdAt:r[3]}))};
}
export async function exportSubmissionsCsv(token,slug,formId,deps){
 const {form,submissions}=await listSubmissions(token,slug,formId,deps);
 return {filename:'hubie-formulario-'+formId.slice(0,8)+'-respuestas.csv',
  csv:formSubmissionsCsv(form,submissions)};
}
