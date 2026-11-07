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
 let deals=[],clients=[],editing=null;
 let preferred=ctx.initialClientId||null;
 const clientName=id=>clients.find(x=>x.id===id)?.name||null;
 const reset=()=>{
  editing=null;form.reset();fields.amount.input.value='0';
  if(preferred&&clients.some(x=>x.id===preferred))fields.clientId.input.value=preferred;
  save.textContent='Crear oportunidad';cancel.hidden=true;
 };
 cancel.addEventListener('click',reset,{signal:ctx.signal});
 async function reload(){
  const response=await ctx.api(base);if(ctx.signal.aborted)return;
  deals=response.deals||[];clients=response.clients||[];
  const previous=fields.clientId.input.value;
  fields.clientId.input.replaceChildren(new Option('Sin vincular / cliente externo',''));
  for(const c of clients)fields.clientId.input.add(new Option(c.name+(c.company?' · '+c.company:''),c.id));
  fields.clientId.input.value=clients.some(x=>x.id===previous)?previous:clients.some(x=>x.id===preferred)?preferred:'';
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
     for(const key of ['title','customer','stage','notes','clientId'])fields[key].input.value=d[key]??'';
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
   list.append(card);
  }
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();save.disabled=true;
  try{
   const amount=Number(fields.amount.input.value);
   if(!Number.isFinite(amount)||amount<0)throw Error('Ingresa un valor válido.');
   const body={title:fields.title.input.value.trim(),clientId:fields.clientId.input.value||null,
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
