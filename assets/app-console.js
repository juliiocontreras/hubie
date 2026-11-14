import {openRecords} from './app-records.js';
import {closeOperationalModule} from './app-workflows.js';
import {createAppearanceEditor,applyAppearance} from './appearance-ui.js';
import {mountOnboardingGuide} from './onboarding.js';
import {icon,toolIcon,toolTint,decorateSidebar} from './ui-icons.js';
import {renderInvitations} from './invitations-ui.js';
import {renderAudit} from './audit-ui.js';
import {createGlobalSearch,bindSearchShortcut} from './search.js';
import {createTenantNotificationCenter,bellIcon} from './notifications.js';
const demoMode=new URLSearchParams(location.search).get('demo')==='1';
const demoApi=async(path,options)=>(await import('./demo-backend.js')).demoRequest(path,options);
const $=id=>document.getElementById(id);
const elt=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x;};
let organizations=[],config=null,activeTool=null,searchBox=null,notificationCenter=null;
async function api(path,options={}){
 if(demoMode)return demoApi(path,options);
 const r=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});
 const d=await r.json().catch(()=>({}));
 if(!r.ok)throw Object.assign(new Error(d.error||'Servicio no disponible'),{status:r.status});
 return d;
}
const write=(path,method,body)=>api(path,{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});
function notice(s,error=false){$('feedback').textContent=s;$('feedback').classList.toggle('error',error);}
const roles={owner:'Propietario',admin:'Administrador',member:'Colaborador',viewer:'Solo lectura'};
function head(title,desc){$('page-heading').textContent=title;$('page-description').textContent=desc;}
function home(){
 closeMobileNav();
 closeOperationalModule();
 $('appearance').hidden=true;$('migration').hidden=true;$('notifications-view').hidden=true;
 if(config)applyAppearance(config.appearance,document.documentElement,config.backgrounds);
 activeTool=null;$('home').hidden=false;$('module').hidden=true;$('add-record').hidden=true;$('billing').hidden=true;$('team').hidden=true;$('history').hidden=true;
 $('suite-name').textContent=config.tenant.suiteName;
 head('Bienvenido a '+config.tenant.displayName,'Tu organización tiene '+config.tools.length+' herramientas habilitadas.');
 $('count-tools').textContent=config.tools.length;
 $('count-role').textContent=roles[config.tenant.role]||config.tenant.role;
 $('count-suite').textContent=config.tenant.suiteName.replace('Hubie ','');
 $('home-title').textContent='Todo '+config.tenant.displayName+' en una sola Suite.';
 document.querySelectorAll('[data-tool]').forEach(n=>n.removeAttribute('aria-current'));
 $('appearance-nav').removeAttribute('aria-current');
 document.querySelector('[data-home]').setAttribute('aria-current','page');
 const host=$('module-cards');host.replaceChildren();
 for(const tool of config.tools){
  const b=elt('button',undefined,'module-card');b.type='button';
  const details=elt('span');details.append(elt('strong',tool.name),elt('small',tool.included?'Core incluido':tool.group));
  const badge=elt('span',undefined,'company-icon');badge.dataset.tint=toolTint(tool.id);badge.append(toolIcon(tool.id));b.append(badge,details);
  b.addEventListener('click',()=>showTool(tool.id));host.append(b);
 }
 void loadHomeInsights(config);
}
async function showTool(id,options={}){
 closeMobileNav();
 const tool=config.tools.find(t=>t.id===id);if(!tool)return notice('La herramienta está desactivada.',true);
 // C010 ya no es un formulario genérico: su vista ES el centro de
 // notificaciones del tenant (assets/notifications.js).
 if(id==='C010')return showNotifications();
 applyAppearance(config.appearance,document.documentElement,config.backgrounds);
 activeTool=tool;$('home').hidden=true;$('module').hidden=false;$('appearance').hidden=true;$('billing').hidden=true;$('migration').hidden=true;$('team').hidden=true;$('history').hidden=true;$('notifications-view').hidden=true;
 document.querySelector('[data-home]').removeAttribute('aria-current');
 $('appearance-nav').removeAttribute('aria-current');
 $('migration-nav').removeAttribute('aria-current');
 document.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-current',b.dataset.tool===id?'page':'false'));
 $('suite-name').textContent=config.tenant.suiteName+' / '+tool.group;
 head(tool.name,'Información exclusiva de '+config.tenant.displayName);
 await openRecords({tool,config,api,write,elt,notice,initialClientId:options.clientId||null,initialRecordId:options.recordId||null,initialDealId:options.dealId||null,navigateToTool:(id,options)=>showTool(id,options)});
}
function navigateToSearchResult(item){
 let url=null;
 try{url=new URL(item.link,location.origin);}catch{return;}
 if(url.searchParams.get('view')==='billing')return showBilling();
 const tool=url.searchParams.get('tool'),record=url.searchParams.get('record');
 if(!tool||!record)return;
 const options={};
 if(tool==='C001')options.clientId=record;
 else if(tool==='C002')options.dealId=record;
 else options.recordId=record;
 void showTool(tool,options);
}
async function showNotifications(){
 closeMobileNav();
 closeOperationalModule();
 activeTool=config.tools.find(t=>t.id==='C010')||null;
 $('home').hidden=true;$('module').hidden=true;$('appearance').hidden=true;$('billing').hidden=true;$('add-record').hidden=true;$('notifications-view').hidden=false;
 document.querySelectorAll('[data-tool]').forEach(n=>n.removeAttribute('aria-current'));
 document.querySelector('[data-home]').removeAttribute('aria-current');
 $('appearance-nav').removeAttribute('aria-current');
 head('Notificaciones','Avisos de '+config.tenant.displayName);
 $('notifications-unread-pill').textContent='Cargando…';
 const data=await notificationCenter?.refresh();
 if(data)$('notifications-unread-pill').textContent=data.unread+' sin leer';
}
function showAppearance(){
 closeMobileNav();
 if(!config||!['owner','admin'].includes(config.tenant.role))return notice('Solo el propietario o administrador puede editar la apariencia.',true);
 closeOperationalModule();
 activeTool=null;$('home').hidden=true;$('module').hidden=true;$('appearance').hidden=false;$('billing').hidden=true;$('add-record').hidden=true;$('migration').hidden=true;$('team').hidden=true;$('history').hidden=true;$('notifications-view').hidden=true;
 document.querySelectorAll('[data-tool]').forEach(n=>n.removeAttribute('aria-current'));
 document.querySelector('[data-home]').removeAttribute('aria-current');
 $('migration-nav').removeAttribute('aria-current');
 $('appearance-nav').setAttribute('aria-current','page');
 head('Personalizar tu Suite','Selecciona el fondo del dashboard y del menú lateral sin modificar otras empresas.');
 const route='/api/app/'+encodeURIComponent(config.tenant.slug)+'/media/';
 createAppearanceEditor($('suite-appearance'),{
  initial:config.appearance,backgrounds:config.backgrounds,
  title:'Fondos de '+config.tenant.displayName,
  description:'Carga una imagen del dashboard y otra del panel lateral, o usa colores y acabados Hubie.',
  live:true,
  onImageUpload:async(kind,file)=>{
   const result=await write(route+kind,'POST',file);
   config.backgrounds={...config.backgrounds,...(result.backgrounds||{[kind]:route+kind+'?v='+result.media?.id})};
   return {backgrounds:config.backgrounds};
  },
  onImageRemove:async kind=>{
   const result=await api(route+kind,{method:'DELETE'});
   config.backgrounds={...config.backgrounds,...(result.backgrounds||{}),[kind]:null};
   return {backgrounds:config.backgrounds};
  },
  onSave:async appearance=>{
   const result=await write('/api/app/'+encodeURIComponent(config.tenant.slug)+'/appearance','PUT',appearance);
   config.appearance=result.appearance;notice('Se ha guardado la apariencia de tu Suite.');return result;
  }
 });
}
async function showBilling(){
 closeMobileNav();
 if(!config)return;
 closeOperationalModule();
 activeTool=null;$('home').hidden=true;$('module').hidden=true;$('appearance').hidden=true;$('billing').hidden=false;$('add-record').hidden=true;$('migration').hidden=true;$('team').hidden=true;$('history').hidden=true;$('notifications-view').hidden=true;
 document.querySelectorAll('[data-tool]').forEach(n=>n.removeAttribute('aria-current'));
 document.querySelector('[data-home]').removeAttribute('aria-current');
 $('appearance-nav').removeAttribute('aria-current');
 $('migration-nav').removeAttribute('aria-current');
 $('billing-nav').setAttribute('aria-current','page');
 head('Mi suscripción','Estado de cobro de '+config.tenant.displayName);
 try{
  const s=await api('/api/billing/status?slug='+encodeURIComponent(config.tenant.slug));
  $('billing-status-pill').textContent=s.statusLabel||s.effectiveStatus;
  const host=$('billing-details');host.replaceChildren();
  const row=(label,value)=>{const r=elt('div',undefined,'aurora-row');const m=elt('span',undefined,'insight-meta');m.append(elt('strong',label),elt('small',value));r.append(m);host.append(r);};
  row('Estado',s.statusLabel||s.effectiveStatus);
  row('Mensualidad de plataforma',currency(s.monthlyFeeCents)+' / mes');
  if(s.currentPeriodEnd)row('Periodo actual termina',new Date(s.currentPeriodEnd).toLocaleDateString('es-MX'));
  if(s.balancePendingCents)row('Saldo pendiente',currency(s.balancePendingCents)+' en '+s.balanceInstallmentsPending+' parcialidades'+(s.nextBalanceDueAt?' · próximo '+new Date(s.nextBalanceDueAt).toLocaleDateString('es-MX'):''));
  if(s.daysPastDue)row('Días de atraso',s.daysPastDue+' (gracia de 3 días antes de la suspensión)');
  if(s.effectiveStatus==='none')row('Sin suscripción','Aún no hay un pago registrado para esta empresa.');
 }catch(e){
  $('billing-status-pill').textContent='No disponible';
  const host=$('billing-details');host.replaceChildren();host.append(elt('p','No se pudo cargar tu estado de cobro: '+e.message,'help'));
 }
}
async function showMigration(){
 closeMobileNav();
 if(!config||!['owner','admin'].includes(config.tenant.role))return notice('Solo el propietario o administrador puede migrar datos.',true);
 closeOperationalModule();
 activeTool=null;$('home').hidden=true;$('module').hidden=true;$('appearance').hidden=true;$('billing').hidden=true;$('migration').hidden=false;$('team').hidden=true;$('history').hidden=true;$('add-record').hidden=true;
 document.querySelectorAll('[data-tool]').forEach(n=>n.removeAttribute('aria-current'));
 document.querySelector('[data-home]').removeAttribute('aria-current');
 $('appearance-nav').removeAttribute('aria-current');
 $('migration-nav').setAttribute('aria-current','page');
 head('Migración de datos','Importa clientes, catálogo, cotizaciones y gastos desde un archivo JSON.');
 const {createMigrationPanel}=await import('./import-ui.js');
 const host=$('migration-panel');host.replaceChildren();
 host.append(createMigrationPanel({
  notice,
  onSubmit:async payload=>write('/api/app/'+encodeURIComponent(config.tenant.slug)+'/migration','POST',payload)
 }));
}
async function showTeam(){
 closeMobileNav();
 if(!config||!['owner','admin'].includes(config.tenant.role))return notice('Solo el propietario o administrador puede gestionar el equipo.',true);
 closeOperationalModule();
 activeTool=null;$('home').hidden=true;$('module').hidden=true;$('appearance').hidden=true;$('billing').hidden=true;$('team').hidden=false;$('history').hidden=true;$('migration').hidden=true;$('add-record').hidden=true;
 document.querySelectorAll('[data-tool]').forEach(n=>n.removeAttribute('aria-current'));
 document.querySelector('[data-home]').removeAttribute('aria-current');
 $('appearance-nav').removeAttribute('aria-current');
 $('billing-nav').removeAttribute('aria-current');
 $('history-nav').removeAttribute('aria-current');
 $('team-nav').setAttribute('aria-current','page');
 head('Equipo','Miembros e invitaciones de '+config.tenant.displayName);
 $('team-role-pill').textContent=roles[config.tenant.role]||config.tenant.role;
 const membersHost=$('team-members');membersHost.replaceChildren();
 const members=config.members||[];
 if(!members.length)membersHost.append(elt('p','Los miembros se autorizan desde Hubie Madre.','help'));
 for(const m of members){const row=elt('div',undefined,'line');const d=elt('div');d.append(elt('strong',m.email),elt('small',roles[m.role]||m.role));row.append(d);membersHost.append(row);}
 try{
  const slug=encodeURIComponent(config.tenant.slug);
  const data=await api('/api/app/'+slug+'/invitations');
  const refresh=async()=>{const fresh=await api('/api/app/'+slug+'/invitations');return {invitations:fresh.invitations};};
  renderInvitations($('team-invitations'),{invitations:data.invitations,emailConfigured:data.emailConfigured,canManage:true},{
   onInvite:async payload=>{const r=await write('/api/app/'+slug+'/invitations','POST',payload);const f=await refresh();return {...f,lastInvite:r,message:r.emailSent?'Invitación enviada a '+r.invitation.email+'.':'Enlace listo para compartir (correo no configurado).'};},
   onRevoke:async invId=>{await api('/api/app/'+slug+'/invitations/'+invId,{method:'DELETE'});const f=await refresh();return {...f,message:'Invitación revocada.'};},
   onResend:async invId=>{const r=await write('/api/app/'+slug+'/invitations/'+invId+'/resend','POST',{});const f=await refresh();return {...f,lastInvite:r,message:r.emailSent?'Invitación reenviada a '+r.invitation.email+'.':'Enlace nuevo listo para compartir (correo no configurado).'};}
  });
 }catch(e){$('team-invitations').replaceChildren(elt('p','No se pudieron cargar las invitaciones: '+e.message,'help'));}
}
async function showHistory(filters={}){
 closeMobileNav();
 if(!config)return;
 closeOperationalModule();
 activeTool=null;$('home').hidden=true;$('module').hidden=true;$('appearance').hidden=true;$('billing').hidden=true;$('team').hidden=true;$('history').hidden=false;$('migration').hidden=true;$('add-record').hidden=true;
 document.querySelectorAll('[data-tool]').forEach(n=>n.removeAttribute('aria-current'));
 document.querySelector('[data-home]').removeAttribute('aria-current');
 $('appearance-nav').removeAttribute('aria-current');
 $('billing-nav').removeAttribute('aria-current');
 $('team-nav').removeAttribute('aria-current');
 $('history-nav').setAttribute('aria-current','page');
 head('Historial','Actividad de '+config.tenant.displayName);
 try{
  const slug=encodeURIComponent(config.tenant.slug);
  const query=new URLSearchParams();
  if(filters.action)query.set('action',filters.action);
  if(filters.actor)query.set('actor',filters.actor);
  if(filters.from)query.set('from',filters.from);
  if(filters.to)query.set('to',filters.to);
  if(filters.limit)query.set('limit',String(filters.limit));
  const data=await api('/api/app/'+slug+'/audit'+(query.toString()?'?'+query.toString():''));
  renderAudit($('history-list'),{events:data.events,actions:data.actions,tenants:null,filters},{onFilter:next=>void showHistory(next)});
 }catch(e){$('history-list').replaceChildren(elt('p','No se pudo cargar el historial: '+e.message,'help'));}

}
function closeMobileNav(){
 document.documentElement.classList.remove('mobile-nav-open');
 const button=$('sidebar-toggle');if(button){button.setAttribute('aria-expanded','false');button.textContent='☰ Menú';}
}
function toolButton(tool){
 const b=elt('button',undefined,'nav-item');b.type='button';b.dataset.tool=tool.id;
 const text=elt('span',tool.name);b.append(toolIcon(tool.id),text);
 b.addEventListener('click',()=>{void showTool(tool.id);closeMobileNav();});
 return b;
}
function nav(){
 const host=$('tools-nav');host.replaceChildren();
 const featured=new Set(['C001','C002','C004','C005','T013']);
 const active=config.tools.filter(t=>featured.has(t.id));
 if(active.length){
  const label=elt('div','Accesos rápidos','nav-label nav-sub-label');host.append(label);
  for(const tool of active)host.append(toolButton(tool));
 }
 const groups=new Map();
 for(const tool of config.tools){
  if(featured.has(tool.id))continue;
  const key=tool.group||'Otras herramientas';
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(tool);
 }
 for(const [name,items]of groups){
  const detail=elt('details',undefined,'nav-group');
  const summary=elt('summary',undefined,'nav-group-summary');
  summary.append(icon('layers'),elt('span',name),elt('small',String(items.length)),icon('chevron',14));
  detail.append(summary);
  const list=elt('div',undefined,'nav-group-items');
  for(const item of items)list.append(toolButton(item));
  detail.append(list);
  detail.addEventListener('toggle',()=>{if(detail.open)for(const other of host.querySelectorAll('.nav-group'))if(other!==detail)other.open=false;});
  host.append(detail);
 }
}
async function openOrganization(slug){
 try{
  config=await api('/api/app/'+encodeURIComponent(slug)+'/config');
  config.backgrounds=config.backgrounds||{dashboard:null,sidebar:null};
  // TOOLS P0 (C009): un permiso 'none' por módulo oculta la Tool en el menú;
  // el servidor la bloquea igualmente (checkMemberToolAccess).
  try{
   const mine=await api('/api/app/'+encodeURIComponent(slug)+'/member-tools');
   if(mine?.access)config.tools=config.tools.filter(t=>mine.access[t.id]!=='none');
  }catch{/* Sin permisos por miembro, manda el rol. */}
  applyAppearance(config.appearance,document.documentElement,config.backgrounds);
  $('appearance-nav').hidden=!['owner','admin'].includes(config.tenant.role);
  $('migration-nav').hidden=!['owner','admin'].includes(config.tenant.role);
  $('team-nav').hidden=!['owner','admin'].includes(config.tenant.role);
  $('history-nav').hidden=false;
  $('billing-nav').hidden=false;
  document.documentElement.style.setProperty('--blue',config.tenant.primaryColor||'#7c5cfc');
  $('brand-name').textContent=config.tenant.displayName;
  // Un logo de tenant que falla (URL rota o archivo ausente) mostraba el icono
  // de imagen rota en el sidebar; con el fallback vuelve al logo oficial.
  // El logo oficial es tinta oscura: sobre el sidebar azul tinta solo se lee
  // en blanco (tratamiento de marca.html), así que la clase logo-official se
  // pone solo cuando el logo en uso es el oficial; un logo de tenant conserva
  // sus propios colores.
  const logo=$('brand-logo');
  logo.onerror=()=>{logo.onerror=null;logo.src='/assets/hubie-logo-official.png';logo.classList.add('logo-official');};
  logo.src=config.tenant.logoUrl||'/assets/hubie-logo-official.png';
  logo.classList.toggle('logo-official',!config.tenant.logoUrl);
  $('brand-logo').alt=config.tenant.displayName;
  $('role').textContent=roles[config.tenant.role]||config.tenant.role;
  $('breadcrumb').textContent='HUBIE / '+config.tenant.slug.toUpperCase();
  $('tenant-select').value=slug;
  const u=new URL(location.href);u.searchParams.set('tenant',slug);history.replaceState({},'',u);
  nav();home();notice('');
  // Guía de primer uso (018): tarjeta en el inicio + Soporte en "Mi cuenta".
  mountOnboardingGuide({api,write,getConfig:()=>config,notice,showTool,showBilling,showAppearance});
  // Búsqueda global (/, Ctrl+K) y campana de notificaciones del tenant.
  const searchInput=$('global-search-input');
  searchInput.dataset.slug=slug;
  if(!searchBox){
   searchBox=createGlobalSearch({input:searchInput,resultsHost:$('global-search-results'),api,onNavigate:navigateToSearchResult});
   bindSearchShortcut(searchInput);
  }
  $('notifications-bell-icon').replaceChildren(bellIcon());
  if(!notificationCenter){
   notificationCenter=createTenantNotificationCenter({api,getSlug:()=>config.tenant.slug,badge:$('notifications-badge'),viewHost:$('notifications-center'),onNavigate:navigateToSearchResult});
  }
  void notificationCenter.refresh();

 }catch(e){notice('No se pudo abrir la empresa: '+e.message,true);}
}
const currency=n=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(Number(n||0)/100);
const row=(icon,title,detail)=>{
 const el=elt('div',undefined,'aurora-row'),symbol=elt('span',icon,'insight-mark'),meta=elt('span',undefined,'insight-meta');
 meta.append(elt('strong',title),elt('small',detail));el.append(symbol,meta);return el;
};
function fillRows(host,items,fallback='Sin registros por mostrar'){
 host.replaceChildren();
 if(!items?.length){host.append(elt('p',fallback,'help'));return;}
 for(const item of items)host.append(row(item.icon,item.title,item.detail));
}
async function loadHomeInsights(current){
 if(!current)return;
 const slug=encodeURIComponent(current.tenant.slug);
 const info=[
  {id:'C001',route:'clients',key:'clients',name:'Clientes',icon:'♧'},
  {id:'C002',route:'crm',key:'deals',name:'Oportunidades',icon:'◈'},
  {id:'C004',route:'agenda',key:'events',name:'Citas próximas',icon:'▣'},
  {id:'C005',route:'inventory',key:'items',name:'Stock crítico',icon:'◇'}
 ];
 const enabled=new Set(current.tools.map(t=>t.id));
 const kpi=$('home-kpis');kpi.replaceChildren();
 const cards=new Map();
 for(const item of info){
  if(!enabled.has(item.id))continue;
  const card=elt('article',undefined,'stat');
  const value=elt('div','…','stat-number');
  card.append(elt('span',item.name,'stat-label'),value,elt('span','Datos de tu empresa','help'));kpi.append(card);
  cards.set(item.id,value);
 }
 const targets={C001:$('home-clients-insight'),C002:$('home-crm-insight'),C004:$('home-agenda-insight'),C005:$('home-stock-insight')};
 for(const item of info){
  targets[item.id].replaceChildren(elt('p',enabled.has(item.id)?'Consultando información…':'Módulo desactivado para esta Suite.','help'));
  const btn=$({'C001':'insight-open-clients','C002':'insight-open-crm','C004':'insight-open-agenda','C005':'insight-open-stock'}[item.id]);
  btn.hidden=!enabled.has(item.id);
 }
 $('home-quick-actions').replaceChildren();
 // La acción principal es crear: Cotizaciones abre el diálogo de alta en un
 // solo toque (showTool + clic en el CTA de la página). El resto abre su módulo.
 for(const [tool,label,primary,direct] of [['T013','Nueva cotización',true,true],['C001','Nuevo cliente'],['C004','Nueva cita'],['C005','Agregar producto']]){
  if(!enabled.has(tool)||current.tenant.role==='viewer')continue;
  const button=elt('button',label,'btn'+(primary?' btn-primary':''));
  button.prepend(toolIcon(tool));
  button.type='button';
  if(direct)button.addEventListener('click',async()=>{await showTool(tool);const first=document.querySelector('#op-quote-title');if(first){first.focus();first.scrollIntoView({block:'nearest'});}else $('add-record').click();});
  else button.addEventListener('click',()=>showTool(tool));
  $('home-quick-actions').append(button);
 }
 if(!kpi.children.length)kpi.append(elt('p','No hay módulos operativos activados.','help'));
 const available=info.filter(item=>enabled.has(item.id));
 const results=await Promise.allSettled(available.map(item=>api('/api/app/'+slug+'/workflows/'+item.route)));
 if(current!==config||$('home').hidden)return;
 for(let i=0;i<results.length;i++){
  const item=available[i],outcome=results[i],value=cards.get(item.id);
  if(outcome.status==='rejected'){
   value.textContent='—';
   targets[item.id].replaceChildren(elt('p','No fue posible consultar el módulo.','help'));continue;
  }
  const data=outcome.value,list=data[item.key]||[];
  const upcoming=item.id==='C004'?list.filter(x=>x.status==='scheduled'&&Date.parse(x.endsAt)>=Date.now()).sort((a,b)=>a.startsAt.localeCompare(b.startsAt)):[];
  const low=item.id==='C005'?list.filter(x=>x.isLow):[];
  value.textContent=String(item.id==='C004'?upcoming.length:item.id==='C005'?low.length:list.length);
  if(item.id==='C001')fillRows(targets[item.id],list.slice(0,4).map(x=>({icon:'♧',title:x.name,detail:x.company||x.email||'Contacto registrado'})),'Todavía no hay clientes.');
  if(item.id==='C002')fillRows(targets[item.id],list.slice(0,4).map(x=>({icon:'◈',title:x.title,detail:x.stage+' · '+currency(x.amountCents)})),'Todavía no hay oportunidades.');
  if(item.id==='C002'){
    const chart=$('home-pipeline-chart');chart.replaceChildren();
    if(list.length){
     const stages=[['lead','Lead'],['qualified','Calificado'],['proposal','Propuesta'],['negotiation','Negociación'],['won','Ganado'],['lost','Perdido']];
     for(const [stage,label] of stages){
      const count=list.filter(x=>x.stage===stage).length;if(!count)continue;
      const track=elt('div',undefined,'pipeline-mini-row'),bar=elt('span',undefined,'pipeline-mini-bar');
      bar.style.setProperty('--bar-pct',Math.max(6,Math.round(count/list.length*100))+'%');
      track.append(elt('span',label),bar,elt('strong',String(count)));chart.append(track);
     }
    }
  }

  if(item.id==='C004')fillRows(targets[item.id],upcoming.slice(0,4).map(x=>({icon:'▣',title:x.title,detail:new Date(x.startsAt).toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'})})),'No hay próximas citas.');
  if(item.id==='C005')fillRows(targets[item.id],low.slice(0,4).map(x=>({icon:'◇',title:x.title,detail:'Existencias: '+x.quantity+' · Mínimo: '+x.lowStock})),'Todos los artículos están por encima del mínimo.');
 }
}
async function init(){
 decorateSidebar(document.querySelector('.sidebar'));
 const toggle=$('sidebar-toggle');
 toggle?.addEventListener('click',()=>{
  const expanded=document.documentElement.classList.toggle('mobile-nav-open');
  toggle.setAttribute('aria-expanded',String(expanded));
  toggle.textContent=expanded?'✕ Cerrar':'☰ Menú';
 });
 document.addEventListener('keydown',ev=>{if(ev.key==='Escape')closeMobileNav();});
 document.addEventListener('click',ev=>{
  if(document.documentElement.classList.contains('mobile-nav-open')&&ev.target instanceof Element&&!ev.target.closest('.sidebar'))closeMobileNav();
 });
 if(demoMode)document.querySelector('.sidebar .brand').href='/app/?demo=1';

 if(demoMode){
  $('demo-banner').hidden=false;
  $('logout').textContent='↪  Salir de la demostración';
  const foot=document.querySelector('footer');if(foot)foot.textContent='Hubie App · MODO DEMO: datos ficticios y temporales, sin conexión a Turso.';
  document.title='Hubie App · Demostración sin conexión';
 }
 $('tenant-select').addEventListener('change',e=>openOrganization(e.target.value));
 document.querySelector('[data-home]').addEventListener('click',home);
 $('notifications-bell').addEventListener('click',()=>void showNotifications());
 $('appearance-nav').addEventListener('click',showAppearance);
 $('migration-nav').addEventListener('click',showMigration);
 $('team-nav').addEventListener('click',showTeam);
 $('history-nav').addEventListener('click',()=>showHistory());
 $('billing-nav').addEventListener('click',showBilling);
 for(const [id,tool] of [['insight-open-crm','C002'],['insight-open-clients','C001'],['insight-open-agenda','C004'],['insight-open-stock','C005']])$(''+id).addEventListener('click',()=>showTool(tool));
 $('logout').addEventListener('click',async()=>{if(demoMode){location.href='/app/';return;}await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});location.reload();});
 try{
  organizations=(await api('/api/app/organizations')).organizations;
  if(!organizations.length)throw Error('Tu cuenta no tiene una empresa asignada. Solicita acceso a Hubie Madre.');
  const select=$('tenant-select');for(const o of organizations)select.add(new Option(o.name,o.slug));
  $('console').hidden=false;
  const requested=new URLSearchParams(location.search).get('tenant');
  await openOrganization(organizations.some(o=>o.slug===requested)?requested:organizations[0].slug);
 }catch(e){$('login').hidden=false;if(e.status===503){$('google-entry').hidden=true;$('login-message').textContent='La conexión real con Google y Turso está pendiente. Explora el panel con datos simulados.';}else $('login-message').textContent=e.status===401?'Inicia sesión con Google para continuar.':e.message;}
 if('serviceWorker'in navigator)navigator.serviceWorker.register('/app/sw.js',{scope:'/app/'}).catch(()=>{});
}
init();
