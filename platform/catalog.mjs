import {readFileSync} from 'node:fs';
const source=JSON.parse(readFileSync(new URL('../assets/catalog.json',import.meta.url),'utf8'));
// Catalog version 2 is the project's confirmed Hubie Tabla Datos Simple v5.
// Do not derive prices from data/suites.json (an incompatible older catalogue).
export const catalog=Object.freeze(source);
const suiteMap=new Map(catalog.suites.map(s=>[s.id,s]));
const toolMap=new Map(catalog.tools.map(t=>[t.id,t]));
export const getSuite=id=>suiteMap.get(id)||null;
export const getTool=id=>toolMap.get(id)||null;
const slugOk=value=>typeof value==='string'&&/^[a-z0-9](?:[a-z0-9-]{1,61})[a-z0-9]$/.test(value);
const colorOk=value=>typeof value==='string'&&/^#[0-9a-fA-F]{6}$/.test(value);
export function defaultToolIds(){return catalog.tools.filter(t=>t.included).map(t=>t.id);}
export function normalizeTenantInput(input){
 const name=typeof input?.name==='string'?input.name.trim():'';
 const slug=typeof input?.slug==='string'?input.slug.trim().toLowerCase():'';
 const suiteId=input?.suiteId;
 const primaryColor=input?.primaryColor??'#7c5cfc';
 const secondaryColor=input?.secondaryColor??'#ec4899';
 const displayName=typeof input?.displayName==='string'?input.displayName.trim():name;
 const toolIds=input?.toolIds===undefined?defaultToolIds():input.toolIds;
 if(name.length<2||name.length>160||displayName.length<2||displayName.length>160||!slugOk(slug)||!getSuite(suiteId)||!colorOk(primaryColor)||!colorOk(secondaryColor)||!Array.isArray(toolIds)||toolIds.length>catalog.tools.length||toolIds.some(id=>!getTool(id))||new Set(toolIds).size!==toolIds.length)throw Error('Invalid tenant data');
 return {name,slug,suiteId,displayName,primaryColor,secondaryColor,toolIds};
}
export function resolveEnabledTools(enabledIds){
 if(!Array.isArray(enabledIds)||enabledIds.some(id=>!getTool(id)))throw Error('Invalid tenant data');
 const enabled=new Set(enabledIds);
 return catalog.tools.map(({id})=>({toolId:id,enabled:enabled.has(id)?1:0}));
}
const statusValues=new Set(['new','draft','active','pending','in_progress','scheduled','completed','cancelled','won','lost','archived']);
export function validateRecord(input){
 const title=typeof input?.title==='string'?input.title.trim():'';
 const status=input?.status??'active';
 const fields=input?.fields??{};
 if(!title||title.length>180||!statusValues.has(status)||!fields||typeof fields!=='object'||Array.isArray(fields))throw Error('Invalid record');
 const keys=Object.keys(fields);
 if(keys.length>40)throw Error('Invalid record');
 const safe=Object.create(null);
 for(const key of keys){
  if(!/^[a-z][a-z0-9_]{0,49}$/.test(key)||['__proto__','constructor','prototype'].includes(key))throw Error('Invalid record');
  const value=fields[key];
  if(!['string','number','boolean'].includes(typeof value)||typeof value==='string'&&value.length>4000||typeof value==='number'&&!Number.isFinite(value))throw Error('Invalid record');
  safe[key]=typeof value==='string'?value.trim():value;
 }
 if(Buffer.byteLength(JSON.stringify(safe),'utf8')>12000)throw Error('Invalid record');
 return {title,status,fields:safe};
}
