// Mesa de ayuda (T028) — tickets con respuestas en hilo y asignación con
// aviso en la app al asignado (sin correo real).
// Contrato real: platform/helpdesk-store.mjs + helpdesk-domain.mjs
// (migración 033). Todo contra /api/app/<slug>/helpdesk/...; si la API
// falla se muestra el error, nunca se inventan filas.
// Marca Hubie: Nunito, tinta #16123a, morado #7c5cfc, rosa #ec4899.
// Sin emojis como iconografía, sin letras como iconos, sin barras visibles.
import {field,line,button,container,date} from './app-workflows.js';
const demoMode=new URLSearchParams(location.search).get('demo')==='1';
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const TICKET_STATUSES={abierto:'Abierto','en curso':'En curso','en espera':'En espera',resuelto:'Resuelto',cerrado:'Cerrado'};
const TICKET_PRIORITIES={baja:'Baja',media:'Media',alta:'Alta',urgente:'Urgente'};
const fmtDay=iso=>iso?new Date(String(iso).slice(0,10)+'T00:00:00').toLocaleDateString('es-MX',{dateStyle:'medium'}):'—';
const statusPill=status=>{const p=el('span',TICKET_STATUSES[status]||status,'pill');
 if(status==='resuelto'||status==='cerrado')p.classList.add('pill-ok');
 else if(status==='en espera')p.classList.add('pill-warn');
 else if(status==='abierto')p.classList.add('pill-bad');
 else p.classList.add('pill-info');
 return p;};
const priorityPill=priority=>{const p=el('span',TICKET_PRIORITIES[priority]||priority,'pill');
 if(priority==='urgente')p.classList.add('pill-bad');
 else if(priority==='alta')p.classList.add('pill-warn');
 else if(priority==='baja')p.classList.add('pill-ok');
 else p.classList.add('pill-info');
 return p;};

export async function renderHelpdesk(ctx){
 const slug=encodeURIComponent(ctx.config.tenant.slug),base='/api/app/'+slug+'/helpdesk';
 const canWrite=ctx.config.tenant.role!=='viewer';
 const host=$('record-list');
 const overview=container('cards'),tabsBar=container('toolbar'),panels=container('stack');
 host.replaceChildren(overview,tabsBar,panels);
 $('record-count').textContent='Mesa de ayuda';
 if(demoMode)host.prepend(line('Estás en modo demostración: los tickets son de ejemplo y se guardan solo en esta pestaña.','help'));
 let tickets=[],clients=[],members=[],dashboard=null,selectedTicketId=null,detailFor=null;
 let activeTab='dashboard';
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
  for(const [key,label] of [['dashboard','Tablero'],['tickets','Tickets']])tabsBar.append(tabButton(key,label));
 }
 // ---------- Tablero ----------
 const dashPanel=container('stack');
 async function loadDashboard(){
  try{dashboard=await api(base+'/dashboard');}catch(e){dashboard=null;dashPanel.replaceChildren(errLine('el tablero',e));return;}
  drawDashboard();
 }
 function drawDashboard(){
  dashPanel.replaceChildren(line('Tablero de mesa de ayuda','group-label'));
  if(!dashboard){dashPanel.append(line('Cargando tablero…','help'));return;}
  const k=dashboard.kpis||{};
  const stats=container('cards');
  for(const [label,value] of [['Abiertos',String(k.open??0)],['En curso',String(k.inProgress??0)],
   ['En espera',String(k.waiting??0)],['Resueltos',String(k.resolved??0)],['Cerrados',String(k.closed??0)],
   ['Urgentes sin resolver',String(k.urgentOpen??0)]]){
   const card=container('stat');card.append(el('span',label,'stat-label'),el('div',value,'stat-number'));stats.append(card);
  }
  dashPanel.append(stats);
  if((k.unassignedOpen??0)>0)dashPanel.append(line('Hay '+k.unassignedOpen+' '+(k.unassignedOpen===1?'ticket abierto':'tickets abiertos')+' sin asignar.','help'));
  dashPanel.append(line('Abiertos recientes','group-label'));
  const recent=container('stack');
  if(!(dashboard.recentOpen||[]).length)recent.append(line('Sin tickets abiertos.','empty'));
  for(const t of dashboard.recentOpen||[]){
   const row=container('record survey-card'),info=container('stack');
   info.append(el('strong',t.subject),
    line([(TICKET_STATUSES[t.status]||t.status),t.clientName?('Cliente: '+t.clientName):'',t.assigneeEmail?('Asignado: '+t.assigneeEmail):'Sin asignar',t.createdAt?('Creado: '+fmtDay(t.createdAt)):''].filter(Boolean).join(' · '),'help'));
   const actions=container('record-actions');
   actions.append(priorityPill(t.priority));
   const open=button('Ver ticket','btn');
   open.addEventListener('click',()=>{selectedTicketId=t.id;activeTab='tickets';drawTabs();void showTab();},{signal:ctx.signal});
   actions.append(open);
   row.append(info,actions);recent.append(row);
  }
  dashPanel.append(recent);
  overview.replaceChildren();
  for(const [label,value] of [['Abiertos',String(k.open??0)],['En curso',String(k.inProgress??0)],
   ['Urgentes sin resolver',String(k.urgentOpen??0)],['Sin asignar',String(k.unassignedOpen??0)]]){
   const card=container('stat');card.append(el('span',label,'stat-label'),el('div',value,'stat-number'));overview.append(card);
  }
 }
 // ---------- Tickets ----------
 const ticketsPanel=container('stack');
 const ticketForm=el('form');ticketForm.className='stack';
 const tf={
  subject:field('hd-subject','Asunto'),
  client:field('hd-client','Cliente (opcional)','select',[['','Sin cliente']]),
  assignee:field('hd-assignee','Asignar a (opcional)','select',[['','Sin asignar']]),
  priority:field('hd-priority','Prioridad','select',Object.entries(TICKET_PRIORITIES)),
  status:field('hd-status','Estado','select',Object.entries(TICKET_STATUSES)),
  description:field('hd-desc','Descripción','textarea')
 };
 tf.subject.input.required=true;
 const ticketGrid=container('field-grid');
 for(const f of Object.values(tf))ticketGrid.append(f.holder);
 const ticketSave=button('Crear ticket','btn btn-primary');ticketSave.type='submit';
 const ticketCancel=button('Cancelar edición');ticketCancel.hidden=true;
 const ticketActions=container('toolbar');ticketActions.append(ticketSave,ticketCancel);
 ticketForm.append(line('Crear o editar ticket','group-label'),
  line('Al asignar un ticket, el asignado recibe un aviso en la app. No se envía correo.','help'),ticketGrid,ticketActions);
 let editingTicket=null;
 function resetTicketForm(){
  editingTicket=null;ticketForm.reset();ticketSave.textContent='Crear ticket';ticketCancel.hidden=true;
 }
 ticketCancel.addEventListener('click',resetTicketForm,{signal:ctx.signal});
 ticketForm.addEventListener('submit',async ev=>{
  ev.preventDefault();ticketSave.disabled=true;
  const body={subject:tf.subject.input.value.trim(),description:tf.description.input.value.trim(),
   clientId:tf.client.input.value||null,assigneeUserId:tf.assignee.input.value||null,
   priority:tf.priority.input.value,status:tf.status.input.value};
  try{
   if(editingTicket)await write(base+'/'+editingTicket,'PATCH',body);
   else await write(base,'POST',body);
   ctx.notice(editingTicket?'Ticket actualizado.':'Ticket creado.');
   resetTicketForm();await loadTickets();await loadDashboard();
  }catch(e){ctx.notice('No se pudo guardar el ticket: '+e.message,true);}
  finally{ticketSave.disabled=false;}
 },{signal:ctx.signal});
 const ticketList=container('stack');
 const detailPanel=container('card-soft');
 async function loadClients(){
  try{const d=await api('/api/app/'+slug+'/workflows/clients');clients=d.clients||[];}
  catch{clients=[];}
  tf.client.input.replaceChildren(new Option('Sin cliente',''));
  for(const c of clients)tf.client.input.add(new Option((c.name||'')+(c.company?' · '+c.company:''),c.id));
 }
 async function loadMembers(){
  try{const d=await api('/api/app/'+slug+'/workflows/tasks');members=d.members||[];}
  catch{members=[];}
  tf.assignee.input.replaceChildren(new Option('Sin asignar',''));
  for(const m of members)tf.assignee.input.add(new Option(m.email,m.userId));
 }
 async function loadTickets(){
  try{const d=await api(base);tickets=d.tickets||[];}catch(e){tickets=[];ticketList.replaceChildren(errLine('los tickets',e));return;}
  drawTickets();
 }
 function drawTickets(){
  ticketsPanel.replaceChildren();
  if(canWrite)ticketsPanel.append(ticketForm);
  ticketsPanel.append(line('Tickets','group-label'),ticketList);
  const visible=tickets.filter(t=>((t.subject||'')+' '+(t.clientName||'')+' '+(t.assigneeEmail||'')).toLowerCase().includes(q()));
  $('record-count').textContent=visible.length+' tickets';
  ticketList.replaceChildren();
  if(!visible.length){ticketList.append(line(tickets.length?'Sin tickets con ese criterio.':'Sin tickets todavía. Crea el primero con el formulario de arriba.','empty'));}
  for(const t of visible){
   const row=container('record survey-card'),info=container('stack');
   const head=container('toolbar');
   head.append(el('strong',t.subject),statusPill(t.status));
   info.append(head,
    line([t.clientName?('Cliente: '+t.clientName):'',t.assigneeEmail?('Asignado: '+t.assigneeEmail):'Sin asignar',
     (t.replies??0)+' '+(t.replies===1?'respuesta':'respuestas'),t.createdAt?('Creado: '+fmtDay(t.createdAt)):''].filter(Boolean).join(' · '),'help'));
   if(t.description)info.append(line(t.description,'help'));
   const actions=container('record-actions');
   actions.append(priorityPill(t.priority));
   const detail=button('Ver hilo','btn btn-primary');
   detail.addEventListener('click',()=>{selectedTicketId=t.id;void showTicketDetail();},{signal:ctx.signal});
   actions.append(detail);
   if(canWrite){
    const edit=button('Editar','btn');
    edit.addEventListener('click',()=>{editingTicket=t.id;tf.subject.input.value=t.subject||'';tf.client.input.value=t.clientId||'';
     tf.assignee.input.value=t.assigneeUserId||'';tf.priority.input.value=t.priority||'media';tf.status.input.value=t.status||'abierto';
     tf.description.input.value=t.description||'';
     ticketSave.textContent='Guardar cambios';ticketCancel.hidden=false;ticketForm.scrollIntoView({block:'center',behavior:'smooth'});},{signal:ctx.signal});
    const next=t.status==='resuelto'?'abierto':'resuelto';
    const toggle=button(t.status==='resuelto'?'Reabrir':'Resolver','btn');
    toggle.addEventListener('click',async()=>{
     try{await write(base+'/'+t.id,'PATCH',{status:next});await loadTickets();await loadDashboard();}
     catch(e){ctx.notice(e.message,true);}
    },{signal:ctx.signal});
    actions.append(edit,toggle);
   }
   row.append(info,actions);ticketList.append(row);
  }
  ticketsPanel.append(detailPanel);
  // Igual que en Proyectos: no re-renderizar el hilo si ya muestra este
  // ticket; el segundo render borraba el panel con "Cargando ticket…"
  // mientras el usuario seguía en él.
  if(selectedTicketId&&detailFor!==selectedTicketId)void showTicketDetail();
 }
 // ---------- Detalle: hilo de respuestas ----------
 const replyList=container('stack');
 async function showTicketDetail(){
  if(!selectedTicketId)return;
  detailPanel.replaceChildren(line('Cargando ticket…','help'));
  detailFor=null;
  let detail;
  try{detail=await api(base+'/'+selectedTicketId);}
  catch(e){detailPanel.replaceChildren(errLine('el ticket',e));return;}
  const t=detail.ticket;
  detailPanel.replaceChildren(line('Ticket · '+t.subject,'group-label'));
  const head=container('stack');
  const headRow=container('toolbar');
  headRow.append(statusPill(t.status),priorityPill(t.priority));
  head.append(headRow,
   line([t.clientName?('Cliente: '+t.clientName):'',t.assigneeEmail?('Asignado: '+t.assigneeEmail):'Sin asignar',
    t.createdAt?('Creado: '+date(t.createdAt)):'' ].filter(Boolean).join(' · '),'help'));
  if(t.description)head.append(line(t.description,'help'));
  detailPanel.append(head);
  // Reasignar
  if(canWrite){
   const assignForm=el('form');assignForm.className='stack';
   const af={assignee:field('hd-reassign','Reasignar a','select',[['','Sin asignar'],...members.map(m=>[m.userId,m.email])])};
   af.assignee.input.value=t.assigneeUserId||'';
   const assignGrid=container('field-grid');
   for(const f of Object.values(af))assignGrid.append(f.holder);
   const assignSave=button('Asignar','btn btn-primary');assignSave.type='submit';
   assignForm.append(assignGrid,assignSave);
   assignForm.addEventListener('submit',async ev=>{
    ev.preventDefault();assignSave.disabled=true;
    try{
     const out=await write(base+'/'+t.id+'/assign','POST',{assigneeUserId:af.assignee.input.value||null});
     ctx.notice(out.notified?'Ticket asignado: el asignado recibió un aviso en la app.':'Ticket asignado.');
     await showTicketDetail();await loadTickets();await loadDashboard();
    }catch(e){ctx.notice('No se pudo asignar el ticket: '+e.message,true);}
    finally{assignSave.disabled=false;}
   },{signal:ctx.signal});
   detailPanel.append(line('Asignación','group-label'),assignForm);
  }
  // Hilo
  detailPanel.append(line('Respuestas','group-label'),replyList);
  replyList.replaceChildren();
  if(!(detail.replies||[]).length)replyList.append(line('Sin respuestas todavía. Escribe la primera abajo.','empty'));
  for(const r of detail.replies||[]){
   const row=container('record survey-card'),info=container('stack');
   info.append(el('strong',r.authorEmail||'Equipo'),line(r.createdAt?date(r.createdAt):'','help'),line(r.body,'help'));
   row.append(info);replyList.append(row);
  }
  if(canWrite){
   const replyForm=el('form');replyForm.className='stack';
   const rf={body:field('hd-reply','Escribe una respuesta','textarea')};
   rf.body.input.required=true;
   const replyGrid=container('field-grid');
   for(const f of Object.values(rf))replyGrid.append(f.holder);
   const replySave=button('Enviar respuesta','btn btn-primary');replySave.type='submit';
   replyForm.append(replyGrid,replySave);
   replyForm.addEventListener('submit',async ev=>{
    ev.preventDefault();replySave.disabled=true;
    try{
     await write(base+'/'+t.id+'/replies','POST',{body:rf.body.input.value.trim()});
     ctx.notice('Respuesta enviada.');replyForm.reset();await showTicketDetail();await loadTickets();
    }catch(e){ctx.notice('No se pudo enviar la respuesta: '+e.message,true);}
    finally{replySave.disabled=false;}
   },{signal:ctx.signal});
   detailPanel.append(replyForm);
  }
  detailFor=selectedTicketId;
 }
 // ---------- Cambio de pestaña y arranque ----------
 const panelsByTab={dashboard:dashPanel,tickets:ticketsPanel};
 async function showTab(){
  panels.replaceChildren(panelsByTab[activeTab]);
  if(activeTab==='dashboard')await loadDashboard();
  if(activeTab==='tickets'){await loadClients();await loadMembers();await loadTickets();}
 }
 ctx.search.addEventListener('input',()=>{
  if(activeTab==='tickets')drawTickets();
 },{signal:ctx.signal});
 $('module-message').textContent='Mesa de ayuda: tickets, respuestas en hilo y asignación con aviso en la app.';
 drawTabs();
 try{
  await loadClients();await loadMembers();await loadTickets();await loadDashboard();
 }catch(e){ctx.notice('Error al abrir Mesa de ayuda: '+e.message,true);}
 await showTab();
}
