import {field,line,money,date,toUTC,button,container,localInput} from './app-workflows.js';
const stages=[['lead','Lead'],['qualified','Calificado'],['proposal','Propuesta'],['negotiation','Negociación'],['won','Ganado'],['lost','Perdido']];
const labels=Object.fromEntries(stages);
export async function renderCrm(ctx){
 const base='/api/app/'+encodeURIComponent(ctx.config.tenant.slug)+'/workflows/crm';
 const canWrite=ctx.config.tenant.role!=='viewer',hasAgenda=ctx.config.tools.some(t=>t.id==='C004');
 const host=document.getElementById('record-list'),stats=container('cards'),editor=container('card-soft'),list=container('stack');
 const form=document.createElement('form');form.className='stack';
 const fields={
  title:field('deal-title','Oportunidad / negocio'),
  clientId:field('deal-client','Cliente registrado (C001)','select',[['','Sin vincular / cliente externo']]),
  assignedUserId:field('deal-assignee','Responsable del equipo','select',[['','Sin asignar']]),
  customer:field('deal-external','Referencia externa (opcional)'),
  amount:field('deal-amount','Valor estimado (MXN)','number'),
  stage:field('deal-stage','Etapa','select',stages),
  followUpAt:field('deal-follow-up','Próximo seguimiento','datetime-local'),
  notes:field('deal-notes','Notas','textarea')
 };
 const grid=container('field-grid');for(const entry of Object.values(fields))grid.append(entry.holder);
 fields.title.input.required=true;fields.amount.input.min='0';fields.amount.input.step='0.01';
 form.append(grid);
 const save=button('Crear oportunidad','btn btn-primary');save.type='submit';
 const cancel=button('Cancelar edición');cancel.hidden=true;
 const actions=container('toolbar');actions.append(save,cancel);form.append(actions);
 editor.append(line('Pipeline comercial conectado al directorio de Clientes','group-label'),form);
 host.replaceChildren(stats);if(canWrite)host.append(editor);host.append(list);
 let deals=[],clients=[],members=[],editing=null;
 let preferred=ctx.initialClientId||null;
 const clientName=id=>clients.find(x=>x.id===id)?.name||null;
 const memberEmail=id=>members.find(x=>x.id===id)?.email||null;
 const reset=()=>{
  editing=null;form.reset();fields.amount.input.value='0';
  if(preferred&&clients.some(x=>x.id===preferred))fields.clientId.input.value=preferred;
  save.textContent='Crear oportunidad';cancel.hidden=true;
 };
 cancel.addEventListener('click',reset,{signal:ctx.signal});
 async function reload(){
  const response=await ctx.api(base);if(ctx.signal.aborted)return;
  deals=response.deals||[];clients=response.clients||[];members=response.members||[];
  const previous=fields.clientId.input.value;
  fields.clientId.input.replaceChildren(new Option('Sin vincular / cliente externo',''));
  for(const c of clients)fields.clientId.input.add(new Option(c.name+(c.company?' · '+c.company:''),c.id));
  fields.clientId.input.value=clients.some(x=>x.id===previous)?previous:clients.some(x=>x.id===preferred)?preferred:'';
  const previousAssignee=fields.assignedUserId.input.value;
  fields.assignedUserId.input.replaceChildren(new Option('Sin asignar',''));
  for(const m of members)fields.assignedUserId.input.add(new Option(m.email+' · '+m.role,m.id));
  fields.assignedUserId.input.value=members.some(x=>x.id===previousAssignee)?previousAssignee:'';
  draw();ctx.attachmentsPanel?.update(deals);
 }
 function draw(){
  if(ctx.signal.aborted)return;
  stats.replaceChildren();list.replaceChildren();
  const open=deals.filter(x=>!['won','lost'].includes(x.stage));
  for(const [label,value] of [['Oportunidades',deals.length],['Pipeline abierto',money(open.reduce((sum,x)=>sum+x.amountCents,0))],['Cierres ganados',deals.filter(x=>x.stage==='won').length]]){
   const card=container('stat');card.append(line(label,'stat-label'),line(String(value),'stat-number'));stats.append(card);
  }
  const q=ctx.search.value.trim().toLowerCase();
  const visible=deals.filter(x=>(!preferred||x.clientId===preferred)&&(x.title+' '+(x.clientName||x.customer)+' '+x.notes).toLowerCase().includes(q));
  document.getElementById('record-count').textContent=visible.length+' oportunidades';
  if(!visible.length){list.append(line(preferred?'Este cliente todavía no tiene oportunidades vinculadas.':'Sin oportunidades; registra la primera utilizando un cliente existente.','empty'));return;}
  for(const d of visible){
   const card=container('record'),info=container('stack');
   const title=document.createElement('strong');title.textContent=d.title;info.append(title);
   info.append(line((d.clientName||clientName(d.clientId)||d.customer||'Cliente sin vincular')+' · '+money(d.amountCents),'help'));
   info.append(line('Etapa: '+labels[d.stage]+' · Seguimiento: '+date(d.followUpAt),'help'));
   info.append(line('Responsable: '+(d.assignedUserEmail||memberEmail(d.assignedUserId)||'Sin asignar'),'help'));
   if(d.notes)info.append(line(d.notes,'help'));card.append(info);
   const buttons=container('record-actions');
   if(hasAgenda){
    const appointment=button('Agendar seguimiento','btn');
    appointment.addEventListener('click',()=>ctx.navigateToTool?.('C004',{clientId:d.clientId,dealId:d.id}),{signal:ctx.signal});
    buttons.append(appointment);
   }
   if(d.clientId){
    const go=button('Ver cliente','btn');
    go.addEventListener('click',()=>ctx.navigateToTool?.('C001',{recordId:d.clientId}),{signal:ctx.signal});
    buttons.append(go);
   }
   if(canWrite){
    const select=document.createElement('select');select.className='search';select.style.maxWidth='145px';
    for(const [key,label] of stages)select.add(new Option(label,key));select.value=d.stage;
    select.addEventListener('change',async()=>{
     select.disabled=true;
     try{await ctx.write(base+'/'+d.id,'PATCH',{stage:select.value});ctx.notice('Etapa comercial actualizada.');await reload();}
     catch(e){select.value=d.stage;ctx.notice('No se guardó: '+e.message,true);}
     finally{select.disabled=false;}
    },{signal:ctx.signal});
    const edit=button('Editar');
    edit.addEventListener('click',()=>{
     editing=d.id;
     for(const key of ['title','customer','stage','notes','clientId','assignedUserId'])fields[key].input.value=d[key]??'';
     fields.amount.input.value=String(d.amountCents/100);fields.followUpAt.input.value=localInput(d.followUpAt);
     save.textContent='Guardar cambios';cancel.hidden=false;fields.title.input.focus();
    },{signal:ctx.signal});
    const archive=button('Archivar','btn btn-danger');
    archive.addEventListener('click',async()=>{
     if(!confirm('¿Archivar esta oportunidad?'))return;
     try{await ctx.api(base+'/'+d.id,{method:'DELETE'});ctx.notice('Oportunidad archivada.');await reload();}
     catch(e){ctx.notice(e.message,true);}
    },{signal:ctx.signal});
    buttons.append(select,edit,archive);
   }
   if(buttons.children.length)card.append(buttons);
   // TOOLS P0: tareas ligadas al trato y cotizaciones ligadas al trato.
   const workHost=container('stack');workHost.hidden=true;
   const workToggle=button('Tareas y cotizaciones','btn');
   workToggle.addEventListener('click',async()=>{
    workHost.hidden=!workHost.hidden;
    if(workHost.hidden)return;
    workHost.replaceChildren(line('Consultando tareas y cotizaciones…','help'));
    try{
     const hasQuotes=ctx.config.tools.some(t=>t.id==='T013');
     const [tasksData,quotesData,allQuotes]=await Promise.all([
      ctx.api(base+'/'+d.id+'/tasks'),
      hasQuotes?ctx.api(base+'/'+d.id+'/quotes'):Promise.resolve({quotes:[]}),
      hasQuotes?ctx.api('/api/app/'+encodeURIComponent(ctx.config.tenant.slug)+'/workflows/quotes'):Promise.resolve({quotes:[]})
     ]);
     if(ctx.signal.aborted)return;
     workHost.replaceChildren();
     const taskBlock=container('client-360-section');taskBlock.append(line('Tareas del trato','group-label'));
     for(const t of tasksData.tasks||[]){
      const row=container('client-360-row');
      const text=container('stack');
      text.append(line(t.title,'client-360-title'),line(t.status+(t.dueAt?' · Vence '+date(t.dueAt):'')+(t.assignedUserId?' · '+(memberEmail(t.assignedUserId)||'Asignado'):' · Sin responsable'),'help'));
      row.append(text);
      if(canWrite){
       if(t.status!=='done'){
        const done=button('Completar','btn');
        done.addEventListener('click',async()=>{
         try{await ctx.write(base+'/'+d.id+'/tasks/'+t.id,'PATCH',{title:t.title,status:'done',dueAt:t.dueAt,assignedUserId:t.assignedUserId});workToggle.click();workToggle.click();}
         catch(e){ctx.notice('No se pudo completar: '+e.message,true);}
        },{signal:ctx.signal});
        row.append(done);
       }
       const del=button('Eliminar','btn btn-danger');
       del.addEventListener('click',async()=>{
        if(!confirm('¿Eliminar esta tarea?'))return;
        try{await ctx.api(base+'/'+d.id+'/tasks/'+t.id,{method:'DELETE'});workToggle.click();workToggle.click();}
        catch(e){ctx.notice('No se pudo eliminar: '+e.message,true);}
       },{signal:ctx.signal});
       row.append(del);
      }
      taskBlock.append(row);
     }
     if(!(tasksData.tasks||[]).length)taskBlock.append(line('Sin tareas; crea la primera abajo.','help'));
     if(canWrite){
      const form2=document.createElement('form');form2.className='toolbar';
      const titleInput=document.createElement('input');titleInput.className='search';titleInput.placeholder='Nueva tarea…';titleInput.required=true;
      const dueInput=document.createElement('input');dueInput.className='search';dueInput.type='datetime-local';dueInput.setAttribute('aria-label','Vencimiento de la tarea');
      const assigneeSelect=document.createElement('select');assigneeSelect.className='search';
      assigneeSelect.add(new Option('Sin responsable',''));
      for(const m of members)assigneeSelect.add(new Option(m.email,m.id));
      const add=button('Añadir tarea','btn btn-primary');add.type='submit';
      form2.append(titleInput,dueInput,assigneeSelect,add);
      form2.addEventListener('submit',async e=>{
       e.preventDefault();add.disabled=true;
       try{
        await ctx.write(base+'/'+d.id+'/tasks','POST',{title:titleInput.value.trim(),status:'todo',dueAt:dueInput.value?toUTC(dueInput.value):null,assignedUserId:assigneeSelect.value||null});
        ctx.notice('Tarea creada.');workToggle.click();workToggle.click();
       }catch(err){ctx.notice('No se guardó la tarea: '+err.message,true);}
       finally{add.disabled=false;}
      },{signal:ctx.signal});
      taskBlock.append(form2);
     }
     workHost.append(taskBlock);
     if(hasQuotes){
      const quoteBlock=container('client-360-section');quoteBlock.append(line('Cotizaciones del trato','group-label'));
      for(const q of quotesData.quotes||[]){
       const row=container('client-360-row');
       const text=container('stack');
       text.append(line(q.title,'client-360-title'),line(q.status+' · '+money(q.totalCents),'help'));
       const open=button('Abrir','btn');
       open.addEventListener('click',()=>ctx.navigateToTool?.('T013',{recordId:q.id}),{signal:ctx.signal});
       row.append(text,open);
       if(canWrite){
        const unlink=button('Quitar','btn');
        unlink.addEventListener('click',async()=>{
         try{await ctx.api(base+'/'+d.id+'/quotes/'+q.id,{method:'DELETE'});workToggle.click();workToggle.click();}
         catch(e){ctx.notice('No se pudo quitar: '+e.message,true);}
        },{signal:ctx.signal});
        row.append(unlink);
       }
       quoteBlock.append(row);
     }
      if(!(quotesData.quotes||[]).length)quoteBlock.append(line('Sin cotizaciones vinculadas.','help'));
      if(canWrite){
       const available=(allQuotes.quotes||[]).filter(q=>!(quotesData.quotes||[]).some(x=>x.id===q.id));
       if(available.length){
        const linkForm=document.createElement('form');linkForm.className='toolbar';
        const select=document.createElement('select');select.className='search';
        for(const q of available)select.add(new Option(q.title+' · '+money(q.totalCents),q.id));
        const link=button('Vincular cotización','btn btn-primary');link.type='submit';
        linkForm.append(select,link);
        linkForm.addEventListener('submit',async e=>{
         e.preventDefault();link.disabled=true;
         try{await ctx.write(base+'/'+d.id+'/quotes/'+select.value,'POST',{});ctx.notice('Cotización vinculada.');workToggle.click();workToggle.click();}
         catch(err){ctx.notice('No se pudo vincular: '+err.message,true);}
         finally{link.disabled=false;}
        },{signal:ctx.signal});
        quoteBlock.append(linkForm);
       }
      }
      workHost.append(quoteBlock);
     }
    }catch(e){workHost.replaceChildren(line('No se pudo cargar: '+e.message,'error'));}
   },{signal:ctx.signal});
   buttons.append(workToggle);
   card.append(workHost);
   list.append(card);
  }
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();save.disabled=true;
  try{
   const amount=Number(fields.amount.input.value);
   if(!Number.isFinite(amount)||amount<0)throw Error('Ingresa un valor válido.');
   const body={title:fields.title.input.value.trim(),clientId:fields.clientId.input.value||null,
    assignedUserId:fields.assignedUserId.input.value||null,
    customer:fields.customer.input.value.trim(),amountCents:Math.round(amount*100),stage:fields.stage.input.value,
    followUpAt:fields.followUpAt.input.value?toUTC(fields.followUpAt.input.value):null,notes:fields.notes.input.value.trim()};
   await ctx.write(base+(editing?'/'+editing:''),editing?'PATCH':'POST',body);
   ctx.notice('Oportunidad vinculada y guardada.');reset();await reload();
  }catch(e){ctx.notice('No se guardó: '+e.message,true);}
  finally{save.disabled=false;}
 },{signal:ctx.signal});
 ctx.search.addEventListener('input',draw,{signal:ctx.signal});
 document.getElementById('module-message').textContent='Selecciona un cliente de C001 para relacionar oportunidades y citas sin recapturar su ficha.';
 try{await reload();}catch(e){ctx.notice('Error al cargar CRM: '+e.message,true);}
}
