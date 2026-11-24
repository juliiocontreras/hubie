// T003 Checklists reales (frente P1-A): plantillas reutilizables, checklists
// con ítems verificables (responsable, vencimiento, evidencia) y progreso.
import {field,line,button,container} from './app-workflows.js';
export async function renderChecklists(ctx){
 const host=document.getElementById('record-list');
 const path='/api/app/'+encodeURIComponent(ctx.config.tenant.slug)+'/workflows/checklists';
 const canWrite=ctx.config.tenant.role!=='viewer';
 const stats=container('cards'),tplEditor=container('card-soft'),editor=container('card-soft'),list=container('stack');
 const tplForm=document.createElement('form');tplForm.className='stack';
 const tplFields={title:field('tpl-title','Nombre de la plantilla'),
  description:field('tpl-desc','Descripción','textarea'),
  items:field('tpl-items','Ítems (uno por línea)','textarea')};
 tplFields.title.input.required=true;tplFields.items.input.required=true;
 const tplGrid=container('field-grid');for(const {holder} of Object.values(tplFields))tplGrid.append(holder);
 tplForm.append(tplGrid);
 const tplSave=button('Guardar plantilla','btn btn-primary');tplSave.type='submit';
 tplForm.append(tplSave);
 tplEditor.append(line('Plantillas reutilizables','group-label'),tplForm);
 const form=document.createElement('form');form.className='stack';
 const fields={title:field('check-title','Nombre del checklist'),
  templateId:field('check-template','Crear desde plantilla','select',[['','Checklist nuevo (sin plantilla)']]),
  items:field('check-items','Ítems propios (uno por línea, solo si no usas plantilla)','textarea')};
 fields.title.input.required=true;
 const grid=container('field-grid');for(const {holder} of Object.values(fields))grid.append(holder);
 form.append(grid);
 const save=button('Crear checklist','btn btn-primary');save.type='submit';
 form.append(save);
 editor.append(line('Checklist con ítems verificables','group-label'),form);
 host.replaceChildren(stats);if(canWrite)host.append(tplEditor,editor);host.append(list);
 let checklists=[],templates=[],members=[];
 const reset=()=>{form.reset();save.textContent='Crear checklist';};
 async function reload(){
  const [mine,tpl]=await Promise.all([ctx.api(path),ctx.api(path+'/templates')]);
  if(ctx.signal.aborted)return;
  checklists=mine.checklists||[];templates=tpl.templates||[];members=mine.members||[];
  const prev=fields.templateId.input.value;
  fields.templateId.input.replaceChildren(new Option('Checklist nuevo (sin plantilla)',''));
  for(const t of templates)fields.templateId.input.add(new Option(t.title+' ('+t.items.length+' ítems)',t.id));
  fields.templateId.input.value=templates.some(t=>t.id===prev)?prev:'';
  draw();ctx.attachmentsPanel?.update(checklists.map(c=>({id:c.id,title:c.title})));
 }
 function draw(){
  if(ctx.signal.aborted)return;
  stats.replaceChildren();list.replaceChildren();
  const total=checklists.reduce((s,c)=>s+c.progress.total,0);
  const done=checklists.reduce((s,c)=>s+c.progress.checked,0);
  for(const [name,value] of [['Checklists activos',checklists.length],['Plantillas',templates.length],
   ['Ítems verificados',done+' / '+total]]) {
   const s=container('stat');s.append(line(name,'stat-label'),line(String(value),'stat-number'));stats.append(s);
  }
  const q=ctx.search.value.trim().toLowerCase();
  const visible=checklists.filter(c=>(c.title+' '+(c.templateTitle||'')).toLowerCase().includes(q));
  document.getElementById('record-count').textContent=visible.length+' checklists';
  if(!visible.length){list.append(line('No hay checklists. Crea una plantilla o un checklist para empezar.','empty'));return;}
  for(const c of visible){
   const card=container('record'),info=container('stack');
   const strong=document.createElement('strong');strong.textContent=c.title;info.append(strong);
   info.append(line('Progreso: '+c.progress.checked+'/'+c.progress.total+' ('+c.progress.percent+'%)'+
    (c.templateTitle?' · Plantilla: '+c.templateTitle:'')+' · '+(c.status==='completed'?'Completado':'Abierto'),'help'));
   const bar=document.createElement('div');bar.className='progress';
   const fill=document.createElement('div');fill.className='progress-fill';fill.style.width=c.progress.percent+'%';
   bar.append(fill);info.append(bar);
   for(const item of c.items){
    const row=container('line');
    const check=document.createElement('input');check.type='checkbox';check.checked=Boolean(item.checkedAt);
    check.disabled=!canWrite;
    check.addEventListener('change',async()=>{
     try{await ctx.write(path+'/'+c.id+'/items/'+item.id,'PATCH',{checked:check.checked});
      ctx.notice(check.checked?'Ítem verificado.':'Ítem reabierto.');await reload();}
     catch(e){ctx.notice('No se pudo actualizar: '+e.message,true);check.checked=!check.checked;}
    },{signal:ctx.signal});
    const label=document.createElement('span');
    label.textContent=item.title+(item.assigneeEmail?' · '+item.assigneeEmail:'')+(item.dueOn?' · vence '+item.dueOn:'')+
     (item.checkedAt?' · verificado':'')+(item.evidenceName?' · evidencia: '+item.evidenceName:'');
    if(item.checkedAt)label.style.textDecoration='line-through';
    row.append(check,label);info.append(row);
   }
   if(canWrite){
    const add=document.createElement('form');add.className='toolbar';
    const title=document.createElement('input');title.className='search';title.placeholder='Nuevo ítem';title.required=true;title.maxLength=180;
    const who=document.createElement('select');who.className='search';who.style.maxWidth='170px';
    who.add(new Option('Sin responsable',''));
    for(const m of members)who.add(new Option(m.email,m.userId));
    const due=document.createElement('input');due.type='date';due.className='search';due.style.maxWidth='140px';
    const evidence=document.createElement('input');evidence.className='search';evidence.style.maxWidth='150px';
    evidence.placeholder='ID evidencia (adjunto)';evidence.title='ID del adjunto en pwa_media, del panel de adjuntos del checklist';
    const go=button('Agregar ítem','btn');go.type='submit';
    add.append(title,who,due,evidence,go);
    add.addEventListener('submit',async e=>{
     e.preventDefault();go.disabled=true;
     try{await ctx.write(path+'/'+c.id+'/items','POST',{title:title.value.trim(),assigneeUserId:who.value||null,
       dueOn:due.value||null,evidenceMediaId:evidence.value.trim()||null});
      ctx.notice('Ítem agregado.');await reload();}
     catch(ex){ctx.notice('No se agregó: '+ex.message,true);}
     finally{go.disabled=false;}
    },{signal:ctx.signal});
    info.append(add);
    const arch=button('Archivar checklist','btn btn-danger');
    arch.addEventListener('click',async()=>{
     if(!confirm('¿Archivar este checklist?'))return;
     try{await ctx.write(path+'/'+c.id,'DELETE');ctx.notice('Checklist archivado.');await reload();}
     catch(e){ctx.notice('No se pudo archivar: '+e.message,true);}
    },{signal:ctx.signal});
    info.append(arch);
   }
   card.append(info);list.append(card);
  }
 }
 tplForm.addEventListener('submit',async e=>{
  e.preventDefault();tplSave.disabled=true;
  try{
   const items=tplFields.items.input.value.split('\n').map(s=>s.trim()).filter(Boolean);
   await ctx.write(path+'/templates','POST',{title:tplFields.title.input.value.trim(),
    description:tplFields.description.input.value.trim(),items});
   ctx.notice('Plantilla guardada.');tplForm.reset();await reload();
  }catch(ex){ctx.notice('No se guardó la plantilla: '+ex.message,true);}
  finally{tplSave.disabled=false;}
 },{signal:ctx.signal});
 form.addEventListener('submit',async e=>{
  e.preventDefault();save.disabled=true;
  try{
   const templateId=fields.templateId.input.value||null;
   const items=templateId?undefined:fields.items.input.value.split('\n').map(s=>s.trim()).filter(Boolean);
   await ctx.write(path,'POST',{title:fields.title.input.value.trim(),templateId,items});
   ctx.notice('Checklist creado.');reset();await reload();
  }catch(ex){ctx.notice('No se creó: '+ex.message,true);}
  finally{save.disabled=false;}
 },{signal:ctx.signal});
 ctx.search.addEventListener('input',draw,{signal:ctx.signal});
 document.getElementById('module-message').textContent='Plantillas reutilizables, ítems con responsable y fecha, y evidencia enlazada a adjuntos.';
 try{await reload();}catch(e){ctx.notice('Error al consultar checklists: '+e.message,true);}
}
