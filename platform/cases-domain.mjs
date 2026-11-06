// C003 Expedientes: a case is always attached to a real, same-tenant C001 client.
export const caseKinds=Object.freeze(['general','commercial','contract','service','administrative']);
export const caseStatuses=Object.freeze(['open','in_progress','on_hold','completed']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const keys=['clientId','title','kind','status','notes'];
const requiredString=(v,max)=>typeof v==='string'&&v.trim().length>0&&v.trim().length<=max;
export function normalizeCase(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!keys.includes(k)))throw Error('Invalid case');
 const clientId=input.clientId;
 const title=typeof input.title==='string'?input.title.trim():'';
 const kind=input.kind??'general',status=input.status??'open',notes=typeof input.notes==='string'?input.notes.trim():input.notes??'';
 if(!uuid.test(clientId||'')||!requiredString(title,180)||!caseKinds.includes(kind)||!caseStatuses.includes(status)||typeof notes!=='string'||notes.length>2000)throw Error('Invalid case');
 return {clientId,title,kind,status,notes};
}
export function normalizeCaseUpdate(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['title','kind','status','notes'].includes(k))||Object.keys(input).length<1)throw Error('Invalid case');
 const title=typeof input.title==='string'?input.title.trim():'';
 const kind=input.kind,status=input.status,notes=input.notes;
 if(!requiredString(title,180)||!caseKinds.includes(kind)||!caseStatuses.includes(status)||typeof notes!=='string'||notes.length>2000)throw Error('Invalid case');
 return {title,kind,status,notes:notes.trim()};
}
