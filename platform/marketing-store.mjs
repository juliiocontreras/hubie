import {randomUUID} from 'node:crypto';
import {executeSql as realExecuteSql,executeBatch as realExecuteBatch} from '../database.mjs';
import {authorizeTool as realAuthorize} from './records.mjs';
import {emailConfigured as realEmailConfigured,sendMarketingEmail as realSendEmail} from './email.mjs';
import {normalizeSegment,normalizeCampaign,segmentMatchesClient,campaignRecipients,isSendableStatus} from './marketing-domain.mjs';
// T029 Marketing. Patrón de inyección de dependencias como training-store:
// `deps` permite probar el store con una base falsa sin tocar Turso; sin
// deps usa los clientes reales. emailConfigured/sendEmail son inyectables
// para probar el envío con y sin clave Resend sin tocar el entorno.
const depsOf=d=>({executeSql:d?.executeSql||realExecuteSql,executeBatch:d?.executeBatch||realExecuteBatch,
 authorize:d?.authorize||realAuthorize,emailConfigured:d?.emailConfigured||realEmailConfigured,sendEmail:d?.sendEmail||realSendEmail});
const rows=r=>r?.rows?.map(a=>a.map(c=>c?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const num=v=>Number(v||0);
function validId(id,label){if(typeof id!=='string'||!uuid.test(id))throw Error(label);}
const NO_RESEND_MESSAGE='Sin envío real (falta clave Resend). Configura la clave Resend para enviar.';
async function segmentFor(db,org,id){
 validId(id,'Invalid segment');
 const row=rows(await db.executeSql('SELECT id,name,description,status,company_contains,created_at,updated_at FROM tenant_marketing_segments WHERE organization_id=? AND id=?',[org,id]))[0];
 if(!row)throw Error('Not found');
 return {id:row[0],name:row[1],description:row[2],status:row[3],companyContains:row[4],createdAt:row[5],updatedAt:row[6]};
}
async function campaignFor(db,org,id){
 validId(id,'Invalid campaign');
 const row=rows(await db.executeSql('SELECT id,name,subject,content,segment_id,status,scheduled_at,sent_at,created_at,updated_at FROM tenant_marketing_campaigns WHERE organization_id=? AND id=?',[org,id]))[0];
 if(!row)throw Error('Not found');
 return {id:row[0],name:row[1],subject:row[2],content:row[3],segmentId:row[4],status:row[5],scheduledAt:row[6],sentAt:row[7],createdAt:row[8],updatedAt:row[9]};
}
async function clientsOf(db,org){
 const r=await db.executeSql('SELECT id,name,company,email,status FROM tenant_client_profiles WHERE organization_id=? AND archived_at IS NULL ORDER BY name LIMIT 500',[org]);
 return rows(r).map(x=>({id:x[0],name:x[1],company:x[2],email:x[3],status:x[4]}));
}
async function recipientsFor(db,org,campaign){
 const segment=campaign.segmentId?await segmentFor(db,org,campaign.segmentId):null;
 return campaignRecipients(segment,await clientsOf(db,org));
}
// ---- Segmentos ----
export async function listSegments(token,slug,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T029');
 const r=await db.executeSql(`SELECT s.id,s.name,s.description,s.status,s.company_contains,s.created_at,s.updated_at,
  (SELECT COUNT(*) FROM tenant_client_profiles p WHERE p.organization_id=s.organization_id AND p.archived_at IS NULL
   AND (s.status='' OR p.status=s.status) AND (s.company_contains='' OR p.company LIKE '%'||s.company_contains||'%'))
  FROM tenant_marketing_segments s WHERE s.organization_id=? ORDER BY s.name LIMIT 100`,[tenant.id]);
 return {segments:rows(r).map(x=>({id:x[0],name:x[1],description:x[2],status:x[3],companyContains:x[4],createdAt:x[5],updatedAt:x[6],recipients:num(x[7])}))};
}
export async function createSegment(token,slug,input,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T029',true);
 const data=normalizeSegment(input);
 const id=randomUUID();
 await db.executeSql('INSERT INTO tenant_marketing_segments(organization_id,id,name,description,status,company_contains,created_by) VALUES(?,?,?,?,?,?,?)',
  [tenant.id,id,data.name,data.description,data.status,data.companyContains,session.userId]);
 return {segment:{id,...data,recipients:0}};
}
export async function updateSegment(token,slug,id,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T029',true);
 const current=await segmentFor(db,tenant.id,id);
 const next=normalizeSegment({name:current.name,description:current.description,status:current.status,companyContains:current.companyContains,...input});
 const r=await db.executeSql('UPDATE tenant_marketing_segments SET name=?,description=?,status=?,company_contains=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',
  [next.name,next.description,next.status,next.companyContains,tenant.id,id]);
 if(!changed(r))throw Error('Not found');
 return {segment:{id,...next}};
}
export async function deleteSegment(token,slug,id,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T029',true);
 await segmentFor(db,tenant.id,id);
 await db.executeBatch([
  {sql:'UPDATE tenant_marketing_campaigns SET segment_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND segment_id=?',args:[tenant.id,id]},
  {sql:'DELETE FROM tenant_marketing_segments WHERE organization_id=? AND id=?',args:[tenant.id,id]}
 ]);
 return {ok:true};
}
// ---- Campañas ----
export async function listCampaigns(token,slug,{status=null}={},deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T029');
 const r=await db.executeSql(`SELECT c.id,c.name,c.subject,c.content,c.segment_id,c.status,c.scheduled_at,c.sent_at,c.created_at,c.updated_at,s.name,
  (SELECT COUNT(*) FROM tenant_marketing_sends d WHERE d.organization_id=c.organization_id AND d.campaign_id=c.id),
  (SELECT COUNT(*) FROM tenant_marketing_sends d WHERE d.organization_id=c.organization_id AND d.campaign_id=c.id AND d.status='enviado')
  FROM tenant_marketing_campaigns c LEFT JOIN tenant_marketing_segments s ON s.organization_id=c.organization_id AND s.id=c.segment_id
  WHERE c.organization_id=?`+(status?` AND c.status=?`:'')+` ORDER BY c.created_at DESC LIMIT 100`,
  status?[tenant.id,status]:[tenant.id]);
 return {campaigns:rows(r).map(x=>({id:x[0],name:x[1],subject:x[2],content:x[3],segmentId:x[4],status:x[5],scheduledAt:x[6],sentAt:x[7],createdAt:x[8],updatedAt:x[9],segmentName:x[10],sends:num(x[11]),sent:num(x[12])}))};
}
export async function createCampaign(token,slug,input,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T029',true);
 const data=normalizeCampaign(input);
 if(data.segmentId)await segmentFor(db,tenant.id,data.segmentId);
 const id=randomUUID();
 await db.executeSql('INSERT INTO tenant_marketing_campaigns(organization_id,id,name,subject,content,segment_id,status,scheduled_at,created_by) VALUES(?,?,?,?,?,?,?,?,?)',
  [tenant.id,id,data.name,data.subject,data.content,data.segmentId,data.status,data.scheduledAt,session.userId]);
 return {campaign:{id,...data,sentAt:null}};
}
export async function updateCampaign(token,slug,id,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T029',true);
 const current=await campaignFor(db,tenant.id,id);
 if(current.status==='enviada')throw Error('Invalid campaign');
 const base={name:current.name,subject:current.subject,content:current.content,segmentId:current.segmentId,scheduledAt:current.scheduledAt,status:current.status};
 const next=normalizeCampaign({...base,...input});
 if(next.status==='enviada')throw Error('Invalid campaign');
 if(next.segmentId)await segmentFor(db,tenant.id,next.segmentId);
 const r=await db.executeSql('UPDATE tenant_marketing_campaigns SET name=?,subject=?,content=?,segment_id=?,scheduled_at=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',
  [next.name,next.subject,next.content,next.segmentId,next.scheduledAt,next.status,tenant.id,id]);
 if(!changed(r))throw Error('Not found');
 return {campaign:{id,...next,sentAt:current.sentAt}};
}
export async function setCampaignStatus(token,slug,id,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T029',true);
 if(!input||Object.keys(input).length!==1||!['borrador','programada'].includes(input.status))throw Error('Invalid campaign');
 const current=await campaignFor(db,tenant.id,id);
 if(current.status==='enviada')throw Error('Invalid campaign');
 const r=await db.executeSql('UPDATE tenant_marketing_campaigns SET status=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',[input.status,tenant.id,id]);
 if(!changed(r))throw Error('Not found');
 return {ok:true,status:input.status};
}
export async function getCampaign(token,slug,id,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T029');
 const campaign=await campaignFor(db,tenant.id,id);
 const segment=campaign.segmentId?await segmentFor(db,tenant.id,campaign.segmentId):null;
 const sends=await listSends(token,slug,id,deps);
 const recipients=await recipientsFor(db,tenant.id,campaign);
 return {campaign:{...campaign,segmentName:segment?.name||null},segment,recipients,sends:sends.sends};
}
export async function previewRecipients(token,slug,{campaignId=null,segmentId=null}={},deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T029');
 let segment=null,campaign=null;
 if(campaignId){campaign=await campaignFor(db,tenant.id,campaignId);if(campaign.segmentId)segment=await segmentFor(db,tenant.id,campaign.segmentId);}
 else if(segmentId){segment=await segmentFor(db,tenant.id,segmentId);}
 const recipients=campaignRecipients(segment,await clientsOf(db,tenant.id));
 return {recipients,count:recipients.length,campaignId:campaign?.id||null,segmentId:segment?.id||null,segmentName:segment?.name||null};
}
export async function listSends(token,slug,campaignId,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T029');
 await campaignFor(db,tenant.id,campaignId);
 const r=await db.executeSql('SELECT id,campaign_id,client_id,recipient_name,recipient_email,status,error,sent_at,created_at FROM tenant_marketing_sends WHERE organization_id=? AND campaign_id=? ORDER BY created_at DESC LIMIT 500',[tenant.id,campaignId]);
 return {sends:rows(r).map(x=>({id:x[0],campaignId:x[1],clientId:x[2],recipientName:x[3],recipientEmail:x[4],status:x[5],error:x[6],sentAt:x[7],createdAt:x[8]}))};
}
// Envío de campaña. Sin clave Resend NO se envía nada real: se registran
// los envíos como 'sin_envio', la campaña NO se marca como enviada y la
// respuesta lo dice explícitamente (mismo patrón que las invitaciones por
// correo de Hubie). Con clave, cada destinatario se envía por Resend y la
// campaña se marca 'enviada' solo si al menos uno se envió de verdad.
export async function sendCampaign(token,slug,id,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T029',true);
 const campaign=await campaignFor(db,tenant.id,id);
 if(!isSendableStatus(campaign.status))throw Error('Invalid campaign');
 const recipients=await recipientsFor(db,tenant.id,campaign);
 if(!recipients.length)throw Error('Invalid campaign');
 if(!db.emailConfigured()){
  const statements=recipients.map(r=>({sql:'INSERT INTO tenant_marketing_sends(organization_id,id,campaign_id,client_id,recipient_name,recipient_email,status,error) VALUES(?,?,?,?,?,?,?,?)',
   args:[tenant.id,randomUUID(),id,r.clientId,r.name,r.email,'sin_envio',NO_RESEND_MESSAGE]}));
  await db.executeBatch(statements);
  return {sent:false,reason:'email-not-configured',campaignId:id,recipients:recipients.length,sendsCreated:recipients.length,sentCount:0,failedCount:0,message:NO_RESEND_MESSAGE};
 }
 let sentCount=0,failedCount=0;
 const statements=[];
 for(const r of recipients){
  let result;
  try{result=await db.sendEmail({to:r.email,subject:campaign.subject,content:campaign.content});}
  catch(e){result={sent:false,reason:'email-send-failed'};}
  const ok=result?.sent===true;
  if(ok)sentCount++;else failedCount++;
  statements.push({sql:'INSERT INTO tenant_marketing_sends(organization_id,id,campaign_id,client_id,recipient_name,recipient_email,status,error,sent_at) VALUES(?,?,?,?,?,?,?,?,?)',
   args:[tenant.id,randomUUID(),id,r.clientId,r.name,r.email,ok?'enviado':'fallido',ok?'':(result?.reason||'email-send-failed'),ok?new Date().toISOString():null]});
 }
 await db.executeBatch(statements);
 if(sentCount>0){
  await db.executeSql("UPDATE tenant_marketing_campaigns SET status='enviada',sent_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?",[tenant.id,id]);
 }
 return {sent:sentCount>0,reason:sentCount>0?null:'email-send-failed',campaignId:id,recipients:recipients.length,sentCount,failedCount};
}
// ---- Tablero ----
export async function dashboard(token,slug,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T029');
 const org=tenant.id;
 const totals=await db.executeSql(`SELECT
  (SELECT COUNT(*) FROM tenant_marketing_campaigns WHERE organization_id=? AND status='borrador'),
  (SELECT COUNT(*) FROM tenant_marketing_campaigns WHERE organization_id=? AND status='programada'),
  (SELECT COUNT(*) FROM tenant_marketing_campaigns WHERE organization_id=? AND status='enviada'),
  (SELECT COUNT(*) FROM tenant_marketing_segments WHERE organization_id=?),
  (SELECT COUNT(*) FROM tenant_marketing_sends WHERE organization_id=?),
  (SELECT COUNT(*) FROM tenant_marketing_sends WHERE organization_id=? AND status='enviado'),
  (SELECT COUNT(*) FROM tenant_marketing_sends WHERE organization_id=? AND status='sin_envio')`,
  [org,org,org,org,org,org,org]);
 const t=rows(totals)[0]||[];
 const recent=(await listCampaigns(token,slug,{},deps)).campaigns.slice(0,5);
 return {kpis:{draftCampaigns:num(t[0]),scheduledCampaigns:num(t[1]),sentCampaigns:num(t[2]),segments:num(t[3]),
  totalSends:num(t[4]),deliveredSends:num(t[5]),unsentSends:num(t[6])},recentCampaigns:recent};
}
export {segmentMatchesClient};
