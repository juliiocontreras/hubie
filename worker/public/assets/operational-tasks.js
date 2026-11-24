// T004 Tareas reales (frente P1-A): responsable del equipo, vencimiento,
// estados y filtro por responsable y vencimiento. Al vencer, el servidor
// intenta avisar (ver INTEGRATION.md: tenant_notifications es del frente 020).
import {field,line,date,button,container} from './app-workflows.js';
const statuses={pending:'Pendiente',in_progress:'En curso',done:'Hecha'};
export async function renderTasks(ctx){
 const host=document.getElementById('record-list');
 const path='/api/app/'+encodeURIComponent(ctx.config.tenant.slug)+'/workflows/tasks';
 const canWrite=ctx.config.tenant.role!=='viewer';
 const stats=container('cards'),editor=container('card-soft'),filters=container('toolbar'),list=container('stack');
 const form=document.createElement('form');form.className='stack';
 const fields={title:field('task-title','Tarea'),
  assignee:field('task-assignee','Responsable (miembro del equipo)','select',[['','Sin responsable']]),
  dueOn:field('task-due','Vencimiento','date'),
  priority:field('task-priority','Prioridad','select',[['low','Baja'],['normal','Normal'],['high','Alta']]),
  notes:field('task-notes','Notas','textarea')};
 fields.title.input.required=true;
 const grid=container('field-grid');for(const {holder} of Object.values(fields))grid.append(holder);
 form.append(grid);
 const save=button('Crear tarea','btn btn-primary');save.type='submit';
 const cancel=button('Cancelar edición');cancel.hidden=true;
 const actions=container('toolbar');actions.append(save,cancel);form.append(actions);
 editor.append(line('Tareas con responsable y vencimiento','group-label'),form);
 const fAssignee=document.createElement('select');fAssignee.className='search';
 fAssignee.add(new Option('Todos los responsables',''));
 const fStatus=document.createElement('select');fStatus.className='search';
 fStatus.add(new Option('Todos los estados',''));
 for(const [value,label] of Object.entries(statuses))fStatus.add(new Option(label,value));
 const fOverdue=document.createElement('input');fOverdue.type='checkbox';fOverdue.id='task-filter-overdue';
 const fOverdueLabel=document.createElement('label');fOverdueLabel.htmlFor='task-filter-overdue';fOverdueLabel.textContent='Solo vencidas';
 const fFrom=document.createElement('input');fFrom.type='date';fFrom.className='search';fFrom.title='Vence desde';
 const fTo=document.createElement('input');fTo.type='date';fTo.className='search';fTo.title='Vence hasta';
 filters.append(fAssignee,fStatus,fOverdue,fOverdueLabel,fFrom,fTo);
 host.replaceChildren(stats);if(canWrite)host.append(editor);host.append(filters,list);
 let tasks=[],members=[],editing=null,noticeInfo=null;
 const reset=()=>{editing=null;form.reset();save.textContent='Crear tarea';cancel.hidden=true;};
 cancel.addEventListener('click',reset,{signal:ctx.signal});
 async function reload(){
  const query=new URLSearchParams();
  if(fAssignee.value)query.set('assignee',fAssignee.value);
  if(fStatus.value)query.set('status',fStatus.value);
  if(fOverdue.checked)query.set('overdue','1');
  if(fFrom.value)query.set('dueFrom',fFrom.value);
  if(fTo.value)query.set('dueTo',fTo.value);
  const result=await ctx.api(path+(query.toString()?'?'+query.toString():''));
  if(ctx.signal.aborted)return;
  tasks=result.tasks||[];members=result.members||[];noticeInfo=result.notifications||null;
  const prev=fAssignee.value;
  fAssignee.replaceChildren(new Option('Todos los responsables',''));
  for(const m of members)fAssignee.add(new Option(m.email+' · '+m.role,m.userId));
  fAssignee.value=members.some(m=>m.userId===prev)?prev:'';
  const prevForm=fields.assignee.input.value;
  fields.assignee.input.replaceChildren(new Option('Sin responsable',''));
  for(const m of members)fields.assignee.input.add(new Option(m.email+' · '+m.role,m.userId));
  fields.assignee.input.value=members.some(m=>m.userId===prevForm)?prevForm:'';
  draw();
 }
 function draw(){
  if(ctx.signal.aborted)return;
  stats.replaceChildren();list.replaceChildren();
  for(const [name,value] of [['Pendientes',tasks.filter(t=>t.status==='pending').length],
   ['En curso',tasks.filter(t=>t.status==='in_progress').length],
   ['Hechas',tasks.filter(t=>t.status==='done').length],
   ['Vencidas',tasks.filter(t=>t.overdue).length]]){
   const s=container('stat');s.append(line(name,'stat-label'),line(String(value),'stat-number'));stats.append(s);
  }
  if(noticeInfo&&(noticeInfo.created||noticeInfo.pending))
   list.append(line(noticeInfo.created?noticeInfo.created+' aviso(s) de vencimiento enviado(s).':'Aviso de vencimiento pendiente: la bandeja de notificaciones (C010) aún no existe en este tenant.','help'));
  const q=ctx.search.value.trim().toLowerCase();
  const visible=tasks.filter(t=>(t.title+' '+(t.assigneeEmail||'')+' '+(t.notes||'')).toLowerCase().includes(q));
  document.getElementById('record-count').textContent=visible.length+' tareas';
  if(!visible.length){list.append(line('No hay tareas con estos filtros.','empty'));return;}
  for(const t of visible){
   const card=container('record'),info=container('stack');
   const strong=document.createElement('strong');strong.textContent=t.title;info.append(strong);
   info.append(line(statuses[t.status]+' · '+(t.assigneeEmail||'Sin responsable')+
    (t.dueOn?' · vence '+t.dueOn:' · sin vencimiento')+' · Prioridad '+t.priority+
    (t.overdue?' · VENCIDA':t.dueBucket==='today'?' · Vence hoy':''),'help'));
   if(t.notes)info.append(line(t.notes,'help'));
   card.append(info);
   if(canWrite){
    const buttons=container('record-actions');
    const edit=button('Editar');
    edit.addEventListener('click',()=>{
     editing=t.id;fields.title.input.value=t.title;fields.assignee.input.value=t.assigneeUserId||'';
     fields.dueOn.input.value=t.dueOn||'';fields.priority.input.value=t.priority;fields.notes.input.value=t.notes||'';
     save.textContent='Guardar tarea';cancel.hidden=false;fields.title.input.focus();
    },{signal:ctx.signal});buttons.append(edit);
    if(t.status!=='done'){
     const next=button(t.status==='pending'?'Empezar':'Marcar hecha','btn btn-primary');
     next.addEventListener('click',async()=>{
      try{await ctx.write(path+'/'+t.id,'PATCH',{status:t.status==='pending'?'in_progress':'done'});
       ctx.notice('Tarea actualizada.');await reload();}
      catch(e){ctx.notice('No se pudo actualizar: '+e.message,true);}
     },{signal:ctx.signal});buttons.append(next);
    }
    const arch=button('Archivar','btn btn-danger');
    arch.addEventListener('click',async()=>{
     if(!confirm('¿Archivar esta tarea?'))return;
     try{await ctx.write(path+'/'+t.id,'DELETE');ctx.notice('Tarea archivada.');await reload();}
     catch(e){ctx.notice('No se pudo archivar: '+e.message,true);}
    },{signal:ctx.signal});buttons.append(arch);
    card.append(buttons);
   }
   list.append(card);
  }
 }
 form.addEventListener('submit',async e=>{
  e.preventDefault();save.disabled=true;
  try{
   const body={title:fields.title.input.value.trim(),notes:fields.notes.input.value.trim(),
    assigneeUserId:fields.assignee.input.value||null,dueOn:fields.dueOn.input.value||null,
    priority:fields.priority.input.value};
   await ctx.write(path+(editing?'/'+editing:''),editing?'PATCH':'POST',body);
   ctx.notice('Tarea guardada.');reset();await reload();
  }catch(ex){ctx.notice('No se guardó: '+ex.message,true);}
  finally{save.disabled=false;}
 },{signal:ctx.signal});
 for(const el of [fAssignee,fStatus,fOverdue,fFrom,fTo])el.addEventListener('change',()=>void reload(),{signal:ctx.signal});
 ctx.search.addEventListener('input',draw,{signal:ctx.signal});
 document.getElementById('module-message').textContent='Responsable real del equipo, vencimiento y estados. Las vencidas intentan avisar cuando exista la bandeja de notificaciones.';
 try{await reload();}catch(e){ctx.notice('Error al consultar tareas: '+e.message,true);}
}
