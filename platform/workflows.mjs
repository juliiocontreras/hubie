// Validated business inputs for Hubie operational workflows.
// All currency is stored as integer centavos; never floating point MXN.
const trimmed=(v,max=180)=>typeof v==='string'&&v.trim().length<=max?v.trim():null;
const positiveInt=(x,max=1_000_000_000)=>Number.isSafeInteger(x)&&x>=0&&x<=max;
const dateTime=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v)&&Number.isFinite(Date.parse(v))&&(new Date(v).toISOString()===v||new Date(v).toISOString().replace(/\.000Z$/,'Z')===v);
const entityId=value=>value===undefined||value===null||value===''?null:
 typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)?value:undefined;
export const dealStages=Object.freeze(['lead','qualified','proposal','negotiation','won','lost']);
export function normalizeDeal(input){
 const title=trimmed(input?.title);
 const customer=trimmed(input?.customer??'',160);
 const notes=trimmed(input?.notes??'',2000);
 const amountCents=input?.amountCents??0;
 const stage=input?.stage??'lead';
 const followUpAt=input?.followUpAt||null;
 const clientId=entityId(input?.clientId);
 if(!title||title.length<2||customer===null||notes===null||!positiveInt(amountCents,100_000_000_000)||!dealStages.includes(stage)||followUpAt!==null&&!dateTime(followUpAt)||clientId===undefined)throw Error('Invalid deal');
 return {title,customer,notes,amountCents,stage,followUpAt,clientId};
}
export function normalizeEvent(input){
 const title=trimmed(input?.title);
 const customer=trimmed(input?.customer??'',160);
 const resource=trimmed(input?.resource??'general',80)?.toLowerCase();
 const notes=trimmed(input?.notes??'',1000);
 const {startsAt,endsAt}=input??{};
 const clientId=entityId(input?.clientId),dealId=entityId(input?.dealId);
 const status=input?.status??'scheduled';
 if(!title||title.length<2||customer===null||!resource||notes===null||!dateTime(startsAt)||!dateTime(endsAt)||!['scheduled','completed','cancelled'].includes(status)||clientId===undefined||dealId===undefined)throw Error('Invalid appointment');
 const start=Date.parse(startsAt),end=Date.parse(endsAt);
 if(end<=start||end-start>7*86400000)throw Error('Invalid appointment');
 return {title,customer,resource,notes,startsAt:new Date(start).toISOString(),endsAt:new Date(end).toISOString(),status,clientId,dealId};
}
export function normalizeStockItem(input){
 const sku=trimmed(input?.sku,48)?.toUpperCase();
 const title=trimmed(input?.title);
 const location=trimmed(input?.location??'',120);
 const lowStock=input?.lowStock??0;
 if(!sku||! /^[A-Z0-9][A-Z0-9._-]{1,47}$/.test(sku)||!title||title.length<2||location===null||!positiveInt(lowStock))throw Error('Invalid inventory item');
 return {sku,title,location,lowStock};
}
export function normalizeStockUpdate(input){
 if(input===null||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!['title','location','lowStock'].includes(key)))throw Error('Invalid inventory item');
 const title=trimmed(input.title),location=trimmed(input.location??'',120),lowStock=input.lowStock??0;
 if(!title||title.length<2||location===null||!positiveInt(lowStock))throw Error('Invalid inventory item');
 return {title,location,lowStock};
}
export function normalizeStockMovement(input){
 const delta=input?.delta;
 const note=trimmed(input?.note??'',400);
 if(!Number.isSafeInteger(delta)||delta===0||Math.abs(delta)>1_000_000_000||note===null)throw Error('Invalid stock movement');
 return {delta,note};
}
