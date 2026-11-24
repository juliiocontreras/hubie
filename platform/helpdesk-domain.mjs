
// T028 Mesa de ayuda: validación/normalización pura, sin acceso a BD.
// Estilo de training-domain.mjs: funciones puras que lanzan
// 'Invalid ...' con claves estrictas (sin campos extra).
export const TICKET_STATUSES=new Set(['abierto','en curso','en espera','resuelto','cerrado']);
export const TICKET_PRIORITIES=new Set(['baja','media','alta','urgente']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
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
function optId(v,label){
 if(v===undefined||v===null)return null;
 if(typeof v!=='string'||!uuid.test(v))throw Error(label);
 return v;
}
export function normalizeTicket(input){
 strictKeys(input,['subject','description','clientId','status','priority','assigneeUserId'],'Invalid ticket');
 return {
  subject:reqStr(input.subject,3,200),
  description:str(input.description,4000),
  clientId:optId(input.clientId,'Invalid ticket'),
  status:input.status===undefined?'abierto':TICKET_STATUSES.has(input.status)?input.status:(()=>{throw Error('Invalid ticket');})(),
  priority:input.priority===undefined?'media':TICKET_PRIORITIES.has(input.priority)?input.priority:(()=>{throw Error('Invalid ticket');})(),
  assigneeUserId:optId(input.assigneeUserId,'Invalid ticket')
 };
}
export function normalizeReply(input){
 strictKeys(input,['ticketId','body'],'Invalid reply');
 if(typeof input.ticketId!=='string'||!uuid.test(input.ticketId))throw Error('Invalid reply');
 return {ticketId:input.ticketId,body:reqStr(input.body,1,4000)};
}
