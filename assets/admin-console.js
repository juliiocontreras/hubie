'use strict';
const demoMode=new URLSearchParams(location.search).get('demo')==='1';
const demoApi=async(path,options)=> (await import('./demo-backend.js')).demoRequest(path,options);
const $=id=>document.getElementById(id);
const state={catalog:null,tenants:[],selected:null,detail:null,platformAppearance:null,platformBackgrounds:{dashboard:null,sidebar:null},auditFilters:{}};
let themeUI=null,iconUI=null,invitationsUI=null,auditUI=null;
const money=n=>n==null?'A cotizar':new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(n);
function node(tag,text,cls){const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x;}
// Estado vacío con acción: título + qué hacer + un botón que lo resuelve.
// Una lista vacía sin salida es un callejón sin salida.
function emptyAction(title,hint,ctaLabel,onClick){
 const wrap=node('div',undefined,'empty empty-state');
 wrap.append(node('strong',title));
 if(hint)wrap.append(node('p',hint,'help'));
 const btn=node('button',ctaLabel,'btn btn-primary');btn.type='button';
 btn.addEventListener('click',onClick);wrap.append(btn);
 return wrap;
}
async function api(path,options={}){
 if(demoMode)return demoApi(path,options);
 const r=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Object.assign(new Error(data.error||'Error al conectar'),{status:r.status});
 return data;
}
async function write(path,method,body){return api(path,{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});}
function notice(message,error=false){const e=$('feedback');e.textContent=message;e.classList.toggle('error',error);}
function screen(view){
 if(view!=='appearance'&&state.platformAppearance&&themeUI)themeUI.applyAppearance(state.platformAppearance,document.documentElement,state.platformBackgrounds);
 for(const s of document.querySelectorAll('[id^="view-"]'))s.hidden=s.id!=='view-'+view;
 for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-current',b.dataset.view===view?'page':'false');
 if(view==='billing')void renderBilling();
 if(view==='audit')void loadAudit(state.auditFilters||{});
 if(view==='notifications')void renderAdminNotifications();
 window.scrollTo({top:0,behavior:'instant'});
}
const toolList=()=>state.catalog.tools;
const suiteList=()=>state.catalog.suites;
function suiteOptions(select){
 select.replaceChildren();
 for(const s of suiteList())select.add(new Option(s.name+' · '+money(s.price),s.id));
}
function toolRow(tool,checked,onChange,editable=true){
 const label=node('label',undefined,'tool-option');
 const input=document.createElement('input');input.type='checkbox';input.checked=checked;input.disabled=!editable;input.dataset.toolId=tool.id;
 if(onChange)input.addEventListener('change',()=>onChange(input));
 label.append(iconUI.toolIcon(tool.id),input);
 const mid=node('span');
 mid.append(node('strong',tool.name),node('small',(tool.included?'Core · incluido':tool.group+' · '+(tool.price===null?'Precio por definir':money(tool.price)))));
 label.append(mid);
 return label;
}
function groupedTools(host,items,makeRow){
 host.replaceChildren();
 const groups=new Map();
 for(const tool of items){const group=tool.group||'Core';if(!groups.has(group))groups.set(group,[]);groups.get(group).push(tool);}
 for(const [group,list]of groups){
  const detail=node('details',undefined,'tool-group');detail.open=group==='Core';
  const head=node('summary',undefined,'tool-group-title');head.append(iconUI.icon('layers'),document.createTextNode(group+' · '+list.length+' Tools'));
  const grid=node('div',undefined,'tool-grid compact-tool-grid');
  for(const tool of list)grid.append(makeRow(tool));
  detail.append(head,grid);host.append(detail);
 }
}
function renderCreateTools(){groupedTools($('create-tools'),toolList(),t=>toolRow(t,!!t.included,null));}
function renderCatalog(){
 const host=$('catalog-suites');host.replaceChildren();
 for(const s of suiteList()){
  const x=node('article',undefined,'module-card');
  const content=node('div');
  content.append(node('strong',s.name),node('small',money(s.price)+' · '+s.users+' usuarios'));
  const badge=node('span',undefined,'company-icon');badge.append(iconUI.icon('layers'));x.append(badge,content);host.append(x);
 }
 const list=$('catalog-tools');list.replaceChildren();
 groupedTools(list,toolList(),t=>toolRow(t,!!t.included,null,false));
}
function companyRow(t){
 const btn=node('button',undefined,'company');btn.type='button';
 const meta=node('div',undefined,'company-meta');meta.append(node('strong',t.name),node('small',t.slug+' · '+(suiteList().find(s=>s.id===t.suiteId)?.name||t.suiteId||'Sin Suite')+(t.ownerEmail?' · Propietario: '+t.ownerEmail:'')));
 const status=node('span',t.status==='active'?'Activa':'Suspendida','status'+(t.status==='active'?'':' off'));
 const badge=node('span',undefined,'company-icon');badge.append(iconUI.icon('building'));btn.append(badge,meta,status);
 btn.addEventListener('click',()=>openDetail(t.id));
 return btn;
}
function renderSuiteDistribution(){
 const host=$('madre-suite-distribution');if(!host)return;
 host.replaceChildren();host.classList.add('pipeline-mini');
 // El conteo vive aquí y no en platform/suite-distribution.mjs: /platform/*
 // no se sirve al navegador (404 por diseño, lo comprueba el smoke test de CI),
 // así que importar ese módulo dejaría el "Calculando distribución…" para
 // siempre. La lógica es la misma: agrupar tenants por suiteId, con el nombre
 // de la Suite del catálogo, ordenados por cantidad.
 const names=new Map(suiteList().map(s=>[s.id,s.name]));
 const counts=new Map();
 for(const t of state.tenants){if(!t?.suiteId)continue;counts.set(t.suiteId,(counts.get(t.suiteId)||0)+1);}
 const rows=[...counts].map(([id,count])=>({id,name:names.get(id)||id,count}))
  .sort((a,b)=>b.count-a.count||a.id.localeCompare(b.id));
 if(!rows.length){host.append(node('p','Aún no hay empresas registradas en ninguna Suite.','help'));return;}
 const total=rows.reduce((sum,r)=>sum+r.count,0)||1;
 for(const item of rows){
  const row=node('div',undefined,'pipeline-mini-row');
  const bar=node('span',undefined,'pipeline-mini-bar');
  bar.style.setProperty('--bar-pct',Math.max(6,Math.round(item.count/total*100))+'%');
  row.append(node('span',item.name),bar,node('strong',String(item.count)));
  host.append(row);
 }
}
function renderTenants(){
 $('stat-companies').textContent=state.tenants.length;
 $('stat-suites').textContent=suiteList().length;
 $('stat-tools').textContent=toolList().length;
 $('stat-core').textContent=toolList().filter(t=>t.included).length;
 renderSuiteDistribution();
 const recent=$('overview-companies');recent.replaceChildren();
 for(const t of state.tenants.slice(0,5))recent.append(companyRow(t));
 if(!state.tenants.length)recent.append(emptyAction('Aún no hay empresas','Crea la primera desde Hubie Madre y configura su Suite.','Crear primera empresa',()=>screen('create')));
 const suites=$('overview-suites');suites.replaceChildren();
 for(const item of suiteList().slice(0,6)){
  const btn=node('button',undefined,'suite-tile');btn.type='button';
  const badge=node('span',undefined,'company-icon');badge.append(iconUI.icon('layers'));btn.append(badge,node('strong',item.name.replace(/^Hubie /,'')),node('small',item.users+' usuarios · '+money(item.price)));
  btn.addEventListener('click',()=>{$('create-suite').value=item.id;screen('create');});
  suites.append(btn);
 }
 const tools=$('overview-tools');tools.replaceChildren();
 for(const item of toolList().slice(0,5)){
  const row=node('div',undefined,'aurora-row');
  const ico=node('span',undefined,'insight-mark');ico.append(iconUI.toolIcon(item.id));
  const meta=node('span',undefined,'insight-meta');
  meta.append(node('strong',item.name),node('small',item.included?'Core incluido':'Complemento · '+money(item.price)));
  row.append(ico,meta,node('span',item.included?'Incluida':'Opcional','status'+(item.included?'':' off')));
  tools.append(row);
 }
 filterCompanies();
}
function filterCompanies(){
 const q=$('filter-companies').value.toLowerCase().trim();
 const host=$('companies');host.replaceChildren();
 const found=state.tenants.filter(t=>(t.name+' '+t.slug).toLowerCase().includes(q));
 for(const t of found)host.append(companyRow(t));
 if(!found.length)host.append(emptyAction('No se encontraron empresas','Ninguna empresa coincide con ese texto. Prueba con otro término o limpia la búsqueda.','Limpiar búsqueda',()=>{$('filter-companies').value='';filterCompanies();}));
}
// Buscador de empresas de Madre (servidor): nombre, slug o correo del owner,
// con estado de cobro. Con menos de 2 caracteres vuelve al filtro local.
let tenantSearchTimer=null;
async function searchTenantsServer(q){
 const host=$('companies');host.replaceChildren();
 host.append(node('div','Buscando empresas…','empty'));
 try{
  const data=await api('/api/admin/tenants/search?q='+encodeURIComponent(q));
  host.replaceChildren();
  for(const t of data.tenants){
   const row=node('div',undefined,'aurora-row');
   const meta=node('span',undefined,'insight-meta');
   meta.append(node('strong',t.name),node('small',t.slug+(t.ownerEmail?' · '+t.ownerEmail:'')));
   const pill=node('span',t.billingStatusLabel||t.billingStatus,'status'+(t.billingStatus==='active'?'':' off'));
   const open=node('button','Ver empresa','btn');open.type='button';open.addEventListener('click',()=>openDetail(t.id));
   row.append(meta,pill,open);host.append(row);
  }
  if(!data.tenants.length)host.append(emptyAction('No se encontraron empresas','Ninguna empresa coincide con ese texto, ni por nombre, identificador o correo del propietario.','Limpiar búsqueda',()=>{$('filter-companies').value='';$('global-search').value='';filterCompanies();}));
 }catch(e){
  host.replaceChildren();
  host.append(node('div','No se pudo buscar en el servidor: '+e.message+'. Se muestra el filtro local.','empty'));
  filterCompanies();
 }
}
// Centro de notificaciones de Madre: avisos de todas las empresas.
let adminNotificationsCenter=null;
async function renderAdminNotifications(){
 if(!adminNotificationsCenter){
  const {createAdminNotificationCenter}=await import('./notifications.js');
  adminNotificationsCenter=createAdminNotificationCenter({
   api,host:$('admin-notifications'),generateButton:$('generate-notifications'),
   onNavigate:item=>{if(item.tenantSlug)openDetail(item.organizationId);}
  });
 }
 const data=await adminNotificationsCenter.refresh();
 if(data){
  $('admin-notifications-pill').textContent=data.unread+' sin leer';
  const badge=$('admin-notifications-badge');
  badge.hidden=!data.unread;badge.textContent=String(data.unread>99?'99+':data.unread);
 }
}
async function loadTenants(){state.tenants=(await api('/api/admin/tenants')).tenants;renderTenants();}
async function renderBilling(){
 const host=$('billing-companies'),ordersHost=$('billing-orders');
 try{
  const data=await api('/api/admin/billing');
  $('billing-summary').textContent=data.tenants.length+' empresas · '+data.tenants.filter(t=>t.billingStatus==='active').length+' al corriente';
  host.replaceChildren();
  for(const t of data.tenants){
   const row=node('div',undefined,'aurora-row');
   const meta=node('span',undefined,'insight-meta');
   meta.append(node('strong',t.name),node('small',(t.suiteId||'Sin suite')+' · '+(t.billingStatusLabel||t.billingStatus)+(t.ownerEmail?' · Propietario: '+t.ownerEmail:'')+(t.balancePendingCents?' · Saldo pendiente '+money(t.balancePendingCents):'')+(t.daysPastDue?' · '+t.daysPastDue+' días vencido':'')));
   const pill=node('span',t.billingStatusLabel||t.billingStatus,'status'+(t.billingStatus==='active'?'':' off'));
   const open=node('button','Ver empresa','btn');open.type='button';open.addEventListener('click',()=>openDetail(t.id));
   row.append(meta,pill,open);host.append(row);
  }
  if(!data.tenants.length)host.append(node('div','Aún no hay empresas registradas.','empty'));
  ordersHost.replaceChildren();
  for(const o of data.pendingOrders){
   const row=node('div',undefined,'aurora-row');
   const meta=node('span',undefined,'insight-meta');
   meta.append(node('strong',o.email),node('small','Suite '+o.suiteId+' · Total '+money(o.totalCents)+' · Anticipo '+money(o.depositCents)));
   row.append(meta,node('span','Pagado · sin empresa','status off'));ordersHost.append(row);
  }
  if(!data.pendingOrders.length)ordersHost.append(node('div','Sin pagos pendientes de convertir.','empty'));
 }catch(e){
  host.replaceChildren();host.append(node('div','No se pudo cargar el estado de cobro: '+e.message,'empty'));
 }
}
function renderMembers(items){
 const host=$('members');host.replaceChildren();
 // TOOLS P0 (C009): permisos por módulo y por miembro. Las invitaciones por
 // correo las hace el frente invites (019); mientras tanto el alta directa
 // autoriza el acceso y el miembro entra con Google.
 host.append(node('p','Invitaciones por correo: pendiente del módulo de invitaciones (frente 019). El alta directa de abajo autoriza el acceso; el miembro entra con Google.','help'));
 const p0tools=['C001','C002','C003','C004','C005','C006','C007','T013','T014','T015','T020'];
 const p0labels={C001:'Clientes',C002:'CRM',C003:'Expedientes',C004:'Agenda',C005:'Inventario',C006:'Catálogo',C007:'Gastos',T013:'Cotizaciones',T014:'Cobros',T015:'Facturación',T020:'Reportes'};
 for(const m of items){
  const line=node('div',undefined,'line'),detail=node('div');
  detail.append(node('strong',m.email),node('small',m.role+' · '+(m.status==='active'?'Acceso activo':'Acceso suspendido')));
  line.append(detail);
  const perms=node('button','Permisos por módulo','btn');perms.type='button';
  const permsHost=node('div',undefined,'stack');permsHost.hidden=true;
  perms.addEventListener('click',async()=>{
   permsHost.hidden=!permsHost.hidden;if(permsHost.hidden)return;
   permsHost.replaceChildren(node('p','Consultando permisos…','help'));
   try{
    const tenantId=state.selected;
    const data=await api('/api/admin/tenants/'+tenantId+'/members/'+m.id+'/tools');
    const current=data.members.find(x=>x.id===m.id)?.tools||{};
    permsHost.replaceChildren();
    const selects={};
    for(const tool of p0tools){
     const row=node('div',undefined,'line');
     row.append(node('span',p0labels[tool]||tool));
     const select=document.createElement('select');select.className='search';
     select.add(new Option('Sin acceso','none'));select.add(new Option('Lectura','read'));select.add(new Option('Escritura','write'));
     select.value=current[tool]||'write';selects[tool]=select;
     row.append(select);permsHost.append(row);
    }
    const save=node('button','Guardar permisos','btn btn-primary');save.type='button';
    save.addEventListener('click',async()=>{
     save.disabled=true;
     try{
      const tools=Object.fromEntries(Object.entries(selects).map(([tool,select])=>[tool,select.value]));
      await write('/api/admin/tenants/'+tenantId+'/members/'+m.id+'/tools','PUT',{tools});
      notice('Permisos por módulo actualizados para '+m.email+'.');
     }catch(e){notice('No se pudieron guardar los permisos: '+e.message,true);}
     finally{save.disabled=false;}
    });
    permsHost.append(save,node('p','Sin cambios guardados, manda el permiso del rol (viewer: lectura; member/admin/owner: escritura).','help'));
   }catch(e){permsHost.replaceChildren(node('p','No se pudieron consultar los permisos: '+e.message,'error'));}
  });
  line.append(perms);
  if(m.role!=='owner'){
   const btn=node('button',m.status==='active'?'Suspender acceso':'Reactivar','btn'+(m.status==='active'?' btn-danger':''));
   btn.type='button';
   btn.addEventListener('click',async()=>{
    const tenantId=state.selected;
    if(m.status==='active'&&!confirm('¿Suspender el acceso de este usuario a la empresa?'))return;
    btn.disabled=true;
    try{
     const changed=await write('/api/admin/tenants/'+tenantId+'/members/'+m.id,'PATCH',{status:m.status==='active'?'suspended':'active'});
     if(state.selected===tenantId)renderMembers(changed.members);
     notice('Acceso actualizado exclusivamente para esta empresa.');
    }catch(e){notice('No se pudo cambiar el acceso: '+e.message,true);}
    finally{btn.disabled=false;}
   });
   line.append(btn);
  }else{
   line.append(node('span','Propietario protegido','status'));
   // Alta autoservicio (018): Madre reemite el enlace de activación de un
   // solo uso (24 h) para el owner. En la demo no hay enlaces reales.
   const act=node('button','Generar enlace de activación','btn');act.type='button';
   act.addEventListener('click',async()=>{
    if(demoMode)return notice('La demostración no emite enlaces de activación reales.');
    act.disabled=true;
    try{
     const link=await write('/api/admin/tenants/'+state.selected+'/activation-link','POST',{});
     const out=node('div',undefined,'line');
     const input=document.createElement('input');input.readOnly=true;input.value=link.activationUrl;input.setAttribute('aria-label','Enlace de activación de un solo uso');input.style.flex='1';
     const copy=node('button','Copiar','btn');copy.type='button';
     copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(link.activationUrl);notice('Enlace copiado. Envíalo al cliente: es de un solo uso y caduca en 24 h.');}catch{input.select();notice('Copia el enlace del campo: es de un solo uso y caduca en 24 h.');}});
     out.append(input,copy);host.append(out);
     notice('Enlace de activación generado para '+link.email+': un solo uso, caduca el '+new Date(link.expiresAt).toLocaleString('es-MX')+'.');
    }catch(e){notice('No se pudo generar el enlace: '+e.message,true);}
    finally{act.disabled=false;}
   });
   line.append(act);
  }
  host.append(line,permsHost);

 }
 if(!items.length)host.append(node('p','Aún no hay miembros. Autoriza el primer correo con el formulario de abajo.','help'));
}
async function loadMembers(id){renderMembers((await api('/api/admin/tenants/'+id+'/members')).members);}
async function loadInvitations(id){
 const data=await api('/api/admin/tenants/'+id+'/invitations');
 const refresh=async()=>{const fresh=await api('/api/admin/tenants/'+id+'/invitations');return {invitations:fresh.invitations};};
 invitationsUI.renderInvitations($('invitations'),{invitations:data.invitations,emailConfigured:data.emailConfigured,canManage:true},{
  onInvite:async payload=>{const r=await write('/api/admin/tenants/'+id+'/invitations','POST',payload);const f=await refresh();return {...f,lastInvite:r,message:r.emailSent?'Invitación enviada a '+r.invitation.email+'.':'Enlace listo para compartir (correo no configurado).'};},
  onRevoke:async invId=>{await api('/api/admin/tenants/'+id+'/invitations/'+invId,{method:'DELETE'});const f=await refresh();return {...f,message:'Invitación revocada.'};},
  onResend:async invId=>{const r=await write('/api/admin/tenants/'+id+'/invitations/'+invId+'/resend','POST',{});const f=await refresh();return {...f,lastInvite:r,message:r.emailSent?'Invitación reenviada a '+r.invitation.email+'.':'Enlace nuevo listo para compartir (correo no configurado).'};}
 });
}
async function loadAudit(filters={}){
 state.auditFilters=filters;
 try{
 const query=new URLSearchParams();
 if(filters.tenant)query.set('tenant',filters.tenant);
 if(filters.action)query.set('action',filters.action);
 if(filters.actor)query.set('actor',filters.actor);
 if(filters.from)query.set('from',filters.from);
 if(filters.to)query.set('to',filters.to);
 if(filters.limit)query.set('limit',String(filters.limit));
 const data=await api('/api/admin/audit'+(query.toString()?'?'+query.toString():''));
 auditUI.renderAudit($('audit-list'),{events:data.events,actions:data.actions,tenants:state.tenants,filters},{onFilter:next=>void loadAudit(next)});
 }catch(e){notice('No se pudo cargar la auditoría: '+e.message,true);}
}
function renderDetail(t){
 state.detail=t;$('detail-heading').textContent=t.name;
 const bgPath='/api/admin/tenants/'+t.id+'/media/';
 const savePhoto=(kind,result)=>{
  t.backgrounds={...t.backgrounds,...(result.backgrounds||{[kind]:bgPath+kind+'?v='+result.media?.id})};
  return {backgrounds:t.backgrounds};
 };

 $('detail-subtitle').textContent='Identificador: '+t.slug+' · '+t.suiteId;
 $('detail-open').href='/app/?'+(demoMode?'demo=1&':'')+'tenant='+encodeURIComponent(t.slug);
 themeUI.createAppearanceEditor($('tenant-appearance'),{
  initial:t.appearance,backgrounds:t.backgrounds,
  title:'Fondos de '+t.name,
  description:'Añade imágenes o elige colores independientes para el dashboard y el menú de esta Suite.',
  live:false,
  onImageUpload:async(kind,file)=>savePhoto(kind,await write(bgPath+kind,'POST',file)),
  onImageRemove:async kind=>{
   const result=await api(bgPath+kind,{method:'DELETE'});
   t.backgrounds={...t.backgrounds,...(result.backgrounds||{}),[kind]:null};return {backgrounds:t.backgrounds};
  },
  onSave:async theme=>{
   const result=await write('/api/admin/tenants/'+t.id+'/appearance','PUT',theme);
   t.appearance=result.appearance;notice('Apariencia de '+t.name+' actualizada.');return result;
  }
 });
 const form=$('detail-form');
 for(const key of ['name','displayName','suiteId','primaryColor','secondaryColor','status','logoUrl'])form.elements[key].value=t[key]??'';
 const host=$('detail-tools');host.replaceChildren();
 const grouped=new Map();let count=t.tools.filter(x=>x.enabled).length;
 $('detail-tools-total').textContent=count+' activas / '+t.tools.length;
 for(const tool of t.tools){
  const row=toolRow(tool,tool.enabled,async input=>{
   input.disabled=true;
   try{
    await write('/api/admin/tenants/'+t.id+'/tools/'+tool.id,'PUT',{enabled:input.checked});
    tool.enabled=input.checked;
    count=t.tools.filter(x=>x.enabled).length;
    $('detail-tools-total').textContent=count+' activas / '+t.tools.length;
    notice(tool.name+(input.checked?' activada.':' desactivada.')+' Solo afecta a '+t.name+'.');
   }catch(e){input.checked=!input.checked;notice('No se guardó: '+e.message,true);}
   finally{input.disabled=false;}
  });
  const key=tool.group||'Core';if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(row);
 }
 for(const [group,rows]of grouped){
  const section=node('details',undefined,'tool-group');section.open=group==='Core';
  const summary=node('summary',group+' · '+rows.length+' Tools','tool-group-title');
  const grid=node('div',undefined,'tool-grid compact-tool-grid');grid.append(...rows);section.append(summary,grid);host.append(section);
 }
 // Importación de datos para esta empresa (P0, E004): CSV de clientes y de
 // catálogo, y migración JSON completa. El servidor valida, deduplica por
 // email/SKU dentro del tenant y devuelve el resumen con errores por fila.
 void renderAdminImport(t);
}
async function renderAdminImport(t){
 const host=$('detail-import');if(!host)return;
 const {createImportPanel,createMigrationPanel,CLIENT_CSV_TEMPLATE,CATALOG_CSV_TEMPLATE}=await import('./import-ui.js');
 host.replaceChildren();
 host.append(node('h3','Importar datos a '+t.name));
 host.append(node('p','Los archivos se importan solo a esta empresa. Los correos y SKU duplicados se omiten; las filas con error se reportan sin cancelar el resto.','help'));
 const post=(kind,body)=>write('/api/admin/tenants/'+t.id+'/import','POST',{kind,...body});
 host.append(createImportPanel({title:'Importar clientes desde CSV',description:'Columnas: Nombre, Empresa, Correo, Teléfono, Estado, Notas. También se reconocen encabezados en inglés.',
  templateName:'hubie-clientes-plantilla.csv',templateText:CLIENT_CSV_TEMPLATE,accept:'.csv,text/csv',notice,
  onSubmit:async csv=>post('clients',{csv})}));
 host.append(createImportPanel({title:'Importar catálogo desde CSV',description:'Columnas: SKU, Nombre, Descripción, Precio, Categoría. También se reconocen encabezados en inglés.',
  templateName:'hubie-catalogo-plantilla.csv',templateText:CATALOG_CSV_TEMPLATE,accept:'.csv,text/csv',notice,
  onSubmit:async csv=>post('catalog',{csv})}));
 host.append(createMigrationPanel({notice,onSubmit:async payload=>post('migration',{payload})}));
}
async function openDetail(id){
 state.selected=id;screen('detail');$('detail-heading').textContent='Cargando empresa…';
 try{const [t,m]=await Promise.all([api('/api/admin/tenants/'+id),api('/api/admin/tenants/'+id+'/members')]);renderDetail(t.tenant);renderMembers(m.members);await loadInvitations(id).catch(e=>notice('No se pudieron cargar las invitaciones: '+e.message,true));}
 catch(e){notice('No fue posible cargar la empresa: '+e.message,true);}
}
async function createCompany(ev){
 ev.preventDefault();const form=ev.currentTarget;const btn=form.querySelector('button[type=submit]');btn.disabled=true;
 const payload=Object.fromEntries(new FormData(form));
 payload.toolIds=Array.from($('create-tools').querySelectorAll('input:checked')).map(x=>x.dataset.toolId);
 try{
  const {tenant}=await write('/api/admin/tenants','POST',payload);
  await loadTenants();notice('Empresa creada. Ahora puedes configurar su marca, Tools y usuarios.');
  await openDetail(tenant.id);
 }catch(e){notice('No se pudo crear la empresa: '+e.message,true);}
 finally{btn.disabled=false;}
}
async function saveDetail(ev){
 ev.preventDefault();if(!state.selected)return;
 const payload=Object.fromEntries(new FormData(ev.currentTarget));
 try{const d=await write('/api/admin/tenants/'+state.selected,'PATCH',payload);renderDetail(d.tenant);await loadTenants();notice('Configuración actualizada.');}
 catch(e){notice('No se guardó: '+e.message,true);}
}
async function addMember(ev){
 ev.preventDefault();if(!state.selected)return;
 const payload=Object.fromEntries(new FormData(ev.currentTarget));
 try{const d=await write('/api/admin/tenants/'+state.selected+'/members','POST',payload);renderMembers(d.members);ev.currentTarget.reset();notice(demoMode?'Usuario ficticio añadido a la demo; no se envían invitaciones.':'Usuario autorizado para esta empresa. Ya puede ingresar con Google.');}
 catch(e){notice('No fue posible autorizar: '+e.message,true);}
}
let slugTouched=false;
function closeMobileNav(){
 document.documentElement.classList.remove('mobile-nav-open');
 const button=$('sidebar-toggle');if(button){button.setAttribute('aria-expanded','false');button.textContent='☰ Menú';}
}
function initEvents(){
 const toggle=$('sidebar-toggle');
 toggle?.addEventListener('click',()=>{
  const state=document.documentElement.classList.toggle('mobile-nav-open');
  toggle.setAttribute('aria-expanded',String(state));
  toggle.textContent=state?'✕ Cerrar':'☰ Menú';
 });
 document.addEventListener('keydown',ev=>{if(ev.key==='Escape')closeMobileNav();});
 document.addEventListener('click',ev=>{
  if(document.documentElement.classList.contains('mobile-nav-open')&&ev.target instanceof Element&&!ev.target.closest('.sidebar'))closeMobileNav();
 });
 const search=$('global-search');
 search?.addEventListener('input',()=>{
  $('filter-companies').value=search.value;
  const q=search.value.trim();
  if(q)screen('companies');
  clearTimeout(tenantSearchTimer);
  if(q.length>=2)tenantSearchTimer=setTimeout(()=>void searchTenantsServer(q),300);
  else filterCompanies();
 });
 document.querySelectorAll('.sidebar [data-view]').forEach(btn=>btn.addEventListener('click',()=>{
  closeMobileNav();
 }));

 document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>screen(btn.dataset.view)));
 $('create-form').addEventListener('submit',createCompany);
 $('detail-form').addEventListener('submit',saveDetail);
 $('member-form').addEventListener('submit',addMember);
 $('filter-companies').addEventListener('input',filterCompanies);
 $('reset-tools').addEventListener('click',()=>{for(const c of $('create-tools').querySelectorAll('input'))c.checked=!!toolList().find(t=>t.id===c.dataset.toolId)?.included;});
 $('create-slug').addEventListener('input',()=>{slugTouched=true;});
 $('create-name').addEventListener('input',ev=>{if(!slugTouched)$('create-slug').value=ev.target.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,63);});
 $('logout').addEventListener('click',async()=>{if(demoMode){location.href='/madre/app.html';return;}await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});location.reload();});
}
async function init(){
 [themeUI,iconUI,invitationsUI,auditUI]=await Promise.all([import('./appearance-ui.js'),import('./ui-icons.js'),import('./invitations-ui.js'),import('./audit-ui.js')]);
 if(demoMode){
  $('demo-banner').hidden=false;
  document.querySelector('.sidebar a[href="/app/"]').href='/app/?demo=1';
  $('logout').textContent='↪  Salir de la demostración';
  const foot=document.querySelector('footer.help');if(foot)foot.textContent='Hubie Madre · MODO DEMO: cambios ficticios en este navegador, no guardados en Turso.';
  document.title='Hubie Madre · Demostración sin conexión';
 }
 initEvents();
 iconUI.decorateSidebar(document.querySelector('.sidebar'));
 if(demoMode)document.querySelector('.sidebar .brand').href='/madre/app.html?demo=1';
 try{
  const [catalogData,tenantData,platformData]=await Promise.all([api('/api/admin/catalog'),api('/api/admin/tenants'),api('/api/admin/appearance')]);
  state.platformAppearance=platformData.appearance;
  state.platformBackgrounds=platformData.backgrounds||{dashboard:null,sidebar:null};
  themeUI.applyAppearance(state.platformAppearance,document.documentElement,state.platformBackgrounds);
  const photoRoute='/api/admin/media/';
  themeUI.createAppearanceEditor($('platform-appearance'),{
   initial:state.platformAppearance,backgrounds:state.platformBackgrounds,
   title:'Apariencia de Hubie Madre',
   description:'Sube imágenes de fondo o utiliza los acabados originales de Hubie.',
   live:true,
   onImageUpload:async(kind,file)=>{
    const result=await write(photoRoute+kind,'POST',file);
    state.platformBackgrounds={...state.platformBackgrounds,...(result.backgrounds||{[kind]:photoRoute+kind+'?v='+result.media?.id})};
    return {backgrounds:state.platformBackgrounds};
   },
   onImageRemove:async kind=>{
    const result=await api(photoRoute+kind,{method:'DELETE'});
    state.platformBackgrounds={...state.platformBackgrounds,...(result.backgrounds||{}),[kind]:null};
    return {backgrounds:state.platformBackgrounds};
   },
   onSave:async appearance=>{
    const result=await write('/api/admin/appearance','PUT',appearance);
    state.platformAppearance=result.appearance;return result;
   }
  });
  state.catalog=catalogData.catalog;state.tenants=tenantData.tenants;
  suiteOptions($('create-suite'));suiteOptions($('detail-suite'));
  renderCreateTools();
  renderCatalog();renderTenants();
  $('console').hidden=false;screen('overview');
  if(location.search.includes('tenant=')){const id=new URLSearchParams(location.search).get('tenant');if(state.tenants.some(t=>t.id===id))await openDetail(id);}
 }catch(e){
  $('login').hidden=false;
  if(e.status===503){
   $('google-entry').hidden=true;
   $('login-message').textContent='El acceso real requiere configurar Google y Turso. Puedes explorar una demostración segura con datos ficticios.';
  }else{
   $('login-message').textContent=e.status===403?'Tu cuenta no tiene permiso de Super Admin. Puedes abrir la PWA de cliente.':'Accede con tu cuenta autorizada para gestionar Hubie Madre.';
  }
 }
 if('serviceWorker'in navigator)navigator.serviceWorker.register('/madre/sw.js',{scope:'/madre/'}).catch(()=>{});
}
init();
