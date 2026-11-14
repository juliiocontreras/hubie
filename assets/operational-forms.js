// T007 Formularios personalizados reales (frente P1-A): constructor de
// campos (texto, número, fecha, selección, casilla; obligatorio o no),
// respuestas validadas que crean registros reales y exportación CSV.
import {field,line,button,container} from './app-workflows.js';
const typeLabels={text:'Texto',number:'Número',date:'Fecha',select:'Selección',checkbox:'Casilla'};
export async function renderForms(ctx){
 const host=document.getElementById('record-list');
 const path='/api/app/'+encodeURIComponent(ctx.config.tenant.slug)+'/workflows/forms';
 const canWrite=ctx.config.tenant.role!=='viewer';
 const stats=container('cards'),builder=container('card-soft'),list=container('stack');
 const titleF=field('form-title','Nombre del formulario');
 const descF=field('form-desc','Descripción','textarea');
 titleF.input.required=true;
 const fieldRows=container('stack');
 function fieldRow(){
  const row=container('toolbar');
  const label=document.createElement('input');label.className='search';label.placeholder='Etiqueta del campo';label.required=true;label.maxLength=120;
  const type=document.createElement('select');type.className='search';
  for(const [value,text] of Object.entries(typeLabels))type.add(new Option(text,value));
  const options=document.createElement('input');options.className='search';options.placeholder='Opciones (coma, solo selección)';options.hidden=true;
  type.addEventListener('change',()=>{options.hidden=type.value!=='select';},{signal:ctx.signal});
  const req=document.createElement('input');req.type='checkbox';
  const reqLabel=document.createElement('label');reqLabel.textContent='Obligatorio';
  const del=button('Quitar');
  del.addEventListener('click',()=>row.remove(),{signal:ctx.signal});
  row.append(label,type,options,req,reqLabel,del);
  return row;
 }
 fieldRows.append(fieldRow());
 const addField=button('Agregar campo');
 addField.addEventListener('click',()=>fieldRows.append(fieldRow()),{signal:ctx.signal});
 const save=button('Crear formulario','btn btn-primary');save.type='submit';
 const form=document.createElement('form');form.className='stack';
 const grid=container('field-grid');grid.append(titleF.holder,descF.holder);
 form.append(grid,line('Campos del formulario','group-label'),fieldRows,addField,save);
 builder.append(line('Constructor de formularios','group-label'),form);
 host.replaceChildren(stats);if(canWrite)host.append(builder);host.append(list);
 let forms=[];
 async function reload(){
  const result=await ctx.api(path);if(ctx.signal.aborted)return;
  forms=result.forms||[];draw();
 }
 function draw(){
  if(ctx.signal.aborted)return;
  stats.replaceChildren();list.replaceChildren();
  for(const [name,value] of [['Formularios',forms.length],
   ['Respuestas totales',forms.reduce((s,f)=>s+(f.submissions||0),0)]]){
   const s=container('stat');s.append(line(name,'stat-label'),line(String(value),'stat-number'));stats.append(s);
  }
  const q=ctx.search.value.trim().toLowerCase();
  const visible=forms.filter(f=>f.title.toLowerCase().includes(q));
  document.getElementById('record-count').textContent=visible.length+' formularios';
  if(!visible.length){list.append(line('No hay formularios. Crea el primero con el constructor.','empty'));return;}
  for(const f of visible){
   const card=container('record'),info=container('stack');
   const strong=document.createElement('strong');strong.textContent=f.title;info.append(strong);
   info.append(line((f.description||'Sin descripción')+' · '+f.fields.length+' campos · '+f.submissions+' respuestas','help'));
   const answer=document.createElement('form');answer.className='stack';
   const inputs={};
   for(const fld of f.fields){
    const holder=document.createElement('div');holder.className='field';
    const tag=document.createElement('label');tag.textContent=fld.label+(fld.required?' *':'');
    let input;
    if(fld.type==='select'){input=document.createElement('select');input.add(new Option('Selecciona…',''));for(const o of fld.options)input.add(new Option(o,o));}
    else if(fld.type==='checkbox'){input=document.createElement('input');input.type='checkbox';}
    else if(fld.type==='textarea'){input=document.createElement('textarea');}
    else{input=document.createElement('input');input.type=fld.type==='number'?'number':fld.type==='date'?'date':'text';}
    input.required=Boolean(fld.required);
    input.id='ans-'+f.id+'-'+fld.key;tag.htmlFor=input.id;
    inputs[fld.key]=input;holder.append(tag,input);answer.append(holder);
   }
   const send=button('Enviar respuesta','btn btn-primary');send.type='submit';
   answer.append(send);
   answer.addEventListener('submit',async e=>{
    e.preventDefault();send.disabled=true;
    try{
     const answers={};
     for(const fld of f.fields){
      const input=inputs[fld.key];
      if(fld.type==='checkbox')answers[fld.key]=input.checked;
      else if(fld.type==='number')answers[fld.key]=input.value===''?null:Number(input.value);
      else answers[fld.key]=input.value||null;
     }
     await ctx.write(path+'/'+f.id+'/submissions','POST',answers);
     ctx.notice('Respuesta registrada.');answer.reset();await reload();
    }catch(ex){ctx.notice('No se registró la respuesta: '+ex.message,true);}
    finally{send.disabled=false;}
   },{signal:ctx.signal});
   info.append(answer);
   const tools=container('toolbar');
   const csv=document.createElement('a');csv.className='btn';csv.textContent='Exportar respuestas (CSV)';
   csv.href=path+'/'+f.id+'/submissions/export';
   tools.append(csv);
   if(canWrite){
    const arch=button('Archivar formulario','btn btn-danger');
    arch.addEventListener('click',async()=>{
     if(!confirm('¿Archivar este formulario y sus respuestas?'))return;
     try{await ctx.write(path+'/'+f.id,'DELETE');ctx.notice('Formulario archivado.');await reload();}
     catch(e){ctx.notice('No se pudo archivar: '+e.message,true);}
    },{signal:ctx.signal});
    tools.append(arch);
   }
   info.append(tools);
   card.append(info);list.append(card);
  }
 }
 form.addEventListener('submit',async e=>{
  e.preventDefault();save.disabled=true;
  try{
   const fields=[];
   for(const row of fieldRows.querySelectorAll('.toolbar')){
    const [label,type,options,req]=row.querySelectorAll('input,select');
    fields.push({key:label.value.trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')||('campo'+(fields.length+1)),
     label:label.value.trim(),type:type.value,required:req.checked,
     options:type.value==='select'?options.value.split(',').map(s=>s.trim()).filter(Boolean):[]});
   }
   await ctx.write(path,'POST',{title:titleF.input.value.trim(),description:descF.input.value.trim(),fields});
   ctx.notice('Formulario creado.');form.reset();fieldRows.replaceChildren(fieldRow());await reload();
  }catch(ex){ctx.notice('No se creó: '+ex.message,true);}
  finally{save.disabled=false;}
 },{signal:ctx.signal});
 ctx.search.addEventListener('input',draw,{signal:ctx.signal});
 document.getElementById('module-message').textContent='Constructor real: las respuestas se validan y se guardan como registros del formulario.';
 try{await reload();}catch(e){ctx.notice('Error al consultar formularios: '+e.message,true);}
}
