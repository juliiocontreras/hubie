import {field,line,money,date,toUTC,button,container} from './app-workflows.js';
const labels={lead:'Lead',qualified:'Calificado',proposal:'Propuesta',negotiation:'Negociación',won:'Ganado',lost:'Perdido'};
const stages=Object.entries(labels);
export async function renderCrm(ctx){
 const host=document.getElementById('record-list');
 const path='/api/app/'+encodeURIComponent(ctx.config.tenant.slug)+'/workflows/crm';
 const canWrite=ctx.config.tenant.role!=='viewer';
 const stats=container('cards'),editor=container('card-soft'),list=container('stack');
 const form=document.createElement('form');form.className='stack';
 let deals=[],editing=null;
 const fields={
  title:field('deal-title','Oportunidad / negocio'),
  customer:field('deal-customer','Cliente'),
  amount:field('deal-amount','Valor estimado (MXN)','number'),
  stage:field('deal-stage','Etapa','select',stages),
  followUpAt:field('deal-follow-up','Próximo seguimiento','datetime-local'),
  notes:field('deal-notes','Notas','textarea')
 };
 const grid=container('field-grid');
 for(const entry of Object.values(fields))grid.append(entry.holder);
 fields.title.input.required=true;
 fields.amount.input.min='0';fields.amount.input.step='0.01';fields.amount.input.value='0';
 form.append(grid);
 const save=button('Crear oportunidad','btn btn-primary');save.type='submit';
 const cancel=button('Cancelar edición');cancel.hidden=true;
 const controls=container('toolbar');controls.append(save,cancel);form.append(controls);
 editor.append(line('Pipeline comercial · oportunidades, etapas y seguimientos','group-label'),form);
 host.replaceChildren(stats);
 if(canWrite)host.append(editor);
 host.append(list);
 const reset=()=>{editing=null;form.reset();fields.amount.input.value='0';save.textContent='Crear oportunidad';cancel.hidden=true;};
 cancel.addEventListener('click',reset,{signal:ctx.signal});
 async function reload(){
  const d=await ctx.api(path);if(ctx.signal.aborted)return;
  deals=d.deals||[];draw();ctx.attachmentsPanel?.update(deals);
 }
 function draw(){
  if(ctx.signal.aborted)return;
  stats.replaceChildren();list.replaceChildren();
  const open=deals.filter(x=>!['won','lost'].includes(x.stage));
  for(const [label,value] of [['Oportunidades',deals.length],['Pipeline abierto',money(open.reduce((sum,x)=>sum+x.amountCents,0))],['Cierres ganados',deals.filter(x=>x.stage==='won').length]]){
   const card=container('stat');card.append(line(label,'stat-label'),line(String(value),'stat-number'));stats.append(card);
  }
  const q=ctx.search.value.trim().toLowerCase();
  const visible=deals.filter(x=>(x.title+' '+x.customer+' '+x.notes).toLowerCase().includes(q));
  document.getElementById('record-count').textContent=visible.length+' oportunidades';
  if(!visible.length){list.append(line('Sin oportunidades. Registra tu primera venta en el formulario.','empty'));return;}
  for(const d of visible){
   const card=container('record');
   const info=container('stack');
   const title=document.createElement('strong');title.textContent=d.title;info.append(title);
   info.append(line((d.customer||'Sin cliente')+' · '+money(d.amountCents),'help'));
   info.append(line('Etapa: '+labels[d.stage]+' · Próximo seguimiento: '+date(d.followUpAt),'help'));
   if(d.notes)info.append(line(d.notes,'help'));
   card.append(info);
   if(canWrite){
    const actions=container('record-actions');
    const select=document.createElement('select');select.className='search';select.style.maxWidth='145px';
    for(const [key,label] of stages)select.add(new Option(label,key));select.value=d.stage;
    select.addEventListener('change',async()=>{
     select.disabled=true;
     try{await ctx.write(path+'/'+d.id,'PATCH',{stage:select.value});ctx.notice('Etapa comercial actualizada.');await reload();}
     catch(e){select.value=d.stage;ctx.notice('No se guardó: '+e.message,true);}
     finally{select.disabled=false;}
    },{signal:ctx.signal});
    const edit=button('Editar');
    edit.addEventListener('click',()=>{
     editing=d.id;for(const key of ['title','customer','stage','notes'])fields[key].input.value=d[key]??'';
     fields.amount.input.value=String(d.amountCents/100);fields.followUpAt.input.value=d.followUpAt?new Date(new Date(d.followUpAt).getTime()-new Date(d.followUpAt).getTimezoneOffset()*60000).toISOString().slice(0,16):'';
     save.textContent='Guardar cambios';cancel.hidden=false;fields.title.input.focus();
    },{signal:ctx.signal});
    const archive=button('Archivar','btn btn-danger');
    archive.addEventListener('click',async()=>{
     if(!confirm('¿Archivar esta oportunidad?'))return;
     try{await ctx.api(path+'/'+d.id,{method:'DELETE'});ctx.notice('Oportunidad archivada.');await reload();}
     catch(e){ctx.notice(e.message,true);}
    },{signal:ctx.signal});
    actions.append(select,edit,archive);card.append(actions);
   }
   list.append(card);
  }
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();save.disabled=true;
  try{
   const amount=Number(fields.amount.input.value);
   if(!Number.isFinite(amount)||amount<0)throw Error('Ingresa un valor válido.');
   const body={title:fields.title.input.value.trim(),customer:fields.customer.input.value.trim(),amountCents:Math.round(amount*100),stage:fields.stage.input.value,followUpAt:fields.followUpAt.input.value?toUTC(fields.followUpAt.input.value):null,notes:fields.notes.input.value.trim()};
   await ctx.write(path+(editing?'/'+editing:''),editing?'PATCH':'POST',body);
   ctx.notice('Oportunidad guardada para '+ctx.config.tenant.displayName+'.');reset();await reload();
  }catch(e){ctx.notice('No se guardó: '+e.message,true);}
  finally{save.disabled=false;}
 },{signal:ctx.signal});
 ctx.search.addEventListener('input',draw,{signal:ctx.signal});
 document.getElementById('module-message').textContent='Pipeline con etapas, valor estimado y seguimiento; aún sin automatizaciones externas.';
 try{await reload();}catch(e){ctx.notice('Error al cargar CRM: '+e.message,true);}
}
