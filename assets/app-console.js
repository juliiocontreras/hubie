import {openRecords} from './app-records.js';
import {closeOperationalModule} from './app-workflows.js';
const $=id=>document.getElementById(id);
const elt=(tag,text,cls)=>{const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x;};
let organizations=[],config=null,activeTool=null;
async function api(path,options={}){
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
 closeOperationalModule();
 activeTool=null;$('home').hidden=false;$('module').hidden=true;$('add-record').hidden=true;
 $('suite-name').textContent=config.tenant.suiteName;
 head('Bienvenido a '+config.tenant.displayName,'Tu organización tiene '+config.tools.length+' herramientas habilitadas.');
 $('count-tools').textContent=config.tools.length;
 $('count-role').textContent=roles[config.tenant.role]||config.tenant.role;
 $('count-suite').textContent=config.tenant.suiteName.replace('Hubie ','');
 $('home-title').textContent='Todo '+config.tenant.displayName+' en una sola Suite.';
 document.querySelectorAll('[data-tool]').forEach(n=>n.removeAttribute('aria-current'));
 document.querySelector('[data-home]').setAttribute('aria-current','page');
 const host=$('module-cards');host.replaceChildren();
 for(const tool of config.tools){
  const b=elt('button',undefined,'module-card');b.type='button';
  const details=elt('span');details.append(elt('strong',tool.name),elt('small',tool.included?'Core incluido':tool.group));
  b.append(elt('span','◈','company-icon'),details);
  b.addEventListener('click',()=>showTool(tool.id));host.append(b);
 }
}
async function showTool(id){
 const tool=config.tools.find(t=>t.id===id);if(!tool)return notice('La herramienta está desactivada.',true);
 activeTool=tool;$('home').hidden=true;$('module').hidden=false;
 document.querySelector('[data-home]').removeAttribute('aria-current');
 document.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-current',b.dataset.tool===id?'page':'false'));
 $('suite-name').textContent=config.tenant.suiteName+' / '+tool.group;
 head(tool.name,'Información exclusiva de '+config.tenant.displayName);
 await openRecords({tool,config,api,write,elt,notice});
}
function nav(){
 const host=$('tools-nav');host.replaceChildren();
 let last='';
 for(const t of config.tools){
  if(t.group!==last){host.append(elt('div',t.group,'nav-label'));last=t.group;}
  const b=elt('button','◫  '+t.name,'nav-item');b.type='button';b.dataset.tool=t.id;
  b.addEventListener('click',()=>showTool(t.id));host.append(b);
 }
}
async function openOrganization(slug){
 try{
  config=await api('/api/app/'+encodeURIComponent(slug)+'/config');
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
async function init(){
 $('tenant-select').addEventListener('change',e=>openOrganization(e.target.value));
 document.querySelector('[data-home]').addEventListener('click',home);
 $('logout').addEventListener('click',async()=>{await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});location.reload();});
 try{
  organizations=(await api('/api/app/organizations')).organizations;
  if(!organizations.length)throw Error('Tu cuenta no tiene una empresa asignada. Solicita acceso a Hubie Madre.');
  const select=$('tenant-select');for(const o of organizations)select.add(new Option(o.name,o.slug));
  $('console').hidden=false;
  const requested=new URLSearchParams(location.search).get('tenant');
  await openOrganization(organizations.some(o=>o.slug===requested)?requested:organizations[0].slug);
 }catch(e){$('login').hidden=false;$('login-message').textContent=e.status===401?'Inicia sesión con Google para continuar.':e.message;}
 if('serviceWorker'in navigator)navigator.serviceWorker.register('/app/sw.js',{scope:'/app/'}).catch(()=>{});
}
init();
