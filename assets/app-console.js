import {openRecords} from './app-records.js';
import {closeOperationalModule} from './app-workflows.js';
import {createAppearanceEditor,applyAppearance} from './appearance-ui.js';
import {icon,toolIcon,decorateSidebar} from './ui-icons.js';
const demoMode=new URLSearchParams(location.search).get('demo')==='1';
const demoApi=async(path,options)=>(await import('./demo-backend.js')).demoRequest(path,options);
const $=id=>document.getElementById(id);
const elt=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x;};
let organizations=[],config=null,activeTool=null;
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
 $('appearance').hidden=true;
 if(config)applyAppearance(config.appearance,document.documentElement,config.backgrounds);
 activeTool=null;$('home').hidden=false;$('module').hidden=true;$('add-record').hidden=true;
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
  const badge=elt('span',undefined,'company-icon');badge.append(toolIcon(tool.id));b.append(badge,details);
  b.addEventListener('click',()=>showTool(tool.id));host.append(b);
 }
 void loadHomeInsights(config);
}
async function showTool(id,options={}){
 closeMobileNav();
 const tool=config.tools.find(t=>t.id===id);if(!tool)return notice('La herramienta está desactivada.',true);
 applyAppearance(config.appearance,document.documentElement,config.backgrounds);
 activeTool=tool;$('home').hidden=true;$('module').hidden=false;$('appearance').hidden=true;
 document.querySelector('[data-home]').removeAttribute('aria-current');
 $('appearance-nav').removeAttribute('aria-current');
 document.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-current',b.dataset.tool===id?'page':'false'));
 $('suite-name').textContent=config.tenant.suiteName+' / '+tool.group;
 head(tool.name,'Información exclusiva de '+config.tenant.displayName);
 await openRecords({tool,config,api,write,elt,notice,initialClientId:options.clientId||null,initialRecordId:options.recordId||null,initialDealId:options.dealId||null,navigateToTool:(id,options)=>showTool(id,options)});
}
function showAppearance(){
 closeMobileNav();
 if(!config||!['owner','admin'].includes(config.tenant.role))return notice('Solo el propietario o administrador puede editar la apariencia.',true);
 closeOperationalModule();
 activeTool=null;$('home').hidden=true;$('module').hidden=true;$('appearance').hidden=false;$('add-record').hidden=true;
 document.querySelectorAll('[data-tool]').forEach(n=>n.removeAttribute('aria-current'));
 document.querySelector('[data-home]').removeAttribute('aria-current');
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
function closeMobileNav(){
 document.documentElement.classList.remove('mobile-nav-open');
 const button=$('sidebar-toggle');if(button)button.setAttribute('aria-expanded','false');
}
function toolButton(tool){
 const b=elt('button',undefined,'nav-item');b.type='button';b.dataset.tool=tool.id;
 const text=elt('span',tool.name);b.append(toolIcon(tool.id),text);
 b.addEventListener('click',()=>{void showTool(tool.id);closeMobileNav();});
 return b;
}
function nav(){
 const host=$('tools-nav');host.replaceChildren();
 const featured=new Set(['C001','C002','C004','C005']);
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
  applyAppearance(config.appearance,document.documentElement,config.backgrounds);
  $('appearance-nav').hidden=!['owner','admin'].includes(config.tenant.role);
  document.documentElement.style.setProperty('--blue',config.tenant.primaryColor||'#327ce7');
  $('brand-name').textContent=config.tenant.displayName;
  $('brand-logo').src=config.tenant.logoUrl||'/assets/hubie-logo-official.png';
  $('brand-logo').alt=config.tenant.displayName;
  $('role').textContent=roles[config.tenant.role]||config.tenant.role;
  $('breadcrumb').textContent='HUBIE / '+config.tenant.slug.toUpperCase();
  $('tenant-select').value=slug;
  const u=new URL(location.href);u.searchParams.set('tenant',slug);history.replaceState({},'',u);
  nav();home();notice('');
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
 for(const [tool,label] of [['C001','Nuevo cliente'],['C004','Nueva cita'],['C005','Agregar producto']]){
  if(!enabled.has(tool)||current.tenant.role==='viewer')continue;
  const button=elt('button',label,'btn'+(tool==='C001'?' btn-primary':''));
  button.prepend(toolIcon(tool));
  button.type='button';button.addEventListener('click',()=>showTool(tool));$('home-quick-actions').append(button);
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
 $('appearance-nav').addEventListener('click',showAppearance);
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
