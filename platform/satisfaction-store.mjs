import {randomUUID,randomBytes} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {getTenantTools} from '../tenant.mjs';
import {normalizeSurvey,normalizeAnswers,surveyStatistics,hashSurveyToken} from './satisfaction-domain.mjs';
const rows=r=>r?.rows?.map(a=>a.map(c=>c?.value??null))??[];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validId(id){if(typeof id!=='string'||!uuid.test(id))throw Error('Invalid survey');}
function decodeQuestions(raw){const q=JSON.parse(raw);if(!Array.isArray(q))throw Error('Invalid survey');return q;}
async function surveyFor(org,id){
 validId(id);
 const row=rows(await executeSql('SELECT id,title,questions_json,status,created_at FROM tenant_surveys WHERE organization_id=? AND id=?',[org,id]))[0];
 if(!row)throw Error('Not found');
 return {id:row[0],title:row[1],questions:decodeQuestions(row[2]),status:row[3],createdAt:row[4]};
}
export async function listSurveys(token,slug){
 const {tenant}=await authorizeTool(token,slug,'T021');
 const enabled=new Set(await getTenantTools(tenant.id));
 const [res,clients,deals]=await Promise.all([
  executeSql(`SELECT s.id,s.title,s.status,s.questions_json,s.created_at,
   (SELECT COUNT(*) FROM tenant_survey_invitations i WHERE i.organization_id=s.organization_id AND i.survey_id=s.id),
   (SELECT COUNT(*) FROM tenant_survey_responses r WHERE r.organization_id=s.organization_id AND r.survey_id=s.id)
   FROM tenant_surveys s WHERE s.organization_id=? ORDER BY s.created_at DESC LIMIT 100`,[tenant.id]),
  enabled.has('C001')?executeSql('SELECT id,name,company FROM tenant_client_profiles WHERE organization_id=? AND archived_at IS NULL ORDER BY name LIMIT 200',[tenant.id]):Promise.resolve({rows:[]}),
  enabled.has('C002')?executeSql('SELECT id,title FROM tenant_crm_deals WHERE organization_id=? AND archived_at IS NULL ORDER BY updated_at DESC LIMIT 200',[tenant.id]):Promise.resolve({rows:[]})
 ]);
 return {surveys:rows(res).map(x=>({id:x[0],title:x[1],status:x[2],questions:decodeQuestions(x[3]),createdAt:x[4],invitations:Number(x[5]),responses:Number(x[6])})),
  clients:rows(clients).map(x=>({id:x[0],name:x[1],company:x[2]})),
  deals:rows(deals).map(x=>({id:x[0],title:x[1]}))};
}
export async function createSurvey(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'T021',true);
 const survey=normalizeSurvey(input);
 const count=Number(rows(await executeSql('SELECT COUNT(*) FROM tenant_surveys WHERE organization_id=?',[tenant.id]))[0]?.[0]||0);
 if(count>=100)throw Error('Survey limit reached');
 const id=randomUUID();
 await executeSql('INSERT INTO tenant_surveys(organization_id,id,title,questions_json,created_by) VALUES(?,?,?,?,?)',
  [tenant.id,id,survey.title,JSON.stringify(survey.questions),session.userId]);
 return {survey:{id,...survey,status:'active'}};
}
export async function setSurveyStatus(token,slug,id,input){
 const {tenant}=await authorizeTool(token,slug,'T021',true);
 if(!input||Object.keys(input).length!==1||!['active','closed'].includes(input.status))throw Error('Invalid survey');
 validId(id);
 const r=await executeSql('UPDATE tenant_surveys SET status=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',[input.status,tenant.id,id]);
 if(!Number(r.rowsAffected??r.affected_row_count??0))throw Error('Not found');
 return {ok:true,status:input.status};
}
export async function createSurveyInvitation(token,slug,id,input={}){
 const {tenant,session}=await authorizeTool(token,slug,'T021',true);
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['clientId','dealId'].includes(k)))throw Error('Invalid survey invitation');
 const survey=await surveyFor(tenant.id,id);
 if(survey.status!=='active')throw Error('Survey closed');
 let clientId=input.clientId||null,dealId=input.dealId||null;
 const enabled=new Set(await getTenantTools(tenant.id));
 if(clientId){
  if(!enabled.has('C001'))throw Error('Tool disabled');
  validId(clientId);
  if(!rows(await executeSql('SELECT id FROM tenant_client_profiles WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,clientId])).length)throw Error('Client not found');
 }
 if(dealId){
  if(!enabled.has('C002'))throw Error('Tool disabled');
  validId(dealId);
  const d=rows(await executeSql(`SELECT d.id,l.client_id FROM tenant_crm_deals d LEFT JOIN tenant_deal_clients l ON l.organization_id=d.organization_id AND l.deal_id=d.id
   WHERE d.organization_id=? AND d.id=? AND d.archived_at IS NULL`,[tenant.id,dealId]))[0];
  if(!d)throw Error('Deal not found');
  if(d[1]&&clientId&&d[1]!==clientId)throw Error('Relation mismatch');
  if(d[1])clientId=d[1];
 }
 const count=Number(rows(await executeSql('SELECT COUNT(*) FROM tenant_survey_invitations WHERE organization_id=? AND survey_id=?',[tenant.id,id]))[0]?.[0]||0);
 if(count>=1000)throw Error('Survey limit reached');
 const code=randomBytes(24).toString('base64url'),tokenHash=hashSurveyToken(code),invitationId=randomUUID();
 const expiresAt=new Date(Date.now()+30*86400000).toISOString();
 await executeSql(`INSERT INTO tenant_survey_invitations(organization_id,id,survey_id,client_id,deal_id,token_hash,expires_at,created_by)
 VALUES(?,?,?,?,?,?,?,?)`,[tenant.id,invitationId,id,clientId,dealId,tokenHash,expiresAt,session.userId]);
 return {invitation:{id:invitationId,clientId,dealId,expiresAt,path:'/encuesta/?token='+code}};
}
export async function surveyReport(token,slug,id){
 const {tenant}=await authorizeTool(token,slug,'T021');
 const survey=await surveyFor(tenant.id,id);
 const canClients=(await getTenantTools(tenant.id)).includes('C001');
 const [answers,invites]=await Promise.all([
  executeSql(`SELECT r.id,r.answers_json,r.created_at,i.client_id,c.name,i.deal_id
   FROM tenant_survey_responses r
   JOIN tenant_survey_invitations i ON i.organization_id=r.organization_id AND i.id=r.invitation_id
   LEFT JOIN tenant_client_profiles c ON c.organization_id=i.organization_id AND c.id=i.client_id
   WHERE r.organization_id=? AND r.survey_id=? ORDER BY r.created_at DESC LIMIT 1000`,[tenant.id,id]),
  executeSql('SELECT COUNT(*),SUM(CASE WHEN used_at IS NOT NULL THEN 1 ELSE 0 END) FROM tenant_survey_invitations WHERE organization_id=? AND survey_id=?',[tenant.id,id])
 ]);
 const responses=rows(answers).map(x=>({id:x[0],answers:JSON.parse(x[1]),createdAt:x[2],
  clientId:canClients?x[3]:null,clientName:canClients?x[4]:null,dealId:x[5]}));
 return {survey,statistics:{...surveyStatistics(responses.map(x=>x.answers),survey.questions),
  invitations:Number(rows(invites)[0]?.[0]||0),completed:Number(rows(invites)[0]?.[1]||0)},responses};
}
async function publicLookup(code){
 const hash=hashSurveyToken(code);
 const result=rows(await executeSql(`SELECT i.organization_id,i.id,i.survey_id,i.expires_at,i.used_at,
 s.title,s.questions_json,s.status,t.display_name
 FROM tenant_survey_invitations i
 JOIN tenant_surveys s ON s.organization_id=i.organization_id AND s.id=i.survey_id
 JOIN organizations o ON o.id=i.organization_id AND o.status='active'
 JOIN tenant_tools e ON e.organization_id=i.organization_id AND e.tool_id='T021' AND e.enabled=1
 JOIN tenant_settings t ON t.organization_id=i.organization_id
 WHERE i.token_hash=? LIMIT 1`,[hash]))[0];
 if(!result||result[4]||Date.parse(result[3])<=Date.now()||result[7]!=='active')throw Error('Survey link unavailable');
 return {organizationId:result[0],invitationId:result[1],surveyId:result[2],expiresAt:result[3],
  title:result[5],questions:decodeQuestions(result[6]),company:result[8],hash};
}
export async function publicSurvey(code){
 const s=await publicLookup(code);
 return {survey:{title:s.title,questions:s.questions,company:s.company,expiresAt:s.expiresAt}};
}
export async function submitSurvey(code,input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==1)throw Error('Invalid answers');
 const s=await publicLookup(code),answers=normalizeAnswers(s.questions,input.answers),id=randomUUID();
 const result=await executeBatch([
  {sql:`INSERT INTO tenant_survey_responses(organization_id,id,invitation_id,survey_id,answers_json)
   SELECT ?,?,?,?,? FROM tenant_survey_invitations i
   JOIN tenant_surveys s ON s.organization_id=i.organization_id AND s.id=i.survey_id
   WHERE i.organization_id=? AND i.id=? AND i.token_hash=? AND i.used_at IS NULL AND julianday(i.expires_at)>julianday('now') AND s.status='active'`,
   args:[s.organizationId,id,s.invitationId,s.surveyId,JSON.stringify(answers),s.organizationId,s.invitationId,s.hash]},
  {sql:`UPDATE tenant_survey_invitations SET used_at=CURRENT_TIMESTAMP
    WHERE organization_id=? AND id=? AND EXISTS(SELECT 1 FROM tenant_survey_responses WHERE organization_id=? AND id=?)`,
   args:[s.organizationId,s.invitationId,s.organizationId,id]},
  {sql:`INSERT INTO audit_events(id,organization_id,action,target_type,target_id)
   SELECT ?,?,'survey.response_received','survey_response',? FROM tenant_survey_responses WHERE organization_id=? AND id=?`,
   args:[randomUUID(),s.organizationId,id,s.organizationId,id]}
 ]);
 if(!Number(result?.[0]?.rowsAffected??result?.[0]?.affected_row_count??0))throw Error('Survey link unavailable');
 return {ok:true,message:'¡Gracias! Tu respuesta fue registrada.'};
}
