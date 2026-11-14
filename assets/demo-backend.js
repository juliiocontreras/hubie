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
const onboardingSteps=[
 {key:'profile',title:'Completa tu perfil',description:'Agrega el nombre, el logo y los colores de tu empresa para que tus clientes te reconozcan.',toolId:null},
 {key:'first-client',title:'Agrega tu primer cliente',description:'Registra a tu primer cliente con su nombre, su correo y su teléfono.',toolId:'C001'},
 {key:'catalog',title:'Crea tu catálogo',description:'Agrega tu primer producto o servicio con su precio.',toolId:'C006'},
 {key:'quote',title:'Crea tu primera cotización',description:'Arma una cotización con partidas y compártela con tu cliente.',toolId:'T013'},
 {key:'team',title:'Invita a tu equipo',description:'Agrega a las personas que trabajarán contigo en Hubie. Las invitaciones las gestiona Hubie Madre.',toolId:null},
 {key:'billing',title:'Configura tu cobro',description:'Revisa tu suscripción y tu anticipo para mantener tu Suite al corriente.',toolId:null}
];
const initialId=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'];
function createTenant(catalog,input,id=uuid()){
 const suite=catalog.suites.find(s=>s.id===input.suiteId);
 if(!suite||typeof input.name!=='string'||input.name.trim().length<2||!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(input.slug||''))throw error('Invalid tenant data');
 const selected=new Set(input.toolIds||catalog.tools.filter(t=>t.included).map(t=>t.id));
 if([...selected].some(code=>!catalog.tools.some(t=>t.id===code)))throw error('Invalid tenant data');
 return {id,appearance:{...appearanceDefaults},backgrounds:{dashboard:null,sidebar:null},uploads:[],slug:input.slug,name:input.name.trim(),displayName:input.name.trim(),suiteId:input.suiteId,status:'active',primaryColor:input.primaryColor||'#7c5cfc',secondaryColor:input.secondaryColor||'#ec4899',timezone:'America/Mexico_City',logoUrl:null,
  tools:catalog.tools.map(t=>({...t,enabled:selected.has(t.id)})),
  members:[{id:'33333333-3333-4333-8333-333333333333',email:'superadmin@ejemplo.invalid',role:'owner',status:'active'}],
  notifications:[],
  memberTools:{},clients:[],clientMerges:[],cases:[],caseEvents:[],caseDocumentMeta:{},caseAccess:{},
  docSettings:{},docAccess:{},entityLinks:[],deals:[],dealTasks:[],events:[],items:[],movements:[],
  checklists:[],checklistTemplates:[],tasks:[],forms:[],formSubmissions:[],goals:[],variants:[],
  quotes:[],catalogItems:[],expenses:[],payments:[],invoices:[],generic:{},
  onboarding:{steps:{},demoSeeded:[]},
  invitations:[],audit:[]};
}
function initial(catalog){
 const first=createTenant(catalog,{name:'Comercio de demostración',slug:'comercio-demo',suiteId:'S004',toolIds:[...catalog.tools.filter(t=>t.included).map(t=>t.id),'T004','T013']},initialId[0]);
 const second=createTenant(catalog,{name:'Consultoría de demostración',slug:'consultoria-demo',suiteId:'S006'},initialId[1]);
 first.clients.push({id:uuid(),name:'Contacto de ejemplo',company:'Negocio ficticio',email:'ejemplo@correo.invalid',phone:'',status:'prospect',notes:'Datos ficticios para conocer la interfaz.'});
 first.cases.push({id:uuid(),clientId:first.clients[0].id,clientName:first.clients[0].name,title:'Expediente comercial de ejemplo',kind:'commercial',status:'open',notes:'Carpeta de demostración, sin datos de clientes reales.',createdAt:now(),updatedAt:now()});
 first.caseEvents.push({id:uuid(),caseId:first.cases[0].id,action:'created',description:'Expediente de demostración creado',createdAt:now()});
 first.deals.push({id:uuid(),title:'Oportunidad de demostración',customer:'Negocio ficticio',clientId:first.clients[0].id,amountCents:250000,stage:'proposal',notes:'Operación simulada; no se realiza ningún cobro.',followUpAt:null,assignedUserId:null,createdAt:now(),updatedAt:now()});
 first.items.push({id:uuid(),sku:'DEMO-001',title:'Producto de muestra',location:'Almacén ficticio',quantity:8,lowStock:3});
 first.variants.push({id:uuid(),itemId:first.items[0].id,label:'Talla M · Rojo',sku:'DEMO-001-M-R',quantity:5,lowStock:2,warehouse:'Almacén ficticio',lot:'LOTE-1',expiresOn:null,supplier:'Proveedor ficticio'});
 first.checklistTemplates.push({id:uuid(),title:'Apertura de tienda',description:'Plantilla de demostración',items:[{title:'Abrir caja',position:0},{title:'Revisar exhibición',position:1}]});
 first.checklists.push({id:uuid(),templateId:first.checklistTemplates[0].id,templateTitle:'Apertura de tienda',title:'Apertura lunes',status:'open',createdAt:now(),updatedAt:now(),
  items:[{id:uuid(),title:'Abrir caja',assigneeUserId:null,assigneeEmail:null,dueOn:null,checkedAt:null,checkedBy:null,evidenceMediaId:null,evidenceName:null,position:0},
   {id:uuid(),title:'Revisar exhibición',assigneeUserId:null,assigneeEmail:null,dueOn:null,checkedAt:null,checkedBy:null,evidenceMediaId:null,evidenceName:null,position:1}]});
 first.tasks.push({id:uuid(),title:'Llamar al proveedor ficticio',notes:'',assigneeUserId:null,assigneeEmail:null,dueOn:new Date(Date.now()+86400000).toISOString().slice(0,10),status:'pending',priority:'normal',sourceToolId:null,sourceRecordId:null,notifiedAt:null,createdAt:now(),updatedAt:now()});
 first.forms.push({id:uuid(),title:'Encuesta de demostración',description:'Formulario de ejemplo',fields:[{key:'nombre',label:'Nombre',type:'text',required:true,options:[],position:0},{key:'calificacion',label:'Calificación',type:'select',required:false,options:['Buena','Regular','Mala'],position:1}],createdAt:now(),updatedAt:now()});
 first.goals.push({month:new Date().toISOString().slice(0,7),targetCents:100000});
 first.events.push({id:uuid(),title:'Reunión de ejemplo',customer:'Contacto ficticio',clientId:first.clients[0].id,dealId:first.deals[0].id,resource:'sala-1',startsAt:'2026-11-12T16:00:00.000Z',endsAt:'2026-11-12T17:00:00.000Z',status:'scheduled',notes:''});
 // Historial de demostración: eventos de ejemplo por empresa, aislados.
 first.audit.push(
  {id:uuid(),organizationId:first.id,actorUserId:'33333333-3333-4333-8333-333333333333',actorEmail:'superadmin@ejemplo.invalid',action:'tenant.created',targetType:'organization',targetId:first.id,occurredAt:'2026-11-10T10:00:00.000Z'},
  {id:uuid(),organizationId:first.id,actorUserId:'33333333-3333-4333-8333-333333333333',actorEmail:'superadmin@ejemplo.invalid',action:'tenant.member_added',targetType:'membership',targetId:'ejemplo@correo.invalid',occurredAt:'2026-11-11T10:00:00.000Z'});
 second.audit.push(
  {id:uuid(),organizationId:second.id,actorUserId:'33333333-3333-4333-8333-333333333333',actorEmail:'superadmin@ejemplo.invalid',action:'tenant.created',targetType:'organization',targetId:second.id,occurredAt:'2026-11-10T11:00:00.000Z'});
 first.notifications.push({id:uuid(),userId:null,type:'info',title:'Bienvenido a la demostración',body:'Este es el centro de notificaciones: aquí aparecerían las cotizaciones por vencer, las citas próximas y los cobros vencidos de tu empresa.',link:null,readAt:null,createdAt:now()});
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
  tenant.notifications=Array.isArray(tenant.notifications)?tenant.notifications:[];tenant.quotes=Array.isArray(tenant.quotes)?tenant.quotes:[];tenant.catalogItems=Array.isArray(tenant.catalogItems)?tenant.catalogItems:[];tenant.onboarding=tenant.onboarding&&typeof tenant.onboarding==='object'?tenant.onboarding:{steps:{},demoSeeded:[]};
  tenant.onboarding.steps=tenant.onboarding.steps&&typeof tenant.onboarding.steps==='object'?tenant.onboarding.steps:{};
  tenant.onboarding.demoSeeded=Array.isArray(tenant.onboarding.demoSeeded)?tenant.onboarding.demoSeeded:[];
  tenant.expenses=Array.isArray(tenant.expenses)?tenant.expenses:[];tenant.payments=Array.isArray(tenant.payments)?tenant.payments:[];
  tenant.invoices=Array.isArray(tenant.invoices)?tenant.invoices:[];tenant.invitations=Array.isArray(tenant.invitations)?tenant.invitations:[];tenant.audit=Array.isArray(tenant.audit)?tenant.audit:[];
  tenant.memberTools=tenant.memberTools&&typeof tenant.memberTools==='object'?tenant.memberTools:{};
  tenant.clientMerges=Array.isArray(tenant.clientMerges)?tenant.clientMerges:[];
  tenant.dealTasks=Array.isArray(tenant.dealTasks)?tenant.dealTasks:[];
  tenant.caseAccess=tenant.caseAccess&&typeof tenant.caseAccess==='object'?tenant.caseAccess:{};
  tenant.docSettings=tenant.docSettings&&typeof tenant.docSettings==='object'?tenant.docSettings:{};
  tenant.docAccess=tenant.docAccess&&typeof tenant.docAccess==='object'?tenant.docAccess:{};
  tenant.checklists=Array.isArray(tenant.checklists)?tenant.checklists:[];tenant.checklistTemplates=Array.isArray(tenant.checklistTemplates)?tenant.checklistTemplates:[];
  tenant.tasks=Array.isArray(tenant.tasks)?tenant.tasks:[];tenant.forms=Array.isArray(tenant.forms)?tenant.forms:[];
  tenant.formSubmissions=Array.isArray(tenant.formSubmissions)?tenant.formSubmissions:[];tenant.goals=Array.isArray(tenant.goals)?tenant.goals:[];
  tenant.variants=Array.isArray(tenant.variants)?tenant.variants:[];
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
 // Invitaciones y auditoría (demo): mismo contrato que el API real. La
 // lista de acciones es la de platform/audit.mjs (fuente de verdad); el
 // token vive en claro solo en sessionStorage de esta pestaña (demo), en
 // producción solo se guarda su hash (platform/invitations.mjs).
 const demoAuditActions=['agenda.appointment_created','agenda.appointment_status','agenda.appointment_updated','appearance.platform_updated','appearance.tenant_updated','archived','cases.created','cases.document_updated','cases.updated','catalog.archived','catalog.created','catalog.updated','clients.archived','clients.created','clients.updated','crm.deal_archived','crm.deal_created','crm.deal_updated','entities.linked','entities.unlinked','expenses.archived','expenses.created','expenses.updated','inventory.item_created','inventory.item_updated','inventory.stock_moved','invoices.archived','invoices.created','media.attachment_removed','media.attachment_uploaded','payments.archived','payments.created','payments.updated','quotes.archived','quotes.created','quotes.updated','survey.response_received','tenant.created','tenant.invitation_accepted','tenant.invitation_created','tenant.invitation_resent','tenant.invitation_revoked','tenant.member_activated','tenant.member_added','tenant.member_suspended','tenant.record_archived','tenant.record_created','tenant.record_updated','tenant.tool_disabled','tenant.tool_enabled','tenant.updated'];
 const demoAudit=(t,action,targetId)=>{t.audit.unshift({id:uuid(),organizationId:t.id,actorUserId:'33333333-3333-4333-8333-333333333333',actorEmail:'superadmin@ejemplo.invalid',action,targetType:'organization_invitation',targetId,occurredAt:now()});};
 const demoInviteStatus=i=>i.consumedAt?'consumed':Date.parse(i.expiresAt)<=Date.now()?'expired':'pending';
 const demoPublicInvite=i=>({id:i.id,organizationId:i.organizationId,email:i.email,role:i.role,expiresAt:i.expiresAt,consumedAt:i.consumedAt,createdAt:i.createdAt,status:demoInviteStatus(i)});
 const demoAuditFilter=(list,url)=>{
  let out=[...list];
  const tenant=url.searchParams.get('tenant'),actor=url.searchParams.get('actor'),action=url.searchParams.get('action'),from=url.searchParams.get('from'),to=url.searchParams.get('to');
  const limit=Math.min(200,Math.max(1,Number(url.searchParams.get('limit'))||50));
  if(tenant)out=out.filter(e=>e.organizationId===tenant);
  if(action)out=out.filter(e=>e.action===action);
  if(actor)out=out.filter(e=>e.actorUserId===actor||e.actorEmail===actor);
  if(from)out=out.filter(e=>e.occurredAt>=from);
  if(to)out=out.filter(e=>e.occurredAt<=to);
  return out.sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)).slice(0,limit);
 };
 const demoInviteLink=token=>'https://hubie-demo.invalid/invitacion?token='+token;
 const invitationsHandler=(t,invId,action,method,input,send)=>{
  if(action==='resend'&&method==='POST'){
   const inv=getRecord(t.invitations,invId);
   const status=demoInviteStatus(inv);
   if(status!=='pending')throw error(status==='consumed'?'Invitation already used':'Invitation expired',410);
   inv.token=uuid().replace(/-/g,'')+uuid().replace(/-/g,'');inv.expiresAt=new Date(Date.now()+7*86400000).toISOString();
   demoAudit(t,'tenant.invitation_resent',inv.id);
   return send({invitation:demoPublicInvite(inv),token:inv.token,inviteUrl:demoInviteLink(inv.token),emailSent:false,emailReason:'email-not-configured'});
  }
  if(invId&&method==='DELETE'){
   const inv=getRecord(t.invitations,invId);
   t.invitations.splice(t.invitations.indexOf(inv),1);
   demoAudit(t,'tenant.invitation_revoked',inv.id);
   return send({revoked:true});
  }
  if(method==='GET')return emit({invitations:t.invitations.map(demoPublicInvite),emailConfigured:false});
  if(method==='POST'){
   const email=String(input.email||'').trim().toLowerCase();
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!['admin','member','viewer'].includes(input.role))throw error('Invalid invitation');
   if(t.invitations.some(i=>i.email===email&&demoInviteStatus(i)==='pending'))throw error('Duplicate invitation',409);
   const inv={id:uuid(),organizationId:t.id,email,role:input.role,token:uuid().replace(/-/g,'')+uuid().replace(/-/g,''),expiresAt:new Date(Date.now()+7*86400000).toISOString(),consumedAt:null,createdAt:now()};
   t.invitations.unshift(inv);
   demoAudit(t,'tenant.invitation_created',inv.id);
   return send({invitation:demoPublicInvite(inv),token:inv.token,inviteUrl:demoInviteLink(inv.token),emailSent:false,emailReason:'email-not-configured'});
  }
  throw error('Not found',404);
 };
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
   const quotes=enable('T013')?tenant.quotes.filter(x=>x.clientId===client.id&&!x.archivedAt).map(x=>({id:x.id,title:x.title,status:x.status,totalCents:x.totalCents,updatedAt:x.updatedAt})):[];
   return emit({client,deals,cases,appointments,quotes,counts:{deals:deals.length,cases:cases.length,appointments:appointments.length,quotes:quotes.length}});
  }
  // TOOLS P0 (021): línea de tiempo, duplicados/fusión, tareas y cotizaciones
  // del trato, búsqueda/vencimientos/acceso de expedientes y permisos por módulo.
  const p0expiry=expiresOn=>{
   if(!expiresOn)return 'none';
   const today=new Date().toISOString().slice(0,10);
   const days=(Date.parse(expiresOn+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000;
   return days<0?'expired':days<=30?'soon':'valid';
  };
  const p0defaultAccess=(role,tool)=>tool==='C009'?['owner','admin'].includes(role)?'read':'none':role==='viewer'?'read':'write';
  const p0memberToolsList=t=>({members:t.members.map(m=>({...m,tools:Object.fromEntries(
   ['C001','C002','C003','C004','C005','C006','C007','T013','T014','T015','T020'].map(tool=>
    [tool,(t.memberTools[m.id]||{})[tool]||p0defaultAccess(m.role,tool)]))}))});
  const p0searchDocs=(tenant,{term='',type='',expiry='',caseId=''}={})=>{
   const docs=[];
   for(const [documentId,meta] of Object.entries(tenant.caseDocumentMeta)){
    const dossier=tenant.cases.find(c=>c.id===meta.caseId&&!c.archivedAt);if(!dossier)continue;
    if(caseId&&meta.caseId!==caseId)continue;
    if(type&&meta.documentType!==type)continue;
    const status=p0expiry(meta.expiresOn);if(expiry&&status!==expiry)continue;
    const files=tenant.uploads.filter(x=>x.toolId==='C003'&&x.documentId===documentId);
    const latest=files.sort((a,b)=>(b.version||1)-(a.version||1))[0];
    const filename=latest?.filename||'';
    const client=tenant.clients.find(c=>c.id===dossier.clientId);
    if(term&&!(filename.toLowerCase().includes(term)||dossier.title.toLowerCase().includes(term)||(client?.name||'').toLowerCase().includes(term)))continue;
    docs.push({documentId,caseId:meta.caseId,caseTitle:dossier.title,clientId:dossier.clientId,
     clientName:client?.name||'',filename,documentType:meta.documentType,expiresOn:meta.expiresOn||null,
     expiryStatus:status,latestVersion:meta.nextVersion||1,visibility:tenant.docSettings[documentId]||'team'});
   }
   return docs;
  };
  const timelineRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/clients\/([a-z0-9-]+)\/timeline$/);
  if(timelineRoute&&method==='GET'){
   const tenant=tenantBySlug(timelineRoute[1]);allowed(tenant,'C001');
   const client=entity(tenant,'C001',timelineRoute[2]);
   const enable=tool=>tenant.tools.some(x=>x.id===tool&&x.enabled);
   const timeline=[];
   const push=(kind,toolId,recordId,title,detail,at)=>{if(at)timeline.push({kind,toolId,recordId,title,detail:detail||'',at});};
   if(enable('C002'))for(const d of entityList(tenant,'C002').filter(x=>x.clientId===client.id))push('deal','C002',d.id,d.title,'Etapa: '+d.stage+' · '+(d.amountCents/100).toFixed(2)+' MXN',d.updatedAt||d.createdAt);
   if(enable('C003')){
    for(const c of entityList(tenant,'C003').filter(x=>x.clientId===client.id))push('case','C003',c.id,c.title,c.kind+' · '+c.status,c.updatedAt||c.createdAt);
    for(const e of tenant.caseEvents.filter(x=>tenant.cases.some(c=>c.id===x.caseId&&c.clientId===client.id))){
     const dossier=tenant.cases.find(c=>c.id===e.caseId);
     push('case_event','C003',e.caseId,dossier?.title||'Expediente',e.action+': '+e.description,e.createdAt);
    }
   }
   if(enable('C004'))for(const e of entityList(tenant,'C004').filter(x=>x.clientId===client.id))push('appointment','C004',e.id,e.title,e.status,e.startsAt);
   if(enable('T013'))for(const q of tenant.quotes.filter(x=>x.clientId===client.id&&!x.archivedAt))push('quote','T013',q.id,q.title,q.status+' · '+(q.totalCents/100).toFixed(2)+' MXN',q.updatedAt||q.createdAt);
   timeline.sort((a,b)=>String(b.at).localeCompare(String(a.at)));
   const counts={};for(const e of timeline)counts[e.kind]=(counts[e.kind]||0)+1;
   return emit({client,timeline:timeline.slice(0,100),counts});
  }
  const dupRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/clients\/duplicates$/);
  if(dupRoute&&method==='GET'){
   const tenant=tenantBySlug(dupRoute[1]);allowed(tenant,'C001');
   const groups=new Map();
   for(const c of entityList(tenant,'C001')){
    if(!c.email)continue;
    const key=c.email.trim().toLowerCase();
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push({...c,relations:{
     deals:entityList(tenant,'C002').filter(d=>d.clientId===c.id).length,
     cases:entityList(tenant,'C003').filter(x=>x.clientId===c.id).length,
     quotes:tenant.quotes.filter(q=>q.clientId===c.id&&!q.archivedAt).length}});
   }
   return emit({duplicates:[...groups].filter(([,m])=>m.length>1).map(([email,clients])=>({email,clients}))});
  }
  const mergeRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/clients\/([a-z0-9-]+)\/merge$/);
  if(mergeRoute&&method==='POST'){
   const tenant=tenantBySlug(mergeRoute[1]);allowed(tenant,'C001');
   const kept=entity(tenant,'C001',mergeRoute[2]);
   const merged=entity(tenant,'C001',input.mergedClientId);
   if(kept.id===merged.id||kept.email.trim().toLowerCase()!==merged.email.trim().toLowerCase())throw error('Invalid merge');
   const reason=typeof input.reason==='string'?input.reason.slice(0,500):'';
   for(const d of tenant.deals)if(d.clientId===merged.id)d.clientId=kept.id;
   for(const e of tenant.events)if(e.clientId===merged.id)e.clientId=kept.id;
   for(const c of tenant.cases)if(c.clientId===merged.id)c.clientId=kept.id;
   for(const q of tenant.quotes)if(q.clientId===merged.id)q.clientId=kept.id;
   for(const pay of tenant.payments)if(pay.clientId===merged.id)pay.clientId=kept.id;
   merged.archivedAt=now();
   const merge={id:uuid(),keptClientId:kept.id,mergedClientId:merged.id,reason,createdAt:now()};
   tenant.clientMerges.push(merge);
   return send({merged:true,mergeId:merge.id,keptClientId:kept.id,mergedClientId:merged.id});
  }
  const dealTasksRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/crm\/([a-z0-9-]+)\/tasks(?:\/([a-z0-9-]+))?$/);
  if(dealTasksRoute){
   const tenant=tenantBySlug(dealTasksRoute[1]);allowed(tenant,'C002');
   const deal=getRecord(entityList(tenant,'C002'),dealTasksRoute[2]);
   const taskId=dealTasksRoute[3];
   const normTask=()=>{
    const title=String(input.title||'').trim(),dueAt=input.dueAt||null,status=input.status||'todo',assignedUserId=input.assignedUserId||null;
    if(title.length<2||title.length>180||!['todo','doing','done'].includes(status)||dueAt&&!Number.isFinite(Date.parse(dueAt))||assignedUserId&&!tenant.members.some(m=>m.id===assignedUserId&&m.status==='active'))throw error('Invalid deal task');
    return {title,dueAt,status,assignedUserId};
   };
   if(method==='GET')return emit({tasks:tenant.dealTasks.filter(t=>t.dealId===deal.id),statuses:['todo','doing','done']});
   if(method==='POST'){
    const task={id:uuid(),dealId:deal.id,...normTask(),createdAt:now(),updatedAt:now(),completedAt:null};
    if(task.status==='done')task.completedAt=now();
    tenant.dealTasks.unshift(task);return send({task});
   }
   const task=getRecord(tenant.dealTasks.filter(t=>t.dealId===deal.id),taskId);
   if(method==='DELETE'){tenant.dealTasks.splice(tenant.dealTasks.indexOf(task),1);return send({archived:true});}
   const data=normTask();
   Object.assign(task,data,{updatedAt:now(),completedAt:data.status==='done'?(task.completedAt||now()):null});
   return send({ok:true});
  }
  const dealQuotesRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/crm\/([a-z0-9-]+)\/quotes(?:\/([a-z0-9-]+))?$/);
  if(dealQuotesRoute){
   const tenant=tenantBySlug(dealQuotesRoute[1]);allowed(tenant,'C002');
   const deal=getRecord(entityList(tenant,'C002'),dealQuotesRoute[2]);
   const quoteId=dealQuotesRoute[3];
   if(method==='GET')return emit({quotes:tenant.quotes.filter(q=>q.dealId===deal.id&&!q.archivedAt).map(q=>({id:q.id,clientId:q.clientId,clientName:q.clientName,title:q.title,status:q.status,totalCents:q.totalCents,createdAt:q.createdAt,updatedAt:q.updatedAt}))});
   if(method==='POST'){
    allowed(tenant,'T013');
    const quote=tenant.quotes.find(q=>q.id===quoteId&&!q.archivedAt);if(!quote)throw error('Not found',404);
    if(deal.clientId&&quote.clientId&&deal.clientId!==quote.clientId)throw error('Relation mismatch',409);
    if(quote.dealId===deal.id)throw error('Duplicate relation',409);
    quote.dealId=deal.id;quote.updatedAt=now();return send({linked:true,dealId:deal.id,quoteId});
   }
   if(method==='DELETE'){
    const quote=tenant.quotes.find(q=>q.id===quoteId&&!q.archivedAt);if(!quote||quote.dealId!==deal.id)throw error('Not found',404);
    quote.dealId=null;quote.updatedAt=now();return send({removed:true});
   }
   throw error('Not found',404);
  }
  const quoteDealRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/quotes\/([a-z0-9-]+)\/deal$/);
  if(quoteDealRoute&&method==='GET'){
   const tenant=tenantBySlug(quoteDealRoute[1]);allowed(tenant,'T013');
   const quote=tenant.quotes.find(q=>q.id===quoteDealRoute[2]&&!q.archivedAt);if(!quote)throw error('Not found',404);
   const deal=quote.dealId?tenant.deals.find(d=>d.id===quote.dealId&&!d.archivedAt):null;
   return emit({deal:deal?{id:deal.id,title:deal.title}:null});
  }
  const docSearchRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/cases\/documents\/search$/);
  if(docSearchRoute&&method==='GET'){
   const tenant=tenantBySlug(docSearchRoute[1]);allowed(tenant,'C003');
   const term=(url.searchParams.get('q')||'').trim().toLowerCase();
   const type=url.searchParams.get('type')||'',expiry=url.searchParams.get('expiry')||'',caseId=url.searchParams.get('caseId')||'';
   if(term.length>120||type&&!['other','contract','identification','invoice','consent','certificate'].includes(type)||expiry&&!['expired','soon','valid','none'].includes(expiry))throw error('Invalid document');
   return emit({documents:p0searchDocs(tenant,{term,type,expiry,caseId}).slice(0,100)});
  }
  const docExpiringRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/cases\/documents\/expiring$/);
  if(docExpiringRoute&&method==='GET'){
   const tenant=tenantBySlug(docExpiringRoute[1]);allowed(tenant,'C003');
   return emit({expired:p0searchDocs(tenant,{expiry:'expired'}),expiringSoon:p0searchDocs(tenant,{expiry:'soon'}),
    counts:{expired:p0searchDocs(tenant,{expiry:'expired'}).length,expiringSoon:p0searchDocs(tenant,{expiry:'soon'}).length}});
  }
  const caseLinksRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/cases\/([a-z0-9-]+)\/links$/);
  if(caseLinksRoute&&method==='GET'){
   const tenant=tenantBySlug(caseLinksRoute[1]);allowed(tenant,'C003');
   const dossier=getRecord(entityList(tenant,'C003'),caseLinksRoute[2]);
   const client=tenant.clients.find(c=>c.id===dossier.clientId);
   const enable=tool=>tenant.tools.some(x=>x.id===tool&&x.enabled);
   return emit({client:client?{id:client.id,name:client.name}:null,
    deals:enable('C002')?entityList(tenant,'C002').filter(d=>d.clientId===dossier.clientId).map(d=>({id:d.id,title:d.title,stage:d.stage})):[],
    appointments:enable('C004')?entityList(tenant,'C004').filter(e=>e.clientId===dossier.clientId).map(e=>({id:e.id,title:e.title,startsAt:e.startsAt,status:e.status})):[],
    quotes:enable('T013')?tenant.quotes.filter(q=>q.clientId===dossier.clientId&&!q.archivedAt).map(q=>({id:q.id,title:q.title,status:q.status,totalCents:q.totalCents})):[],
    explicit:tenant.entityLinks.filter(x=>(x.leftToolId==='C003'&&x.leftRecordId===dossier.id)||(x.rightToolId==='C003'&&x.rightRecordId===dossier.id)).map(x=>({id:x.id,targetToolId:x.leftToolId==='C003'?x.rightToolId:x.leftToolId,targetRecordId:x.leftToolId==='C003'?x.rightRecordId:x.leftRecordId,relationType:x.relationType}))});
  }
  const caseAccessRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/cases\/([a-z0-9-]+)\/access$/);
  if(caseAccessRoute){
   const tenant=tenantBySlug(caseAccessRoute[1]);allowed(tenant,'C003');
   const dossier=getRecord(entityList(tenant,'C003'),caseAccessRoute[2]);
   if(method==='GET')return emit({grants:tenant.caseAccess[dossier.id]||[]});
   if(method==='PUT'){
    const {userId,access}=input;
    if(access!==null&&access!==undefined&&!['read','write'].includes(access))throw error('Invalid document');
    const member=tenant.members.find(m=>m.id===userId&&m.status==='active');if(!member)throw error('Not found',404);
    const grants=tenant.caseAccess[dossier.id]??(tenant.caseAccess[dossier.id]=[]);
    if(access===null||access===undefined)tenant.caseAccess[dossier.id]=grants.filter(g=>g.userId!==userId);
    else{const g=grants.find(g=>g.userId===userId);if(g)g.access=access;else grants.push({userId,email:member.email,access});}
    tenant.caseEvents.unshift({id:uuid(),caseId:dossier.id,action:'updated',description:'Acceso del expediente actualizado',createdAt:now()});
    return send({ok:true});
   }
   throw error('Not found',404);
  }
  const docVisRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/case-documents\/([a-z0-9-]+)\/visibility$/);
  if(docVisRoute&&method==='PATCH'){
   const tenant=tenantBySlug(docVisRoute[1]);allowed(tenant,'C003');
   const meta=tenant.caseDocumentMeta[docVisRoute[2]];if(!meta)throw error('Not found',404);
   if(!['team','restricted'].includes(input.visibility))throw error('Invalid document');
   tenant.docSettings[docVisRoute[2]]=input.visibility;
   tenant.caseEvents.unshift({id:uuid(),caseId:meta.caseId,action:'updated',description:'Visibilidad del documento: '+input.visibility,createdAt:now()});
   return send({ok:true,visibility:input.visibility});
  }
  const docAccessRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/case-documents\/([a-z0-9-]+)\/access$/);
  if(docAccessRoute){
   const tenant=tenantBySlug(docAccessRoute[1]);allowed(tenant,'C003');
   const meta=tenant.caseDocumentMeta[docAccessRoute[2]];if(!meta)throw error('Not found',404);
   if(method==='GET')return emit({visibility:tenant.docSettings[docAccessRoute[2]]||'team',caseId:meta.caseId,grants:tenant.docAccess[docAccessRoute[2]]||[]});
   if(method==='PUT'){
    const {userId,access}=input;
    if(access!==null&&access!==undefined&&!['read','write'].includes(access))throw error('Invalid document');
    const member=tenant.members.find(m=>m.id===userId&&m.status==='active');if(!member)throw error('Not found',404);
    const grants=tenant.docAccess[docAccessRoute[2]]??(tenant.docAccess[docAccessRoute[2]]=[]);
    if(access===null||access===undefined)tenant.docAccess[docAccessRoute[2]]=grants.filter(g=>g.userId!==userId);
    else{const g=grants.find(g=>g.userId===userId);if(g)g.access=access;else grants.push({userId,email:member.email,access});}
    tenant.caseEvents.unshift({id:uuid(),caseId:meta.caseId,action:'updated',description:'Acceso del documento actualizado',createdAt:now()});
    return send({ok:true});
   }
   throw error('Not found',404);
  }
  const memberToolsRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/member-tools(?:\/([a-z0-9-]+))?$/);
  if(memberToolsRoute){
   const tenant=tenantBySlug(memberToolsRoute[1]);
   const userId=memberToolsRoute[2];
   if(method==='GET'){
    if(!userId){
     const access={};
     for(const t of tenant.tools.filter(t=>t.enabled))access[t.id]=p0defaultAccess('owner',t.id);
     return emit({role:'owner',access});
    }
    return emit(p0memberToolsList(tenant));
   }
   if(method==='PUT'){
    const member=getRecord(tenant.members,userId);
    const tools=input.tools||{};
    if(typeof tools!=='object'||Array.isArray(tools)||Object.entries(tools).some(([tool,a])=>!catalog.tools.some(t=>t.id===tool)||!['none','read','write'].includes(a)))throw error('Invalid tenant data');
    const kept={};
    for(const [tool,a] of Object.entries(tools))if(a!==p0defaultAccess(member.role,tool))kept[tool]=a;
    tenant.memberTools[member.id]=kept;
    return send(p0memberToolsList(tenant));
   }
   throw error('Not found',404);
  }
  const adminMemberToolsRoute=p.match(/^\/api\/admin\/tenants\/([a-z0-9-]+)\/members\/([a-z0-9-]+)\/tools$/);
  if(adminMemberToolsRoute){
   const tenant=tenantById(adminMemberToolsRoute[1]);
   const member=getRecord(tenant.members,adminMemberToolsRoute[2]);
   if(method==='GET')return emit(p0memberToolsList(tenant));
   if(method==='PUT'){
    const tools=input.tools||{};
    if(typeof tools!=='object'||Array.isArray(tools)||Object.entries(tools).some(([tool,a])=>!catalog.tools.some(t=>t.id===tool)||!['none','read','write'].includes(a)))throw error('Invalid tenant data');
    const kept={};
    for(const [tool,a] of Object.entries(tools))if(a!==p0defaultAccess(member.role,tool))kept[tool]=a;
    tenant.memberTools[member.id]=kept;
    return send(p0memberToolsList(tenant));
   }
   throw error('Not found',404);
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
    demoAudit(t,'tenant.created',t.id);
    return send({tenant:{id:t.id,slug:t.slug,name:t.name,suiteId:t.suiteId}});
   }
  }
  let m=p.match(/^\/api\/admin\/tenants\/([a-z0-9-]+)(?:\/(tools\/([A-Z][0-9]{3})|members(?:\/([a-z0-9-]+))?))?$/);
  // 'search' es ruta propia (/api/admin/tenants/search), no un id de tenant.
  if(m&&m[1]!=='search'){
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
     demoAudit(t,'tenant.member_added',email);
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
  if(p==='/api/admin/audit'&&method==='GET'){
   return emit({events:demoAuditFilter(state.tenants.flatMap(t=>t.audit),url),actions:demoAuditActions});
  }
  const adminInvites=p.match(/^\/api\/admin\/tenants\/([a-z0-9-]+)\/invitations(?:\/([a-z0-9-]+))?(?:\/(resend))?$/);
  if(adminInvites)return invitationsHandler(tenantById(adminInvites[1]),adminInvites[2],adminInvites[3],method,input,send);
  const appInvites=p.match(/^\/api\/app\/([a-z0-9-]+)\/invitations(?:\/([a-z0-9-]+))?(?:\/(resend))?$/);
  if(appInvites)return invitationsHandler(tenantBySlug(appInvites[1]),appInvites[2],appInvites[3],method,input,send);
  const appAudit=p.match(/^\/api\/app\/([a-z0-9-]+)\/audit$/);
  if(appAudit&&method==='GET')return emit({events:demoAuditFilter(tenantBySlug(appAudit[1]).audit,url),actions:demoAuditActions});
  if(p==='/api/public/invitations'){
   if(method==='GET'){
    const token=url.searchParams.get('token')||'';
    const found=state.tenants.flatMap(t=>t.invitations.map(i=>({t,i}))).find(x=>x.i.token===token);
    if(!found)throw error('Invitation not found',404);
    const demoStatus=demoInviteStatus(found.i);
    return emit({status:demoStatus==='pending'?'valid':demoStatus,invitation:{...demoPublicInvite(found.i),organizationName:found.t.name,organizationSlug:found.t.slug}});
   }
   if(method==='POST'){
    const token=String(input.token||'');
    const found=state.tenants.flatMap(t=>t.invitations.map(i=>({t,i}))).find(x=>x.i.token===token);
    if(!found)throw error('Not found',404);
    const {t,i:inv}=found;
    const status=demoInviteStatus(inv);
    if(status==='expired')throw error('Invitation expired',410);
    if(status==='consumed')throw error('Invitation already used',410);
    inv.consumedAt=now();
    const member=t.members.find(x=>x.email===inv.email);
    if(member){member.status='active';if(member.role!=='owner')member.role=inv.role;}
    else t.members.push({id:uuid(),email:inv.email,role:inv.role,status:'active'});
    demoAudit(t,'tenant.invitation_accepted',inv.id);
    return send({organizationId:t.id,organizationSlug:t.slug,organizationName:t.name,email:inv.email,role:inv.role});
   }
  }
  if(p==='/api/app/organizations'&&method==='GET')return emit({organizations:state.tenants.filter(t=>t.status==='active').map(t=>({slug:t.slug,name:t.name,role:'owner',suiteId:t.suiteId}))});
  m=p.match(/^\/api\/app\/([a-z0-9-]+)\/config$/);
  if(m&&method==='GET'){
   const t=tenantBySlug(m[1]);const suite=catalog.suites.find(s=>s.id===t.suiteId);
   return emit({tenant:{id:t.id,slug:t.slug,name:t.name,role:'owner',displayName:t.displayName,logoUrl:t.logoUrl,primaryColor:t.primaryColor,secondaryColor:t.secondaryColor,timezone:t.timezone,suiteId:t.suiteId,suiteName:suite?.name||t.suiteId},
    appearance:t.appearance,backgrounds:t.backgrounds,tools:t.tools.filter(x=>x.enabled),members:t.members.filter(x=>x.status==='active').map(x=>({email:x.email,role:x.role}))});
  }
  // Guía de primer uso + datos de ejemplo (018), espejo en demo del flujo real.
  const onboardingProgress=t=>{
   const stored=t.onboarding?.steps||{};
   const live=list=>list.filter(x=>!x.archivedAt);
   const derived={'first-client':live(t.clients).length>0,catalog:live(t.catalogItems).length>0,quote:live(t.quotes).length>0,team:t.members.filter(x=>x.status==='active').length>1,billing:false};
   const steps=onboardingSteps.map(s=>({key:s.key,title:s.title,description:s.description,toolId:s.toolId,done:!!stored[s.key]||!!derived[s.key],auto:!!derived[s.key]&&!stored[s.key]}));
   const doneCount=steps.filter(s=>s.done).length;
   return {organizationId:t.id,userId:'demo-user',steps,doneCount,total:steps.length,complete:doneCount===steps.length,demoSeeded:(t.onboarding?.demoSeeded||[]).length>0,demoCount:(t.onboarding?.demoSeeded||[]).length};
  };
  m=p.match(/^\/api\/app\/([a-z0-9-]+)\/onboarding$/);
  if(m){
   const t=tenantBySlug(m[1]);
   if(method==='GET')return emit(onboardingProgress(t));
   if(method==='POST'){
    if(input.action==='reset'){t.onboarding.steps={};return send(onboardingProgress(t));}
    const step=onboardingSteps.find(s=>s.key===input.step);
    if(!step)throw error('Invalid onboarding step');
    t.onboarding.steps[step.key]=now();return send(onboardingProgress(t));
   }
   throw error('Not found',404);
  }
  m=p.match(/^\/api\/app\/([a-z0-9-]+)\/demo-data$/);
  if(m){
   const t=tenantBySlug(m[1]);
   if(method==='GET')return emit({demo:t.onboarding.demoSeeded});
   if(method==='POST'){
    if(t.onboarding.demoSeeded.length)return send({seeded:false,alreadySeeded:true,demo:t.onboarding.demoSeeded});
    const suite=catalog.suites.find(s=>s.id===t.suiteId);
    const clientId=uuid(),itemId=uuid(),quoteId=uuid();
    const priceCents=99000,vatCents=Math.round(priceCents*.16);
    const productName=suite?`Servicio de ejemplo — ${suite.name}`:'Servicio de ejemplo';
    const client={id:clientId,name:'DEMO — Cliente de ejemplo',company:'Empresa Demo',email:'demo@ejemplo.invalid',phone:'',status:'prospect',notes:'Cliente de ejemplo (DEMO). Se puede eliminar desde la guía de primer uso.',createdAt:now(),updatedAt:now()};
    t.clients.unshift(client);
    const item={id:itemId,sku:'DEMO-001',name:`DEMO — ${productName}`,description:'Producto o servicio de ejemplo (DEMO). Precio de muestra, no es una venta real.',priceCents,category:'General',active:true,createdAt:now(),updatedAt:now()};
    t.catalogItems.unshift(item);
    const quote={id:quoteId,clientId,clientName:client.name,title:'DEMO — Cotización de ejemplo',notes:'Cotización de ejemplo (DEMO). No es una venta real.',vatRate:16,status:'draft',validUntil:null,subtotalCents:priceCents,vatCents,totalCents:priceCents+vatCents,publicToken:'demo',acceptedAt:null,createdAt:now(),updatedAt:now(),lines:[{id:uuid(),description:`DEMO — ${productName}`,quantity:1,unitPriceCents:priceCents,lineTotalCents:priceCents,position:0}]};
    t.quotes.unshift(quote);
    t.onboarding.demoSeeded=[{entityType:'client',entityId:clientId},{entityType:'catalog_item',entityId:itemId},{entityType:'quote',entityId:quoteId}];
    return send({seeded:true,alreadySeeded:false,demo:t.onboarding.demoSeeded});
   }
   if(method==='DELETE'){
    const seeded=t.onboarding.demoSeeded;
    for(const s of seeded){
     if(s.entityType==='client')t.clients=t.clients.filter(c=>c.id!==s.entityId);
     if(s.entityType==='catalog_item')t.catalogItems=t.catalogItems.filter(c=>c.id!==s.entityId);
     if(s.entityType==='quote')t.quotes=t.quotes.filter(c=>c.id!==s.entityId);
    }
    t.onboarding.demoSeeded=[];
    return send({removed:seeded.length,demo:seeded});
   }
   throw error('Not found',404);
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
   const linkedDeal=d=>({...d,clientName:t.clients.find(c=>c.id===d.clientId)?.name||null,
    assignedUserEmail:t.members.find(m=>m.id===d.assignedUserId)?.email||null});
   if(method==='GET'){
    if(module==='clients')return emit({clients:entityList(t,'C001'),statuses});
    const canClients=t.tools.some(x=>x.id==='C001'&&x.enabled),canCRM=t.tools.some(x=>x.id==='C002'&&x.enabled);
    if(module==='crm')return emit({deals:deals.map(d=>canClients?linkedDeal(d):{...d,clientId:null,clientName:null}),clients:canClients?clientChoices:[],members:t.members.filter(m=>m.status==='active').map(m=>({id:m.id,email:m.email,role:m.role})),stages});
    if(module==='agenda'){
     let agendaList=list;
     const view=url.searchParams.get('view'),viewDate=url.searchParams.get('date')||new Date().toISOString().slice(0,10);
     if(view==='day')agendaList=list.filter(e=>(e.startsAt||'').slice(0,10)===viewDate);
     else if(view==='week'){
      const d=new Date(viewDate+'T00:00:00Z'),dow=(d.getUTCDay()+6)%7;
      const from=new Date(d.getTime()-dow*86400000).toISOString().slice(0,10);
      const to=new Date(d.getTime()+(6-dow)*86400000).toISOString().slice(0,10);
      agendaList=list.filter(e=>{const day=(e.startsAt||'').slice(0,10);return day>=from&&day<=to;});
     }
     return emit({events:agendaList.map(e=>({...e,
      assigneeEmail:e.assigneeUserId?t.members.find(m=>m.id===e.assigneeUserId)?.email||null:null,

      clientId:canClients?e.clientId:null,clientName:canClients?t.clients.find(c=>c.id===e.clientId)?.name||null:null,
      dealId:canCRM?e.dealId:null,dealTitle:canCRM?t.deals.find(d=>d.id===e.dealId)?.title||null:null})),
      clients:canClients?clientChoices:[],deals:canCRM?deals.map(d=>({id:d.id,title:d.title,clientId:canClients?d.clientId||null:null})):[],
      members:t.members.filter(m=>m.status==='active').map(m=>({userId:m.id,email:m.email,role:m.role})),
      view:view||'list',from:view==='list'?null:viewDate,to:view==='list'?null:viewDate,
      statuses:['scheduled','confirmed','completed','cancelled'],
      reminders:{attempted:0,created:0,pending:0},
      externalCalendars:{status:'pending',note:'Sincronización con Google/Outlook pendiente de integración.'}});
    }
    return emit({items:list.map(i=>({...i,isLow:i.quantity<=i.lowStock,
      variants:t.variants.filter(v=>v.itemId===i.id&&!v.archivedAt).map(v=>({...v,
       isLow:v.quantity<=v.lowStock,expired:!!v.expiresOn&&v.expiresOn<new Date().toISOString().slice(0,10),
       expiringSoon:!!v.expiresOn&&v.expiresOn>=new Date().toISOString().slice(0,10)})),
      lowVariants:t.variants.filter(v=>v.itemId===i.id&&!v.archivedAt&&v.quantity<=v.lowStock).length,
      expiringVariants:t.variants.filter(v=>v.itemId===i.id&&!v.archivedAt&&v.expiresOn&&v.expiresOn<=new Date(Date.now()+30*86400000).toISOString().slice(0,10)).length})),
     movements:t.movements,
     purchaseNote:'La orden de compra real es T008 (Compras, frente p1b): aquí se registra el proveedor por variante.'});
   }
   if(module==='inventory'&&movement==='movements'&&method==='POST'){
    const item=getRecord(list,id),delta=input.delta;
    if(!Number.isSafeInteger(delta)||!delta)throw error('Invalid stock movement');
    if(item.quantity+delta<0)throw error('Insufficient stock',409);
    if(input.variantId){
     const variant=t.variants.find(v=>v.id===input.variantId&&v.itemId===item.id&&!v.archivedAt);
     if(!variant)throw error('Not found',404);
     if(variant.quantity+delta<0)throw error('Insufficient stock',409);
     variant.quantity+=delta;
    }
    item.quantity+=delta;
    const m={id:uuid(),itemId:item.id,variantId:input.variantId||null,delta,note:String(input.note||'').slice(0,400),createdAt:now()};
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
    const assignedUserId=input.assignedUserId||null;
    if(assignedUserId&&!t.members.some(m=>m.id===assignedUserId&&m.status==='active'))throw error('Invalid deal');
    const deal={title:String(input.title||'').trim(),customer:String(input.customer||''),clientId,assignedUserId,
      amountCents:input.amountCents??0,stage:input.stage||'lead',followUpAt:input.followUpAt||null,notes:String(input.notes||'')};
    if(deal.title.length<2||!stages.includes(deal.stage)||!Number.isSafeInteger(deal.amountCents)||deal.amountCents<0)throw error('Invalid deal');
    if(method==='POST'){const d={id:uuid(),...deal,createdAt:now(),updatedAt:now()};list.unshift(d);return send({deal:d});}
    if(method==='PATCH'){
     const current=getRecord(deals,id);
     if(deal.clientId&&t.events.some(e=>e.dealId===id&&e.clientId&&e.clientId!==deal.clientId))throw error('Relation mismatch',409);
     Object.assign(current,deal,{updatedAt:now()});
     if(deal.clientId)for(const event of t.events)if(event.dealId===id&&!event.clientId)event.clientId=deal.clientId;
     return send({ok:true});
    }
   }
   if(module==='agenda'){
    if(method==='PATCH'&&Object.keys(input).length===1&&['completed','cancelled','confirmed'].includes(input.status)){getRecord(list,id).status=input.status;return send({ok:true});}
    let clientId=input.clientId||null;const dealId=input.dealId||null;
    if(dealId){
     allowed(t,'C002');
     const deal=getRecord(deals,dealId);
     if(deal.clientId){if(clientId&&clientId!==deal.clientId)throw error('Relation mismatch');clientId=deal.clientId;}
    }
    if(clientId)allowed(t,'C001');
    if(clientId&&!clients.some(x=>x.id===clientId))throw error('Client not found',404);
    if(input.assigneeUserId&&!t.members.some(m=>m.id===input.assigneeUserId&&m.status==='active'))throw error('Assignee not found',404);
    const event={title:String(input.title||'').trim(),customer:String(input.customer||''),clientId,dealId,
     assigneeUserId:input.assigneeUserId||null,
     remindMinutesBefore:input.remindMinutesBefore??null,
     resource:String(input.resource||'general').trim().toLowerCase(),startsAt:input.startsAt,endsAt:input.endsAt,
     status:input.status||'scheduled',notes:String(input.notes||'')};
    if(event.title.length<2||!Number.isFinite(Date.parse(event.startsAt))||!Number.isFinite(Date.parse(event.endsAt))||event.endsAt<=event.startsAt)throw error('Invalid appointment');
    if(!['scheduled','confirmed','completed','cancelled'].includes(event.status))throw error('Invalid appointment');
    if(['scheduled','confirmed'].includes(event.status)&&list.some(x=>x.id!==id&&['scheduled','confirmed'].includes(x.status)&&x.resource===event.resource&&x.startsAt<event.endsAt&&x.endsAt>event.startsAt))throw error('Schedule conflict',409);
    if(method==='POST'){const e={id:uuid(),...event};list.unshift(e);return send({event:e});}
    if(method==='PATCH'){Object.assign(getRecord(list,id),event);return send({ok:true});}
   }
   if(module==='inventory'){
    if(method==='POST'){
     const sku=String(input.sku||'').trim().toUpperCase(),title=String(input.title||'').trim();
     if(!sku||title.length<2||list.some(x=>x.sku===sku))throw error('Duplicate SKU',409);
     const item={id:uuid(),sku,title,quantity:0,lowStock:Number(input.lowStock)||0,location:String(input.location||'')};list.push(item);
     for(const raw of Array.isArray(input.variants)?input.variants:[]){
      const label=String(raw.label||'').trim();
      const vsku=raw.sku?String(raw.sku).trim().toUpperCase():null;
      if(label.length<2||vsku&&t.variants.some(v=>v.sku===vsku))throw error('Invalid inventory variant');
      t.variants.push({id:uuid(),itemId:item.id,label,sku:vsku,quantity:0,lowStock:Number(raw.lowStock)||0,
       warehouse:String(raw.warehouse||'').trim(),lot:String(raw.lot||'').trim(),
       expiresOn:raw.expiresOn||null,supplier:String(raw.supplier||'').trim()});
     }
     return send({item});
    }
    if(method==='PATCH'){
     const item=getRecord(list,id);
     Object.assign(item,{title:input.title??item.title,location:input.location??item.location,lowStock:input.lowStock??item.lowStock});
     return send({ok:true});
    }
   }
  }
  // Importación CSV + migración JSON en la demo (P0, E004): misma validación
  // y mismo resumen que el servidor real, pero en sessionStorage. El panel
  // de la UI llama a estas rutas con ?demo=1; sin ellas la demo diría
  // "Not found" al importar.
  const demoParseCsv=text=>{
   if(typeof text!=='string'||!text.trim())throw error('Invalid import');
   const clean=text.replace(/^\uFEFF/,'');
   const out=[];let field='',row=[],line=1,rowLine=1,inQ=false;
   const pf=()=>{row.push(field);field='';};
   const pr=()=>{pf();out.push({values:row,line:rowLine});row=[];rowLine=line;};
   for(let i=0;i<clean.length;i++){const ch=clean[i];
    if(inQ){if(ch==='"'){if(clean[i+1]==='"'){field+='"';i++;}else inQ=false;}else{if(ch==='\n')line++;field+=ch;}}
    else if(ch==='"'&&field==='')inQ=true;
    else if(ch===',')pf();
    else if(ch==='\r'){if(clean[i+1]==='\n')i++;line++;pr();}
    else if(ch==='\n'){line++;pr();}
    else field+=ch;}
   if(inQ)throw error('Invalid import');
   if(field!==''||row.length)pr();
   return out.filter(r=>r.values.some(v=>String(v??'').trim()!==''));
  };
  const demoNormKey=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const demoPriceCents=v=>{
   if(typeof v==='number')return Number.isFinite(v)&&v>=0?Math.round(v*100):null;
   if(typeof v!=='string')return null;
   let s=v.trim().replace(/[$\s]|mxn/gi,'');
   if(!s||!/^[0-9.,]+$/.test(s))return null;
   const d=s.lastIndexOf('.'),c=s.lastIndexOf(',');
   if(d!==-1&&c!==-1){if(c>d)s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/,/g,'');}
   else if(c!==-1){s=s.slice(c+1).length===2?s.replace(',','.'):s.replace(/,/g,'');}
   if(!/^\d+(\.\d{1,2})?$/.test(s))return null;
   return Math.round(Number(s)*100);
  };
  const demoHeaderMap=(headers,aliases)=>{
   const cols=new Map();
   headers.forEach((h,i)=>{const f=aliases[demoNormKey(h)];if(f&&!cols.has(f))cols.set(f,i);});
   return cols;
  };
  const demoImportClients=(t,csv)=>{
   allowed(t,'C001');
   const parsed=demoParseCsv(csv);
   const cols=demoHeaderMap(parsed[0].values,{nombre:'name',name:'name',empresa:'company',company:'company',negocio:'company',correo:'email',email:'email','correo electronico':'email',telefono:'phone',tel:'phone',phone:'phone',whatsapp:'phone',estado:'status',estatus:'status',status:'status',notas:'notes',notes:'notes'});
   if(!cols.has('name'))throw error('Invalid import');
   const seen=new Set(t.clients.filter(c=>!c.archivedAt).map(c=>c.email.toLowerCase()).filter(Boolean));
   const records=[],errors=[];
   for(const r of parsed.slice(1)){
    const get=f=>String(r.values[cols.get(f)]??'').trim();
    const name=get('name'),email=get('email').toLowerCase(),phone=get('phone'),status=(get('status')||'prospect').toLowerCase();
    const rowErrs=[];
    if(name.length<2)rowErrs.push({field:'name',reason:'El nombre es obligatorio (mínimo 2 caracteres).'});
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))rowErrs.push({field:'email',reason:'El correo no tiene un formato válido.'});
    if(email&&seen.has(email))rowErrs.push({field:'email',reason:'Duplicado: ese correo ya existe en esta empresa.'});
    if(!statuses.includes(status))rowErrs.push({field:'status',reason:'El estado debe ser prospect, active o inactive.'});
    if(rowErrs.length){for(const e of rowErrs)errors.push({row:r.line,...e});continue;}
    if(email)seen.add(email);
    records.push({id:uuid(),name,company:get('company'),email,phone,status,notes:get('notes'),createdAt:now(),updatedAt:now()});
   }
   for(const c of records)t.clients.unshift(c);
   return {summary:{total:parsed.length-1,imported:records.length,skipped:parsed.length-1-records.length,errors:errors.length,duplicates:errors.filter(e=>e.reason.startsWith('Duplicado')).length},errors};
  };
  const demoImportCatalog=(t,csv)=>{
   allowed(t,'C006');
   const parsed=demoParseCsv(csv);
   const cols=demoHeaderMap(parsed[0].values,{sku:'sku',codigo:'sku',code:'sku',nombre:'name',name:'name',producto:'name',descripcion:'description',description:'description',precio:'price','precio mxn':'price',price:'price',categoria:'category',category:'category'});
   if(!cols.has('name'))throw error('Invalid import');
   const seen=new Set(t.catalogItems.filter(i=>!i.archivedAt).map(i=>i.sku.toUpperCase()).filter(Boolean));
   const records=[],errors=[];
   for(const r of parsed.slice(1)){
    const get=f=>String(r.values[cols.get(f)]??'').trim();
    const name=get('name'),sku=get('sku').toUpperCase(),priceCents=demoPriceCents(get('price'));
    const rowErrs=[];
    if(name.length<2)rowErrs.push({field:'name',reason:'El nombre es obligatorio (mínimo 2 caracteres).'});
    if(sku&&!/^[A-Z0-9][A-Z0-9._-]{0,47}$/.test(sku))rowErrs.push({field:'sku',reason:'El SKU solo admite letras, dígitos, punto, guion y guion bajo.'});
    if(priceCents===null)rowErrs.push({field:'price',reason:'El precio no es un importe válido (ejemplo: 129.50).'});
    if(sku&&seen.has(sku))rowErrs.push({field:'sku',reason:'Duplicado: ese SKU ya existe en este catálogo.'});
    if(rowErrs.length){for(const e of rowErrs)errors.push({row:r.line,...e});continue;}
    if(sku)seen.add(sku);
    records.push({id:uuid(),sku,name,description:get('description'),priceCents,category:get('category')||'General',active:true,createdAt:now(),updatedAt:now()});
   }
   for(const item of records)t.catalogItems.unshift(item);
   return {summary:{total:parsed.length-1,imported:records.length,skipped:parsed.length-1-records.length,errors:errors.length,duplicates:errors.filter(e=>e.reason.startsWith('Duplicado')).length},errors};
  };
  const demoImportMigration=(t,payload)=>{
   if(!payload||typeof payload!=='object'||Array.isArray(payload))throw error('Invalid import');
   const errors=[];let imported=0;const bySection={};
   if(Array.isArray(payload.clients)&&payload.clients.length){
    const csv=['Nombre,Empresa,Correo,Teléfono,Estado,Notas',...payload.clients.map(c=>[c.name??c.nombre??'',c.company??c.empresa??'',c.email??c.correo??'',c.phone??c.telefono??'',c.status??c.estado??'prospect',c.notes??c.notas??''].map(v=>String(v).includes(',')?'"'+String(v).replace(/"/g,'""')+'"':v).join(','))].join('\r\n');
    const r=demoImportClients(t,csv);
    imported+=r.summary.imported;errors.push(...r.errors.map(e=>({...e,section:'clients'})));
    bySection.clients=r.summary;
   }
   if(Array.isArray(payload.catalogItems)&&payload.catalogItems.length){
    const csv=['SKU,Nombre,Descripción,Precio,Categoría',...payload.catalogItems.map(c=>[c.sku??'',c.name??c.nombre??'',c.description??c.descripcion??'',c.price??(c.priceCents!==undefined?c.priceCents/100:''),c.category??c.categoria??'General'].map(v=>String(v).includes(',')?'"'+String(v).replace(/"/g,'""')+'"':v).join(','))].join('\r\n');
    const r=demoImportCatalog(t,csv);
    imported+=r.summary.imported;errors.push(...r.errors.map(e=>({...e,section:'catalogItems'})));
    bySection.catalogItems=r.summary;
   }
   const quoteSection={total:payload.quotes?.length||0,imported:0,errors:0};
   if(Array.isArray(payload.quotes)){
    allowed(t,'T013');
    payload.quotes.forEach((q,i)=>{
     try{
      const lines=(q.lines||[]).map((l,pos)=>{
       const unitPriceCents=l.unitPriceCents!==undefined?l.unitPriceCents:demoPriceCents(l.unitPrice??l.price);
       if(!String(l.description||'').trim()||!Number.isSafeInteger(l.quantity)||l.quantity<=0||unitPriceCents===null)throw error('Invalid quote');
       return {description:String(l.description).trim(),quantity:l.quantity,unitPriceCents,lineTotalCents:l.quantity*unitPriceCents,position:pos};
      });
      if(!String(q.title||'').trim()||q.title.trim().length<2||!lines.length||![0,8,16].includes(q.vatRate??16))throw error('Invalid quote');
      const sub=lines.reduce((s,l)=>s+l.lineTotalCents,0),vat=Math.round(sub*(q.vatRate??16)/100);
      t.quotes.unshift({id:uuid(),clientId:null,clientName:String(q.clientName||q.client||'').trim(),title:String(q.title).trim(),notes:String(q.notes||'').trim(),vatRate:q.vatRate??16,status:'draft',validUntil:q.validUntil||null,subtotalCents:sub,vatCents:vat,totalCents:sub+vat,publicToken:Array.from({length:32},()=>'0123456789abcdef'[Math.floor(Math.random()*16)]).join(''),acceptedAt:null,createdAt:now(),updatedAt:now(),lines});
      quoteSection.imported++;
     }catch{quoteSection.errors++;errors.push({row:i+1,section:'quotes',field:'title',reason:'La cotización no pasa la validación (título y al menos una partida válida).'});}
    });
    imported+=quoteSection.imported;bySection.quotes=quoteSection;
   }
   const expenseSection={total:payload.expenses?.length||0,imported:0,errors:0};
   if(Array.isArray(payload.expenses)){
    allowed(t,'C007');
    payload.expenses.forEach((e,i)=>{
     const amountCents=e.amountCents!==undefined?e.amountCents:demoPriceCents(e.amount??e.price);
     const occurredOn=e.occurredOn||e.date||e.fecha;
     if(String(e.description||'').trim().length<2||!Number.isSafeInteger(amountCents)||amountCents<=0||!validExpiry(occurredOn)||!['insumos','renta','servicios','transporte','marketing','personal','impuestos','otros'].includes(e.category||'otros')){
      expenseSection.errors++;errors.push({row:i+1,section:'expenses',field:'description',reason:'El gasto no pasa la validación (concepto, monto y fecha válidos).'});return;
     }
     t.expenses.unshift({id:uuid(),description:String(e.description).trim(),amountCents,occurredOn,category:e.category||'otros',vendor:String(e.vendor||'').trim(),createdAt:now(),updatedAt:now()});
     expenseSection.imported++;
    });
    imported+=expenseSection.imported;bySection.expenses=expenseSection;
   }
   const total=(payload.clients?.length||0)+(payload.catalogItems?.length||0)+(payload.quotes?.length||0)+(payload.expenses?.length||0);
   if(!total)throw error('Invalid import');
   return send({summary:{total,imported,skipped:total-imported,errors:errors.length,duplicates:errors.filter(e=>e.reason.startsWith('Duplicado')).length,bySection},errors});
  };
  const importRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/(clients|catalog)\/import$/);
  if(importRoute&&method==='POST'){
   const t=tenantBySlug(importRoute[1]);
   return send(importRoute[2]==='clients'?demoImportClients(t,input.csv):demoImportCatalog(t,input.csv));
  }
  const migrationRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/migration$/);
  if(migrationRoute&&method==='POST')return demoImportMigration(tenantBySlug(migrationRoute[1]),input);
  const adminImportRoute=p.match(/^\/api\/admin\/tenants\/([a-z0-9-]+)\/import$/);
  if(adminImportRoute&&method==='POST'){
   const t=tenantById(adminImportRoute[1]);
   if(input.kind==='clients')return send(demoImportClients(t,input.csv));
   if(input.kind==='catalog')return send(demoImportCatalog(t,input.csv));
   if(input.kind==='migration')return demoImportMigration(t,input.payload);
   throw error('Invalid import');
  }
  // TOOLS P1-A en memoria para la demo (mismo contrato que el servidor real).
  // Checklists, tareas, formularios y dashboard; variantes de inventario y
  // responsable/recordatorio de agenda van en sus handlers de abajo.
  // (csvCell/toCsv del bloque de commerce van después: este bloque usa su propio helper.)
  const p1aCell=v=>{const t=v==null?'':String(v);return /[",\n\r]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t;};
  const p1aCsv=(cols,rows)=>cols.map(c=>p1aCell(c[1])).join(',')+(rows.length?'\r\n'+rows.map(r=>cols.map(c=>p1aCell(r[c[0]])).join(',')).join('\r\n'):'')+'\r\n';
  const p1a=m=>p.match(new RegExp('^/api/app/([a-z0-9-]+)/workflows/'+m+'(?:/([a-z0-9-]+))?(?:/(templates|items|submissions|export|goals))?(?:/([a-z0-9-]+))?$'));
  const variantRoute=p.match(/^\/api\/app\/([a-z0-9-]+)\/workflows\/inventory\/([a-z0-9-]+)\/variants(?:\/([a-z0-9-]+))?$/);
  if(variantRoute){
   const t=tenantBySlug(variantRoute[1]);allowed(t,'C005');
   const item=getRecord(t.items,variantRoute[2]),variantId=variantRoute[3];
   if(method==='POST'){
    const label=String(input.label||'').trim();
    const sku=input.sku?String(input.sku).trim().toUpperCase():null;
    if(label.length<2||sku&&!/^[A-Z0-9][A-Z0-9._-]{1,47}$/.test(sku))throw error('Invalid inventory variant');
    if(sku&&t.variants.some(v=>v.sku===sku))throw error('Duplicate variant SKU',409);
    const v={id:uuid(),itemId:item.id,label,sku,quantity:0,lowStock:Number(input.lowStock)||0,
     warehouse:String(input.warehouse||'').trim(),lot:String(input.lot||'').trim(),
     expiresOn:input.expiresOn||null,supplier:String(input.supplier||'').trim()};
    t.variants.push(v);return send({variant:v});
   }
   const v=getRecord(t.variants.filter(x=>x.itemId===item.id),variantId);
   if(method==='DELETE'){v.archivedAt=now();return send({archived:true});}
   Object.assign(v,{label:String(input.label||v.label).trim(),warehouse:String(input.warehouse??v.warehouse),
    lot:String(input.lot??v.lot),expiresOn:input.expiresOn??v.expiresOn,supplier:String(input.supplier??v.supplier),
    lowStock:input.lowStock??v.lowStock});
   return send({ok:true});
  }
  let dm=p1a('checklists');
  if(dm){
   const t=tenantBySlug(dm[1]),id=dm[2],section=dm[3],itemId=dm[4];allowed(t,'T003');
   const live=c=>!c.archivedAt;
   if(id==='templates'){
    if(method==='GET')return emit({templates:t.checklistTemplates});
    const title=String(input.title||'').trim();
    const items=(Array.isArray(input.items)?input.items:[]).map((x,i)=>({title:String((x?.title ?? x) || '').trim(),position:i})).filter(x=>x.title.length>=2);
    if(title.length<2||!items.length)throw error('Invalid checklist template');
    const tpl={id:uuid(),title,description:String(input.description||'').trim(),items};
    t.checklistTemplates.unshift(tpl);return send({template:tpl});
   }
   if(section==='items'&&itemId&&method==='PATCH'){
    const c=getRecord(t.checklists.filter(live),id);
    const item=getRecord(c.items,itemId);
    item.checkedAt=input.checked?now():null;item.checkedBy=input.checked?'demo':null;
    if(input.evidenceMediaId!==undefined)item.evidenceMediaId=input.evidenceMediaId||null;
    const progress={total:c.items.length,checked:c.items.filter(x=>x.checkedAt).length};
    progress.percent=progress.total?Math.round(progress.checked*100/progress.total):0;
    c.status=progress.total&&progress.checked===progress.total?'completed':'open';
    return send({ok:true,checked:!!input.checked,progress});
   }
   if(section==='items'&&method==='POST'){
    const c=getRecord(t.checklists.filter(live),id);
    const title=String(input.title||'').trim();
    if(title.length<2)throw error('Invalid checklist item');
    const item={id:uuid(),title,assigneeUserId:input.assigneeUserId||null,
     assigneeEmail:t.members.find(m=>m.id===(input.assigneeUserId||null))?.email||null,
     dueOn:input.dueOn||null,checkedAt:null,checkedBy:null,evidenceMediaId:input.evidenceMediaId||null,
     evidenceName:null,position:c.items.length};
    c.items.push(item);return send({item});
   }
   if(id&&method==='DELETE'){getRecord(t.checklists.filter(live),id).archivedAt=now();return send({archived:true});}
   if(method==='GET'){
    const withProgress=t.checklists.filter(live).map(c=>{
     const total=c.items.length,checked=c.items.filter(x=>x.checkedAt).length;
     return {...c,progress:{total,checked,percent:total?Math.round(checked*100/total):0,done:total>0&&checked===total}};
    });
    return emit({checklists:withProgress,members:t.members.filter(m=>m.status==='active').map(m=>({userId:m.id,email:m.email,role:m.role}))});
   }
   const title=String(input.title||'').trim();
   if(title.length<2)throw error('Invalid checklist');
   let items=[];
   if(input.templateId){
    const tpl=t.checklistTemplates.find(x=>x.id===input.templateId);
    if(!tpl)throw error('Template not found',404);
    items=tpl.items.map((x,i)=>({id:uuid(),title:x.title,assigneeUserId:null,assigneeEmail:null,dueOn:null,checkedAt:null,checkedBy:null,evidenceMediaId:null,evidenceName:null,position:i}));
   }else{
    items=(Array.isArray(input.items)?input.items:[]).map((x,i)=>({id:uuid(),title:String((x?.title ?? x) || '').trim(),assigneeUserId:null,assigneeEmail:null,dueOn:null,checkedAt:null,checkedBy:null,evidenceMediaId:null,evidenceName:null,position:i})).filter(x=>x.title.length>=2);
   }
   const c={id:uuid(),templateId:input.templateId||null,templateTitle:t.checklistTemplates.find(x=>x.id===input.templateId)?.title||null,
    title,status:'open',createdAt:now(),updatedAt:now(),items};
   t.checklists.unshift(c);return send({checklist:c});
  }
  dm=p1a('tasks');
  if(dm){
   const t=tenantBySlug(dm[1]),id=dm[2];allowed(t,'T004');
   const live=x=>!x.archivedAt;
   const today=new Date().toISOString().slice(0,10);
   const view=x=>({...x,overdue:!!x.dueOn&&x.status!=='done'&&x.dueOn<today,
    dueBucket:!x.dueOn?'no-date':x.dueOn<today?'overdue':x.dueOn===today?'today':'later'});
   if(method==='GET'){
    let list=t.tasks.filter(live);
    if(url.searchParams.get('assignee'))list=list.filter(x=>x.assigneeUserId===url.searchParams.get('assignee'));
    if(url.searchParams.get('status'))list=list.filter(x=>x.status===url.searchParams.get('status'));
    if(url.searchParams.get('overdue')==='1')list=list.filter(x=>x.dueOn&&x.status!=='done'&&x.dueOn<today);
    if(url.searchParams.get('dueFrom'))list=list.filter(x=>x.dueOn&&x.dueOn>=url.searchParams.get('dueFrom'));
    if(url.searchParams.get('dueTo'))list=list.filter(x=>x.dueOn&&x.dueOn<=url.searchParams.get('dueTo'));
    return emit({tasks:list.map(view),members:t.members.filter(m=>m.status==='active').map(m=>({userId:m.id,email:m.email,role:m.role})),
     notifications:{attempted:0,created:0,pending:list.filter(x=>x.dueOn&&x.status!=='done'&&x.dueOn<today).length},
     overdueCount:list.filter(x=>x.dueOn&&x.status!=='done'&&x.dueOn<today).length});
   }
   if(method==='POST'){
    const title=String(input.title||'').trim();
    if(title.length<2||!['pending','in_progress','done'].includes(input.status||'pending')||!['low','normal','high'].includes(input.priority||'normal'))throw error('Invalid task');
    if(input.assigneeUserId&&!t.members.some(m=>m.id===input.assigneeUserId&&m.status==='active'))throw error('Assignee not found',404);
    const task={id:uuid(),title,notes:String(input.notes||'').trim(),assigneeUserId:input.assigneeUserId||null,
     assigneeEmail:t.members.find(m=>m.id===(input.assigneeUserId||null))?.email||null,
     dueOn:input.dueOn||null,status:input.status||'pending',priority:input.priority||'normal',
     sourceToolId:null,sourceRecordId:null,notifiedAt:null,createdAt:now(),updatedAt:now()};
    t.tasks.unshift(task);return send({task});
   }
   const task=getRecord(t.tasks.filter(live),id);
   if(method==='DELETE'){task.archivedAt=now();return send({archived:true});}
   if(Object.keys(input).length===1&&input.status){
    if(!['pending','in_progress','done'].includes(input.status))throw error('Invalid task');
    task.status=input.status;task.updatedAt=now();return send({ok:true});
   }
   const title=String(input.title||'').trim();
   if(title.length<2)throw error('Invalid task');
   if(input.assigneeUserId&&!t.members.some(m=>m.id===input.assigneeUserId&&m.status==='active'))throw error('Assignee not found',404);
   Object.assign(task,{title,notes:String(input.notes||'').trim(),assigneeUserId:input.assigneeUserId||null,
    assigneeEmail:t.members.find(m=>m.id===(input.assigneeUserId||null))?.email||null,
    dueOn:input.dueOn||null,status:input.status||'pending',priority:input.priority||'normal',updatedAt:now()});
   return send({ok:true});
  }
  dm=p1a('forms');
  if(dm){
   const t=tenantBySlug(dm[1]),id=dm[2],section=dm[3],exportAction=dm[4];allowed(t,'T007');
   const live=x=>!x.archivedAt;
   if(section==='submissions'&&exportAction==='export'&&method==='GET'){
    const form=getRecord(t.forms.filter(live),id);
    const subs=t.formSubmissions.filter(s=>s.formId===id);
    const cols=[['submittedAt','Fecha de respuesta'],...form.fields.map(f=>[f.key,f.label])];
    const csv=p1aCsv(cols,subs.map(s=>({submittedAt:s.createdAt,...s.answers})));
    return emit({filename:'hubie-formulario-'+id.slice(0,8)+'-respuestas.csv',csv});
   }
   if(section==='submissions'){
    const form=getRecord(t.forms.filter(live),id);
    if(method==='GET')return emit({form,submissions:t.formSubmissions.filter(s=>s.formId===id).map(s=>({...s,submittedByEmail:null}))});
    const answers={};
    for(const f of form.fields){
     const raw=input[f.key];
     if(raw===undefined||raw===null||raw===''){if(f.required)throw error('Invalid form submission');answers[f.key]=null;continue;}
     if(f.type==='number'){const n=Number(raw);if(!Number.isFinite(n))throw error('Invalid form submission');answers[f.key]=n;}
     else if(f.type==='select'){if(!f.options.includes(raw))throw error('Invalid form submission');answers[f.key]=raw;}
     else if(f.type==='checkbox'){if(typeof raw!=='boolean')throw error('Invalid form submission');answers[f.key]=raw;}
     else if(f.type==='date'){if(!/^\d{4}-\d{2}-\d{2}$/.test(raw))throw error('Invalid form submission');answers[f.key]=raw;}
     else answers[f.key]=String(raw).trim();
    }
    const sub={id:uuid(),formId:id,answers,submittedBy:'demo',createdAt:now()};
    t.formSubmissions.unshift(sub);return send({submission:sub});
   }
   if(method==='GET')return emit({forms:t.forms.filter(live).map(f=>({...f,submissions:t.formSubmissions.filter(s=>s.formId===f.id).length}))});
   if(id&&method==='DELETE'){getRecord(t.forms.filter(live),id).archivedAt=now();return send({archived:true});}
   const title=String(input.title||'').trim();
   const fields=(Array.isArray(input.fields)?input.fields:[]).map((f,i)=>{
    const key=String(f.key||'').trim().toLowerCase().replace(/[^a-z0-9_]/g,'');
    const label=String(f.label||'').trim();
    if(!key||!label||!['text','number','date','select','checkbox'].includes(f.type))throw error('Invalid form');
    return {key,label,type:f.type,required:f.required===true,options:f.type==='select'?(f.options||[]).filter(Boolean):[],position:i};
   });
   if(title.length<2||!fields.length||new Set(fields.map(f=>f.key)).size!==fields.length)throw error('Invalid form');
   if(id){
    const form=getRecord(t.forms.filter(live),id);
    Object.assign(form,{title,description:String(input.description||'').trim(),fields,updatedAt:now()});
    return send({ok:true});
   }
   const form={id:uuid(),title,description:String(input.description||'').trim(),fields,createdAt:now(),updatedAt:now()};
   t.forms.unshift(form);return send({form});
  }
  dm=p1a('dashboard');
  if(dm){
   const t=tenantBySlug(dm[1]),section=dm[2]==='goals'?'goals':dm[3];allowed(t,'C008');
   const month=url.searchParams.get('from')?.slice(0,7)||new Date().toISOString().slice(0,7);
   const from=url.searchParams.get('from')||month+'-01',to=url.searchParams.get('to')||month+'-31';
   const liveList=list=>list.filter(x=>!x.archivedAt);
   if(section==='goals'){
    if(method==='GET')return emit({goals:t.goals});
    const targetCents=input.targetCents??0;
    if(!/^\d{4}-\d{2}$/.test(input.month||'')||!Number.isSafeInteger(targetCents)||targetCents<0)throw error('Invalid dashboard goal');
    const existing=t.goals.find(g=>g.month===input.month);
    if(existing)existing.targetCents=targetCents;else t.goals.unshift({month:input.month,targetCents});
    return send({goal:{month:input.month,targetCents}});
   }
   const pays=liveList(t.payments).filter(x=>x.paidOn>=from&&x.paidOn<=to);
   const exps=liveList(t.expenses).filter(x=>x.occurredOn>=from&&x.occurredOn<=to);
   const today=new Date().toISOString().slice(0,10);
   const metrics={activeClients:t.clients.filter(c=>c.status==='active').length,
    openQuotes:liveList(t.quotes).filter(q=>['draft','sent'].includes(q.status)).length,
    openQuotesCents:liveList(t.quotes).filter(q=>['draft','sent'].includes(q.status)).reduce((s,q)=>s+q.totalCents,0),
    paymentsCount:pays.length,paymentsCents:pays.reduce((s,x)=>s+x.amountCents,0),
    expensesCount:exps.length,expensesCents:exps.reduce((s,x)=>s+x.amountCents,0),
    appointmentsToday:t.events.filter(e=>['scheduled','confirmed'].includes(e.status)&&(e.startsAt||'').slice(0,10)===today).length,
    lowStockItems:t.items.filter(i=>i.quantity<=i.lowStock).length+t.variants.filter(v=>v.quantity<=v.lowStock).length};
   const goal=t.goals.find(g=>g.month===month);
   const weeks=[];const d=new Date();d.setUTCDate(1);
   const monday=new Date(Date.parse(today+'T00:00:00Z')-((new Date(today+'T00:00:00Z').getUTCDay()+6)%7)*86400000);
   for(let i=11;i>=0;i--){
    const s=new Date(monday.getTime()-i*7*86400000),e=new Date(s.getTime()+6*86400000);
    const ss=s.toISOString().slice(0,10),ee=e.toISOString().slice(0,10);
    weeks.push({weekStart:ss,weekEnd:ee,
     quotesCreated:liveList(t.quotes).filter(q=>(q.createdAt||'').slice(0,10)>=ss&&(q.createdAt||'').slice(0,10)<=ee).length,
     paymentsCents:liveList(t.payments).filter(x=>x.paidOn>=ss&&x.paidOn<=ee).reduce((s2,x)=>s2+x.amountCents,0)});
   }
   return emit({dashboard:true,from,to,month,module:url.searchParams.get('module')||null,metrics,
    goal:goal?{month:goal.month,targetCents:goal.targetCents,actualCents:metrics.paymentsCents,
     percent:goal.targetCents>0?Math.min(100,Math.round(metrics.paymentsCents*100/goal.targetCents)):0,
     remainingCents:Math.max(0,goal.targetCents-metrics.paymentsCents)}:null,
    series:weeks,chartSvg:''});
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
      vatRate,status:'draft',validUntil,...totals,dealId:null,
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
  // Búsqueda global + notificaciones (frente BÚSQUEDA + NOTIFICACIONES).
  // Demo en memoria: mismo contrato que /api real (grupos con límite 10,
  // centro con contador, marcar leída / todas). Sin Turso ni correo.
  const demoNotify=(tenant,type,title,body,link)=>{
   if(tenant.notifications.some(n=>n.type===type&&n.link===link&&!n.readAt))return false;
   tenant.notifications.unshift({id:uuid(),userId:null,type,title,body,link,readAt:null,createdAt:now()});
   return true;
  };
  const demoGenerate=tenant=>{
   let created=0;
   const today=new Date().toISOString().slice(0,10);
   const in3=new Date(Date.now()+3*86400000).toISOString().slice(0,10);
   for(const q of tenant.quotes.filter(x=>!x.archivedAt&&x.status==='sent'&&x.validUntil&&x.validUntil<=in3)){
    if(demoNotify(tenant,'quote_expiring',(q.validUntil<today?'Cotización vencida: ':'Cotización por vencer: ')+q.title,
     (q.clientName?'Cliente: '+q.clientName+'. ':'')+'Vigencia: '+q.validUntil+'.',
     '/app/?tenant='+tenant.slug+'&tool=T013&record='+q.id))created++;
   }
   const in24=new Date(Date.now()+24*3600000).toISOString();
   for(const e of tenant.events.filter(x=>x.status==='scheduled'&&x.startsAt>=now()&&x.startsAt<=in24)){
    if(demoNotify(tenant,'appointment_soon','Cita en las próximas 24 h: '+e.title,
     (e.customer?'Cliente: '+e.customer+'. ':'')+'Inicia: '+new Date(e.startsAt).toLocaleString('es-MX')+'.',
     '/app/?tenant='+tenant.slug+'&tool=C004&record='+e.id))created++;
   }
   for(const pay of tenant.payments.filter(x=>x.status==='pending'&&x.dueAt&&x.dueAt<now())){
    if(demoNotify(tenant,'payment_overdue','Cobro vencido: $'+(Number(pay.amountCents)/100).toLocaleString('es-MX')+' MXN',
     'Vencimiento: '+pay.dueAt+'.','/app/?tenant='+tenant.slug+'&view=billing'))created++;
   }
   return created;
  };
  m=p.match(/^\/api\/app\/([a-z0-9-]+)\/search$/);
  if(m&&method==='GET'){
   const tenant=tenantBySlug(m[1]);
   const q=(url.searchParams.get('q')||'').trim().replace(/\s+/g,' ');
   if(q.length<2||q.length>100)throw error('Invalid search query');
   const needle=q.toLowerCase();
   const enabled=id=>tenant.tools.some(x=>x.id===id&&x.enabled);
   const match=(...values)=>values.some(v=>String(v??'').toLowerCase().includes(needle));
   const groups=[];
   const push=(module,toolId,label,items)=>{if(enabled(toolId)&&items.length)groups.push({module,toolId,label,items:items.slice(0,10)});};
   push('clients','C001','Clientes',tenant.clients.filter(c=>!c.archivedAt&&match(c.name,c.company,c.email)).map(c=>({id:c.id,title:c.name,detail:[c.company,c.email].filter(Boolean).join(' · '),toolId:'C001',module:'clients',link:'/app/?tenant='+tenant.slug+'&tool=C001&record='+c.id})));
   push('quotes','T013','Cotizaciones',tenant.quotes.filter(x=>!x.archivedAt&&match(x.title,x.clientName)).map(x=>({id:x.id,title:x.title,detail:[x.clientName,x.status].filter(Boolean).join(' · '),toolId:'T013',module:'quotes',link:'/app/?tenant='+tenant.slug+'&tool=T013&record='+x.id})));
   push('catalog','C006','Catálogo',tenant.catalogItems.filter(x=>!x.archivedAt&&match(x.name,x.sku)).map(x=>({id:x.id,title:x.name,detail:x.sku||'',toolId:'C006',module:'catalog',link:'/app/?tenant='+tenant.slug+'&tool=C006&record='+x.id})));
   push('expenses','C007','Gastos',tenant.expenses.filter(x=>!x.archivedAt&&match(x.description,x.vendor)).map(x=>({id:x.id,title:x.description,detail:x.vendor||'',toolId:'C007',module:'expenses',link:'/app/?tenant='+tenant.slug+'&tool=C007&record='+x.id})));
   push('cases','C003','Expedientes',tenant.cases.filter(x=>!x.archivedAt&&match(x.title,x.clientName)).map(x=>({id:x.id,title:x.title,detail:x.clientName||'',toolId:'C003',module:'cases',link:'/app/?tenant='+tenant.slug+'&tool=C003&record='+x.id})));
   push('agenda','C004','Agenda',tenant.events.filter(x=>match(x.title,x.customer)).map(x=>({id:x.id,title:x.title,detail:x.customer||'',toolId:'C004',module:'agenda',link:'/app/?tenant='+tenant.slug+'&tool=C004&record='+x.id})));
   push('crm','C002','CRM',tenant.deals.filter(x=>!x.archivedAt&&match(x.title,x.customer)).map(x=>({id:x.id,title:x.title,detail:[x.customer,x.stage].filter(Boolean).join(' · '),toolId:'C002',module:'crm',link:'/app/?tenant='+tenant.slug+'&tool=C002&record='+x.id})));
   push('inventory','C005','Inventario',tenant.items.filter(x=>!x.archivedAt&&match(x.title,x.sku)).map(x=>({id:x.id,title:x.title,detail:(x.sku||'')+' · Existencias: '+x.quantity,toolId:'C005',module:'inventory',link:'/app/?tenant='+tenant.slug+'&tool=C005&record='+x.id})));
   return emit({query:q,total:groups.reduce((n,g)=>n+g.items.length,0),groups});
  }
  m=p.match(/^\/api\/app\/([a-z0-9-]+)\/notifications(?:\/([a-z0-9-]+)(?:\/(read))?)?$/);
  if(m){
   const tenant=tenantBySlug(m[1]),target=m[2],action=m[3];
   if(method==='GET'&&!target){
    demoGenerate(tenant);
    const list=[...tenant.notifications].sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
    return emit({notifications:list,unread:list.filter(n=>!n.readAt).length});
   }
   if(method==='POST'&&target==='read-all'){
    let n=0;for(const item of tenant.notifications)if(!item.readAt){item.readAt=now();n++;}
    return send({read:n});
   }
   if(method==='POST'&&target&&action==='read'){
    const item=tenant.notifications.find(n=>n.id===target);
    if(!item)throw error('Not found',404);
    if(!item.readAt)item.readAt=now();
    return send({read:true});
   }
   throw error('Not found',404);
  }
  if(p==='/api/admin/tenants/search'&&method==='GET'){
   const q=(url.searchParams.get('q')||'').trim().replace(/\s+/g,' ');
   if(q.length<2||q.length>100)throw error('Invalid search query');
   const needle=q.toLowerCase();
   const found=state.tenants.filter(t=>{
    const owner=t.members.find(x=>x.role==='owner')?.email||'';
    return t.name.toLowerCase().includes(needle)||t.slug.toLowerCase().includes(needle)||owner.toLowerCase().includes(needle);
   }).slice(0,20);
   return emit({query:q,tenants:found.map(t=>({id:t.id,slug:t.slug,name:t.name,
    ownerEmail:t.members.find(x=>x.role==='owner')?.email||null,
    billingStatus:'none',billingStatusLabel:'Sin suscripción',pastDueSince:null}))});
  }
  if(p==='/api/admin/notifications'&&method==='GET'){
   const all=state.tenants.flatMap(t=>t.notifications.map(n=>({...n,organizationId:t.id,tenantName:t.name,tenantSlug:t.slug,typeLabel:n.type})));
   all.sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
   return emit({notifications:all.slice(0,100),unread:all.filter(n=>!n.readAt).length});
  }
  if(p==='/api/admin/notifications/generate'&&method==='POST'){
   let created=0;for(const t of state.tenants)created+=demoGenerate(t);
   return send({tenants:state.tenants.length,created});
  }
  if(p==='/api/admin/billing/sweep'&&method==='POST'){
   // La demo no tiene suscripciones past_due: nada que suspender.
   return send({checked:0,suspended:[],suspendedCount:0});
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
