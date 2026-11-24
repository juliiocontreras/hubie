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
 // TOOLS P0: búsqueda de documentos en todos los expedientes y alerta de vencimientos.
 const docSearchRow=container('toolbar');
 const docSearchInput=make('input');docSearchInput.className='search';docSearchInput.type='search';
 docSearchInput.placeholder='Buscar documentos por nombre, expediente o cliente…';
 docSearchInput.setAttribute('aria-label','Buscar documentos en expedientes');
 const docSearchButton=button('Buscar documentos','btn');
 const docExpiringButton=button('Por vencer','btn');
 const docResults=container('stack');docResults.hidden=true;
 const expiryLabels={expired:'Vencido',soon:'Vence pronto',valid:'Vigente',none:'Sin vencimiento'};
 async function renderDocResults(documents){
  docResults.replaceChildren();docResults.hidden=false;
  if(!documents.length){docResults.append(line('Ningún documento coincide con la búsqueda.','help'));return;}
  for(const doc of documents){
   const row=container('record'),info=container('stack');
   info.append(make('strong',doc.filename||doc.documentType));
   info.append(line(doc.caseTitle+' · '+doc.clientName+' · '+expiryLabels[doc.expiryStatus]+(doc.expiresOn?' · '+doc.expiresOn:''),'help'));
   row.append(info);
   const controls=container('record-actions');
   const open=button('Ver expediente','btn');
   open.addEventListener('click',()=>{
    clientFilter.value=doc.clientId;ctx.search.value=doc.caseTitle;draw();
    document.getElementById('record-list')?.scrollIntoView({block:'start'});
   },{signal:ctx.signal});
   controls.append(open);
   if(canWrite){
    const vis=make('select');vis.className='search';vis.setAttribute('aria-label','Visibilidad del documento');
    vis.add(new Option('Equipo','team'));vis.add(new Option('Restringido','restricted'));vis.value=doc.visibility||'team';
    vis.addEventListener('change',async()=>{
     try{await ctx.write('/api/app/'+encodeURIComponent(ctx.config.tenant.slug)+'/case-documents/'+doc.documentId+'/visibility','PATCH',{visibility:vis.value});ctx.notice('Visibilidad actualizada.');}
     catch(e){vis.value=doc.visibility||'team';ctx.notice('No se guardó: '+e.message,true);}
    },{signal:ctx.signal});
    controls.append(vis);
   }
   row.append(controls);docResults.append(row);
  }
 }
 docSearchButton.addEventListener('click',async()=>{
  docResults.replaceChildren(line('Buscando documentos…','help'));docResults.hidden=false;
  try{
   const result=await ctx.api(base+'/documents/search?q='+encodeURIComponent(docSearchInput.value.trim()));
   if(ctx.signal.aborted)return;
   await renderDocResults(result.documents||[]);
  }catch(e){docResults.replaceChildren(line('No se pudo buscar: '+e.message,'error'));}
 },{signal:ctx.signal});
 docExpiringButton.addEventListener('click',async()=>{
  docResults.replaceChildren(line('Consultando vencimientos…','help'));docResults.hidden=false;
  try{
   const result=await ctx.api(base+'/documents/expiring');
   if(ctx.signal.aborted)return;
   const all=[...(result.expired||[]),...(result.expiringSoon||[])];
   docResults.replaceChildren();
   docResults.append(line((result.counts?.expired||0)+' vencido(s) · '+(result.counts?.expiringSoon||0)+' por vencer en 30 días','group-label'));
   await renderDocResults(all);
  }catch(e){docResults.replaceChildren(line('No se pudo consultar: '+e.message,'error'));}
 },{signal:ctx.signal});
 docSearchRow.append(docSearchInput,docSearchButton,docExpiringButton);
 host.replaceChildren(summary);
 if(canWrite)host.append(editor);
 host.append(filterRow,docSearchRow,docResults,list);
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
   // TOOLS P0: vinculados del expediente (tratos, citas y cotizaciones del mismo cliente).
   const linksButton=button('Vinculados','btn');
   const linksHost=make('div',undefined,'case-history stack');linksHost.hidden=true;
   linksButton.addEventListener('click',async()=>{
    linksHost.hidden=!linksHost.hidden;if(linksHost.hidden)return;
    linksHost.replaceChildren(line('Consultando vinculados…','help'));
    try{
     const linked=await ctx.api(base+'/'+c.id+'/links');if(ctx.signal.aborted)return;
     linksHost.replaceChildren();
     linksHost.append(line('Cliente: '+(linked.client?.name||'Sin cliente'),'group-label'));
     for(const [name,tool,entries,detail] of [
      ['Tratos','C002',linked.deals,e=>e.stage||''],
      ['Citas','C004',linked.appointments,e=>e.status||''],
      ['Cotizaciones','T013',linked.quotes,e=>e.status||'']]){
      if(!ctx.config.tools.some(t=>t.id===tool))continue;
      const block=make('div',undefined,'stack');block.append(line(name,'group-label'));
      if(!entries?.length)block.append(line('Sin registros vinculados.','help'));
      for(const entry of entries){
       const row=container('client-360-row');
       const text=container('stack');text.append(line(entry.title,'client-360-title'),line(detail(entry),'help'));
       const open=button('Abrir','btn');
       open.addEventListener('click',()=>ctx.navigateToTool?.(tool,{recordId:entry.id,clientId:c.clientId}),{signal:ctx.signal});
       row.append(text,open);block.append(row);
      }
      linksHost.append(block);
     }
    }catch(error){linksHost.replaceChildren(line('No fue posible consultar vinculados: '+error.message,'error'));}
   },{signal:ctx.signal});
   action.append(linksButton);
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
   card.append(action,historyHost,linksHost);list.append(card);
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
 if(ctx.attachmentsPanel)ctx.attachmentsPanel.onChange=reload;
 document.getElementById('module-message').textContent='Expedientes privados con clientes relacionados, archivos adjuntos e historial por organización.';
 try{await reload();}catch(e){ctx.notice('No fue posible consultar Expedientes: '+e.message,true);}
}
