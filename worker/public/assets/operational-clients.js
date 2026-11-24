import {field,line,button,container} from './app-workflows.js';
import {createImportPanel,CLIENT_CSV_TEMPLATE} from './import-ui.js';
const states=[['prospect','Prospecto'],['active','Activo'],['inactive','Inactivo']];
const names=Object.fromEntries(states);
export async function renderClients(ctx){
 const path='/api/app/'+encodeURIComponent(ctx.config.tenant.slug)+'/workflows/clients';
 const canWrite=ctx.config.tenant.role!=='viewer';
 const host=document.getElementById('record-list'),stats=container('cards'),editor=container('card-soft'),list=container('stack');
 const form=document.createElement('form');form.className='stack';
 const fields={
  name:field('client-name','Nombre o razón social'),
  company:field('client-company','Empresa (opcional)'),
  email:field('client-email','Correo electrónico','email'),
  phone:field('client-phone','Teléfono o WhatsApp','tel'),
  status:field('client-status','Estado','select',states),
  notes:field('client-notes','Notas de relación comercial','textarea')
 };
 fields.name.input.required=true;
 const grid=container('field-grid');for(const {holder} of Object.values(fields))grid.append(holder);
 const save=button('Guardar cliente','btn btn-primary');save.type='submit';
 const cancel=button('Cancelar edición');cancel.hidden=true;
 const actions=container('toolbar');actions.append(save,cancel);
 form.append(grid,actions);
 editor.append(line('Directorio de clientes y prospectos','group-label'),form);
 if(canWrite){
  const importPanel=createImportPanel({title:'Importar clientes desde CSV',description:'Columnas: Nombre, Empresa, Correo, Teléfono, Estado, Notas. También se reconocen encabezados en inglés (Name, Company, Email, Phone, Status, Notes). Los correos duplicados se omiten sin borrar nada.',
   templateName:'hubie-clientes-plantilla.csv',templateText:CLIENT_CSV_TEMPLATE,accept:'.csv,text/csv',
   notice:ctx.notice,
   onSubmit:async csv=>{const data=await ctx.write(path+'/import','POST',{csv});await reload();return data;}});
  editor.append(importPanel);
 }
 host.replaceChildren(stats);if(canWrite)host.append(editor);host.append(list);
 // TOOLS P0: deduplicación por email (la importación CSV la hace el frente
 // import 017; aquí solo se revisan y fusionan duplicados ya registrados).
 let duplicatesHost=null;
 if(canWrite){
  const dupBar=container('toolbar');
  const dupButton=button('Revisar duplicados','btn');
  duplicatesHost=container('stack');duplicatesHost.hidden=true;
  dupButton.addEventListener('click',async()=>{
   duplicatesHost.hidden=!duplicatesHost.hidden;
   if(duplicatesHost.hidden)return;
   duplicatesHost.replaceChildren(line('Buscando duplicados por correo…','help'));
   try{
    const result=await ctx.api(path+'/duplicates');if(ctx.signal.aborted)return;
    duplicatesHost.replaceChildren();
    if(!result.duplicates?.length){duplicatesHost.append(line('No hay clientes con el mismo correo.','help'));return;}
    for(const group of result.duplicates){
     const block=container('client-360-section');
     block.append(line('Correo duplicado: '+group.email,'group-label'));
     for(const candidate of group.clients){
      const row=container('client-360-row');
      const text=container('stack');
      text.append(line(candidate.name,'client-360-title'),
       line((candidate.relations?.deals||0)+' tratos · '+(candidate.relations?.cases||0)+' expedientes · '+(candidate.relations?.quotes||0)+' cotizaciones','help'));
      row.append(text);
      const others=group.clients.filter(x=>x.id!==candidate.id);
      for(const other of others){
       const merge=button('Fusionar en '+other.name,'btn');
       merge.addEventListener('click',async()=>{
        if(!confirm('¿Fusionar "'+candidate.name+'" en "'+other.name+'"? Sus tratos, citas, expedientes y cotizaciones pasan al cliente conservado y el duplicado se archiva. Esta acción queda auditada.'))return;
        try{await ctx.api(path+'/'+other.id+'/merge',{method:'POST',body:JSON.stringify({mergedClientId:candidate.id,reason:'Duplicado por email'})});
         ctx.notice('Clientes fusionados.');duplicatesHost.hidden=true;await reload();}
        catch(e){ctx.notice('No se pudo fusionar: '+e.message,true);}
       },{signal:ctx.signal});
       row.append(merge);
      }
      block.append(row);
     }
     duplicatesHost.append(block);
    }
   }catch(err){duplicatesHost.replaceChildren(line('No se pudieron revisar duplicados: '+err.message,'error'));}
  },{signal:ctx.signal});
  dupBar.append(dupButton,line('Importación CSV: pendiente del módulo de importación (frente 017).','help'));
  host.append(dupBar,duplicatesHost);
 }
 let clients=[],editing=null;
 let focusRecord=ctx.initialRecordId||null;
 const reset=()=>{editing=null;form.reset();save.textContent='Guardar cliente';cancel.hidden=true;};
 cancel.addEventListener('click',reset,{signal:ctx.signal});
 async function reload(){
  const result=await ctx.api(path);if(ctx.signal.aborted)return;
  clients=result.clients||[];draw();ctx.attachmentsPanel?.update(clients.map(c=>({id:c.id,title:c.name})));
 }
 function draw(){
  if(ctx.signal.aborted)return;
  stats.replaceChildren();list.replaceChildren();
  for(const [label,value] of [['Clientes',clients.length],['Prospectos',clients.filter(c=>c.status==='prospect').length],['Activos',clients.filter(c=>c.status==='active').length]]){
   const card=container('stat');card.append(line(label,'stat-label'),line(String(value),'stat-number'));stats.append(card);
  }
  const q=ctx.search.value.toLowerCase().trim();
  const filtered=clients.filter(c=>(c.name+' '+c.company+' '+c.email+' '+c.phone).toLowerCase().includes(q));
  document.getElementById('record-count').textContent=filtered.length+' contactos';
  if(!filtered.length){list.append(line('Todavía no hay contactos. Registra un prospecto para comenzar.','empty'));return;}
  for(const c of filtered){
   const card=container('record'),info=container('stack');
   const h=document.createElement('strong');h.textContent=c.name;info.append(h);
   info.append(line((c.company?c.company+' · ':'')+names[c.status],'help'));
   if(c.email||c.phone)info.append(line([c.email,c.phone].filter(Boolean).join(' · '),'help'));
   if(c.notes)info.append(line(c.notes,'help'));
   card.append(info);
   const controls=container('record-actions');
   const summary=container('client-360');summary.hidden=true;
   const view=button('Ver ficha 360°','btn');
   async function loadSummary(){
    summary.replaceChildren(line('Consultando relaciones del cliente…','help'));
    try{
     const data=await ctx.api(path+'/'+c.id+'/summary');
     if(ctx.signal.aborted)return;
     summary.replaceChildren();
     const counters=container('client-360-stats');
     for(const [name,num] of [['Oportunidades',data.counts?.deals||0],['Expedientes',data.counts?.cases||0],['Citas',data.counts?.appointments||0],['Cotizaciones',data.counts?.quotes||0]]){
      const stat=container('client-360-count');stat.append(line(name,'help'),line(String(num),'stat-number'));counters.append(stat);
     }
     summary.append(counters);
     const sets=[['Oportunidades','C002',data.deals],['Expedientes','C003',data.cases],['Citas','C004',data.appointments],['Cotizaciones','T013',data.quotes]];
     for(const [name,tool,entries] of sets){
      if(!ctx.config.tools.some(t=>t.id===tool))continue;
      const block=container('client-360-section');block.append(line(name,'group-label'));
      if(!entries?.length)block.append(line('No existen registros vinculados.','help'));
      for(const entry of entries){
       const row=container('client-360-row');
       const text=container('stack');text.append(line(entry.title,'client-360-title'),line(entry.stage||entry.status||entry.kind||'','help'));
       const open=button('Abrir','btn');open.addEventListener('click',()=>ctx.navigateToTool?.(tool,{recordId:entry.id,clientId:c.id}),{signal:ctx.signal});
       row.append(text,open);block.append(row);
      }
      summary.append(block);
     }
     // TOOLS P0: línea de tiempo con tratos, expedientes, citas, cotizaciones y eventos.
     try{
      const history=await ctx.api(path+'/'+c.id+'/timeline');if(ctx.signal.aborted)return;
      const block=container('client-360-section');block.append(line('Línea de tiempo','group-label'));
      const kindLabels={deal:'Trato',case:'Expediente',appointment:'Cita',quote:'Cotización',case_event:'Evento de expediente',client_event:'Evento de cliente'};
      if(!history.timeline?.length)block.append(line('Sin actividad registrada.','help'));
      for(const entry of (history.timeline||[]).slice(0,20)){
       const row=container('client-360-row');
       const text=container('stack');
       text.append(line((kindLabels[entry.kind]||entry.kind)+': '+entry.title,'client-360-title'),line(entry.detail+' · '+new Date(entry.at).toLocaleString(),'help'));
       const open=button('Abrir','btn');
       open.addEventListener('click',()=>ctx.navigateToTool?.(entry.toolId,{recordId:entry.recordId,clientId:c.id}),{signal:ctx.signal});
       row.append(text,open);block.append(row);
      }
      summary.append(block);
     }catch(err){summary.append(line('No se pudo cargar la línea de tiempo: '+err.message,'error'));}
     if(!data.deals?.length&&!data.cases?.length&&!data.appointments?.length)
       summary.append(line('Al crear una oportunidad o cita desde esta ficha se vinculará automáticamente con este cliente.','help'));
    }catch(err){summary.replaceChildren(line('No se pudo cargar la ficha 360°: '+err.message,'error'));}
   }
   view.addEventListener('click',async()=>{
    summary.hidden=!summary.hidden;
    view.textContent=summary.hidden?'Ver ficha 360°':'Ocultar ficha 360°';
    if(!summary.hidden)await loadSummary();
   },{signal:ctx.signal});
   controls.append(view);
   for(const [tool,label] of [['C002','Nueva oportunidad'],['C004','Nueva cita']]){
    if(!canWrite||!ctx.config.tools.some(t=>t.id===tool))continue;
    const create=button(label,'btn');
    create.addEventListener('click',()=>ctx.navigateToTool?.(tool,{clientId:c.id}),{signal:ctx.signal});
    controls.append(create);
   }
   card.append(summary);
   if(focusRecord===c.id){focusRecord=null;queueMicrotask(()=>{if(!ctx.signal.aborted)view.click();});}

   if(ctx.config.tools.some(t=>t.id==='C003')){
    const dossiers=button('Expedientes','btn');
    dossiers.addEventListener('click',()=>ctx.navigateToTool?.('C003',{clientId:c.id}),{signal:ctx.signal});
    controls.append(dossiers);
   }
   if(canWrite){
    const edit=button('Editar');
    edit.addEventListener('click',()=>{
     editing=c.id;
     for(const name of Object.keys(fields))fields[name].input.value=c[name]??'';
     save.textContent='Guardar cambios';cancel.hidden=false;fields.name.input.focus();
    },{signal:ctx.signal});
    const archive=button('Archivar','btn btn-danger');
    archive.addEventListener('click',async()=>{
     if(!confirm('¿Archivar este cliente? Se conserva el historial.'))return;
     try{await ctx.api(path+'/'+c.id,{method:'DELETE'});ctx.notice('Cliente archivado.');await reload();}
     catch(e){ctx.notice('No fue posible archivar: '+e.message,true);}
    },{signal:ctx.signal});

    controls.append(edit,archive);
   }
   if(controls.children.length)card.append(controls);
   list.append(card);
  }
 }
 form.addEventListener('submit',async e=>{
  e.preventDefault();save.disabled=true;
  try{
   const body=Object.fromEntries(Object.entries(fields).map(([key,entry])=>[key,entry.input.value.trim()]));
   await ctx.write(path+(editing?'/'+editing:''),editing?'PATCH':'POST',body);
   ctx.notice('Cliente guardado para '+ctx.config.tenant.displayName+'.');reset();await reload();
  }catch(e){ctx.notice(e.message==='Duplicate client email'?'Ese correo ya está registrado en esta empresa.':'No se guardó: '+e.message,true);}
  finally{save.disabled=false;}
 },{signal:ctx.signal});
 ctx.search.addEventListener('input',draw,{signal:ctx.signal});
 document.getElementById('module-message').textContent='Ficha 360°: Clientes se relaciona con CRM, Expedientes y Agenda mediante IDs de la misma empresa.';
 try{await reload();}catch(e){ctx.notice('Error al cargar Clientes: '+e.message,true);}
}
