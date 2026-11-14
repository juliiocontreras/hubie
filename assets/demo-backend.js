// Browser-only demo adapter. NEVER sends user/tenant data to /api or Turso.
// Explicit ?demo=1 only; stored locally in this browser tab's sessionStorage.
const now=()=>new Date().toISOString();
const uuid=()=>globalThis.crypto?.randomUUID?.()||'demo-'+Math.random().toString(36).slice(2);
const copy=x=>structuredClone(x);
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const statuses=['prospect','active','inactive'];
const validExpiry=d=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return false;const x=new Date(d+'T00:00:00Z');return !isNaN(x.getTime())&&x.toISOString().slice(0,10)===d;};
const stages=['lead','qualified','proposal','negotiation','won','lost'];
const caseKinds=['general','commercial','contract','service','administrative'];
const caseStatuses=['open','in_progress','on_hold','completed'];
const appearanceDefaults={dashboardPreset:'hubie',sidebarPreset:'midnight',dashboardColor:'#f6f7fb',sidebarColor:'#16123a'};
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
 if(!allowedMime.includes(input?.mime)||typeof input?.data!=='string'||input.data.length>2700000||!/^[A-Za-z0-9+/=]+$/.test(input.data)||typeof input.filename!=='string')throw error('Invalid media');
 return {id:uuid(),filename:input.filename.slice(0,120),mime:input.mime,data:input.data,size:Math.floor(input.data.length*.75)};
};
const initialId=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
function createTenant(catalog,input,id=uuid()){
 const suite=catalog.suites.find(s=>s.id===input.suiteId);
 if(!suite||typeof input.name!=='string'||input.name.trim().length<2||!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(input.slug||''))throw error('Invalid tenant data');
 const selected=new Set(input.toolIds||catalog.tools.filter(t=>t.included).map(t=>t.id));
 if([...selected].some(code=>!catalog.tools.some(t=>t.id===code)))throw error('Invalid tenant data');
 return {id,appearance:{...appearanceDefaults},backgrounds:{dashboard:null,sidebar:null},uploads:[],slug:input.slug,name:input.name.trim(),displayName:input.name.trim(),suiteId:input.suiteId,status:'active',primaryColor:input.primaryColor||'#7c5cfc',secondaryColor:input.secondaryColor||'#ec4899',timezone:'America/Mexico_City',logoUrl:null,
  tools:catalog.tools.map(t=>({...t,enabled:selected.has(t.id)})),
  members:[{id:'33333333-3333-4333-8333-333333333333',email:'superadmin@ejemplo.invalid',role:'owner',status:'active'}],
  clients:[],cases:[],caseEvents:[],caseDocumentMeta:{},entityLinks:[],deals:[],events:[],items:[],movements:[],
  quotes:[],catalogItems:[],expenses:[],payments:[],invoices:[],generic:{}};
}
function initial(catalog){
 const first=createTenant(catalog,{name:'Comercio de demostración',slug:'comercio-demo',suiteId:'S004',toolIds:[...catalog.tools.filter(t=>t.included).map(t=>t.id),'T004','T013']},initialId[0]);
 const second=createTenant(catalog,{name:'Consultoría de demostración',slug:'consultoria-demo',suiteId:'S006'},initialId[1]);
 first.clients.push({id:uuid(),name:'Contacto de ejemplo',company:'Negocio ficticio',email:'ejemplo@correo.invalid',phone:'',status:'prospect',notes:'Datos ficticios para conocer la interfaz.'});
 first.cases.push({id:uuid(),clientId:first.clients[0].id,clientName:first.clients[0].name,title:'Expediente comercial de ejemplo',kind:'commercial',status:'open',notes:'Carpeta de demostración, sin datos de clientes reales.',createdAt:now(),updatedAt:now()});
 first.caseEvents.push({id:uuid(),caseId:first.cases[0].id,action:'created',description:'Expediente de demostración creado',createdAt:now()});
 first.deals.push({id:uuid(),title:'Oportunidad de demostración',customer:'Negocio ficticio',clientId:first.clients[0].id,amountCents:250000,stage:'proposal',notes:'Operación simulada; no se realiza ningún cobro.',followUpAt:null});
 first.items.push({id:uuid(),sku:'DEMO-001',title:'Producto de muestra',location:'Almacén ficticio',quantity:8,lowStock:3});
 first.events.push({id:uuid(),title:'Reunión de ejemplo',customer:'Contacto ficticio',clientId:first.clients[0].id,dealId:first.deals[0].id,resource:'sala-1',startsAt:'2026-11-12T16:00:00.000Z',endsAt:'2026-11-12T17:00:00.000Z',status:'scheduled',notes:''});
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
  tenant.quotes=Array.isArray(tenant.quotes)?tenant.quotes:[];tenant.catalogItems=Array.isArray(tenant.catalogItems)?tenant.catalogItems:[];
  tenant.expenses=Array.isArray(tenant.expenses)?tenant.expenses:[];tenant.payments=Array.isArray(tenant.payments)?tenant.payments:[];
  tenant.invoices=Array.isArray(tenant.invoices)?tenant.invoices:[];
  tenant.cases=Array.isArray(tenant.cases)?tenant.cases:[];tenant.caseEvents=Array.isArray(tenant.caseEvents)?tenant.caseEvents:[];tenant.caseDocumentMeta=tenant.caseDocumentMeta&&typeof tenant.caseDocumentMeta==='object'?tenant.caseDocumentMeta:{};tenant.entityLinks=Array.isArray(tenant.entityLinks)?tenant.entityLinks:[];
  if(tenant.slug==='comercio-demo'){
   const sampleClient=tenant.clients.find(c=>c.name==='Contacto de ejemplo');
   const sampleDeal=tenant.deals.find(d=>d.title==='Oportunidad de demostración');
   const sampleAppointment=tenant.events.find(e=>e.title==='Reunión de ejemplo');
   if(sampleClient&&sampleDeal&&!sampleDeal.clientId)sampleDeal.clientId=sampleClient.id;
   if(sampleClient&&sampleAppointment&&!sampleAppointment.clientId)sampleAppointment.clientId=sampleClient.id;
   if(sampleDeal&&sampleAppointment&&!sampleAppointment.dealId)sampleAppointment.dealId=sampleDeal.id;
  }
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
  const registry=tool=>({C001:'clients',C002:'deals',C003:'cases',C004:'events',C005:'items'})[tool];
  const entityList=(tenant,tool)=>{
   if(!catalog.tools.some(item=>item.id===tool)||['C008','C009'].includes(tool))throw error('Not found',404);
   const key=registry(tool);
   const list=key?tenant[key]:(tenant.generic[tool]||[]);
   return list.filter(x=>!x.archivedAt);
  };
  const entity=(tenant,tool,id)=>getRecord(entityList(tenant,tool),id);
  const canonical=(aTool,aId,bTool,bId)=>{
   if(aTool===bTool&&aId===bId)throw error('Invalid relation');
   const left=aTool+':'+aId,right=bTool+':'+bId;
   return left<right?[aTool,aId,bTool,bId]:[bTool,bId,aTool,aId];
  };
  const clientSummaryRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/clients\/([a-z0-9-]+)\/summary$/);
  if(clientSummaryRoute&&method==='GET'){
   const tenant=tenantBySlug(clientSummaryRoute[1]);allowed(tenant,'C001');
   const client=entity(tenant,'C001',clientSummaryRoute[2]);
   const enable=tool=>tenant.tools.some(x=>x.id===tool&&x.enabled);
   const deals=enable('C002')?entityList(tenant,'C002').filter(x=>x.clientId===client.id).map(x=>({id:x.id,title:x.title,stage:x.stage,amountCents:x.amountCents,followUpAt:x.followUpAt})):[];
   const cases=enable('C003')?entityList(tenant,'C003').filter(x=>x.clientId===client.id).map(x=>({id:x.id,title:x.title,kind:x.kind,status:x.status,updatedAt:x.updatedAt})):[];
   const appointments=enable('C004')?entityList(tenant,'C004').filter(x=>x.clientId===client.id).map(x=>({id:x.id,title:x.title,startsAt:x.startsAt,status:x.status})):[];
   return emit({client,deals,cases,appointments,counts:{deals:deals.length,cases:cases.length,appointments:appointments.length}});
  }
  const relationOptions=p.match(/^\/api\/app\/([a-z0-9-]+)\/relations\/options\/([A-Z][0-9]{3})$/);
  if(relationOptions&&method==='GET'){
   const tenant=tenantBySlug(relationOptions[1]),tool=relationOptions[2];allowed(tenant,tool);
   return emit({records:entityList(tenant,tool).slice(0,120).map(x=>({id:x.id,title:x.title||x.name}))});
  }
  const relationTarget=p.match(/^\/api\/app\/([a-z0-9-]+)\/tools\/([A-Z][0-9]{3})\/records\/([a-z0-9-]+)\/links$/);
  if(relationTarget){
   const tenant=tenantBySlug(relationTarget[1]),tool=relationTarget[2],recordId=relationTarget[3];
   allowed(tenant,tool);entity(tenant,tool,recordId);
   if(method==='GET'){
    const links=tenant.entityLinks.filter(x=>x.leftToolId===tool&&x.leftRecordId===recordId||x.rightToolId===tool&&x.rightRecordId===recordId)
     .map(x=>{
      const targetToolId=x.leftToolId===tool&&x.leftRecordId===recordId?x.rightToolId:x.leftToolId;
      const targetRecordId=x.leftToolId===tool&&x.leftRecordId===recordId?x.rightRecordId:x.leftRecordId;
      if(!tenant.tools.some(x=>x.id===targetToolId&&x.enabled))return null;
      const target=entityList(tenant,targetToolId).find(x=>x.id===targetRecordId);
      if(!target)return null;
      return {id:x.id,targetToolId,targetRecordId,title:target.title||target.name,toolName:catalog.tools.find(t=>t.id===targetToolId)?.name,relationType:x.relationType};
     }).filter(Boolean);
    const implied=[];
    if(tool==='C001'){
     implied.push(...entityList(tenant,'C002').filter(d=>d.clientId===recordId).map(x=>['C002',x.id]));
     implied.push(...entityList(tenant,'C003').filter(c=>c.clientId===recordId).map(x=>['C003',x.id]));
     implied.push(...entityList(tenant,'C004').filter(e=>e.clientId===recordId).map(x=>['C004',x.id]));
    }else if(tool==='C002'){
     const deal=entity(tenant,tool,recordId);
     if(deal.clientId)implied.push(['C001',deal.clientId]);
     implied.push(...entityList(tenant,'C004').filter(e=>e.dealId===recordId).map(x=>['C004',x.id]));
    }else if(tool==='C003'){
     const dossier=entity(tenant,tool,recordId);
     if(dossier.clientId)implied.push(['C001',dossier.clientId]);
    }else if(tool==='C004'){
     const appointment=entity(tenant,tool,recordId);
     if(appointment.clientId)implied.push(['C001',appointment.clientId]);
     if(appointment.dealId)implied.push(['C002',appointment.dealId]);
    }
    for(const [targetToolId,targetRecordId]of implied){
     if(!tenant.tools.some(t=>t.id===targetToolId&&t.enabled)||
       links.some(link=>link.targetToolId===targetToolId&&link.targetRecordId===targetRecordId))continue;
     const target=entityList(tenant,targetToolId).find(x=>x.id===targetRecordId);
     if(target)links.push({id:null,targetToolId,targetRecordId,title:target.title||target.name,
      toolName:catalog.tools.find(t=>t.id===targetToolId)?.name,relationType:'related',builtIn:true});
    }
    return emit({links});
   }
   if(method==='POST'){
    if(Object.keys(input).some(k=>!['targetToolId','targetRecordId','relationType'].includes(k)))throw error('Invalid relation');
    const targetTool=input.targetToolId,targetId=input.targetRecordId,type=input.relationType||'related';
    if(!['related','depends_on','supports'].includes(type))throw error('Invalid relation');
    allowed(tenant,targetTool);entity(tenant,targetTool,targetId);
    const [leftToolId,leftRecordId,rightToolId,rightRecordId]=canonical(tool,recordId,targetTool,targetId);
    if(tenant.entityLinks.some(x=>x.leftToolId===leftToolId&&x.leftRecordId===leftRecordId&&x.rightToolId===rightToolId&&x.rightRecordId===rightRecordId))throw error('Duplicate relation',409);
    const link={id:uuid(),leftToolId,leftRecordId,rightToolId,rightRecordId,relationType:type,createdAt:now()};
    tenant.entityLinks.push(link);return send({link});
   }
  }
  const deleteRelation=p.match(/^\/api\/app\/([a-z0-9-]+)\/relations\/([a-z0-9-]+)$/);
  if(deleteRelation&&method==='DELETE'){
   const tenant=tenantBySlug(deleteRelation[1]),link=getRecord(tenant.entityLinks,deleteRelation[2]);
   allowed(tenant,link.leftToolId);allowed(tenant,link.rightToolId);
   tenant.entityLinks.splice(tenant.entityLinks.indexOf(link),1);return send({removed:true});
  }
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
  const docsMetadata=p.match(/^\/api\/app\/([a-z0-9-]+)\/case-documents\/([a-z0-9-]+)$/);
  if(docsMetadata&&method==='PATCH'){
   const tenant=tenantBySlug(docsMetadata[1]);allowed(tenant,'C003');
   const doc=tenant.caseDocumentMeta[docsMetadata[2]];
   if(!doc||!tenant.cases.some(c=>c.id===doc.caseId&&!c.archivedAt))throw error('Not found',404);
   const types=['other','contract','identification','invoice','consent','certificate'];
   if(Object.keys(input).some(k=>!['documentType','expiresOn'].includes(k)))throw error('Invalid document');
   const newType=input.documentType??'other',expiry=input.expiresOn||null;
   if(!types.includes(newType)||expiry&&!validExpiry(expiry))throw error('Invalid document');
   doc.documentType=newType;doc.expiresOn=expiry;
   tenant.caseEvents.unshift({id:uuid(),caseId:doc.caseId,action:'updated',description:'Documento actualizado · '+newType,createdAt:now()});
   return send({document:{documentId:docsMetadata[2],documentType:newType,expiresOn:expiry}});
  }
  const filesPath=p.match(/^\/api\/app\/([a-z0-9-]+)\/tools\/([A-Z][0-9]{3})\/records\/([a-z0-9-]+)\/attachments$/);
  if(filesPath){
   const tenant=tenantBySlug(filesPath[1]),tool=filesPath[2],recordId=filesPath[3];allowed(tenant,tool);
   const items=tenant.uploads.filter(x=>x.toolId===tool&&x.recordId===recordId);
   if(method==='GET')return emit({attachments:items.map(file=>{
    const group=tenant.caseDocumentMeta[file.documentId],same=items.filter(x=>x.documentId===file.documentId);
    const latest=same.length?Math.max(...same.map(x=>x.version||1)):1;
    return {id:file.id,filename:file.filename,mime:file.mime,bytes:file.size,
     documentId:group?file.documentId:file.id,managed:!!group,version:file.version||1,isLatest:!group||file.version===latest,
     documentType:group?.documentType||'other',expiresOn:group?.expiresOn||null,
     downloadUrl:'/api/app/'+tenant.slug+'/attachments/'+file.id};
   })});
   if(method==='POST'){
    const media=demoMedia(input);if(media.size>2000000||items.length>=12)throw error('Storage quota exceeded');
    const list={C001:tenant.clients,C002:tenant.deals,C003:tenant.cases.filter(c=>!c.archivedAt),C004:tenant.events,C005:tenant.items}[tool]||tenant.generic[tool]||[];
    if(!list.some(x=>x.id===recordId))throw error('Not found',404);
    let docId=null,version=1;
    if(tool==='C003'){
     const types=['other','contract','identification','invoice','consent','certificate'];
     if(Object.keys(input).some(k=>!['filename','mime','data','documentType','expiresOn','replaceDocumentId'].includes(k)))throw error('Invalid document');
     const expiry=input.expiresOn||null,kind=input.documentType||'other';
     if(!types.includes(kind)||expiry&&!validExpiry(expiry))throw error('Invalid document');
     if(input.replaceDocumentId){
      docId=input.replaceDocumentId;
      let group=tenant.caseDocumentMeta[docId];
      if(!group){
       const legacy=items.find(x=>x.id===docId);
       if(!legacy)throw error('Not found',404);
       legacy.documentId=docId;legacy.version=1;
       group=tenant.caseDocumentMeta[docId]={caseId:recordId,documentType:kind,expiresOn:expiry,nextVersion:1};
      }
      if(group.caseId!==recordId)throw error('Not found',404);
      version=++group.nextVersion;
     }else{
      docId=uuid();
      tenant.caseDocumentMeta[docId]={caseId:recordId,documentType:kind,expiresOn:expiry,nextVersion:1};
     }
    }
    tenant.uploads.push({...media,toolId:tool,recordId,...(docId?{documentId:docId,version}:{})});
    if(tool==='C003')tenant.caseEvents.unshift({id:uuid(),caseId:recordId,action:'document_added',description:(version>1?'Nueva versión: ':'Documento añadido: ')+media.filename,createdAt:now()});
    return send({attachment:{id:media.id,filename:media.filename,bytes:media.size,documentId:docId}});
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
  if(p==='/api/admin/billing'&&method==='GET')return emit({tenants:state.tenants.map(t=>({id:t.id,slug:t.slug,name:t.name,suiteId:t.suiteId,billingStatus:'active',billingStatusLabel:'Al corriente',monthlyFeeCents:94900,currentPeriodEnd:null,pastDueSince:null,daysPastDue:0,balancePendingCents:0})),pendingOrders:[]});
  if(p.startsWith('/api/billing/status')&&method==='GET')return emit({organizationId:'demo',status:'active',effectiveStatus:'active',statusLabel:'Al corriente',monthlyFeeCents:94900,currentPeriodEnd:null,pastDueSince:null,daysPastDue:0,balancePendingCents:0,balanceInstallmentsPending:0,nextBalanceDueAt:null,nextMonthlyChargeCents:94900});
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
      documentsCount:new Set(tenant.uploads.filter(x=>x.toolId==='C003'&&x.recordId===c.id).map(x=>x.documentId||x.id)).size})),
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
   const clients=entityList(t,'C001'),deals=entityList(t,'C002');
   const clientChoices=clients.map(x=>({id:x.id,name:x.name,company:x.company}));
   const linkedDeal=d=>({...d,clientName:t.clients.find(c=>c.id===d.clientId)?.name||null});
   if(method==='GET'){
    if(module==='clients')return emit({clients:entityList(t,'C001'),statuses});
    const canClients=t.tools.some(x=>x.id==='C001'&&x.enabled),canCRM=t.tools.some(x=>x.id==='C002'&&x.enabled);
    if(module==='crm')return emit({deals:deals.map(d=>canClients?linkedDeal(d):{...d,clientId:null,clientName:null}),clients:canClients?clientChoices:[],stages});
    if(module==='agenda')return emit({events:list.map(e=>({...e,
      clientId:canClients?e.clientId:null,clientName:canClients?t.clients.find(c=>c.id===e.clientId)?.name||null:null,
      dealId:canCRM?e.dealId:null,dealTitle:canCRM?t.deals.find(d=>d.id===e.dealId)?.title||null:null})),
      clients:canClients?clientChoices:[],deals:canCRM?deals.map(d=>({id:d.id,title:d.title,clientId:canClients?d.clientId||null:null})):[]});
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
    if(client.email&&entityList(t,'C001').some(x=>x.email===client.email&&x.id!==id))throw error('Duplicate client email',409);
    if(method==='POST'){const c={id:uuid(),...client};list.unshift(c);return send({client:c});}
    if(method==='PATCH'){Object.assign(getRecord(list,id),client);return send({ok:true});}
    if(method==='DELETE'){const rec=getRecord(list,id);rec.archivedAt=now();return send({archived:true});}
   }
   if(module==='crm'){
    if(method==='DELETE'){const rec=getRecord(deals,id);rec.archivedAt=now();return send({archived:true});}
    if(method==='PATCH'&&Object.keys(input).length===1&&input.stage){
     if(!stages.includes(input.stage))throw error('Invalid deal');getRecord(deals,id).stage=input.stage;return send({ok:true});
    }
    const clientId=input.clientId||null;
    if(clientId)allowed(t,'C001');
    if(clientId&&!clients.some(x=>x.id===clientId))throw error('Client not found',404);
    const deal={title:String(input.title||'').trim(),customer:String(input.customer||''),clientId,
      amountCents:input.amountCents??0,stage:input.stage||'lead',followUpAt:input.followUpAt||null,notes:String(input.notes||'')};
    if(deal.title.length<2||!stages.includes(deal.stage)||!Number.isSafeInteger(deal.amountCents)||deal.amountCents<0)throw error('Invalid deal');
    if(method==='POST'){const d={id:uuid(),...deal};list.unshift(d);return send({deal:d});}
    if(method==='PATCH'){
     const current=getRecord(deals,id);
     if(deal.clientId&&t.events.some(e=>e.dealId===id&&e.clientId&&e.clientId!==deal.clientId))throw error('Relation mismatch',409);
     Object.assign(current,deal);
     if(deal.clientId)for(const event of t.events)if(event.dealId===id&&!event.clientId)event.clientId=deal.clientId;
     return send({ok:true});
    }
   }
   if(module==='agenda'){
    if(method==='PATCH'&&Object.keys(input).length===1&&['completed','cancelled'].includes(input.status)){getRecord(list,id).status=input.status;return send({ok:true});}
    let clientId=input.clientId||null;const dealId=input.dealId||null;
    if(dealId){
     allowed(t,'C002');
     const deal=getRecord(deals,dealId);
     if(deal.clientId){if(clientId&&clientId!==deal.clientId)throw error('Relation mismatch');clientId=deal.clientId;}
    }
    if(clientId)allowed(t,'C001');
    if(clientId&&!clients.some(x=>x.id===clientId))throw error('Client not found',404);
    const event={title:String(input.title||'').trim(),customer:String(input.customer||''),clientId,dealId,
     resource:String(input.resource||'general').trim().toLowerCase(),startsAt:input.startsAt,endsAt:input.endsAt,
     status:input.status||'scheduled',notes:String(input.notes||'')};
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
  // Commerce tools reales (T013/C006/C007/T014/T015/T020) en memoria para la demo.
  const quoteTotals=(lines,vat)=>{const sub=lines.reduce((s,l)=>s+l.lineTotalCents,0);const vatC=Math.round(sub*vat/100);return{subtotalCents:sub,vatCents:vatC,totalCents:sub+vatC};};
  const csvCell=v=>{const t=v==null?'':String(v);return /[",\n\r]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t;};
  const toCsv=(cols,rows)=>cols.map(c=>csvCell(c[1])).join(',')+(rows.length?'\r\n'+rows.map(r=>cols.map(c=>csvCell(r[c[0]])).join(',')).join('\r\n'):'')+'\r\n';
  const moneyText=c=>(Number(c||0)/100).toFixed(2);
  const quoteTransitions={draft:['sent','accepted','rejected'],sent:['accepted','rejected','draft'],accepted:[],rejected:['draft']};
  const expenseCats=['insumos','renta','servicios','transporte','marketing','personal','impuestos','otros'];
  m=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/(quotes|catalog|expenses|payments|invoices|reports)(?:\/([a-z0-9-]+))?(?:\/(send|accept|reject|draft|issued|cancelled|export))?$/);
  if(m){
   const t=tenantBySlug(m[1]),module=m[2],id=m[3],action=m[4];
   const tool={quotes:'T013',catalog:'C006',expenses:'C007',payments:'T014',invoices:'T015',reports:'T020'}[module];
   allowed(t,tool);
   const live=list=>list.filter(x=>!x.archivedAt);
   const paidFor=qid=>live(t.payments).filter(x=>x.quoteId===qid).reduce((s,x)=>s+x.amountCents,0);
   const quoteView=q=>({...q,paidCents:paidFor(q.id),balanceCents:Math.max(0,q.totalCents-paidFor(q.id))});
   if(module==='reports'&&(action==='export'||id==='export')&&method==='GET'){
    const kind=url.searchParams.get('kind');
    if(kind==='clients')return emit({filename:'hubie-clientes.csv',csv:toCsv([['name','Nombre'],['company','Empresa'],['email','Correo'],['phone','Teléfono'],['status','Estatus']],live(t.clients))});
    if(kind==='quotes')return emit({filename:'hubie-cotizaciones.csv',csv:toCsv([['title','Cotización'],['clientName','Cliente'],['status','Estatus'],['subtotal','Subtotal MXN'],['vat','IVA MXN'],['total','Total MXN']],live(t.quotes).map(q=>({...q,subtotal:moneyText(q.subtotalCents),vat:moneyText(q.vatCents),total:moneyText(q.totalCents)})))});
    if(kind==='payments')return emit({filename:'hubie-cobros.csv',csv:toCsv([['clientName','Cliente'],['quoteTitle','Cotización'],['amount','Monto MXN'],['method','Método'],['reference','Referencia'],['paidOn','Fecha']],live(t.payments).map(x=>({...x,quoteTitle:t.quotes.find(q=>q.id===x.quoteId)?.title||'',amount:moneyText(x.amountCents)})))});
    if(kind==='expenses')return emit({filename:'hubie-gastos.csv',csv:toCsv([['description','Concepto'],['category','Categoría'],['vendor','Proveedor'],['amount','Monto MXN'],['occurredOn','Fecha']],live(t.expenses).map(x=>({...x,amount:moneyText(x.amountCents)})))});
    throw error('Not found',404);
   }
   if(module==='reports'&&method==='GET'){
    const month=url.searchParams.get('month')||new Date().toISOString().slice(0,7);
    const accepted=live(t.quotes).filter(q=>q.status==='accepted'&&(q.createdAt||'').slice(0,7)===month);
    const pays=live(t.payments).filter(x=>x.paidOn.slice(0,7)===month);
    const exps=live(t.expenses).filter(x=>x.occurredOn.slice(0,7)===month);
    const byCategory={};for(const e of exps)byCategory[e.category]=(byCategory[e.category]||0)+e.amountCents;
    const months=[];const d=new Date();d.setUTCDate(1);
    for(let i=0;i<6;i++){months.unshift(d.toISOString().slice(0,7));d.setUTCMonth(d.getUTCMonth()-1);}
    return emit({month,totals:{acceptedQuotes:accepted.length,acceptedQuotesCents:accepted.reduce((s,q)=>s+q.totalCents,0),
     payments:pays.length,paymentsCents:pays.reduce((s,x)=>s+x.amountCents,0),
     expensesCents:exps.reduce((s,x)=>s+x.amountCents,0),expensesCount:exps.length,
     newClients:0,balanceCents:pays.reduce((s,x)=>s+x.amountCents,0)-exps.reduce((s,x)=>s+x.amountCents,0)},
     expensesByCategory:byCategory,
     byMonth:months.map(mo=>({month:mo,
      paymentsCents:live(t.payments).filter(x=>x.paidOn.slice(0,7)===mo).reduce((s,x)=>s+x.amountCents,0),
      expensesCents:live(t.expenses).filter(x=>x.occurredOn.slice(0,7)===mo).reduce((s,x)=>s+x.amountCents,0)}))});
   }
   if(module==='quotes'){
    const normLines=raw=>{
     if(!Array.isArray(raw)||!raw.length||raw.length>50)throw error('Invalid quote');
     return raw.map((l,i)=>{
      const description=String(l.description||'').trim(),quantity=l.quantity,unitPriceCents=l.unitPriceCents;
      if(!description||!Number.isSafeInteger(quantity)||quantity<=0||quantity>100000||!Number.isSafeInteger(unitPriceCents)||unitPriceCents<0)throw error('Invalid quote');
      return {id:uuid(),description,quantity,unitPriceCents,lineTotalCents:quantity*unitPriceCents,position:i};
     });
    };
    if(method==='GET'&&!id)return emit({quotes:live(t.quotes).map(quoteView),
     clients:t.clients.map(c=>({id:c.id,name:c.name,company:c.company})),statuses:['draft','sent','accepted','rejected'],
     statusLabels:{draft:'Borrador',sent:'Enviada',accepted:'Aceptada',rejected:'Rechazada'},vatRates:[0,8,16]});
    if(method==='GET'&&id){const q=getRecord(live(t.quotes),id);return emit({quote:quoteView({...q,lines:q.lines})});}
    if(method==='POST'&&!id){
     const title=String(input.title||'').trim(),clientName=String(input.clientName||'').trim();
     const vatRate=input.vatRate??16,validUntil=input.validUntil||null;
     if(title.length<2||!clientName||![0,8,16].includes(vatRate)||validUntil&&!validExpiry(validUntil))throw error('Invalid quote');
     if(input.clientId&&!t.clients.some(c=>c.id===input.clientId))throw error('Client not found',404);
     const lines=normLines(input.lines),totals=quoteTotals(lines,vatRate);
     const q={id:uuid(),clientId:input.clientId||null,clientName,title,notes:String(input.notes||'').trim(),
      vatRate,status:'draft',validUntil,...totals,
      publicToken:Array.from({length:32},()=>'0123456789abcdef'[Math.floor(Math.random()*16)]).join(''),
      acceptedAt:null,createdAt:now(),updatedAt:now(),lines};
     t.quotes.unshift(q);return send({quote:quoteView(q)});
    }
    if(id&&action&&method==='POST'){
     const q=getRecord(live(t.quotes),id);
     const next=action==='send'?'sent':action==='accept'?'accepted':action==='reject'?'rejected':'draft';
     if(!quoteTransitions[q.status].includes(next))throw error('Invalid quote status');
     q.status=next;q.acceptedAt=next==='accepted'?now():null;q.updatedAt=now();
     return send({ok:true,status:next});
    }
    if(id&&method==='PATCH'){
     const q=getRecord(live(t.quotes),id);
     if(!['draft','rejected'].includes(q.status))throw error('Invalid quote status');
     const title=String(input.title||'').trim(),clientName=String(input.clientName||'').trim();
     const vatRate=input.vatRate??16;
     if(title.length<2||!clientName||![0,8,16].includes(vatRate))throw error('Invalid quote');
     const lines=normLines(input.lines),totals=quoteTotals(lines,vatRate);
     Object.assign(q,{clientId:input.clientId||null,clientName,title,notes:String(input.notes||'').trim(),vatRate,validUntil:input.validUntil||null,...totals,lines,updatedAt:now()});
     return send({ok:true});
    }
    if(id&&method==='DELETE'){getRecord(live(t.quotes),id).archivedAt=now();return send({archived:true});}
    throw error('Not found',404);
   }
   if(module==='catalog'){
    if(method==='GET')return emit({items:live(t.catalogItems).map(i=>({...i,photoUrl:null})),categories:[...new Set(live(t.catalogItems).map(i=>i.category))]});
    const norm=()=>{
     const sku=String(input.sku||'').trim().toUpperCase(),name=String(input.name||'').trim();
     const priceCents=input.priceCents??0,category=String(input.category||'General').trim()||'General';
     if(name.length<2||!Number.isSafeInteger(priceCents)||priceCents<0||typeof input.active!=='undefined'&&typeof input.active!=='boolean')throw error('Invalid catalog item');
     if(sku&&!/^[A-Z0-9][A-Z0-9._-]{0,47}$/.test(sku))throw error('Invalid catalog item');
     return {sku,name,description:String(input.description||'').trim(),priceCents,category,active:input.active??true};
    };
    if(method==='POST'){
     const item=norm();
     if(item.sku&&live(t.catalogItems).some(x=>x.sku===item.sku))throw error('Duplicate SKU',409);
     const created={id:uuid(),...item,createdAt:now(),updatedAt:now()};t.catalogItems.unshift(created);return send({item:created});
    }
    if(id&&method==='PATCH'){
     const item=norm(),current=getRecord(live(t.catalogItems),id);
     if(item.sku&&live(t.catalogItems).some(x=>x.id!==id&&x.sku===item.sku))throw error('Duplicate SKU',409);
     Object.assign(current,item,{updatedAt:now()});return send({ok:true});
    }
    if(id&&method==='DELETE'){getRecord(live(t.catalogItems),id).archivedAt=now();return send({archived:true});}
    throw error('Not found',404);
   }
   if(module==='expenses'){
    if(method==='GET'){
     const from=url.searchParams.get('from'),to=url.searchParams.get('to'),cat=url.searchParams.get('category');
     const list=live(t.expenses).filter(e=>(!from||e.occurredOn>=from)&&(!to||e.occurredOn<=to)&&(!cat||e.category===cat));
     const byCategory={},byMonth={};let total=0;
     for(const e of list){total+=e.amountCents;byCategory[e.category]=(byCategory[e.category]||0)+e.amountCents;byMonth[e.occurredOn.slice(0,7)]=(byMonth[e.occurredOn.slice(0,7)]||0)+e.amountCents;}
     return emit({expenses:list.map(e=>({...e,receiptCount:0})),summary:{totalCents:total,count:list.length,byCategory,byMonth},
      categories:expenseCats,categoryLabels:{insumos:'Insumos',renta:'Renta',servicios:'Servicios',transporte:'Transporte',marketing:'Marketing',personal:'Personal',impuestos:'Impuestos',otros:'Otros'}});
    }
    const norm=()=>{
     const description=String(input.description||'').trim(),amountCents=input.amountCents,occurredOn=input.occurredOn,category=input.category||'otros';
     if(description.length<2||!Number.isSafeInteger(amountCents)||amountCents<=0||!validExpiry(occurredOn)||!expenseCats.includes(category))throw error('Invalid expense');
     return {description,amountCents,occurredOn,category,vendor:String(input.vendor||'').trim()};
    };
    if(method==='POST'){const e={id:uuid(),...norm(),createdAt:now(),updatedAt:now()};t.expenses.unshift(e);return send({expense:{...e,receiptCount:0}});}
    if(id&&method==='PATCH'){Object.assign(getRecord(live(t.expenses),id),norm(),{updatedAt:now()});return send({ok:true});}
    if(id&&method==='DELETE'){getRecord(live(t.expenses),id).archivedAt=now();return send({archived:true});}
    throw error('Not found',404);
   }
   if(module==='payments'){
    if(method==='GET')return emit({payments:live(t.payments).map(p=>{
     const q=t.quotes.find(x=>x.id===p.quoteId);
     return {...p,quoteTitle:q?.title||null,quoteTotalCents:q?.totalCents??null,quotePaidCents:q?paidFor(q.id):null,
      quoteBalanceCents:q?Math.max(0,q.totalCents-paidFor(q.id)):null};
    }),
    quotes:live(t.quotes).filter(q=>['sent','accepted'].includes(q.status)).map(q=>({id:q.id,title:q.title,clientName:q.clientName,totalCents:q.totalCents,paidCents:paidFor(q.id),balanceCents:Math.max(0,q.totalCents-paidFor(q.id))})),
    clients:t.clients.map(c=>({id:c.id,name:c.name,company:c.company})),methods:['efectivo','transferencia','tarjeta'],
    methodLabels:{efectivo:'Efectivo',transferencia:'Transferencia',tarjeta:'Tarjeta'},canReadQuotes:true});
    if(method==='POST'){
     const amountCents=input.amountCents,paidOn=input.paidOn,method=input.method||'efectivo';
     const clientName=String(input.clientName||'').trim();
     if(!Number.isSafeInteger(amountCents)||amountCents<=0||!validExpiry(paidOn)||!['efectivo','transferencia','tarjeta'].includes(method)||!clientName&&!input.quoteId&&!input.clientId)throw error('Invalid payment');
     if(input.quoteId){
      const q=t.quotes.find(x=>x.id===input.quoteId&&!x.archivedAt);
      if(!q)throw error('Not found',404);
      if(amountCents>Math.max(0,q.totalCents-paidFor(q.id)))throw error('Invalid payment');
     }
     if(input.clientId&&!t.clients.some(c=>c.id===input.clientId))throw error('Client not found',404);
     const pay={id:uuid(),quoteId:input.quoteId||null,clientId:input.clientId||null,clientName,amountCents,paidOn,method,
      reference:String(input.reference||'').trim(),notes:String(input.notes||'').trim(),createdAt:now(),updatedAt:now()};
     t.payments.unshift(pay);return send({payment:pay});
    }
    if(id&&method==='PATCH'){
     const pay=getRecord(live(t.payments),id);
     if(Object.keys(input).some(k=>!['paidOn','method','reference','notes'].includes(k)))throw error('Invalid payment');
     if(!validExpiry(input.paidOn)||!['efectivo','transferencia','tarjeta'].includes(input.method??'efectivo'))throw error('Invalid payment');
     Object.assign(pay,{paidOn:input.paidOn,method:input.method??'efectivo',reference:String(input.reference||'').trim(),notes:String(input.notes||'').trim(),updatedAt:now()});
     return send({ok:true});
    }
    if(id&&method==='DELETE'){getRecord(live(t.payments),id).archivedAt=now();return send({archived:true});}
    throw error('Not found',404);
   }
   if(module==='invoices'){
    if(method==='GET')return emit({invoices:live(t.invoices),acceptedQuotes:live(t.quotes).filter(q=>q.status==='accepted').map(q=>({id:q.id,title:q.title,clientName:q.clientName,totalCents:q.totalCents})),
     statuses:['draft','issued','cancelled'],statusLabels:{draft:'Borrador',issued:'Emitida',cancelled:'Cancelada'},vatRates:[0,8,16]});
    if(method==='POST'&&!id){
     let data;
     if(input.quoteId){
      const q=t.quotes.find(x=>x.id===input.quoteId&&!x.archivedAt);
      if(!q)throw error('Not found',404);
      if(q.status!=='accepted')throw error('Invalid invoice');
      data={clientName:q.clientName,rfc:String(input.rfc||'').trim().toUpperCase(),notes:String(input.notes||'').trim(),vatRate:q.vatRate,quoteId:q.id,lines:q.lines.map(l=>({description:l.description,quantity:l.quantity,unitPriceCents:l.unitPriceCents}))};
     }else{
      const lines=Array.isArray(input.lines)?input.lines:[];
      if(!lines.length)throw error('Invalid invoice');
      data={clientName:String(input.clientName||'').trim(),rfc:String(input.rfc||'').trim().toUpperCase(),notes:String(input.notes||'').trim(),vatRate:input.vatRate??16,quoteId:null,lines};
     }
     if(!data.clientName||data.rfc&&!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(data.rfc))throw error('Invalid invoice');
     const lines=data.lines.map((l,i)=>{
      const description=String(l.description||'').trim();
      if(!description||!Number.isSafeInteger(l.quantity)||l.quantity<=0||!Number.isSafeInteger(l.unitPriceCents)||l.unitPriceCents<0)throw error('Invalid invoice');
      return {id:uuid(),description,quantity:l.quantity,unitPriceCents:l.unitPriceCents,lineTotalCents:l.quantity*l.unitPriceCents,position:i};
     });
     const totals=quoteTotals(lines,data.vatRate);
     const folio=Math.max(0,...live(t.invoices).map(x=>x.folio))+1;
     const inv={id:uuid(),folio,folioLabel:'F-'+String(folio).padStart(4,'0'),quoteId:data.quoteId,clientName:data.clientName,rfc:data.rfc,
      items:lines,...totals,vatRate:data.vatRate,status:'draft',notes:data.notes,createdAt:now(),updatedAt:now(),cfdi:false,cfdiNote:'Sin CFDI (pendiente PAC)'};
     t.invoices.unshift(inv);return send({invoice:inv});
    }
    if(id&&action&&method==='POST'){
     const inv=getRecord(live(t.invoices),id);
     const allowedNext={draft:['issued','cancelled'],issued:['cancelled'],cancelled:[]};
     if(!allowedNext[inv.status].includes(action))throw error('Invalid invoice');
     inv.status=action;inv.updatedAt=now();return send({ok:true,status:action});
    }
    if(id&&method==='DELETE'){getRecord(live(t.invoices),id).archivedAt=now();return send({archived:true});}
    throw error('Not found',404);
   }
   throw error('Not found',404);
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
