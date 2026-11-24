// Proyectos (T025) — panel de Operación: tablero con KPIs, avance por
// proyecto, dona de tareas, equipo y detalle con hitos, tareas reales
// (T004) y tablero Kanban (T005).
// Contrato real: platform/projects-store.mjs + projects-domain.mjs
// (migración 030). Todo contra /api/app/<slug>/projects/...; si la API
// falla se muestra el error, nunca se inventan filas.
// Composición del tablero según la referencia de Julio (FlowTask, suite
// Office, ~/workspace/hubie-design-refs/ — no va al repo): fila de 4 KPI
// con círculo de icono, avance por proyecto con barras, dona de tareas y
// equipo. Sin variación % contra el mes anterior: no hay histórico
// guardado y no se inventa. Sin emojis, sin texto azul: barras y dona en
// morado/gradiente Hubie; verde/ámbar/rojo solo como color semántico en
// píldoras de estado/prioridad. A 390 px todo se apila.
// Marca Hubie: Nunito, tinta #16123a, morado #7c5cfc, rosa #ec4899.
import {field,line,button,container} from './app-workflows.js';
import {icon} from './ui-icons.js';
const demoMode=new URLSearchParams(location.search).get('demo')==='1';
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const PROJECT_STATUSES={planificado:'Planificado','en curso':'En curso','en pausa':'En pausa',completado:'Completado',cancelado:'Cancelado'};
const MILESTONE_STATUSES={pendiente:'Pendiente',completado:'Completado',cancelado:'Cancelado'};
const TASK_STATUSES={pending:'Pendiente',in_progress:'En curso',done:'Hecha'};
const TASK_PRIORITIES={low:'Baja',normal:'Normal',high:'Alta'};
const fmtDay=iso=>iso?new Date(String(iso).slice(0,10)+'T00:00:00').toLocaleDateString('es-MX',{dateStyle:'medium'}):'—';
const pct=n=>n===null||n===undefined?'—':Math.max(0,Math.min(100,Math.round(Number(n)||0)))+'%';
const statusPill=status=>{const p=el('span',PROJECT_STATUSES[status]||status,'pill');
 if(status==='completado')p.classList.add('pill-ok');
 else if(status==='en pausa')p.classList.add('pill-warn');
 else if(status==='cancelado')p.classList.add('pill-bad');
 else p.classList.add('pill-info');
 return p;};
const priorityPill=priority=>{const p=el('span',TASK_PRIORITIES[priority]||priority,'pill');
 if(priority==='high')p.classList.add('pill-bad');
 else if(priority==='low')p.classList.add('pill-ok');
 else p.classList.add('pill-info');
 return p;};
function progressBar(percent){
 const track=el('div',undefined,'progress-track');
 const bar=el('div');bar.className='progress-bar';bar.style.width=Math.max(0,Math.min(100,Number(percent)||0))+'%';
 track.append(bar);return track;
}
// Dona SVG en morado/gradiente Hubie (sin verde/ámbar/rojo: la dona es
// gráfica, no píldora de estado).
function donut(done,inProgress,pending){
 const total=done+inProgress+pending,r=34,c=2*Math.PI*r;
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('width','120');svg.setAttribute('height','120');
 svg.setAttribute('role','img');svg.setAttribute('aria-label','Tareas: '+done+' hechas, '+inProgress+' en curso, '+pending+' pendientes');
 const mk=(color,frac,offset)=>{
  const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
  circle.setAttribute('cx','50');circle.setAttribute('cy','50');circle.setAttribute('r',String(r));
  circle.setAttribute('fill','none');circle.setAttribute('stroke',color);circle.setAttribute('stroke-width','13');
  circle.setAttribute('stroke-dasharray',(frac*c).toFixed(1)+' '+c.toFixed(1));
  circle.setAttribute('stroke-dashoffset',(-offset*c).toFixed(1));
  circle.setAttribute('transform','rotate(-90 50 50)');
  svg.append(circle);
 };
 if(total===0){mk('#eceaf6',1,0);}
 else{
  let offset=0;
  for(const [color,value] of [['#7c5cfc',done],['#a855f7',inProgress],['#d9d4f5',pending]]){
   const frac=value/total;
   if(frac>0)mk(color,frac,offset);
   offset+=frac;
  }
 }
 const center=document.createElementNS('http://www.w3.org/2000/svg','text');
 center.setAttribute('x','50');center.setAttribute('y','54');center.setAttribute('text-anchor','middle');
 center.setAttribute('font-size','20');center.setAttribute('font-weight','800');center.setAttribute('fill','#16123a');
 center.textContent=String(total);svg.append(center);
 return svg;
}

export async function renderProjects(ctx){
 const slug=encodeURIComponent(ctx.config.tenant.slug),base='/api/app/'+slug+'/projects';
 const kanbanBase='/api/app/'+slug+'/workflows/kanban';
 const canWrite=ctx.config.tenant.role!=='viewer';
 const host=$('record-list');
 const overview=container('cards'),tabsBar=container('toolbar'),panels=container('stack');
 host.replaceChildren(overview,tabsBar,panels);
 $('record-count').textContent='Proyectos';
 if(demoMode)host.prepend(line('Estás en modo demostración: los datos de proyectos son de ejemplo y se guardan solo en esta pestaña.','help'));
 let projects=[],clients=[],members=[],dashboard=null,selectedProjectId=null,detailFor=null;
 let activeTab='dashboard';
 const q=()=>ctx.search.value.trim().toLowerCase();
 const api=async(path,options)=>ctx.api(path,options);
 const write=(path,method,body)=>ctx.write(path,method,body);
 const errLine=(what,e)=>line('No se pudo cargar '+what+': '+e.message,'error');
 function tabButton(key,label){
  const b=button(label,activeTab===key?'btn btn-primary':'btn');
  b.addEventListener('click',()=>{activeTab=key;drawTabs();void showTab();},{signal:ctx.signal});
  return b;
 }
 function drawTabs(){
  tabsBar.replaceChildren();
  for(const [key,label] of [['dashboard','Tablero'],['projects','Proyectos']])tabsBar.append(tabButton(key,label));
 }
 // ---------- Tablero (FlowTask) ----------
 const dashPanel=container('stack');
 async function loadDashboard(){
  try{dashboard=await api(base+'/dashboard');}catch(e){dashboard=null;dashPanel.replaceChildren(errLine('el tablero',e));return;}
  drawDashboard();
 }
 function kpi(iconName,label,value){
  const card=container('kpi');
  const badge=el('span',undefined,'kpi-icon');badge.append(icon(iconName,22));
  const info=container('stack');
  info.append(el('span',label,'kpi-label'),el('div',String(value),'kpi-number'));
  card.append(badge,info);return card;
 }
 function drawDashboard(){
  dashPanel.replaceChildren(line('Tablero de proyectos','group-label'));
  if(!dashboard){dashPanel.append(line('Cargando tablero…','help'));return;}
  const k=dashboard.kpis||{};
  const kpis=container('kpi-grid');
  kpis.append(
   kpi('folder','Proyectos activos',k.activeProjects??0),
   kpi('check','Tareas completadas',k.tasksCompleted??0),
   kpi('clock','Tareas pendientes',(k.tasksPending??0)+(k.tasksInProgress??0)),
   kpi('users','Miembros del equipo',k.teamMembers??0));
  dashPanel.append(kpis);
  const middle=container('two-col');
  const progressCard=container('card-soft'),donutCard=container('card-soft');
  progressCard.append(line('Avance de proyectos','group-label'));
  const progressList=container('stack');
  if(!(dashboard.projectProgress||[]).length)progressList.append(line('Sin proyectos todavía. Crea el primero en la pestaña Proyectos.','empty'));
  for(const p of dashboard.projectProgress||[]){
   const row=container('stack');
   const head=container('toolbar');
   head.append(el('strong',p.name),el('span',pct(p.percent)));
   row.append(head,progressBar(p.percent),
    line([(PROJECT_STATUSES[p.status]||p.status),(p.milestonesDone??0)+' de '+(p.milestonesTotal??0)+' hitos',(p.tasksDone??0)+' de '+(p.tasksTotal??0)+' tareas'].join(' · '),'help'));
   progressList.append(row);
  }
  progressCard.append(progressList);
  const byStatus=dashboard.tasksByStatus||{};
  donutCard.append(line('Tareas','group-label'));
  const donutWrap=container('toolbar');
  donutWrap.append(donut(byStatus.done||0,byStatus.inProgress||0,byStatus.pending||0));
  const legend=container('stack');
  for(const [label,value] of [['Hechas',byStatus.done||0],['En curso',byStatus.inProgress||0],['Pendientes',byStatus.pending||0]])
   legend.append(line(label+': '+value,'help'));
  legend.append(line('Total: '+((byStatus.done||0)+(byStatus.inProgress||0)+(byStatus.pending||0))+' tareas de proyectos','help'));
  donutWrap.append(legend);
  donutCard.append(donutWrap);
  middle.append(progressCard,donutCard);
  dashPanel.append(middle);
  const teamCard=container('card-soft');
  teamCard.append(line('Equipo','group-label'));
  const teamList=container('stack');
  if(!(dashboard.team||[]).length)teamList.append(line('Sin miembros del equipo todavía.','empty'));
  for(const m of dashboard.team||[]){
   const row=container('record');
   const info=container('stack');
   info.append(el('strong',m.email||''),line(m.role||'','help'));
   const pill=el('span',(m.activeTasks??0)+' '+(m.activeTasks===1?'tarea activa':'tareas activas'),'pill');
   if((m.activeTasks??0)>0)pill.classList.add('pill-info');
   row.append(info,pill);teamList.append(row);
  }
  teamCard.append(teamList);
  dashPanel.append(teamCard);
  overview.replaceChildren();
  for(const [label,value] of [['Proyectos activos',String(k.activeProjects??0)],['Tareas completadas',String(k.tasksCompleted??0)],
   ['Tareas pendientes',String((k.tasksPending??0)+(k.tasksInProgress??0))],['Miembros del equipo',String(k.teamMembers??0)]]){
   const card=container('stat');card.append(el('span',label,'stat-label'),el('div',value,'stat-number'));overview.append(card);
  }
 }
 // ---------- Proyectos ----------
 const projectsPanel=container('stack');
 const projectForm=el('form');projectForm.className='stack';
 const pf={
  name:field('pj-name','Nombre del proyecto'),
  client:field('pj-client','Cliente (opcional)','select',[['','Sin cliente']]),
  owner:field('pj-owner','Responsable (opcional)','select',[['','Sin responsable']]),
  startsOn:field('pj-start','Inicio','date'),
  endsOn:field('pj-end','Fin','date'),
  status:field('pj-status','Estado','select',Object.entries(PROJECT_STATUSES)),
  description:field('pj-desc','Descripción','textarea')
 };
 pf.name.input.required=true;pf.name.input.minLength=3;
 const projectGrid=container('field-grid');
 for(const f of Object.values(pf))projectGrid.append(f.holder);
 const projectSave=button('Crear proyecto','btn btn-primary');projectSave.type='submit';
 const projectCancel=button('Cancelar edición');projectCancel.hidden=true;
 const projectActions=container('toolbar');projectActions.append(projectSave,projectCancel);
 projectForm.append(line('Crear o editar proyecto','group-label'),projectGrid,projectActions);
 let editingProject=null;
 function resetProjectForm(){
  editingProject=null;projectForm.reset();projectSave.textContent='Crear proyecto';projectCancel.hidden=true;
 }
 projectCancel.addEventListener('click',resetProjectForm,{signal:ctx.signal});
 projectForm.addEventListener('submit',async ev=>{
  ev.preventDefault();projectSave.disabled=true;
  const body={name:pf.name.input.value.trim(),description:pf.description.input.value.trim(),
   clientId:pf.client.input.value||null,ownerUserId:pf.owner.input.value||null,
   startsOn:pf.startsOn.input.value||null,endsOn:pf.endsOn.input.value||null,status:pf.status.input.value};
  try{
   if(editingProject)await write(base+'/'+editingProject,'PATCH',body);
   else await write(base,'POST',body);
   ctx.notice(editingProject?'Proyecto actualizado.':'Proyecto creado.');
   resetProjectForm();await loadProjects();await loadDashboard();
  }catch(e){ctx.notice('No se pudo guardar el proyecto: '+e.message,true);}
  finally{projectSave.disabled=false;}
 },{signal:ctx.signal});
 const projectList=container('stack');
 const detailPanel=container('card-soft');
 async function loadClients(){
  try{const d=await api('/api/app/'+slug+'/workflows/clients');clients=d.clients||[];}
  catch{clients=[];}
  pf.client.input.replaceChildren(new Option('Sin cliente',''));
  for(const c of clients)pf.client.input.add(new Option((c.name||'')+(c.company?' · '+c.company:''),c.id));
 }
 async function loadMembers(){
  try{const d=await api('/api/app/'+slug+'/workflows/tasks');members=d.members||[];}
  catch{members=(dashboard?.team||[]).map(m=>({userId:m.userId,email:m.email,role:m.role}));}
  pf.owner.input.replaceChildren(new Option('Sin responsable',''));
  for(const m of members)pf.owner.input.add(new Option(m.email,m.userId));
 }
 async function loadProjects(){
  try{const d=await api(base);projects=d.projects||[];}catch(e){projects=[];projectList.replaceChildren(errLine('los proyectos',e));return;}
  drawProjects();
 }
 function drawProjects(){
  projectsPanel.replaceChildren();
  if(canWrite)projectsPanel.append(projectForm);
  projectsPanel.append(line('Proyectos','group-label'),projectList);
  const visible=projects.filter(p=>(p.name||'').toLowerCase().includes(q()));
  $('record-count').textContent=visible.length+' proyectos';
  projectList.replaceChildren();
  if(!visible.length){projectList.append(line(projects.length?'Sin proyectos con ese nombre.':'Sin proyectos todavía. Crea el primero con el formulario de arriba.','empty'));}
  for(const p of visible){
   const row=container('record survey-card'),info=container('stack');
   const head=container('toolbar');
   head.append(el('strong',p.name),statusPill(p.status));
   info.append(head,
    line([p.clientName?('Cliente: '+p.clientName):'',p.ownerEmail?('Responsable: '+p.ownerEmail):'',
     p.startsOn?('Inicio: '+fmtDay(p.startsOn)):'',p.endsOn?('Fin: '+fmtDay(p.endsOn)):'',
     'Avance: '+pct(p.progress?.percent)+' ('+(p.progress?.milestones?.done??0)+' de '+(p.progress?.milestones?.total??0)+' hitos · '+(p.progress?.tasks?.done??0)+' de '+(p.progress?.tasks?.total??0)+' tareas)'].filter(Boolean).join(' · '),'help'));
   info.append(progressBar(p.progress?.percent||0));
   if(p.description)info.append(line(p.description,'help'));
   const actions=container('record-actions');
   const detail=button('Detalle','btn btn-primary');
   detail.addEventListener('click',()=>{selectedProjectId=p.id;void showProjectDetail();},{signal:ctx.signal});
   actions.append(detail);
   if(canWrite){
    const edit=button('Editar','btn');
    edit.addEventListener('click',()=>{editingProject=p.id;pf.name.input.value=p.name||'';pf.client.input.value=p.clientId||'';
     pf.owner.input.value=p.ownerUserId||'';pf.startsOn.input.value=(p.startsOn||'').slice(0,10);pf.endsOn.input.value=(p.endsOn||'').slice(0,10);
     pf.status.input.value=p.status||'planificado';pf.description.input.value=p.description||'';
     projectSave.textContent='Guardar cambios';projectCancel.hidden=false;projectForm.scrollIntoView({block:'center',behavior:'smooth'});},{signal:ctx.signal});
    const next=p.status==='completado'?'planificado':'completado';
    const toggle=button(p.status==='completado'?'Reabrir':'Completar','btn');
    toggle.addEventListener('click',async()=>{
     try{await write(base+'/'+p.id,'PATCH',{status:next});await loadProjects();await loadDashboard();}
     catch(e){ctx.notice(e.message,true);}
    },{signal:ctx.signal});
    actions.append(edit,toggle);
   }
   row.append(info,actions);projectList.append(row);
  }
  projectsPanel.append(detailPanel);
  // No re-renderizar el detalle si ya muestra este proyecto: los
  // formularios del detalle llaman showProjectDetail() y luego
  // loadProjects(), y un segundo render borraba el panel mientras el
  // usuario seguía trabajando en él (carrera con "Cargando detalle…").
  if(selectedProjectId&&detailFor!==selectedProjectId)void showProjectDetail();
 }
 // ---------- Detalle: hitos, tareas y Kanban ----------
 const milestoneList=container('stack');
 const taskList=container('stack');
 const kanbanPanel=container('stack');
 async function showProjectDetail(){
  if(!selectedProjectId)return;
  detailPanel.replaceChildren(line('Cargando detalle…','help'));
  detailFor=null;
  let detail;
  try{detail=await api(base+'/'+selectedProjectId);}
  catch(e){detailPanel.replaceChildren(errLine('el detalle del proyecto',e));return;}
  const p=detail.project;
  detailPanel.replaceChildren(line('Detalle · '+p.name,'group-label'));
  const head=container('stack');
  head.append(line([(PROJECT_STATUSES[p.status]||p.status),p.clientName?('Cliente: '+p.clientName):'',p.ownerEmail?('Responsable: '+p.ownerEmail):'',
   p.startsOn?('Inicio: '+fmtDay(p.startsOn)):'',p.endsOn?('Fin: '+fmtDay(p.endsOn)):''].filter(Boolean).join(' · '),'help'));
  head.append(progressBar(p.progress?.percent||0));
  head.append(line('Avance: '+pct(p.progress?.percent)+' · Hitos: '+(p.progress?.milestones?.done??0)+' de '+(p.progress?.milestones?.total??0)+' · Tareas: '+(p.progress?.tasks?.done??0)+' de '+(p.progress?.tasks?.total??0),'help'));
  detailPanel.append(head);
  // Hitos
  const milestoneForm=el('form');milestoneForm.className='stack';
  const mf={title:field('pj-ms-title','Título del hito'),dueOn:field('pj-ms-due','Fecha','date')};
  mf.title.input.required=true;
  const msGrid=container('field-grid');
  for(const f of Object.values(mf))msGrid.append(f.holder);
  const msSave=button('Agregar hito','btn btn-primary');msSave.type='submit';
  milestoneForm.append(line('Hitos','group-label'),msGrid,msSave);
  milestoneForm.addEventListener('submit',async ev=>{
   ev.preventDefault();msSave.disabled=true;
   try{
    await write(base+'/'+p.id+'/milestones','POST',{title:mf.title.input.value.trim(),dueOn:mf.dueOn.input.value||null});
    ctx.notice('Hito agregado.');milestoneForm.reset();await showProjectDetail();await loadProjects();
   }catch(e){ctx.notice('No se pudo agregar el hito: '+e.message,true);}
   finally{msSave.disabled=false;}
  },{signal:ctx.signal});
  milestoneList.replaceChildren();
  if(!(detail.milestones||[]).length)milestoneList.append(line('Sin hitos todavía.','empty'));
  for(const m of detail.milestones||[]){
   const row=container('record survey-card'),info=container('stack');
   info.append(el('strong',m.title),
    line([(MILESTONE_STATUSES[m.status]||m.status),m.dueOn?('Fecha: '+fmtDay(m.dueOn)):''].filter(Boolean).join(' · '),'help'));
   const actions=container('record-actions');
   if(canWrite&&m.status!=='completado'){
    const done=button('Completar','btn btn-primary');
    done.addEventListener('click',async()=>{
     try{await write(base+'/'+p.id+'/milestones/'+m.id,'PATCH',{status:'completado'});await showProjectDetail();await loadProjects();}
     catch(e){ctx.notice(e.message,true);}
    },{signal:ctx.signal});
    actions.append(done);
   }
   row.append(info,actions);milestoneList.append(row);
  }
  if(canWrite)detailPanel.append(milestoneForm);
  detailPanel.append(milestoneList);
  // Tareas (T004 reales)
  const taskForm=el('form');taskForm.className='stack';
  const tf={title:field('pj-task-title','Título de la tarea'),
   assignee:field('pj-task-assignee','Responsable','select',[['','Sin responsable'],...members.map(m=>[m.userId,m.email])]),
   dueOn:field('pj-task-due','Vencimiento','date'),
   priority:field('pj-task-priority','Prioridad','select',Object.entries(TASK_PRIORITIES))};
  tf.title.input.required=true;
  const taskGrid=container('field-grid');
  for(const f of Object.values(tf))taskGrid.append(f.holder);
  const taskSave=button('Agregar tarea','btn btn-primary');taskSave.type='submit';
  taskForm.append(line('Tareas del proyecto','group-label'),
   line('Las tareas del proyecto son tareas reales: también aparecen en Tareas (T004).','help'),taskGrid,taskSave);
  taskForm.addEventListener('submit',async ev=>{
   ev.preventDefault();taskSave.disabled=true;
   try{
    await write(base+'/'+p.id+'/tasks','POST',{title:tf.title.input.value.trim(),notes:'',
     assigneeUserId:tf.assignee.input.value||null,dueOn:tf.dueOn.input.value||null,status:'pending',priority:tf.priority.input.value});
    ctx.notice('Tarea agregada al proyecto.');taskForm.reset();await showProjectDetail();await loadProjects();await loadDashboard();
   }catch(e){ctx.notice('No se pudo agregar la tarea: '+e.message,true);}
   finally{taskSave.disabled=false;}
  },{signal:ctx.signal});
  taskList.replaceChildren();
  if(!(detail.tasks||[]).length)taskList.append(line('Sin tareas todavía.','empty'));
  for(const t of detail.tasks||[]){
   const row=container('record survey-card'),info=container('stack');
   info.append(el('strong',t.title),
    line([(TASK_STATUSES[t.status]||t.status),t.assigneeEmail?('Responsable: '+t.assigneeEmail):'',t.dueOn?('Vence: '+fmtDay(t.dueOn)):''].filter(Boolean).join(' · '),'help'));
   const actions=container('record-actions');
   actions.append(priorityPill(t.priority));
   if(canWrite){
    const sel=el('select');sel.className='search';sel.setAttribute('aria-label','Estado de la tarea');
    for(const [v,l] of Object.entries(TASK_STATUSES))sel.add(new Option(l,v));
    sel.value=t.status||'pending';
    sel.addEventListener('change',async()=>{
     try{await write(base+'/'+p.id+'/tasks/'+t.id,'PATCH',{status:sel.value});await showProjectDetail();await loadProjects();await loadDashboard();}
     catch(e){ctx.notice(e.message,true);sel.value=t.status||'pending';}
    },{signal:ctx.signal});
    actions.append(sel);
   }
   row.append(info,actions);taskList.append(row);
  }
  if(canWrite)detailPanel.append(taskForm);
  detailPanel.append(taskList);
  // Kanban (T005 reutilizado)
  detailPanel.append(line('Tablero Kanban','group-label'),kanbanPanel);
  await drawKanban(p);
 }
 async function drawKanban(p){
  kanbanPanel.replaceChildren();
  if(!p.kanbanBoardId){
   kanbanPanel.append(line('Este proyecto aún no tiene tablero Kanban.','help'));
   if(canWrite){
    const create=button('Crear tablero','btn btn-primary');
    create.addEventListener('click',async()=>{
     create.disabled=true;
     try{
      await write(base+'/'+p.id+'/board','POST',{});
      ctx.notice('Tablero creado y ligado al proyecto.');await showProjectDetail();await loadProjects();
     }catch(e){ctx.notice('No se pudo crear el tablero: '+e.message,true);}
     finally{create.disabled=false;}
    },{signal:ctx.signal});
    kanbanPanel.append(create,line('El tablero se crea con las fases Por hacer, En curso y Hecho. Requiere Kanban (T005) habilitado en el tenant.','help'));
   }
   return;
  }
  try{
   const data=await api(kanbanBase+'/'+p.kanbanBoardId);
   kanbanPanel.append(line(data.board?.name||p.kanbanBoardName||'', 'group-label'));
   const open=button('Abrir tablero en Kanban','btn');
   open.addEventListener('click',()=>{
    if(typeof ctx.navigateToTool==='function')ctx.navigateToTool('T005');
    else ctx.notice('Abre Kanban (T005) y busca el tablero "'+(data.board?.name||'')+'".');
   },{signal:ctx.signal});
   kanbanPanel.append(open);
   const columns=container('cards');
   for(const phase of data.board?.phases||[]){
    const col=container('card-soft');
    col.append(el('strong',phase.title));
    const cards=(data.cards||[]).filter(c=>c.phaseId===phase.id);
    if(!cards.length)col.append(line('Sin tarjetas en esta fase.','help'));
    for(const c of cards)col.append(line(c.title||c.sourceRecordId,'help'));
    columns.append(col);
   }
   kanbanPanel.append(columns);
  }catch(e){kanbanPanel.replaceChildren(errLine('el tablero Kanban',e));}
  detailFor=selectedProjectId;
 }
 // ---------- Cambio de pestaña y arranque ----------
 const panelsByTab={dashboard:dashPanel,projects:projectsPanel};
 async function showTab(){
  panels.replaceChildren(panelsByTab[activeTab]);
  if(activeTab==='dashboard')await loadDashboard();
  if(activeTab==='projects'){await loadClients();await loadMembers();await loadProjects();}
 }
 ctx.search.addEventListener('input',()=>{
  if(activeTab==='projects')drawProjects();
 },{signal:ctx.signal});
 $('module-message').textContent='Proyectos: tablero con avance, hitos, tareas y tablero Kanban por proyecto.';
 drawTabs();
 try{
  await loadClients();await loadMembers();await loadProjects();await loadDashboard();
 }catch(e){ctx.notice('Error al abrir Proyectos: '+e.message,true);}
 await showTab();
}
