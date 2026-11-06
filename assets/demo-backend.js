// Browser-only demo adapter. NEVER sends user/tenant data to /api or Turso.
// Explicit ?demo=1 only; stored locally in this browser tab's sessionStorage.
const now=()=>new Date().toISOString();
const uuid=()=>globalThis.crypto?.randomUUID?.()||'demo-'+Math.random().toString(36).slice(2);
const copy=x=>structuredClone(x);
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const statuses=['prospect','active','inactive'];
const stages=['lead','qualified','proposal','negotiation','won','lost'];
const caseKinds=['general','commercial','contract','service','administrative'];
const caseStatuses=['open','in_progress','on_hold','completed'];
const appearanceDefaults={dashboardPreset:'hubie',sidebarPreset:'midnight',dashboardColor:'#eaf1ff',sidebarColor:'#10294b'};
const appearanceFields=Object.keys(appearanceDefaults);
const normalizeTheme=input=>{
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!appearanceFields.includes(k)))throw error('Invalid appearance');
 const theme={...appearanceDefaults,...input};
 if(!['hubie','pearl','silver','sand','custom'].includes(theme.dashboardPreset)||!['midnight','steel','platinum','graphite','custom'].includes(theme.sidebarPreset))throw error('Invalid appearance');
 if(!/^#[0-9a-fA-F]{6}$/.test(theme.dashboardColor)||!/^#[0-9a-fA-F]{6}$/.test(theme.sidebarColor))throw error('Invalid appearance');
 return theme;
};
const makeBackgrounds=t=>({dashboard:t?.dashboard||null,sidebar:t?.sidebar||null});
const dataUrl=media=>'data:'+media.mime+';base64,'+media.data;
const allowedMime=['image/png','image/jpeg','image/webp','application/pdf','text/plain','text/csv','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
const demoMedia=input=>{
 if(!allowedMime.includes(input?.mime)||typeof input?.data!=='string'||input.data.length>1500000||!/^[A-Za-z0-9+/=]+$/.test(input.data)||typeof input.filename!=='string')throw error('Invalid media');
 return {id:uuid(),filename:input.filename.slice(0,120),mime:input.mime,data:input.data,size:Math.floor(input.data.length*.75)};
};
const initialId=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
function createTenant(catalog,input,id=uuid()){
 const suite=catalog.suites.find(s=>s.id===input.suiteId);
 if(!suite||typeof input.name!=='string'||input.name.trim().length<2||!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(input.slug||''))throw error('Invalid tenant data');
 const selected=new Set(input.toolIds||catalog.tools.filter(t=>t.included).map(t=>t.id));
 if([...selected].some(code=>!catalog.tools.some(t=>t.id===code)))throw error('Invalid tenant data');
 return {id,appearance:{...appearanceDefaults},backgrounds:{dashboard:null,sidebar:null},uploads:[],slug:input.slug,name:input.name.trim(),displayName:input.name.trim(),suiteId:input.suiteId,status:'active',primaryColor:input.primaryColor||'#327ce7',secondaryColor:input.secondaryColor||'#55c1e5',timezone:'America/Mexico_City',logoUrl:null,
  tools:catalog.tools.map(t=>({...t,enabled:selected.has(t.id)})),
  members:[{id:'33333333-3333-4333-8333-333333333333',email:'superadmin@ejemplo.invalid',role:'owner',status:'active'}],
  clients:[],cases:[],caseEvents:[],deals:[],events:[],items:[],movements:[],generic:{}};
}
function initial(catalog){
 const first=createTenant(catalog,{name:'Comercio de demostración',slug:'comercio-demo',suiteId:'S004',toolIds:[...catalog.tools.filter(t=>t.included).map(t=>t.id),'T004','T013']},initialId[0]);
 const second=createTenant(catalog,{name:'Consultoría de demostración',slug:'consultoria-demo',suiteId:'S006'},initialId[1]);
 first.clients.push({id:uuid(),name:'Contacto de ejemplo',company:'Negocio ficticio',email:'ejemplo@correo.invalid',phone:'',status:'prospect',notes:'Datos ficticios para conocer la interfaz.'});
 first.cases.push({id:uuid(),clientId:first.clients[0].id,clientName:first.clients[0].name,title:'Expediente comercial de ejemplo',kind:'commercial',status:'open',notes:'Carpeta de demostración, sin datos de clientes reales.',createdAt:now(),updatedAt:now()});
 first.caseEvents.push({id:uuid(),caseId:first.cases[0].id,action:'created',description:'Expediente de demostración creado',createdAt:now()});
 first.deals.push({id:uuid(),title:'Oportunidad de demostración',customer:'Negocio ficticio',amountCents:250000,stage:'proposal',notes:'Operación simulada; no se realiza ningún cobro.',followUpAt:null});
 first.items.push({id:uuid(),sku:'DEMO-001',title:'Producto de muestra',location:'Almacén ficticio',quantity:8,lowStock:3});
 first.events.push({id:uuid(),title:'Reunión de ejemplo',customer:'Contacto ficticio',resource:'sala-1',startsAt:'2026-11-12T16:00:00.000Z',endsAt:'2026-11-12T17:00:00.000Z',status:'scheduled',notes:''});
 second.clients.push({id:uuid(),name:'Otro contacto de ejemplo',company:'Otra empresa',email:'otro@correo.invalid',phone:'',status:'active',notes:''});
 return {platformAppearance:{...appearanceDefaults},platformBackgrounds:{dashboard:null,sidebar:null},tenants:[first,second]};
}
export function createDemoStore(catalog,{load=()=>null,save=()=>{}}={}){
 let state=load();
 if(!state||!Array.isArray(state.tenants))state=initial(catalog);
 state.platformAppearance=normalizeTheme(state.platformAppearance||{});
 for(const tenant of state.tenants)tenant.appearance=normalizeTheme(tenant.appearance||{});
 state.platformBackgrounds=makeBackgrounds(state.platformBackgrounds);
 for(const tenant of state.tenants){
  tenant.backgrounds=makeBackgrounds(tenant.backgrounds);tenant.uploads=Array.isArray(tenant.uploads)?tenant.uploads:[];
  tenant.cases=Array.isArray(tenant.cases)?tenant.cases:[];tenant.caseEvents=Array.isArray(tenant.caseEvents)?tenant.caseEvents:[];
 }
 const sync=()=>save(copy(state));
 const tenantById=id=>{const t=state.tenants.find(t=>t.id===id);if(!t)throw error('Not found',404);return t;};
 const tenantBySlug=slug=>{const t=state.tenants.find(t=>t.slug===slug&&t.status==='active');if(!t)throw error('Not found',404);return t;};
 const allowed=(t,id)=>{if(!t.tools.some(x=>x.id===id&&x.enabled))throw error('Tool disabled',403);};
 const bodyOf=o=>{try{return typeof o.body==='string'?JSON.parse(o.body):o.body||{};}catch{throw error('Invalid JSON');}};
 const getRecord=(items,id)=>{const found=items.find(r=>r.id===id);if(!found)throw error('Not found',404);return found;};
 const emit=v=>copy(v);
 async function request(path,options={}){
  const url=new URL(path,'https://hubie-demo.invalid');
  const p=url.pathname,method=(options.method||'GET').toUpperCase(),input=bodyOf(options);
  const send=data=>{sync();return emit(data);};
  // Media endpoints deliberately never call the network: demo storage belongs to this tab only.
  const platformMedia=p.match(/^\/api\/admin\/media\/(dashboard|sidebar)$/);
  const adminMedia=p.match(/^\/api\/admin\/tenants\/([0-9a-f-]+)\/media\/(dashboard|sidebar)$/);
  const suiteMedia=p.match(/^\/api\/app\/([a-z0-9-]+)\/media\/(dashboard|sidebar)$/);
  if(platformMedia||adminMedia||suiteMedia){
   const target=platformMedia?state.platformBackgrounds:adminMedia?tenantById(adminMedia[1]).backgrounds:tenantBySlug(suiteMedia[1]).backgrounds;
   const kind=(platformMedia||adminMedia||suiteMedia)[platformMedia?1:2];
   if(method==='POST'){
    const file=demoMedia(input);
    if(!file.mime.startsWith('image/')||file.size>900000)throw error('Invalid media');
    target[kind]=dataUrl(file);return send({backgrounds:makeBackgrounds(target)});
   }
   if(method==='DELETE'){target[kind]=null;return send({backgrounds:makeBackgrounds(target),removed:true});}
   throw error('Not found',404);
  }
  const filesPath=p.match(/^\/api\/app\/([a-z0-9-]+)\/tools\/([A-Z][0-9]{3})\/records\/([a-z0-9-]+)\/attachments$/);
  if(filesPath){
   const tenant=tenantBySlug(filesPath[1]),tool=filesPath[2],recordId=filesPath[3];allowed(tenant,tool);
   const items=tenant.uploads.filter(x=>x.toolId===tool&&x.recordId===recordId);
   if(method==='GET')return emit({attachments:items.map(({id,filename,mime,size})=>({id,filename,mime,bytes:size,downloadUrl:'/api/app/'+tenant.slug+'/attachments/'+id}))});
   if(method==='POST'){
    const media=demoMedia(input);if(media.size>650000||items.length>=12)throw error('Storage quota exceeded');
    const list={C001:tenant.clients,C002:tenant.deals,C003:tenant.cases.filter(c=>!c.archivedAt),C004:tenant.events,C005:tenant.items}[tool]||tenant.generic[tool]||[];
    if(!list.some(x=>x.id===recordId))throw error('Not found',404);
    tenant.uploads.push({...media,toolId:tool,recordId});
    if(tool==='C003')tenant.caseEvents.unshift({id:uuid(),caseId:recordId,action:'document_added',description:media.filename,createdAt:now()});
    return send({attachment:{id:media.id,filename:media.filename,bytes:media.size}});
   }
  }
  const filePath=p.match(/^\/api\/app\/([a-z0-9-]+)\/attachments\/([a-z0-9-]+)$/);
  if(filePath){
   const tenant=tenantBySlug(filePath[1]),file=tenant.uploads.find(x=>x.id===filePath[2]);
   if(!file)throw error('Not found',404);
   allowed(tenant,file.toolId);
   if(method==='GET')return emit({file:{filename:file.filename,mime:file.mime,data:file.data}});
   if(method==='DELETE'){
    tenant.uploads=tenant.uploads.filter(x=>x.id!==file.id);
    if(file.toolId==='C003')tenant.caseEvents.unshift({id:uuid(),caseId:file.recordId,action:'document_removed',description:file.filename,createdAt:now()});
    return send({removed:true});
   }
  }
  if(p==='/api/admin/appearance'){
   if(method==='GET')return emit({appearance:state.platformAppearance,backgrounds:state.platformBackgrounds});
   if(method==='PUT'){state.platformAppearance=normalizeTheme(input);return send({appearance:state.platformAppearance,backgrounds:state.platformBackgrounds});}
  }
  const themePath=p.match(/^\/api\/admin\/tenants\/([a-z0-9-]+)\/appearance$/);
  if(themePath&&method==='PUT'){
    const tenant=tenantById(themePath[1]);tenant.appearance=normalizeTheme(input);
    return send({appearance:tenant.appearance,backgrounds:tenant.backgrounds});
  }
  const ownAppearancePath=p.match(/^\/api\/app\/([a-z0-9-]+)\/appearance$/);
  if(ownAppearancePath&&method==='PUT'){
    const tenant=tenantBySlug(ownAppearancePath[1]);tenant.appearance=normalizeTheme(input);
    return send({appearance:tenant.appearance});
  }
  if(p==='/api/admin/catalog'&&method==='GET')return emit({catalog});
  if(p==='/api/admin/tenants'){
   if(method==='GET')return emit({tenants:state.tenants.map(({id,slug,name,status,suiteId})=>({id,slug,name,status,suiteId}))});
   if(method==='POST'){
    if(state.tenants.some(t=>t.slug===input.slug))throw error('Identificador ocupado',409);
    const t=createTenant(catalog,input);state.tenants.unshift(t);
    return send({tenant:{id:t.id,slug:t.slug,name:t.name,suiteId:t.suiteId}});
   }
  }
  let m=p.match(/^\/api\/admin\/tenants\/([a-z0-9-]+)(?:\/(tools\/([A-Z][0-9]{3})|members(?:\/([a-z0-9-]+))?))?$/);
  if(m){
   const t=tenantById(m[1]);
   if(m[3]&&method==='PUT'){
    const tool=t.tools.find(x=>x.id===m[3]);if(!tool||typeof input.enabled!=='boolean')throw error('Invalid tenant data');
    tool.enabled=input.enabled;return send({tool:{toolId:tool.id,enabled:tool.enabled}});
   }
   if(m[2]?.startsWith('members')){
    if(m[4]&&method==='PATCH'){
     const member=getRecord(t.members,m[4]);if(member.role==='owner')throw error('Forbidden',403);
     if(!['active','suspended'].includes(input.status))throw error('Invalid tenant data');
     member.status=input.status;return send({members:t.members});
    }
    if(method==='GET')return emit({members:t.members});
    if(method==='POST'){
     const email=String(input.email||'').trim().toLowerCase();
     if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!['admin','member','viewer'].includes(input.role))throw error('Invalid tenant data');
     const member=t.members.find(x=>x.email===email);
     if(member){member.status='active';if(member.role!=='owner')member.role=input.role;}
     else t.members.push({id:uuid(),email,role:input.role,status:'active'});
     return send({members:t.members});
    }
   }
   if(!m[2]&&method==='GET')return emit({tenant:t});
   if(!m[2]&&method==='PATCH'){
    if(input.suiteId&&!catalog.suites.some(s=>s.id===input.suiteId))throw error('Invalid tenant data');
    Object.assign(t,Object.fromEntries(Object.entries(input).filter(([key])=>['name','displayName','suiteId','primaryColor','secondaryColor','status','logoUrl'].includes(key))));
    return send({tenant:t});
   }
  }
  if(p==='/api/app/organizations'&&method==='GET')return emit({organizations:state.tenants.filter(t=>t.status==='active').map(t=>({slug:t.slug,name:t.name,role:'owner',suiteId:t.suiteId}))});
  m=p.match(/^\/api\/app\/([a-z0-9-]+)\/config$/);
  if(m&&method==='GET'){
   const t=tenantBySlug(m[1]);const suite=catalog.suites.find(s=>s.id===t.suiteId);
   return emit({tenant:{id:t.id,slug:t.slug,name:t.name,role:'owner',displayName:t.displayName,logoUrl:t.logoUrl,primaryColor:t.primaryColor,secondaryColor:t.secondaryColor,timezone:t.timezone,suiteId:t.suiteId,suiteName:suite?.name||t.suiteId},
    appearance:t.appearance,backgrounds:t.backgrounds,tools:t.tools.filter(x=>x.enabled),members:t.members.filter(x=>x.status==='active').map(x=>({email:x.email,role:x.role}))});
  }
  m=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/cases(?:\/([a-z0-9-]+))?(?:\/(history))?$/);
  if(m){
   const tenant=tenantBySlug(m[1]),id=m[2],action=m[3];allowed(tenant,'C003');
   const active=tenant.cases.filter(c=>!c.archivedAt);
   if(method==='GET'&&!id)return emit({
    cases:active.map(c=>({...c,clientName:tenant.clients.find(x=>x.id===c.clientId)?.name||c.clientName||'Cliente archivado',
      documentsCount:tenant.uploads.filter(x=>x.toolId==='C003'&&x.recordId===c.id).length})),
    clients:tenant.clients.map(c=>({id:c.id,name:c.name,company:c.company,email:c.email})),
    kinds:caseKinds,statuses:caseStatuses
   });
   if(method==='GET'&&action==='history'){
    getRecord(active,id);
    return emit({events:tenant.caseEvents.filter(x=>x.caseId===id)});
   }
   const normalize=(value,updating=false)=>{
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!(updating?['title','kind','status','notes']:['clientId','title','kind','status','notes']).includes(k)))throw error('Invalid case');
    const title=String(value.title??'').trim(),kind=value.kind||'general',status=value.status||'open',notes=String(value.notes??'').trim();
    if(title.length<1||title.length>180||!caseKinds.includes(kind)||!caseStatuses.includes(status)||notes.length>2000)throw error('Invalid case');
    return {title,kind,status,notes};
   };
   if(method==='POST'&&!id){
    const client=tenant.clients.find(c=>c.id===input.clientId);
    if(!client)throw error('Client not found',404);
    const obj={id:uuid(),clientId:client.id,clientName:client.name,...normalize(input),createdAt:now(),updatedAt:now()};
    tenant.cases.unshift(obj);
    tenant.caseEvents.unshift({id:uuid(),caseId:obj.id,action:'created',description:'Expediente registrado',createdAt:now()});
    return send({case:obj});
   }
   if(id&&!action&&method==='PATCH'){
    const c=getRecord(active,id);Object.assign(c,normalize(input,true),{updatedAt:now()});
    tenant.caseEvents.unshift({id:uuid(),caseId:c.id,action:'updated',description:'Expediente actualizado',createdAt:now()});
    return send({case:c});
   }
   if(id&&!action&&method==='DELETE'){
    const c=getRecord(active,id);c.archivedAt=now();
    tenant.caseEvents.unshift({id:uuid(),caseId:c.id,action:'archived',description:'Expediente archivado',createdAt:now()});
    return send({archived:true});
   }
   throw error('Not found',404);
  }
  m=p.match(/^\/api\/app\/([a-z0-9-]+)\/tools\/([A-Z][0-9]{3})\/records(?:\/([a-z0-9-]+))?$/);
  if(m){
   const t=tenantBySlug(m[1]),tool=m[2],id=m[3];allowed(t,tool);
   if(tool==='C008'&&method==='GET'){
    const counts={C001:t.clients.length,C002:t.deals.length,C003:t.cases.filter(c=>!c.archivedAt).length,C004:t.events.length,C005:t.items.length};
    for(const [key,list]of Object.entries(t.generic))counts[key]=list.length;
    return emit({dashboard:true,counts:Object.fromEntries(Object.entries(counts).filter(([key])=>t.tools.some(x=>x.id===key&&x.enabled)))});
   }
   if(tool==='C009')throw error('Read members in tenant config');
   const list=t.generic[tool]??(t.generic[tool]=[]);
   if(method==='GET')return emit({records:list});
   if(method==='POST'){
    const r={id:uuid(),title:String(input.title||'').trim(),status:input.status||'active',fields:input.fields||{},createdAt:now(),updatedAt:now()};
    if(!r.title)throw error('Invalid record');
    list.unshift(r);return send({record:r});
   }
   const record=getRecord(list,id);
   if(method==='DELETE'){list.splice(list.indexOf(record),1);return send({archived:true});}
   if(method==='PATCH'){Object.assign(record,{title:input.title??record.title,status:input.status??record.status,fields:input.fields??record.fields,updatedAt:now()});return send({record});}
  }
  m=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/(clients|crm|agenda|inventory)(?:\/([a-z0-9-]+))?(?:\/(movements))?$/);
  if(m){
   const t=tenantBySlug(m[1]),module=m[2],id=m[3],movement=m[4];
   const tool={clients:'C001',crm:'C002',agenda:'C004',inventory:'C005'}[module];allowed(t,tool);
   const list={clients:t.clients,crm:t.deals,agenda:t.events,inventory:t.items}[module];
   if(method==='GET'){
    if(module==='clients')return emit({clients:list,statuses});
    if(module==='crm')return emit({deals:list,stages});
    if(module==='agenda')return emit({events:list});
    return emit({items:list.map(i=>({...i,isLow:i.quantity<=i.lowStock})),movements:t.movements});
   }
   if(module==='inventory'&&movement==='movements'&&method==='POST'){
    const item=getRecord(list,id),delta=input.delta;
    if(!Number.isSafeInteger(delta)||!delta)throw error('Invalid stock movement');
    if(item.quantity+delta<0)throw error('Insufficient stock',409);
    item.quantity+=delta;
    const m={id:uuid(),itemId:item.id,delta,note:String(input.note||'').slice(0,400),createdAt:now()};
    t.movements.unshift(m);return send({movement:m});
   }
   if(module==='clients'){
    const client={name:String(input.name||'').trim(),company:String(input.company||''),email:String(input.email||'').trim().toLowerCase(),phone:String(input.phone||''),status:input.status||'prospect',notes:String(input.notes||'')};
    if(client.name.length<2||!statuses.includes(client.status))throw error('Invalid client');
    if(client.email&&list.some(x=>x.email===client.email&&x.id!==id))throw error('Duplicate client email',409);
    if(method==='POST'){const c={id:uuid(),...client};list.unshift(c);return send({client:c});}
    if(method==='PATCH'){Object.assign(getRecord(list,id),client);return send({ok:true});}
    if(method==='DELETE'){const rec=getRecord(list,id);list.splice(list.indexOf(rec),1);return send({archived:true});}
   }
   if(module==='crm'){
    if(method==='DELETE'){const rec=getRecord(list,id);list.splice(list.indexOf(rec),1);return send({archived:true});}
    if(method==='PATCH'&&Object.keys(input).length===1&&input.stage){if(!stages.includes(input.stage))throw error('Invalid deal');getRecord(list,id).stage=input.stage;return send({ok:true});}
    const deal={title:String(input.title||'').trim(),customer:String(input.customer||''),amountCents:input.amountCents??0,stage:input.stage||'lead',followUpAt:input.followUpAt||null,notes:String(input.notes||'')};
    if(deal.title.length<2||!stages.includes(deal.stage)||!Number.isSafeInteger(deal.amountCents)||deal.amountCents<0)throw error('Invalid deal');
    if(method==='POST'){const d={id:uuid(),...deal};list.unshift(d);return send({deal:d});}
    if(method==='PATCH'){Object.assign(getRecord(list,id),deal);return send({ok:true});}
   }
   if(module==='agenda'){
    if(method==='PATCH'&&Object.keys(input).length===1&&['completed','cancelled'].includes(input.status)){getRecord(list,id).status=input.status;return send({ok:true});}
    const event={title:String(input.title||'').trim(),customer:String(input.customer||''),resource:String(input.resource||'general').trim().toLowerCase(),startsAt:input.startsAt,endsAt:input.endsAt,status:input.status||'scheduled',notes:String(input.notes||'')};
    if(event.title.length<2||!Number.isFinite(Date.parse(event.startsAt))||!Number.isFinite(Date.parse(event.endsAt))||event.endsAt<=event.startsAt)throw error('Invalid appointment');
    if(event.status==='scheduled'&&list.some(x=>x.id!==id&&x.status==='scheduled'&&x.resource===event.resource&&x.startsAt<event.endsAt&&x.endsAt>event.startsAt))throw error('Schedule conflict',409);
    if(method==='POST'){const e={id:uuid(),...event};list.unshift(e);return send({event:e});}
    if(method==='PATCH'){Object.assign(getRecord(list,id),event);return send({ok:true});}
   }
   if(module==='inventory'){
    if(method==='POST'){
     const sku=String(input.sku||'').trim().toUpperCase(),title=String(input.title||'').trim();
     if(!sku||title.length<2||list.some(x=>x.sku===sku))throw error('Duplicate SKU',409);
     const item={id:uuid(),sku,title,quantity:0,lowStock:Number(input.lowStock)||0,location:String(input.location||'')};list.push(item);return send({item});
    }
    if(method==='PATCH'){
     const item=getRecord(list,id);
     Object.assign(item,{title:input.title??item.title,location:input.location??item.location,lowStock:input.lowStock??item.lowStock});
     return send({ok:true});
    }
   }
  }
  throw error('Not found',404);
 }
 return {request};
}
let active=null;
export async function demoRequest(path,options={}){
 if(!active){
  const response=await fetch('/assets/catalog.json',{cache:'no-store'});
  if(!response.ok)throw error('No fue posible consultar el catálogo',503);
  const catalog=await response.json();
  const key='hubie-demo-browser-v1';
  let storage=null;
  try{storage=sessionStorage;}catch{}
  const load=()=>{try{return JSON.parse(storage?.getItem(key)||'null');}catch{return null;}};
  const save=state=>{try{storage?.setItem(key,JSON.stringify(state));}catch{}};
  active=createDemoStore(catalog,{load,save});
 }
 return active.request(path,options);
}
