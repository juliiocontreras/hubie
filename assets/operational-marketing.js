// Marketing (T029) — campañas, segmentos y registro de envíos.
// Contrato real: platform/marketing-store.mjs + marketing-domain.mjs
// (migración 034). Todo contra /api/app/<slug>/marketing/...; si la API
// falla se muestra el error, nunca se inventan filas.
// Envío por correo solo con clave Resend (platform/email.mjs): sin clave
// el envío se registra como 'sin_envio' y la campaña NO se marca como
// enviada; la UI lo dice explícitamente. Nunca se finge un envío.
// Marca Hubie: Nunito, tinta #16123a, morado #7c5cfc, rosa #ec4899.
// Sin emojis como iconografía, sin letras como iconos, sin barras visibles.
import {field,line,button,container,date} from './app-workflows.js';
const demoMode=new URLSearchParams(location.search).get('demo')==='1';
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const CAMPAIGN_STATUSES={borrador:'Borrador',programada:'Programada',enviada:'Enviada'};
const CLIENT_STATUSES={'':'Todos los estatus',prospect:'Prospecto',active:'Activo',inactive:'Inactivo'};
const SEND_STATUSES={pendiente:'Pendiente',enviado:'Enviado',fallido:'Fallido',sin_envio:'Sin envío (falta clave Resend)'};

export async function renderMarketing(ctx){
 const slug=encodeURIComponent(ctx.config.tenant.slug),base='/api/app/'+slug+'/marketing';
 const canWrite=ctx.config.tenant.role!=='viewer';
 const host=$('record-list');
 const overview=container('cards'),tabsBar=container('toolbar'),panels=container('stack');
 host.replaceChildren(overview,tabsBar,panels);
 $('record-count').textContent='Marketing';
 if(demoMode)host.prepend(line('Estás en modo demostración: los datos de marketing son de ejemplo y se guardan solo en esta pestaña. El envío por correo no está activo en la demo (falta clave Resend).','help'));
 let segments=[],campaigns=[],dashboardData=null;
 let activeTab='dashboard',selectedCampaignId=null,selectedSendsCampaignId=null;
 const q=()=>ctx.search.value.trim().toLowerCase();
 const api=async(path,options)=>ctx.api(path,options);
 const write=(path,method,body)=>ctx.write(path,method,body);
 const errLine=(what,e)=>line('No se pudo cargar '+what+': '+e.message,'error');
 function tabButton(key,label){
  const b=button(label,activeTab===key?'btn btn-primary':'btn');
  b.addEventListener('click',()=>{activeTab=key;drawTabs();void showTab();},{signal:ctx.signal});
  return b;
 }
 function drawTabs(){
  tabsBar.replaceChildren();
  for(const [key,label] of [['dashboard','Tablero'],['campaigns','Campañas'],['segments','Segmentos'],['sends','Envíos']])tabsBar.append(tabButton(key,label));
 }
 async function showTab(){
  if(activeTab==='dashboard')await loadDashboard();
  if(activeTab==='campaigns')await loadCampaigns();
  if(activeTab==='segments')await loadSegments();
  if(activeTab==='sends')drawSends();
  panels.replaceChildren(activeTab==='dashboard'?dashPanel:activeTab==='campaigns'?campaignsPanel:activeTab==='segments'?segmentsPanel:sendsPanel);
 }
 // ---------- Tablero ----------
 const dashPanel=container('stack');
 async function loadDashboard(){
  try{dashboardData=await api(base+'/dashboard');}catch(e){dashboardData=null;dashPanel.replaceChildren(errLine('el tablero',e));return;}
  drawDashboard();
 }
 function drawDashboard(){
  dashPanel.replaceChildren(line('Tablero de marketing','group-label'));
  if(!dashboardData){dashPanel.append(line('Cargando tablero…','help'));return;}
  const k=dashboardData.kpis||{};
  const stats=container('cards');
  for(const [label,value] of [['Campañas en borrador',String(k.draftCampaigns??0)],
   ['Campañas programadas',String(k.scheduledCampaigns??0)],['Campañas enviadas',String(k.sentCampaigns??0)],
   ['Segmentos',String(k.segments??0)],['Envíos registrados',String(k.totalSends??0)],
   ['Enviados de verdad',String(k.deliveredSends??0)],['Sin envío (falta clave Resend)',String(k.unsentSends??0)]]){
   const card=container('stat');card.append(el('span',label,'stat-label'),el('div',value,'stat-number'));stats.append(card);
  }
  dashPanel.append(stats);
  dashPanel.append(line('Sin clave Resend configurada, ningún correo sale de verdad: los envíos quedan como «Sin envío» y la campaña no se marca como enviada.','help'));
  const recent=container('stack');
  for(const c of dashboardData.recentCampaigns||[])recent.append(line(c.name+' · '+(CAMPAIGN_STATUSES[c.status]||c.status)+' · '+(c.sent||0)+' enviados de '+(c.sends||0)+' registrados','help'));
  if(!(dashboardData.recentCampaigns||[]).length)recent.append(line('Sin campañas todavía. Crea la primera en la pestaña Campañas.','empty'));
  dashPanel.append(line('Campañas recientes','group-label'),recent);
  overview.replaceChildren();
  for(const [label,value] of [['Campañas enviadas',String(k.sentCampaigns??0)],['Segmentos',String(k.segments??0)],
   ['Envíos registrados',String(k.totalSends??0)],['Sin envío (falta clave Resend)',String(k.unsentSends??0)]]){
   const card=container('stat');card.append(el('span',label,'stat-label'),el('div',value,'stat-number'));overview.append(card);
  }
 }
 // ---------- Campañas ----------
 const campaignsPanel=container('stack');
 const campaignForm=el('form');campaignForm.className='stack';
 const cf={
  name:field('mk-campaign-name','Nombre de la campaña'),
  subject:field('mk-campaign-subject','Asunto del correo'),
  segment:field('mk-campaign-segment','Segmento','select',[['','Todos los clientes']]),
  status:field('mk-campaign-status','Estado','select',Object.entries(CAMPAIGN_STATUSES).filter(([v])=>v!=='enviada')),
  scheduledAt:field('mk-campaign-scheduled','Programada para (opcional)','datetime-local'),
  content:field('mk-campaign-content','Contenido del correo','textarea')
 };
 cf.name.input.required=true;cf.subject.input.required=true;
 const campaignGrid=container('field-grid');
 for(const f of Object.values(cf))campaignGrid.append(f.holder);
 const campaignSave=button('Crear campaña','btn btn-primary');campaignSave.type='submit';
 const campaignCancel=button('Cancelar edición');campaignCancel.hidden=true;
 const campaignActions=container('toolbar');campaignActions.append(campaignSave,campaignCancel);
 campaignForm.append(line('Crear o editar campaña','group-label'),campaignGrid,campaignActions);
 let editingCampaign=null;
 function resetCampaignForm(){
  editingCampaign=null;campaignForm.reset();campaignSave.textContent='Crear campaña';campaignCancel.hidden=true;
 }
 campaignCancel.addEventListener('click',resetCampaignForm,{signal:ctx.signal});
 campaignForm.addEventListener('submit',async ev=>{
  ev.preventDefault();campaignSave.disabled=true;
  const body={name:cf.name.input.value.trim(),subject:cf.subject.input.value.trim(),
   segmentId:cf.segment.input.value||null,status:cf.status.input.value,
   scheduledAt:cf.scheduledAt.input.value?new Date(cf.scheduledAt.input.value).toISOString():null,
   content:cf.content.input.value};
  try{
   if(editingCampaign)await write(base+'/campaigns/'+editingCampaign,'PATCH',body);
   else await write(base+'/campaigns','POST',body);
   ctx.notice(editingCampaign?'Campaña actualizada.':'Campaña creada.');
   resetCampaignForm();await loadCampaigns();await loadDashboard();
  }catch(e){ctx.notice('No se pudo guardar la campaña: '+e.message,true);}
  finally{campaignSave.disabled=false;}
 },{signal:ctx.signal});
 const campaignList=container('stack');
 const campaignDetail=container('card-soft');
 async function loadCampaigns(){
  try{const d=await api(base+'/campaigns');campaigns=d.campaigns||[];}catch(e){campaigns=[];campaignList.replaceChildren(errLine('las campañas',e));return;}
  drawCampaigns();
 }
 function drawCampaigns(){
  campaignsPanel.replaceChildren();
  cf.segment.input.replaceChildren(new Option('Todos los clientes',''));
  for(const s of segments)cf.segment.input.add(new Option(s.name+(s.recipients!==undefined?' ('+s.recipients+' clientes)':''),s.id));
  if(canWrite)campaignsPanel.append(campaignForm);
  campaignsPanel.append(line('Campañas','group-label'),campaignList);
  const visible=campaigns.filter(c=>(c.name+' '+(c.subject||'')).toLowerCase().includes(q()));
  $('record-count').textContent=visible.length+' campañas';
  campaignList.replaceChildren();
  if(!visible.length){campaignList.append(line(campaigns.length?'Sin campañas con ese criterio.':'Sin campañas todavía. Crea la primera con el formulario de arriba.','empty'));}
  for(const c of visible){
   const row=container('record survey-card'),info=container('stack');
   info.append(el('strong',c.name),
    line([(CAMPAIGN_STATUSES[c.status]||c.status),'Asunto: '+(c.subject||''),c.segmentName?('Segmento: '+c.segmentName):'Segmento: todos los clientes',
     c.scheduledAt?('Programada: '+date(c.scheduledAt)):'',c.sentAt?('Enviada: '+date(c.sentAt)):'',
     (c.sent||0)+' enviados de '+(c.sends||0)+' registrados'].filter(Boolean).join(' · '),'help'));
   const actions=container('record-actions');
   const detail=button('Ver detalle y envíos','btn');
   detail.addEventListener('click',()=>{selectedCampaignId=c.id;void showCampaignDetail();},{signal:ctx.signal});
   actions.append(detail);
   if(canWrite&&c.status!=='enviada'){
    const edit=button('Editar','btn');
    edit.addEventListener('click',()=>{editingCampaign=c.id;cf.name.input.value=c.name||'';cf.subject.input.value=c.subject||'';
     cf.segment.input.value=c.segmentId||'';cf.status.input.value=c.status||'borrador';
     cf.scheduledAt.input.value=c.scheduledAt?new Date(new Date(c.scheduledAt).getTime()-new Date(c.scheduledAt).getTimezoneOffset()*60000).toISOString().slice(0,16):'';
     cf.content.input.value=c.content||'';campaignSave.textContent='Guardar cambios';campaignCancel.hidden=false;
     campaignForm.scrollIntoView({block:'center',behavior:'smooth'});},{signal:ctx.signal});
    const next=c.status==='programada'?'borrador':'programada';
    const toggle=button(c.status==='programada'?'Volver a borrador':'Programar','btn');
    toggle.addEventListener('click',async()=>{
     try{await write(base+'/campaigns/'+c.id,'PATCH',{status:next});await loadCampaigns();}
     catch(e){ctx.notice(e.message,true);}
    },{signal:ctx.signal});
    actions.append(edit,toggle);
   }
   row.append(info,actions);campaignList.append(row);
  }
  campaignsPanel.append(campaignDetail);
  if(selectedCampaignId)drawCampaignDetailPlaceholder();
 }
 function drawCampaignDetailPlaceholder(){
  if(!campaignDetail.dataset.loaded)return;
 }
 async function showCampaignDetail(){
  if(!selectedCampaignId)return;
  campaignDetail.replaceChildren(line('Cargando detalle…','help'));
  campaignDetail.dataset.loaded='1';
  try{
   const d=await api(base+'/campaigns/'+selectedCampaignId);
   const c=d.campaign;
   const preview=await api(base+'/campaigns/'+selectedCampaignId+'/preview');
   const recipients=preview.recipients||[];
   campaignDetail.replaceChildren(line('Detalle · '+c.name,'group-label'));
   campaignDetail.append(line('Asunto: '+(c.subject||''),'help'));
   if(c.content)campaignDetail.append(line(c.content,'help'));
   campaignDetail.append(line('Destinatarios con correo ('+recipients.length+'): '+(recipients.map(r=>r.name+' <'+r.email+'>').join(', ')||'ninguno'),'help'));
   const sends=container('stack');
   for(const s of d.sends||[])sends.append(line((s.recipientName||s.recipientEmail)+' · '+(SEND_STATUSES[s.status]||s.status)+(s.error?(' · '+s.error):'')+(s.sentAt?(' · '+date(s.sentAt)):''),'help'));
   if(!(d.sends||[]).length)sends.append(line('Sin envíos registrados todavía para esta campaña.','empty'));
   campaignDetail.append(line('Registro de envíos','group-label'),sends);
   if(canWrite&&c.status!=='enviada'){
    const sendBtn=button('Enviar campaña','btn btn-primary');
    sendBtn.addEventListener('click',async()=>{
     if(!confirm('¿Enviar la campaña «'+c.name+'» a '+(d.recipients||[]).length+' destinatario(s)?'))return;
     sendBtn.disabled=true;
     try{
      const out=await write(base+'/campaigns/'+c.id+'/send','POST',{});
      if(out.sent)ctx.notice('Campaña enviada a '+out.sentCount+' de '+out.recipients+' destinatarios.');
      else if(out.reason==='email-not-configured')ctx.notice('Sin envío real (falta clave Resend): se registraron '+out.sendsCreated+' envíos como «Sin envío» y la campaña sigue sin enviarse.',true);
      else ctx.notice('No se pudo enviar la campaña: '+(out.reason||'error de envío'),true);
      await loadCampaigns();await showCampaignDetail();
     }catch(e){ctx.notice('No se pudo enviar la campaña: '+e.message,true);}
     finally{sendBtn.disabled=false;}
    },{signal:ctx.signal});
    campaignDetail.append(sendBtn);
    campaignDetail.append(line('Sin clave Resend configurada, el envío se registra como «Sin envío» y la campaña no se marca como enviada.','help'));
   }
  }catch(e){campaignDetail.replaceChildren(errLine('el detalle de la campaña',e));}
 }
 // ---------- Segmentos ----------
 const segmentsPanel=container('stack');
 const segmentForm=el('form');segmentForm.className='stack';
 const sf={
  name:field('mk-segment-name','Nombre del segmento'),
  status:field('mk-segment-status','Estatus del cliente','select',Object.entries(CLIENT_STATUSES)),
  companyContains:field('mk-segment-company','Empresa contiene (texto libre, opcional)'),
  description:field('mk-segment-desc','Descripción','textarea')
 };
 sf.name.input.required=true;
 const segmentGrid=container('field-grid');
 for(const f of Object.values(sf))segmentGrid.append(f.holder);
 const segmentSave=button('Crear segmento','btn btn-primary');segmentSave.type='submit';
 const segmentCancel=button('Cancelar edición');segmentCancel.hidden=true;
 const segmentActions=container('toolbar');segmentActions.append(segmentSave,segmentCancel);
 segmentForm.append(line('Crear o editar segmento','group-label'),
  line('Los segmentos se construyen solo con datos reales de clientes: estatus (prospecto, activo, inactivo) y empresa. Sin reglas, el segmento incluye a todos los clientes.','help'),
  segmentGrid,segmentActions);
 let editingSegment=null;
 function resetSegmentForm(){
  editingSegment=null;segmentForm.reset();segmentSave.textContent='Crear segmento';segmentCancel.hidden=true;
 }
 segmentCancel.addEventListener('click',resetSegmentForm,{signal:ctx.signal});
 segmentForm.addEventListener('submit',async ev=>{
  ev.preventDefault();segmentSave.disabled=true;
  const body={name:sf.name.input.value.trim(),status:sf.status.input.value,
   companyContains:sf.companyContains.input.value.trim(),description:sf.description.input.value.trim()};
  try{
   if(editingSegment)await write(base+'/segments/'+editingSegment,'PATCH',body);
   else await write(base+'/segments','POST',body);
   ctx.notice(editingSegment?'Segmento actualizado.':'Segmento creado.');
   resetSegmentForm();await loadSegments();await loadCampaigns();
  }catch(e){ctx.notice('No se pudo guardar el segmento: '+e.message,true);}
  finally{segmentSave.disabled=false;}
 },{signal:ctx.signal});
 const segmentList=container('stack');
 async function loadSegments(){
  try{const d=await api(base+'/segments');segments=d.segments||[];}catch(e){segments=[];segmentList.replaceChildren(errLine('los segmentos',e));return;}
  drawSegments();
 }
 function drawSegments(){
  segmentsPanel.replaceChildren();
  if(canWrite)segmentsPanel.append(segmentForm);
  segmentsPanel.append(line('Segmentos','group-label'),segmentList);
  const visible=segments.filter(s=>(s.name+' '+(s.companyContains||'')).toLowerCase().includes(q()));
  $('record-count').textContent=visible.length+' segmentos';
  segmentList.replaceChildren();
  if(!visible.length){segmentList.append(line(segments.length?'Sin segmentos con ese criterio.':'Sin segmentos todavía. Crea el primero con el formulario de arriba.','empty'));return;}
  for(const s of visible){
   const row=container('record survey-card'),info=container('stack');
   info.append(el('strong',s.name),
    line([(CLIENT_STATUSES[s.status]||'Todos los estatus'),s.companyContains?('Empresa contiene: '+s.companyContains):'',
     (s.recipients??0)+' clientes en el segmento'].filter(Boolean).join(' · '),'help'));
   if(s.description)info.append(line(s.description,'help'));
   const actions=container('record-actions');
   if(canWrite){
    const edit=button('Editar','btn');
    edit.addEventListener('click',()=>{editingSegment=s.id;sf.name.input.value=s.name||'';sf.status.input.value=s.status||'';
     sf.companyContains.input.value=s.companyContains||'';sf.description.input.value=s.description||'';
     segmentSave.textContent='Guardar cambios';segmentCancel.hidden=false;
     segmentForm.scrollIntoView({block:'center',behavior:'smooth'});},{signal:ctx.signal});
    const del=button('Eliminar','btn btn-danger');
    del.addEventListener('click',async()=>{
     if(!confirm('¿Eliminar este segmento? Las campañas que lo usaban quedarán con «Todos los clientes».'))return;
     try{await write(base+'/segments/'+s.id,'DELETE');await loadSegments();await loadCampaigns();}
     catch(e){ctx.notice('No se pudo eliminar el segmento: '+e.message,true);}
    },{signal:ctx.signal});
    actions.append(edit,del);
   }
   row.append(info,actions);segmentList.append(row);
  }
 }
 // ---------- Envíos ----------
 const sendsPanel=container('stack');
 const sendsCampaignSel=el('select');sendsCampaignSel.className='search';sendsCampaignSel.setAttribute('aria-label','Campaña para ver sus envíos');
 const sendsList=container('stack');
 function drawSends(){
  sendsPanel.replaceChildren(line('Registro de envíos por campaña','group-label'));
  sendsCampaignSel.replaceChildren(new Option('Selecciona una campaña',''));
  for(const c of campaigns)sendsCampaignSel.add(new Option(c.name+' · '+(CAMPAIGN_STATUSES[c.status]||c.status),c.id));
  sendsCampaignSel.value=selectedSendsCampaignId||'';
  sendsPanel.append(sendsCampaignSel,sendsList);
  if(!selectedSendsCampaignId){sendsList.replaceChildren(line('Selecciona una campaña para ver su registro de envíos.','empty'));return;}
  sendsList.replaceChildren(line('Cargando envíos…','help'));
  void (async()=>{
   try{
    const d=await api(base+'/campaigns/'+selectedSendsCampaignId+'/sends');
    sendsList.replaceChildren();
    if(!(d.sends||[]).length){sendsList.append(line('Sin envíos registrados todavía para esta campaña.','empty'));return;}
    for(const s of d.sends){
     sendsList.append(line((s.recipientName||s.recipientEmail)+' · '+(SEND_STATUSES[s.status]||s.status)+(s.error?(' · '+s.error):'')+(s.sentAt?(' · '+date(s.sentAt)):''),'help'));
    }
   }catch(e){sendsList.replaceChildren(errLine('los envíos',e));}
  })();
 }
 sendsCampaignSel.addEventListener('change',()=>{selectedSendsCampaignId=sendsCampaignSel.value||null;drawSends();},{signal:ctx.signal});
 drawTabs();
 await loadSegments();
 await loadDashboard();
 await loadCampaigns();
 await showTab();
}
