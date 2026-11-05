'use strict';
const $=id=>document.getElementById(id);
const state={catalog:null,tenants:[],selected:null,detail:null};
const money=n=>n==null?'A cotizar':new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0}).format(n);
function node(tag,text,cls){const x=document.createElement(tag);if(text!==undefined)x.textContent=text;if(cls)x.className=cls;return x;}
async function api(path,options={}){
 const r=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});
 const data=await r.json().catch(()=>({}));
 if(!r.ok)throw Object.assign(new Error(data.error||'Error al conectar'),{status:r.status});
 return data;
}
async function write(path,method,body){return api(path,{method,headers:{'content-type':'application/json'},body:JSON.stringify(body)});}
function notice(message,error=false){const e=$('feedback');e.textContent=message;e.classList.toggle('error',error);}
function screen(view){
 for(const s of document.querySelectorAll('[id^="view-"]'))s.hidden=s.id!=='view-'+view;
 for(const b of document.querySelectorAll('[data-view]'))b.setAttribute('aria-current',b.dataset.view===view?'page':'false');
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
 const input=document.createElement('input');input.type='checkbox';input.checked=checked;input.disabled=!editable;
 if(onChange)input.addEventListener('change',()=>onChange(input));
 label.append(input);
 const mid=node('span');
 mid.append(node('strong',tool.name),node('small',(tool.included?'Core · incluido':tool.group+' · '+money(tool.price))));
 label.append(mid);
 return label;
}
function renderCreateTools(){
 const host=$('create-tools');host.replaceChildren();
 for(const t of toolList())host.append(toolRow(t,!!t.included,null));
}
function renderCatalog(){
 const host=$('catalog-suites');host.replaceChildren();
 for(const s of suiteList()){
  const x=node('article',undefined,'module-card');
  const content=node('div');
  content.append(node('strong',s.name),node('small',money(s.price)+' · '+s.users+' usuarios'));
  x.append(node('span','◈','company-icon'),content);host.append(x);
 }
 const list=$('catalog-tools');list.replaceChildren();
 for(const t of toolList())list.append(toolRow(t,!!t.included,null,false));
}
function companyRow(t){
 const btn=node('button',undefined,'company');btn.type='button';
 const meta=node('div',undefined,'company-meta');meta.append(node('strong',t.name),node('small',t.slug+' · '+(suiteList().find(s=>s.id===t.suiteId)?.name||t.suiteId||'Sin Suite')));
 const status=node('span',t.status==='active'?'Activa':'Suspendida','status'+(t.status==='active'?'':' off'));
 btn.append(node('span','▦','company-icon'),meta,status);
 btn.addEventListener('click',()=>openDetail(t.id));
 return btn;
}
function renderTenants(){
 $('stat-companies').textContent=state.tenants.length;
 $('stat-suites').textContent=suiteList().length;
 $('stat-tools').textContent=toolList().length;
 const recent=$('overview-companies');recent.replaceChildren();
 for(const t of state.tenants.slice(0,5))recent.append(companyRow(t));
 if(!state.tenants.length)recent.append(node('div','Aún no hay empresas. Crea la primera desde Hubie Madre.','empty'));
 filterCompanies();
}
function filterCompanies(){
 const q=$('filter-companies').value.toLowerCase().trim();
 const host=$('companies');host.replaceChildren();
 const found=state.tenants.filter(t=>(t.name+' '+t.slug).toLowerCase().includes(q));
 for(const t of found)host.append(companyRow(t));
 if(!found.length)host.append(node('div','No se encontraron empresas.','empty'));
}
async function loadTenants(){state.tenants=(await api('/api/admin/tenants')).tenants;renderTenants();}
function renderMembers(items){
 const host=$('members');host.replaceChildren();
 for(const m of items){const line=node('div',undefined,'line');line.append(node('strong',m.email),node('small',m.role));host.append(line);}
 if(!items.length)host.append(node('p','Sin miembros asignados.','help'));
}
async function loadMembers(id){renderMembers((await api('/api/admin/tenants/'+id+'/members')).members);}
function renderDetail(t){
 state.detail=t;$('detail-heading').textContent=t.name;
 $('detail-subtitle').textContent='Identificador: '+t.slug+' · '+t.suiteId;
 $('detail-open').href='/app/?tenant='+encodeURIComponent(t.slug);
 const form=$('detail-form');
 for(const key of ['name','displayName','suiteId','primaryColor','secondaryColor','status','logoUrl'])form.elements[key].value=t[key]??'';
 const host=$('detail-tools');host.replaceChildren();
 let count=t.tools.filter(x=>x.enabled).length;
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
  host.append(row);
 }
}
async function openDetail(id){
 state.selected=id;screen('detail');$('detail-heading').textContent='Cargando empresa…';
 try{const [t,m]=await Promise.all([api('/api/admin/tenants/'+id),api('/api/admin/tenants/'+id+'/members')]);renderDetail(t.tenant);renderMembers(m.members);}
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
 try{const d=await write('/api/admin/tenants/'+state.selected+'/members','POST',payload);renderMembers(d.members);ev.currentTarget.reset();notice('Usuario autorizado para esta empresa. Ya puede ingresar con Google.');}
 catch(e){notice('No fue posible autorizar: '+e.message,true);}
}
let slugTouched=false;
function initEvents(){
 document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>screen(btn.dataset.view)));
 $('create-form').addEventListener('submit',createCompany);
 $('detail-form').addEventListener('submit',saveDetail);
 $('member-form').addEventListener('submit',addMember);
 $('filter-companies').addEventListener('input',filterCompanies);
 $('reset-tools').addEventListener('click',()=>{for(const c of $('create-tools').querySelectorAll('input'))c.checked=!!toolList().find(t=>t.id===c.dataset.toolId)?.included;});
 $('create-slug').addEventListener('input',()=>{slugTouched=true;});
 $('create-name').addEventListener('input',ev=>{if(!slugTouched)$('create-slug').value=ev.target.value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,63);});
 $('logout').addEventListener('click',async()=>{await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'});location.reload();});
}
async function init(){
 initEvents();
 try{
  const [catalogData,tenantData]=await Promise.all([api('/api/admin/catalog'),api('/api/admin/tenants')]);
  state.catalog=catalogData.catalog;state.tenants=tenantData.tenants;
  suiteOptions($('create-suite'));suiteOptions($('detail-suite'));
  renderCreateTools();for(const [i,t] of toolList().entries())$('create-tools').children[i].querySelector('input').dataset.toolId=t.id;
  renderCatalog();renderTenants();
  $('console').hidden=false;screen('overview');
  if(location.search.includes('tenant=')){const id=new URLSearchParams(location.search).get('tenant');if(state.tenants.some(t=>t.id===id))await openDetail(id);}
 }catch(e){
  $('login').hidden=false;
  $('login-message').textContent=e.status===403?'Tu cuenta no tiene permiso de Super Admin. Puedes abrir la PWA de cliente.':'Accede con tu cuenta autorizada para gestionar Hubie Madre.';
 }
 if('serviceWorker'in navigator)navigator.serviceWorker.register('/madre/sw.js',{scope:'/madre/'}).catch(()=>{});
}
init();
