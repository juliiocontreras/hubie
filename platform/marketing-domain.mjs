import {clientStatuses} from './clients-domain.mjs';
// T029 Marketing: validación/normalización pura, sin acceso a BD.
// Estilo de training-domain.mjs: funciones puras que lanzan 'Invalid ...'
// con claves estrictas (sin campos extra).
//
// Segmentos: solo con campos que existen en tenant_client_profiles (C001):
// status (prospect/active/inactive) y company (texto libre). No hay ciudad
// ni etiquetas en clientes: no se inventan campos de segmentación.
export const CAMPAIGN_STATUSES=new Set(['borrador','programada','enviada']);
export const SEND_STATUSES=new Set(['pendiente','enviado','fallido','sin_envio']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const email=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function strictKeys(input,allowed,label){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!allowed.includes(k)))throw Error(label);
}
function str(v,max,def=''){
 if(v===undefined||v===null)return def;
 if(typeof v!=='string')throw Error('Invalid value');
 const t=v.trim();
 if(t.length>max)throw Error('Invalid value');
 return t;
}
function reqStr(v,min,max){
 const t=str(v,max);
 if(t.length<min)throw Error('Invalid value');
 return t;
}
export function normalizeSegment(input){
 strictKeys(input,['name','description','status','companyContains'],'Invalid segment');
 const status=input.status===undefined||input.status===null?'':input.status;
 if(typeof status!=='string'||(status!==''&&!clientStatuses.includes(status)))throw Error('Invalid segment');
 return {
  name:reqStr(input.name,2,120),
  description:str(input.description,2000),
  status,
  companyContains:str(input.companyContains,160)
 };
}
// Un cliente pertenece al segmento si cumple TODAS las reglas con valor:
// status igual y company contiene el texto (insensible a mayúsculas).
// Segmento sin reglas = todos los clientes.
export function segmentMatchesClient(segment,client){
 if(!segment||!client||typeof client!=='object')return false;
 if(segment.status&&client.status!==segment.status)return false;
 if(segment.companyContains){
  const needle=String(segment.companyContains).toLowerCase();
  if(!String(client.company||'').toLowerCase().includes(needle))return false;
 }
 return true;
}
export function normalizeCampaign(input){
 strictKeys(input,['name','subject','content','segmentId','scheduledAt','status'],'Invalid campaign');
 let segmentId=null;
 if(input.segmentId!==undefined&&input.segmentId!==null&&input.segmentId!==''){
  if(typeof input.segmentId!=='string'||!uuid.test(input.segmentId))throw Error('Invalid campaign');
  segmentId=input.segmentId;
 }
 let scheduledAt=null;
 if(input.scheduledAt!==undefined&&input.scheduledAt!==null&&input.scheduledAt!==''){
  if(typeof input.scheduledAt!=='string'||Number.isNaN(Date.parse(input.scheduledAt)))throw Error('Invalid campaign');
  scheduledAt=input.scheduledAt;
 }
 return {
  name:reqStr(input.name,2,140),
  subject:reqStr(input.subject,2,200),
  content:str(input.content,20000),
  segmentId,
  scheduledAt,
  status:input.status===undefined?'borrador':CAMPAIGN_STATUSES.has(input.status)?input.status:(()=>{throw Error('Invalid campaign');})()
 };
}
export function isSendableStatus(status){
 return status==='borrador'||status==='programada';
}
// Destinatarios de una campaña: clientes del segmento (o todos si la
// campaña no tiene segmento) que tengan correo válido.
export function campaignRecipients(segment,clients){
 const list=(clients||[]).filter(c=>c&&typeof c.email==='string'&&email.test(c.email.trim().toLowerCase()));
 const scoped=segment?list.filter(c=>segmentMatchesClient(segment,c)):list;
 return scoped.map(c=>({clientId:c.id||null,name:c.name||'',email:c.email.trim().toLowerCase(),company:c.company||'',status:c.status||''}));
}
