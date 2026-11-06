import {field,line,button,container} from './app-workflows.js';
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
 host.replaceChildren(stats);if(canWrite)host.append(editor);host.append(list);
 let clients=[],editing=null;
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
 document.getElementById('module-message').textContent='Directorio privado por empresa. Próximo: enlazar clientes con oportunidades CRM.';
 try{await reload();}catch(e){ctx.notice('Error al cargar Clientes: '+e.message,true);}
}
