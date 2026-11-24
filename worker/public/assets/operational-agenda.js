import {field,line,date,toUTC,localInput,button,container} from './app-workflows.js';
const statuses={scheduled:'Programada',confirmed:'Confirmada',completed:'Completada',cancelled:'Cancelada'};
export async function renderAgenda(ctx){
 const host=document.getElementById('record-list'),path='/api/app/'+encodeURIComponent(ctx.config.tenant.slug)+'/workflows/agenda';
 const canWrite=ctx.config.tenant.role!=='viewer';
 const stats=container('cards'),editor=container('card-soft'),list=container('stack');
 const viewBar=container('toolbar');
 const viewDate=document.createElement('input');viewDate.type='date';viewDate.className='search';
 viewDate.value=new Date().toISOString().slice(0,10);
 const viewButtons={list:button('Lista'),day:button('Día'),week:button('Semana')};
 let view='list';
 const setView=next=>{view=next;for(const [key,btn] of Object.entries(viewButtons))btn.className=key===view?'btn btn-primary':'btn';void reload();};
 for(const [key,btn] of Object.entries(viewButtons))btn.addEventListener('click',()=>setView(key),{signal:ctx.signal});
 viewDate.addEventListener('change',()=>{if(view!=='list')void reload();},{signal:ctx.signal});
 viewBar.append(...Object.values(viewButtons),viewDate,
  line('Calendarios externos (Google/Outlook): pendiente de integración.','help'));
 const form=document.createElement('form');form.className='stack';
 const fields={
  title:field('event-title','Nombre de la cita'),
  clientId:field('event-client','Cliente existente (C001)','select',[['','Sin vincular / visitante']]),
  dealId:field('event-deal','Oportunidad comercial (C002)','select',[['','Sin oportunidad asociada']]),
  customer:field('event-external','Visitante externo (opcional)'),
  resource:field('event-resource','Recurso, sala o responsable'),
  assignee:field('event-assignee','Responsable (miembro del equipo)','select',[['','Sin responsable asignado']]),
  status:field('event-status','Estado','select',[['scheduled','Programada'],['confirmed','Confirmada']]),
  remind:field('event-remind','Recordatorio','select',[['','Sin recordatorio'],['15','15 minutos antes'],['30','30 minutos antes'],['60','1 hora antes'],['1440','1 día antes']]),
  startsAt:field('event-starts','Inicio','datetime-local'),
  endsAt:field('event-ends','Fin','datetime-local'),
  notes:field('event-notes','Observaciones','textarea')
 };
 fields.title.input.required=true;fields.startsAt.input.required=true;fields.endsAt.input.required=true;
 fields.resource.input.value='general';
 const grid=container('field-grid');for(const {holder} of Object.values(fields))grid.append(holder);
 form.append(grid);
 const save=button('Agendar cita','btn btn-primary');save.type='submit';
 const cancel=button('Cancelar edición');cancel.hidden=true;
 const actions=container('toolbar');actions.append(save,cancel);form.append(actions);
 editor.append(line('Agenda vinculada con Clientes y CRM · evita solapamientos de recursos','group-label'),form);
 host.replaceChildren(stats,viewBar);if(canWrite)host.append(editor);host.append(list);
 let events=[],clients=[],deals=[],members=[],editing=null;
 const selectedClient=ctx.initialClientId||null,selectedDeal=ctx.initialDealId||null;
 function refillDeals(){
  const current=fields.dealId.input.value;
  fields.dealId.input.replaceChildren(new Option('Sin oportunidad asociada',''));
  for(const d of deals.filter(d=>!fields.clientId.input.value||!d.clientId||d.clientId===fields.clientId.input.value))
   fields.dealId.input.add(new Option(d.title,d.id));
  if(deals.some(d=>d.id===current)&&[...fields.dealId.input.options].some(o=>o.value===current))fields.dealId.input.value=current;
 }
 fields.clientId.input.addEventListener('change',refillDeals,{signal:ctx.signal});
 fields.dealId.input.addEventListener('change',()=>{
  const deal=deals.find(d=>d.id===fields.dealId.input.value);
  if(deal?.clientId){fields.clientId.input.value=deal.clientId;refillDeals();}
 },{signal:ctx.signal});
 const reset=()=>{
  editing=null;form.reset();fields.resource.input.value='general';
  if(selectedClient&&clients.some(x=>x.id===selectedClient))fields.clientId.input.value=selectedClient;
  if(selectedDeal&&deals.some(x=>x.id===selectedDeal)){
   const deal=deals.find(x=>x.id===selectedDeal);
   fields.clientId.input.value=deal.clientId||fields.clientId.input.value;
   refillDeals();fields.dealId.input.value=selectedDeal;
  }else refillDeals();
  save.textContent='Agendar cita';cancel.hidden=true;
 };
 cancel.addEventListener('click',reset,{signal:ctx.signal});
 async function reload(){
  const query=view==='list'?'':'?view='+view+'&date='+encodeURIComponent(viewDate.value||new Date().toISOString().slice(0,10));
  const result=await ctx.api(path+query);if(ctx.signal.aborted)return;
  events=result.events||[];clients=result.clients||[];deals=result.deals||[];members=result.members||[];
  const previous=fields.clientId.input.value;
  fields.clientId.input.replaceChildren(new Option('Sin vincular / visitante',''));
  for(const client of clients)fields.clientId.input.add(new Option(client.name+(client.company?' · '+client.company:''),client.id));
  fields.clientId.input.value=clients.some(x=>x.id===previous)?previous:clients.some(x=>x.id===selectedClient)?selectedClient:'';
  refillDeals();
  const prevAssignee=fields.assignee.input.value;
  fields.assignee.input.replaceChildren(new Option('Sin responsable asignado',''));
  for(const m of members)fields.assignee.input.add(new Option(m.email+' · '+m.role,m.userId));
  fields.assignee.input.value=members.some(x=>x.userId===prevAssignee)?prevAssignee:'';
  if(selectedDeal&&deals.some(d=>d.id===selectedDeal)){
   const d=deals.find(x=>x.id===selectedDeal);
   if(d.clientId){fields.clientId.input.value=d.clientId;refillDeals();}
   fields.dealId.input.value=selectedDeal;
  }
  draw();ctx.attachmentsPanel?.update(events);
 }
 function draw(){
  if(ctx.signal.aborted)return;
  stats.replaceChildren();list.replaceChildren();
  for(const [label,total] of Object.entries({Programadas:events.filter(e=>e.status==='scheduled').length,
    Confirmadas:events.filter(e=>e.status==='confirmed').length,
    Completadas:events.filter(e=>e.status==='completed').length,Canceladas:events.filter(e=>e.status==='cancelled').length})){
   const card=container('stat');card.append(line(label,'stat-label'),line(String(total),'stat-number'));stats.append(card);
  }
  const q=ctx.search.value.trim().toLowerCase();
  const visible=events.filter(e=>(!selectedClient||e.clientId===selectedClient)&&
    (e.title+' '+(e.clientName||e.customer||'')+' '+e.resource+' '+(e.dealTitle||'')).toLowerCase().includes(q));
  document.getElementById('record-count').textContent=visible.length+' citas';
  if(!visible.length){list.append(line(selectedClient?'No hay citas vinculadas a este cliente.':'No hay citas registradas.','empty'));return;}
  for(const e of visible){
   const card=container('record'),details=container('stack');
   const strong=document.createElement('strong');strong.textContent=e.title;details.append(strong);
   details.append(line(date(e.startsAt)+' → '+date(e.endsAt),'help'));
   details.append(line('Recurso: '+e.resource+' · '+(e.clientName||e.customer||'Sin cliente')+' · '+statuses[e.status],'help'));
   if(e.assigneeEmail)details.append(line('Responsable: '+e.assigneeEmail,'help'));
   if(e.remindMinutesBefore!==null&&e.remindMinutesBefore!==undefined)
    details.append(line('Recordatorio: '+e.remindMinutesBefore+' min antes'+(e.reminderNotifiedAt?' · avisado':' · pendiente'),'help'));
   if(e.dealTitle)details.append(line('Oportunidad: '+e.dealTitle,'help'));
   if(e.notes)details.append(line(e.notes,'help'));
   card.append(details);
   const buttons=container('record-actions');
   if(e.clientId){
    const go=button('Ver cliente','btn');
    go.addEventListener('click',()=>ctx.navigateToTool?.('C001',{recordId:e.clientId}),{signal:ctx.signal});buttons.append(go);
   }
   if(e.dealId){
    const deal=button('Ver oportunidad','btn');
    deal.addEventListener('click',()=>ctx.navigateToTool?.('C002',{recordId:e.dealId}),{signal:ctx.signal});buttons.append(deal);
   }
   if(canWrite){
    const edit=button('Modificar');
    edit.addEventListener('click',()=>{
     editing=e.id;
     for(const key of ['title','clientId','customer','resource','notes'])fields[key].input.value=e[key]??'';
     refillDeals();fields.dealId.input.value=e.dealId||'';
     fields.assignee.input.value=e.assigneeUserId||'';
     fields.status.input.value=e.status==='completed'||e.status==='cancelled'?'scheduled':e.status;
     fields.remind.input.value=e.remindMinutesBefore===null||e.remindMinutesBefore===undefined?'':String(e.remindMinutesBefore);
     fields.startsAt.input.value=localInput(e.startsAt);fields.endsAt.input.value=localInput(e.endsAt);
     save.textContent='Guardar cita';cancel.hidden=false;fields.title.input.focus();
    },{signal:ctx.signal});buttons.append(edit);
    if(e.status==='scheduled'||e.status==='confirmed')for(const [status,label] of [['confirmed','Confirmar'],['completed','Completar'],['cancelled','Cancelar cita']]){
     if(e.status==='confirmed'&&status==='confirmed')continue;
     const control=button(label,status==='cancelled'?'btn btn-danger':'btn');
     control.addEventListener('click',async()=>{
      if(status==='cancelled'&&!confirm('¿Cancelar la cita?'))return;
      try{await ctx.write(path+'/'+e.id,'PATCH',{status});ctx.notice('Cita actualizada.');await reload();}
      catch(ex){ctx.notice('No fue posible actualizar: '+ex.message,true);}
     },{signal:ctx.signal});buttons.append(control);
    }
   }
   if(buttons.children.length)card.append(buttons);
   list.append(card);
  }
 }
 form.addEventListener('submit',async e=>{
  e.preventDefault();save.disabled=true;
  try{
   const body={title:fields.title.input.value,customer:fields.customer.input.value,
    clientId:fields.clientId.input.value||null,dealId:fields.dealId.input.value||null,
    assigneeUserId:fields.assignee.input.value||null,
    status:editing?fields.status.input.value:'scheduled',
    remindMinutesBefore:fields.remind.input.value===''?null:Number(fields.remind.input.value),
    resource:fields.resource.input.value||'general',startsAt:toUTC(fields.startsAt.input.value),
    endsAt:toUTC(fields.endsAt.input.value),notes:fields.notes.input.value};
   await ctx.write(path+(editing?'/'+editing:''),editing?'PATCH':'POST',body);
   ctx.notice('Cita guardada y vinculada.');reset();await reload();
  }catch(e){ctx.notice(e.message==='Schedule conflict'?'El recurso ya está reservado durante ese horario.':'No se pudo guardar: '+e.message,true);}
  finally{save.disabled=false;}
 },{signal:ctx.signal});
 ctx.search.addEventListener('input',draw,{signal:ctx.signal});
 document.getElementById('module-message').textContent='Relaciona cada cita con un cliente o una oportunidad CRM existente; los nombres se mantienen sincronizados.';
 try{await reload();}catch(e){ctx.notice('Error al consultar Agenda: '+e.message,true);}
}
