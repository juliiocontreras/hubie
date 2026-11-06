import {field,line,button,container,date} from './app-workflows.js';
const kinds=[['general','General'],['commercial','Comercial'],['contract','Contractual'],['service','Servicio'],['administrative','Administrativo']];
const states=[['open','Abierto'],['in_progress','En seguimiento'],['on_hold','En espera'],['completed','Concluido']];
const kindLabels=Object.fromEntries(kinds),stateLabels=Object.fromEntries(states);
const make=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
export async function renderCases(ctx){
 const base='/api/app/'+encodeURIComponent(ctx.config.tenant.slug)+'/workflows/cases';
 const canWrite=ctx.config.tenant.role!=='viewer';
 const host=document.getElementById('record-list'),summary=container('cards'),editor=container('card-soft');
 const list=container('stack'),form=make('form',undefined,'stack');
 const controls=container('toolbar');
 const fields={
  clientId:field('case-client','Cliente relacionado','select'),
  title:field('case-title','Nombre del expediente'),
  kind:field('case-kind','Tipo de expediente','select',kinds),
  status:field('case-status','Estado','select',states),
  notes:field('case-notes','Descripción y seguimiento','textarea')
 };
 fields.title.input.required=true;
 fields.clientId.input.required=true;
 const grid=container('field-grid');
 Object.values(fields).forEach(x=>grid.append(x.holder));
 const save=button('Crear expediente','btn btn-primary');save.type='submit';
 const cancel=button('Cancelar edición');cancel.hidden=true;controls.append(save,cancel);
 const note=line('Cada expediente pertenece a un cliente real de esta empresa. Los documentos y la actividad se consultan desde el mismo módulo.','help');
 form.append(grid,controls);
 editor.append(line('Expedientes vinculados a Clientes (C001)','group-label'),note,form);
 const filterRow=container('toolbar');
 const clientFilter=make('select');clientFilter.className='search';clientFilter.setAttribute('aria-label','Filtrar expedientes por cliente');
 const statusFilter=make('select');statusFilter.className='search';statusFilter.setAttribute('aria-label','Filtrar expedientes por estado');
 statusFilter.add(new Option('Todos los estados',''));
 for(const [id,label]of states)statusFilter.add(new Option(label,id));
 filterRow.append(clientFilter,statusFilter);
 host.replaceChildren(summary);
 if(canWrite)host.append(editor);
 host.append(filterRow,list);
 let cases=[],clients=[],editing=null,preferred=ctx.initialClientId||null;
 function draw(){
  if(ctx.signal.aborted)return;
  summary.replaceChildren();list.replaceChildren();
  for(const [title,value] of [['Expedientes activos',cases.length],['En seguimiento',cases.filter(c=>c.status==='in_progress').length],['Documentos',cases.reduce((n,c)=>n+(c.documentsCount||0),0)]]){
   const item=container('stat');item.append(line(title,'stat-label'),line(String(value),'stat-number'));summary.append(item);
  }
  const q=ctx.search.value.trim().toLowerCase();
  const visible=cases.filter(c=>(!clientFilter.value||c.clientId===clientFilter.value)&&(!statusFilter.value||c.status===statusFilter.value)&&
   (c.title+' '+c.clientName+' '+c.kind+' '+c.notes).toLowerCase().includes(q));
  document.getElementById('record-count').textContent=visible.length+' expedientes';
  if(!visible.length){list.append(line(cases.length?'Ningún expediente coincide con los filtros.':'Todavía no hay expedientes. Selecciona un cliente para crear el primero.','empty'));return;}
  for(const c of visible){
   const card=container('record'),info=container('stack'),action=container('record-actions');
   info.append(make('strong',c.title));
   info.append(line('Cliente: '+c.clientName+' · '+kindLabels[c.kind]+' · '+stateLabels[c.status],'help'));
   info.append(line((c.documentsCount||0)+' documento(s) · Actualizado '+date(c.updatedAt),'help'));
   if(c.notes)info.append(line(c.notes,'help'));card.append(info);
   const documents=button('Ver documentos ('+(c.documentsCount||0)+')','btn');
   documents.addEventListener('click',()=>{
    ctx.attachmentsPanel?.select?.(c.id);
    document.getElementById('module-attachments')?.scrollIntoView({block:'start',behavior:'smooth'});
   },{signal:ctx.signal});
   const history=button('Historial','btn');
   const historyHost=make('div',undefined,'case-history stack');historyHost.hidden=true;
   history.addEventListener('click',async()=>{
    historyHost.hidden=!historyHost.hidden;if(historyHost.hidden)return;
    historyHost.replaceChildren(line('Consultando historial…','help'));
    try{
     const result=await ctx.api(base+'/'+c.id+'/history');if(ctx.signal.aborted)return;
     historyHost.replaceChildren();
     if(!result.events?.length)historyHost.append(line('No hay actividades registradas.','help'));
     for(const activity of result.events){
      const label={created:'Creación',updated:'Modificación',archived:'Archivado',document_added:'Documento añadido',document_removed:'Documento eliminado'}[activity.action]||activity.action;
      const entry=make('div',undefined,'case-activity');
      entry.append(make('strong',label),line(activity.description||'Actividad del expediente','help'),line(date(activity.createdAt),'help'));
      historyHost.append(entry);
     }
    }catch(error){historyHost.replaceChildren(line('No fue posible consultar el historial: '+error.message,'error'));}
   },{signal:ctx.signal});
   action.append(documents,history);
   if(canWrite){
    const edit=button('Editar','btn');
    edit.addEventListener('click',()=>{
     editing=c.id;
     fields.clientId.input.value=c.clientId;fields.clientId.input.disabled=true;
     for(const key of ['title','kind','status','notes'])fields[key].input.value=c[key]??'';
     save.textContent='Guardar cambios';cancel.hidden=false;
     editor.scrollIntoView({block:'start',behavior:'smooth'});fields.title.input.focus();
    },{signal:ctx.signal});
    const archive=button('Archivar','btn btn-danger');
    archive.addEventListener('click',async()=>{
     if(!confirm('¿Archivar el expediente? Sus documentos se conservarán en la base de datos y dejarán de aparecer en la vista activa.'))return;
     try{await ctx.api(base+'/'+c.id,{method:'DELETE'});ctx.notice('Expediente archivado.');await reload();}
     catch(error){ctx.notice('No se pudo archivar: '+error.message,true);}
    },{signal:ctx.signal});
    action.append(edit,archive);
   }
   card.append(action,historyHost);list.append(card);
  }
 }
 function reset(){
  editing=null;form.reset();fields.clientId.input.disabled=false;
  if(preferred&&clients.some(c=>c.id===preferred))fields.clientId.input.value=preferred;
  save.textContent='Crear expediente';cancel.hidden=true;
 }
 cancel.addEventListener('click',reset,{signal:ctx.signal});
 async function reload(){
  const data=await ctx.api(base);if(ctx.signal.aborted)return;
  cases=data.cases||[];clients=data.clients||[];
  const selected=clientFilter.value||preferred||'';
  clientFilter.replaceChildren(new Option('Todos los clientes',''));
  fields.clientId.input.replaceChildren(new Option('Seleccionar cliente…',''));
  for(const c of clients){
   const label=c.name+(c.company?' · '+c.company:'');
   clientFilter.add(new Option(label,c.id));fields.clientId.input.add(new Option(label,c.id));
  }
  clientFilter.value=clients.some(x=>x.id===selected)?selected:'';
  if(preferred&&clients.some(c=>c.id===preferred)){fields.clientId.input.value=preferred;preferred=null;}
  if(!clients.length&&canWrite){save.disabled=true;editor.append(line('Registra primero un cliente en Clientes (C001).','help'));}
  ctx.attachmentsPanel?.update(cases.map(c=>({id:c.id,title:c.clientName+' · '+c.title})));
  draw();
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();save.disabled=true;
  try{
   const body={title:fields.title.input.value.trim(),kind:fields.kind.input.value,status:fields.status.input.value,notes:fields.notes.input.value.trim()};
   if(!editing)body.clientId=fields.clientId.input.value;
   await ctx.write(base+(editing?'/'+editing:''),editing?'PATCH':'POST',body);
   ctx.notice(editing?'Expediente actualizado.':'Expediente vinculado al cliente.');
   reset();await reload();
  }catch(error){ctx.notice('No se pudo guardar el expediente: '+error.message,true);}
  finally{save.disabled=false;}
 },{signal:ctx.signal});
 clientFilter.addEventListener('change',draw,{signal:ctx.signal});
 statusFilter.addEventListener('change',draw,{signal:ctx.signal});
 ctx.search.addEventListener('input',draw,{signal:ctx.signal});
 document.getElementById('module-message').textContent='Expedientes privados con clientes relacionados, archivos adjuntos e historial por organización.';
 try{await reload();}catch(e){ctx.notice('No fue posible consultar Expedientes: '+e.message,true);}
}
