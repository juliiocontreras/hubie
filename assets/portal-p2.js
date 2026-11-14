// T001 Portal de clientes (panel del staff). Crea accesos de portal, muestra el
// enlace de activación una sola vez y revoca accesos. El envío del enlace por
// correo está PENDIENTE: el staff comparte el enlace por el canal que ya usa
// con el cliente; nunca se finge un envío. La vista pública del cliente vive
// en /portal.html (portal-p2 público, mismo archivo, función renderPortalPage).
import {field,line,button,container} from './app-workflows.js';
const chevron='<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"/></svg>';
export async function renderPortal(ctx){
 const base='/api/app/'+encodeURIComponent(ctx.config.tenant.slug)+'/workflows/portal';
 const canWrite=ctx.config.tenant.role!=='viewer';
 const host=document.getElementById('record-list'),editor=container('card-soft'),list=container('stack');
 const form=document.createElement('form');form.className='stack';
 const fields={clientId:field('portal-client','Cliente registrado (C001)','select',[['','Elige un cliente']]),email:field('portal-email','Correo del cliente','email')};
 const grid=container('field-grid');for(const entry of Object.values(fields))grid.append(entry.holder);
 form.append(grid);
 const save=button('Crear acceso y generar enlace','btn btn-primary');save.type='submit';
 const note=line('El enlace de activación caduca en 24 h y solo se puede usar una vez. El envío por correo está pendiente: comparte el enlace por el canal que ya usas con el cliente.','group-label');
 const actions=container('toolbar');actions.append(save);form.append(actions,note);
 editor.append(line('Portal de clientes: acceso seguro por correo y contraseña','group-label'),form);
 host.replaceChildren(editor);host.append(list);
 let clients=[],access=[],requests=[];
 async function reload(){
  const response=await ctx.api(base);if(ctx.signal.aborted)return;
  access=response.access||[];requests=response.requests||[];
  const clientsResponse=await ctx.api('/api/app/'+encodeURIComponent(ctx.config.tenant.slug)+'/workflows/clients');if(ctx.signal.aborted)return;
  clients=clientsResponse.clients||[];
  const previous=fields.clientId.input.value;
  fields.clientId.input.replaceChildren(new Option('Elige un cliente',''));
  for(const c of clients)fields.clientId.input.add(new Option(c.name+(c.email?' · '+c.email:''),c.id));
  fields.clientId.input.value=clients.some(x=>x.id===previous)?previous:'';
  draw();
 }
 function draw(){
  list.replaceChildren();
  for(const a of access){
   const card=container('card-soft');
   card.append(line(a.clientName+' · '+a.email,'group-label'),line('Estatus: '+a.status+(a.lastLoginAt?' · último acceso '+a.lastLoginAt:''),'stat-label'));
   if(canWrite&&a.status!=='revoked'){
    const revoke=button('Revocar acceso');revoke.addEventListener('click',async()=>{await ctx.api(base+'/'+a.id,{method:'DELETE'});await reload();},{signal:ctx.signal});
    card.append(revoke);
   }
   list.append(card);
  }
  for(const r of requests){
   const card=container('card-soft');
   card.append(line(r.clientName+' · '+r.subject,'group-label'),line(r.message,'stat-label'),line('Estatus: '+r.status+' · '+r.createdAt,'stat-label'));
   if(canWrite&&r.status!=='closed'){
    const close=button('Marcar cerrada');close.addEventListener('click',async()=>{await ctx.api(base+'/requests/'+r.id,{method:'PATCH',body:JSON.stringify({status:'closed'})});await reload();},{signal:ctx.signal});
    card.append(close);
   }
   list.append(card);
  }
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  const created=await ctx.api(base,{method:'POST',body:JSON.stringify({clientId:fields.clientId.input.value,email:fields.email.input.value||undefined})});
  const card=container('card-soft');
  card.append(line('Enlace de activación (muéstralo una sola vez)','group-label'));
  const link=document.createElement('a');link.href=created.activationUrl;link.textContent=created.activationUrl;link.target='_blank';link.rel='noopener';
  card.append(link,line('Caduca: '+created.activationExpiresAt,'stat-label'));
  editor.append(card);await reload();
 },{signal:ctx.signal});
 await reload();
}
// Vista pública del portal (portal.html): activación, login y solicitudes.
export function renderPortalPage(root){
 root.replaceChildren();
 const title=document.createElement('h1');title.textContent='Portal de clientes';
 const pending=document.createElement('p');pending.textContent='Acceso seguro: tu correo y la contraseña que fijaste con tu enlace de activación. Solo ves tus expedientes, cotizaciones y solicitudes.';
 root.append(title,pending);
 const params=new URLSearchParams(location.search);
 const org=params.get('org')||'',token=params.get('token')||'';
 const api=async(path,options={})=>{const r=await fetch(path,{headers:{'content-type':'application/json',...(options.headers||{})},method:options.method||'GET',body:options.body});if(!r.ok)throw new Error(await r.text());return r.json();};
 const sessionKey='hubie-portal-session';
 const show=(node)=>{root.replaceChildren(title,pending,node);};
 if(token){
  const card=document.createElement('div');
  const label=document.createElement('p');label.textContent='Activa tu acceso: crea una contraseña (mínimo 10 caracteres, con letras y números). El enlace caduca en 24 h y solo se puede usar una vez.';
  const password=document.createElement('input');password.type='password';password.placeholder='Nueva contraseña';password.required=true;
  const save=document.createElement('button');save.textContent='Activar acceso';save.className='btn btn-primary';
  const msg=document.createElement('p');
  save.addEventListener('click',async()=>{try{const data=await api('/api/portal/'+encodeURIComponent(org)+'/activate',{method:'POST',body:JSON.stringify({token,password:password.value})});sessionStorage.setItem(sessionKey,JSON.stringify(data));msg.textContent='Acceso activado. Ya puedes entrar.';setTimeout(()=>loadData(),400);}catch{msg.textContent='El enlace caducó o ya se usó. Pide uno nuevo a tu empresa.';}});
  card.append(label,password,save,msg);show(card);return;
 }
 const login=document.createElement('div');
 const email=document.createElement('input');email.type='email';email.placeholder='Tu correo';email.required=true;
 const password=document.createElement('input');password.type='password';password.placeholder='Tu contraseña';password.required=true;
 const enter=document.createElement('button');enter.textContent='Entrar';enter.className='btn btn-primary';
 const msg=document.createElement('p');
 enter.addEventListener('click',async()=>{try{const data=await api('/api/portal/'+encodeURIComponent(org)+'/login',{method:'POST',body:JSON.stringify({email:email.value,password:password.value})});sessionStorage.setItem(sessionKey,JSON.stringify(data));await loadData();}catch{msg.textContent='Correo o contraseña incorrectos.';}});
 login.append(email,password,enter,msg);show(login);
 async function loadData(){
  const session=JSON.parse(sessionStorage.getItem(sessionKey)||'null');
  if(!session||!org){return;}
  try{
   const data=await api('/api/portal/'+encodeURIComponent(org)+'/me?session='+encodeURIComponent(session.sessionToken));
   const view=document.createElement('div');
   const hello=document.createElement('h2');hello.textContent='Hola, '+data.client.name;
   const points=document.createElement('p');points.textContent='Tus puntos de lealtad: '+data.loyaltyPoints;
   view.append(hello,points);
   const addSection=(heading,items,render)=>{const h=document.createElement('h3');h.textContent=heading;view.append(h);for(const item of items){const p=document.createElement('p');p.textContent=render(item);view.append(p);}};
   addSection('Tus expedientes',data.cases,c=>c.title+' · '+c.status);
   addSection('Tus cotizaciones',data.quotes,q=>q.title+' · '+q.status+' · $'+(q.totalCents/100).toFixed(2));
   addSection('Tus solicitudes',data.requests,r=>r.subject+' · '+r.status);
   const subject=document.createElement('input');subject.placeholder='Asunto de tu solicitud';
   const message=document.createElement('textarea');message.placeholder='Describe tu solicitud';
   const send=document.createElement('button');send.textContent='Enviar solicitud';send.className='btn btn-primary';
   send.addEventListener('click',async()=>{await api('/api/portal/'+encodeURIComponent(org)+'/requests?session='+encodeURIComponent(session.sessionToken),{method:'POST',body:JSON.stringify({subject:subject.value,message:message.value})});await loadData();});
   const out=document.createElement('button');out.textContent='Cerrar sesión';
   out.addEventListener('click',async()=>{await api('/api/portal/'+encodeURIComponent(org)+'/logout?session='+encodeURIComponent(session.sessionToken),{method:'POST',body:'{}'});sessionStorage.removeItem(sessionKey);location.reload();});
   view.append(subject,message,send,out);
   show(view);
  }catch{sessionStorage.removeItem(sessionKey);}
 }
 if(sessionStorage.getItem(sessionKey)&&org)loadData();
}
export {chevron};
