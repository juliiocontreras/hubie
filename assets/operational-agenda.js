import {field,line,date,toUTC,localInput,button,container} from './app-workflows.js';
const statuses={scheduled:'Programada',completed:'Completada',cancelled:'Cancelada'};
export async function renderAgenda(ctx){
 const host=document.getElementById('record-list'),path='/api/app/'+encodeURIComponent(ctx.config.tenant.slug)+'/workflows/agenda';
 const canWrite=ctx.config.tenant.role!=='viewer';
 const stats=container('cards'),editor=container('card-soft'),list=container('stack');
 const form=document.createElement('form');form.className='stack';
 const fields={
  title:field('event-title','Nombre de la cita'),
  customer:field('event-customer','Cliente o visitante'),
  resource:field('event-resource','Recurso, sala o responsable'),
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
 editor.append(line('Agenda · horario y recurso compartido','group-label'),form);
 host.replaceChildren(stats);if(canWrite)host.append(editor);host.append(list);
 let events=[],editing=null;
 const reset=()=>{editing=null;form.reset();fields.resource.input.value='general';save.textContent='Agendar cita';cancel.hidden=true;};
 cancel.addEventListener('click',reset,{signal:ctx.signal});
 async function reload(){const r=await ctx.api(path);if(ctx.signal.aborted)return;events=r.events||[];draw();ctx.attachmentsPanel?.update(events);}
 function draw(){
  if(ctx.signal.aborted)return;
  stats.replaceChildren();list.replaceChildren();
  for(const [label,total] of Object.entries({Programadas:events.filter(e=>e.status==='scheduled').length,Completadas:events.filter(e=>e.status==='completed').length,Canceladas:events.filter(e=>e.status==='cancelled').length})){
   const card=container('stat');card.append(line(label,'stat-label'),line(String(total),'stat-number'));stats.append(card);
  }
  const q=ctx.search.value.trim().toLowerCase();
  const visible=events.filter(e=>(e.title+' '+e.customer+' '+e.resource).toLowerCase().includes(q));
  document.getElementById('record-count').textContent=visible.length+' citas';
  if(!visible.length){list.append(line('No hay citas registradas.','empty'));return;}
  for(const event of visible){
   const card=container('record'),details=container('stack');
   const strong=document.createElement('strong');strong.textContent=event.title;details.append(strong);
   details.append(line(date(event.startsAt)+' → '+date(event.endsAt),'help'));
   details.append(line('Recurso: '+event.resource+' · '+(event.customer||'Sin cliente')+' · '+statuses[event.status],'help'));
   if(event.notes)details.append(line(event.notes,'help'));
   card.append(details);
   if(canWrite){
    const buttons=container('record-actions');
    const edit=button('Modificar');
    edit.addEventListener('click',()=>{
     editing=event.id;
     for(const key of ['title','customer','resource','notes'])fields[key].input.value=event[key]??'';
     fields.startsAt.input.value=localInput(event.startsAt);fields.endsAt.input.value=localInput(event.endsAt);
     save.textContent='Guardar cita';cancel.hidden=false;fields.title.input.focus();
    },{signal:ctx.signal});
    buttons.append(edit);
    if(event.status==='scheduled')for(const [status,label] of [['completed','Completar'],['cancelled','Cancelar cita']]){
     const control=button(label,status==='cancelled'?'btn btn-danger':'btn');
     control.addEventListener('click',async()=>{
      if(status==='cancelled'&&!confirm('¿Cancelar la cita?'))return;
      try{await ctx.write(path+'/'+event.id,'PATCH',{status});ctx.notice('Cita actualizada.');await reload();}
      catch(e){ctx.notice('No fue posible actualizar: '+e.message,true);}
     },{signal:ctx.signal});
     buttons.append(control);
    }
    card.append(buttons);
   }
   list.append(card);
  }
 }
 form.addEventListener('submit',async ev=>{
  ev.preventDefault();save.disabled=true;
  try{
   const body={title:fields.title.input.value,customer:fields.customer.input.value,resource:fields.resource.input.value||'general',startsAt:toUTC(fields.startsAt.input.value),endsAt:toUTC(fields.endsAt.input.value),notes:fields.notes.input.value,status:'scheduled'};
   await ctx.write(path+(editing?'/'+editing:''),editing?'PATCH':'POST',body);
   ctx.notice('Cita guardada.');reset();await reload();
  }catch(e){ctx.notice(e.message==='Schedule conflict'?'El recurso ya está reservado durante ese horario.':'No se pudo guardar: '+e.message,true);}
  finally{save.disabled=false;}
 },{signal:ctx.signal});
 ctx.search.addEventListener('input',draw,{signal:ctx.signal});
 document.getElementById('module-message').textContent='Agenda interna por recurso: evita solapamientos; no envía recordatorios externos todavía.';
 try{await reload();}catch(e){ctx.notice('Error al consultar agenda: '+e.message,true);}
}
