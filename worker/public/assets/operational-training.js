// Capacitaciones (T022) — panel RH real: cursos, sesiones, empleados,
// inscripciones, asistencia, avance, evaluaciones, certificados y tablero.
// Contrato real: platform/training-store.mjs + training-domain.mjs
// (migración 026). Todo contra /api/app/<slug>/training/...; si la API
// falla se muestra el error, nunca se inventan filas.
// Marca Hubie: Nunito, tinta #16123a, morado #7c5cfc, rosa #ec4899.
// Sin emojis como iconografía, sin letras como iconos, sin barras visibles.
import {field,line,button,container,date} from './app-workflows.js';
const demoMode=new URLSearchParams(location.search).get('demo')==='1';
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
function saveBlob(blob,filename){
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
// --- AJUSTE FÁCIL (segunda pasada, con las fotos de referencia de Julio) ---
// `category` es TEXTO LIBRE en el backend (sin enum cerrado): esta lista son
// solo sugerencias del desplegable; añadir o cambiar una categoría es tocar
// este arreglo, sin migrar nada. CERTIFICATE_THEME agrupa el formato visual
// de la constancia (título y prefijo de folio).
export const COURSE_CATEGORIES=['Inducción','Seguridad','Ventas','Atención al cliente','Liderazgo','Técnico','Normativa'];
export const CERTIFICATE_THEME={title:'Constancia de capacitación',issuerLabel:'Otorgada por',folioPrefix:'CAP-'};
const MODALITIES=[['presencial','Presencial'],['en línea','En línea'],['mixta','Mixta']];
const COURSE_STATUSES={borrador:'Borrador',activo:'Activo',archivado:'Archivado'};
const MODULE_TYPES={learning:'Aprendizaje',certification:'Certificación'};
const MODULE_STATUSES={borrador:'Borrador',activo:'Activo',archivado:'Archivado'};
const ENROLL_STATUSES={inscrito:'Inscrito','en curso':'En curso',completado:'Completado',cancelado:'Cancelado'};
const ATTENDANCE={presente:'Presente',ausente:'Ausente',justificado:'Justificado'};
const fmtDay=iso=>iso?new Date(String(iso).slice(0,10)+'T00:00:00').toLocaleDateString('es-MX',{dateStyle:'medium'}):'—';
const pct=n=>n===null||n===undefined?'—':Math.max(0,Math.min(100,Math.round(Number(n)||0)))+'%';
const byName=(a,b)=>(a.name||'').localeCompare(b.name||'','es');
const daysLeft=iso=>{if(!iso)return null;const today=new Date().toISOString().slice(0,10);return Math.round((Date.parse(iso+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);};

export async function renderTraining(ctx){
 const slug=encodeURIComponent(ctx.config.tenant.slug),base='/api/app/'+slug+'/training';
 const canWrite=ctx.config.tenant.role!=='viewer';
 const host=$('record-list');
 const overview=container('cards'),tabsBar=container('toolbar'),panels=container('stack');
 host.replaceChildren(overview,tabsBar,panels);
 $('record-count').textContent='Capacitaciones';
 if(demoMode)host.prepend(line('Estás en modo demostración: los datos de capacitación son de ejemplo y se guardan solo en esta pestaña.','help'));
 let courses=[],employees=[],enrollments=[],sessions=[],modules=[],attempts=[],evaluations=[],certificates=[],dashboard=null;
 let activeTab='dashboard',selectedCourseId=null,selectedModuleId=null,selectedSessionId=null,selectedEmployeeId=null,selectedEnrollmentId=null;
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
  for(const [key,label] of [['dashboard','Tablero'],['courses','Cursos'],['sessions','Sesiones'],['employees','Empleados'],
   ['enrollments','Inscripciones'],['attendance','Asistencia'],['progress','Avance'],['evaluations','Evaluaciones'],
   ['certificates','Certificados'],['export','Exportar']])tabsBar.append(tabButton(key,label));
 }
 // ---------- Tablero RH ----------
 const dashPanel=container('stack');
 async function loadDashboard(){
  try{dashboard=await api(base+'/dashboard');}catch(e){dashboard=null;dashPanel.replaceChildren(errLine('el tablero',e));return;}
  drawDashboard();
 }
 function drawDashboard(){
  dashPanel.replaceChildren(line('Tablero RH','group-label'));
  if(!dashboard){dashPanel.append(line('Cargando tablero…','help'));return;}
  const k=dashboard.kpis||{};
  const stats=container('cards');
  for(const [label,value] of [['Empleados en capacitación',String(k.employeesInTraining??0)],
   ['Avance global',pct(k.globalProgress)],['Cursos activos',String(k.activeCourses??0)],
   ['Inscripciones activas',String(k.activeEnrollments??0)],['Constancias emitidas',String(k.certificatesIssued??0)],
   ['Sesiones próximas',String(k.upcomingSessions??0)]]){
   const card=container('stat');card.append(el('span',label,'stat-label'),el('div',value,'stat-number'));stats.append(card);
  }
  dashPanel.append(stats);
  const expiring=container('stack');
  for(const c of dashboard.coursesExpiring||[]){
   const d=daysLeft(c.validUntil);
   expiring.append(line(c.name+' · vence '+fmtDay(c.validUntil)+(d===null?'':' ('+(d<0?'vencido hace '+(-d)+' días':'en '+d+' días')+')'),'help'));
  }
  if(!(dashboard.coursesExpiring||[]).length)expiring.append(line('Ningún curso vence en los próximos 30 días.','help'));
  const pending=container('stack');
  for(const p of dashboard.pendingEvaluations||[])pending.append(line((p.employeeName||'Empleado')+' · '+(p.courseName||'Curso'),'help'));
  if(!(dashboard.pendingEvaluations||[]).length)pending.append(line('Sin evaluaciones pendientes.','help'));
  dashPanel.append(line('Cursos por vencer','group-label'),expiring,line('Pendientes de evaluación','group-label'),pending);
  overview.replaceChildren();
  for(const [label,value] of [['Empleados en capacitación',String(k.employeesInTraining??0)],['Avance global',pct(k.globalProgress)],
   ['Cursos por vencer',String((dashboard.coursesExpiring||[]).length)],['Pendientes de evaluación',String((dashboard.pendingEvaluations||[]).length)]]){
   const card=container('stat');card.append(el('span',label,'stat-label'),el('div',value,'stat-number'));overview.append(card);
  }
 }
 // ---------- Cursos ----------
 const coursesPanel=container('stack');
 const courseForm=el('form');courseForm.className='stack';
 const cf={
  name:field('tr-course-name','Nombre del curso'),
  category:field('tr-course-category','Categoría (texto libre)'),
  modality:field('tr-course-modality','Modalidad','select',MODALITIES),
  duration:field('tr-course-duration','Duración (horas)','number'),
  instructor:field('tr-course-instructor','Instructor'),
  materials:field('tr-course-materials','Materiales','textarea'),
  validUntil:field('tr-course-valid','Vigencia hasta','date'),
  minScore:field('tr-course-minscore','Nota mínima para aprobar (0–100)','number'),
  status:field('tr-course-status','Estado','select',Object.entries(COURSE_STATUSES)),
  description:field('tr-course-desc','Descripción','textarea')
 };
 cf.name.input.required=true;cf.name.input.minLength=4;cf.minScore.input.min='0';cf.minScore.input.max='100';cf.minScore.input.value='70';cf.duration.input.min='0';
 cf.category.input.setAttribute('list','tr-course-categories');
 const catList=el('datalist');catList.id='tr-course-categories';
 for(const c of COURSE_CATEGORIES)catList.append(new Option(c));
 cf.category.holder.append(catList);
 const courseGrid=container('field-grid');
 for(const f of Object.values(cf))courseGrid.append(f.holder);
 const courseSave=button('Crear curso','btn btn-primary');courseSave.type='submit';
 const courseCancel=button('Cancelar edición');courseCancel.hidden=true;
 const courseActions=container('toolbar');courseActions.append(courseSave,courseCancel);
 courseForm.append(line('Crear o editar curso','group-label'),courseGrid,courseActions);
 let editingCourse=null;
 function resetCourseForm(){
  editingCourse=null;courseForm.reset();cf.minScore.input.value='70';
  courseSave.textContent='Crear curso';courseCancel.hidden=true;
 }
 courseCancel.addEventListener('click',resetCourseForm,{signal:ctx.signal});
 courseForm.addEventListener('submit',async ev=>{
  ev.preventDefault();courseSave.disabled=true;
  const body={name:cf.name.input.value.trim(),category:cf.category.input.value.trim(),
   modality:cf.modality.input.value,durationHours:Number(cf.duration.input.value)||0,
   instructor:cf.instructor.input.value.trim(),materials:cf.materials.input.value.trim(),
   validUntil:cf.validUntil.input.value||null,
   minScore:Math.max(0,Math.min(100,Math.round(Number(cf.minScore.input.value)||0))),
   status:cf.status.input.value,description:cf.description.input.value.trim()};
  try{
   if(editingCourse)await write(base+'/courses/'+editingCourse,'PATCH',body);
   else await write(base+'/courses','POST',body);
   ctx.notice(editingCourse?'Curso actualizado.':'Curso creado.');
   resetCourseForm();await loadCourses();await loadDashboard();
  }catch(e){ctx.notice('No se pudo guardar el curso: '+e.message,true);}
  finally{courseSave.disabled=false;}
 },{signal:ctx.signal});
 const courseList=container('stack');
 const modulePanel=container('card-soft');
 async function loadCourses(){
  try{const d=await api(base+'/courses');courses=d.courses||[];}catch(e){courses=[];courseList.replaceChildren(errLine('los cursos',e));return;}
  drawCourses();
 }
 function drawCourses(){
  coursesPanel.replaceChildren();
  if(canWrite)coursesPanel.append(courseForm);
  coursesPanel.append(line('Cursos','group-label'),courseList);
  const visible=courses.filter(c=>(c.name||'').toLowerCase().includes(q()));
  $('record-count').textContent=visible.length+' cursos';
  courseList.replaceChildren();
  if(!visible.length){courseList.append(line(courses.length?'Sin cursos con ese nombre.':'Sin cursos todavía. Crea el primero con el formulario de arriba.','empty'));}
  for(const c of visible){
   const row=container('record survey-card'),info=container('stack');
   info.append(el('strong',c.name),
    line([(COURSE_STATUSES[c.status]||c.status),c.category||'',MODALITIES.find(m=>m[0]===c.modality)?.[1]||c.modality,
     (c.durationHours||0)+' h',c.instructor?('Instructor: '+c.instructor):'',c.validUntil?('Vigencia: '+fmtDay(c.validUntil)):'',
     'Nota mínima: '+(c.minScore??70),((c.modules??0)+' módulos · '+(c.enrollments??0)+' inscritos · '+(c.sessions??0)+' sesiones')].filter(Boolean).join(' · '),'help'));
   if(c.description)info.append(line(c.description,'help'));
   const actions=container('record-actions');
   const mods=button('Módulos y quizzes','btn');
   mods.addEventListener('click',()=>{selectedCourseId=c.id;selectedModuleId=null;void loadModules();},{signal:ctx.signal});
   const hist=button('Historial del curso','btn');
   hist.addEventListener('click',()=>{selectedCourseId=c.id;void showCourseHistory();},{signal:ctx.signal});
   actions.append(mods,hist);
   if(canWrite){
    const edit=button('Editar','btn');
    edit.addEventListener('click',()=>{editingCourse=c.id;cf.name.input.value=c.name||'';cf.category.input.value=c.category||'';
     cf.modality.input.value=c.modality||'en línea';cf.duration.input.value=c.durationHours??'';cf.instructor.input.value=c.instructor||'';
     cf.materials.input.value=c.materials||'';cf.validUntil.input.value=(c.validUntil||'').slice(0,10);cf.minScore.input.value=c.minScore??70;
     cf.status.input.value=c.status||'borrador';cf.description.input.value=c.description||'';
     courseSave.textContent='Guardar cambios';courseCancel.hidden=false;courseForm.scrollIntoView({block:'center',behavior:'smooth'});},{signal:ctx.signal});
    const next=c.status==='activo'?'archivado':c.status==='archivado'?'borrador':'activo';
    const toggle=button(c.status==='activo'?'Archivar':c.status==='archivado'?'Volver a borrador':'Activar','btn');
    toggle.addEventListener('click',async()=>{
     try{await write(base+'/courses/'+c.id,'PATCH',{status:next});await loadCourses();await loadDashboard();}
     catch(e){ctx.notice(e.message,true);}
    },{signal:ctx.signal});
    actions.append(edit,toggle);
   }
   row.append(info,actions);courseList.append(row);
  }
  coursesPanel.append(modulePanel);
  if(selectedCourseId)drawModules();
 }
 async function showCourseHistory(){
  if(!selectedCourseId)return;
  modulePanel.replaceChildren(line('Cargando historial…','help'));
  try{
   const d=await api(base+'/courses/'+selectedCourseId+'/history');
   modulePanel.replaceChildren(line('Historial · '+d.course.name,'group-label'));
   const list=container('stack');
   if(!d.enrollments.length)list.append(line('Sin inscripciones todavía en este curso.','empty'));
   for(const x of d.enrollments){
    list.append(line((x.employeeName||'Empleado')+' · '+(ENROLL_STATUSES[x.status]||x.status)+' · Avance: '+pct(x.progress?.percent)+' · '+(x.evaluation?('Evaluación: '+x.evaluation.score+' · '+(x.evaluation.passed?'Aprobado':'Reprobado')):'Sin evaluación')+' · Constancias: '+(x.certificates||0),'help'));
   }
   modulePanel.append(list,line('Sesiones: '+d.sessions.length+' · Módulos: '+d.modules.length+' · Constancias emitidas: '+d.certificatesIssued,'help'));
  }catch(e){modulePanel.replaceChildren(errLine('el historial del curso',e));}
 }
 // ---------- Módulos y quizzes (dentro del curso) ----------
 const moduleList=container('stack');
 const moduleForm=el('form');moduleForm.className='stack';
 const mf={
  type:field('tr-module-type','Tipo de módulo','select',Object.entries(MODULE_TYPES)),
  title:field('tr-module-title','Título del módulo'),position:field('tr-module-pos','Orden','number'),
  status:field('tr-module-status','Estado','select',Object.entries(MODULE_STATUSES)),
  description:field('tr-module-desc','Descripción','textarea'),content:field('tr-module-content','Contenido / lección','textarea')
 };
 mf.title.input.required=true;mf.position.input.min='0';mf.position.input.value='0';
 const moduleGrid=container('field-grid');
 for(const f of Object.values(mf))moduleGrid.append(f.holder);
 const moduleSave=button('Crear módulo','btn btn-primary');moduleSave.type='submit';
 const moduleCancel=button('Cancelar edición');moduleCancel.hidden=true;
 const moduleActions=container('toolbar');moduleActions.append(moduleSave,moduleCancel);
 moduleForm.append(line('Nuevo módulo','group-label'),
  line('Los quizzes solo aplican a módulos de certificación.','help'),moduleGrid,moduleActions);
 let editingModule=null;
 function resetModuleForm(){
  editingModule=null;moduleForm.reset();mf.position.input.value='0';moduleSave.textContent='Crear módulo';moduleCancel.hidden=true;
 }
 moduleCancel.addEventListener('click',resetModuleForm,{signal:ctx.signal});
 moduleForm.addEventListener('submit',async ev=>{
  ev.preventDefault();if(!selectedCourseId)return;moduleSave.disabled=true;
  const body={type:mf.type.input.value,title:mf.title.input.value.trim(),position:Number(mf.position.input.value)||0,
   status:mf.status.input.value,description:mf.description.input.value.trim(),content:mf.content.input.value.trim()};
  try{
   if(editingModule)await write(base+'/courses/'+selectedCourseId+'/modules/'+editingModule,'PATCH',body);
   else await write(base+'/courses/'+selectedCourseId+'/modules','POST',body);
   ctx.notice(editingModule?'Módulo actualizado.':'Módulo creado.');
   resetModuleForm();await loadModules();
  }catch(e){ctx.notice('No se pudo guardar el módulo: '+e.message,true);}
  finally{moduleSave.disabled=false;}
 },{signal:ctx.signal});
 const quizPanel=container('stack');
 const attemptPanel=container('stack');
 async function loadModules(){
  if(!selectedCourseId)return;
  try{const d=await api(base+'/courses/'+selectedCourseId+'/modules');modules=(d.modules||[]).sort((a,b)=>(a.position||0)-(b.position||0));}
  catch(e){modules=[];modulePanel.replaceChildren(errLine('los módulos',e));return;}
  drawModules();
 }
 function drawModules(){
  const course=courses.find(c=>c.id===selectedCourseId);
  modulePanel.replaceChildren(line('Módulos y quizzes · '+(course?.name||''),'group-label'));
  if(canWrite)modulePanel.append(moduleForm);
  modulePanel.append(line('Módulos del curso','group-label'),moduleList,quizPanel,attemptPanel);
  moduleList.replaceChildren();
  if(!modules.length){moduleList.append(line('Sin módulos todavía. Crea el primero: una lección de aprendizaje o un módulo de certificación.','empty'));}
  for(const m of modules){
   const row=container('record survey-card'),info=container('stack');
   info.append(el('strong',(m.position||0)+'. '+m.title),
    line([MODULE_TYPES[m.type]||m.type,MODULE_STATUSES[m.status]||m.status,
     m.quiz?.hasQuiz?('Quiz: '+m.quiz.questionCount+' preguntas · mínimo '+(m.quiz.passingScore??course?.minScore??70)+' · '+(m.quiz.maxAttempts??'sin límite')+' intento(s)'):'Sin quiz'].join(' · '),'help'));
   if(m.description)info.append(line(m.description,'help'));
   const actions=container('record-actions');
   if(m.type==='certification'){
    const quiz=button(m.quiz?.hasQuiz?'Editar quiz':'Añadir quiz','btn');
    quiz.addEventListener('click',()=>{selectedModuleId=m.id;drawQuizEditor();},{signal:ctx.signal});
    const play=button('Responder quiz','btn btn-primary');
    play.disabled=!m.quiz?.hasQuiz;
    play.addEventListener('click',()=>{selectedModuleId=m.id;drawAttemptPlayer();},{signal:ctx.signal});
    actions.append(quiz,play);
   }
   if(canWrite){
    const edit=button('Editar','btn');
    edit.addEventListener('click',()=>{editingModule=m.id;mf.type.input.value=m.type||'learning';mf.title.input.value=m.title||'';
     mf.position.input.value=m.position??0;mf.status.input.value=m.status||'borrador';mf.description.input.value=m.description||'';
     mf.content.input.value=m.content||'';moduleSave.textContent='Guardar cambios';moduleCancel.hidden=false;
     moduleForm.scrollIntoView({block:'center',behavior:'smooth'});},{signal:ctx.signal});
    const del=button('Eliminar','btn btn-danger');
    del.addEventListener('click',async()=>{
     if(!confirm('¿Eliminar este módulo? No se puede eliminar si ya tiene intentos de quiz registrados.'))return;
     try{await write(base+'/courses/'+selectedCourseId+'/modules/'+m.id,'DELETE');await loadModules();}
     catch(e){ctx.notice('No se pudo eliminar el módulo: '+e.message,true);}
    },{signal:ctx.signal});
    actions.append(edit,del);
   }
   row.append(info,actions);moduleList.append(row);
  }
  if(selectedModuleId)drawQuizEditor();
 }
 // Editor de quiz: preguntas de opción múltiple (opciones como texto,
 // correctIndex = índice de la correcta, puntos por pregunta).
 function drawQuizEditor(){
  const m=modules.find(x=>x.id===selectedModuleId);
  const course=courses.find(c=>c.id===selectedCourseId);
  quizPanel.replaceChildren();
  if(!m||m.type!=='certification')return;
  quizPanel.append(line('Quiz · '+m.title,'group-label'));
  const quiz=m.quizConfig||{passingScore:course?.minScore??70,maxAttempts:1,questions:[]};
  const qf={
   passing:field('tr-quiz-passing','Puntaje mínimo aprobatorio (0–100)','number'),
   attempts:field('tr-quiz-attempts','Intentos permitidos (vacío = sin límite)','number')
  };
  qf.passing.input.min='0';qf.passing.input.max='100';qf.passing.input.value=quiz.passingScore??course?.minScore??70;
  qf.attempts.input.min='1';qf.attempts.input.max='20';qf.attempts.input.value=quiz.maxAttempts??'';
  const qGrid=container('field-grid');for(const f of Object.values(qf))qGrid.append(f.holder);
  const qList=container('stack');
  let questions=structuredClone(quiz.questions||[]);
  function drawQuestions(){
   qList.replaceChildren();
   if(!questions.length)qList.append(line('Sin preguntas todavía. Añade la primera pregunta de opción múltiple.','empty'));
   questions.forEach((qq,qi)=>{
    const card=container('card-soft');
    const text=el('input');text.type='text';text.className='search';text.maxLength=500;text.value=qq.text||'';
    text.placeholder='Escribe la pregunta';text.setAttribute('aria-label','Texto de la pregunta');
    text.addEventListener('input',()=>{qq.text=text.value;});
    const pts=field('tr-q-points-'+qi,'Puntos','number');pts.input.min='1';pts.input.max='100';pts.input.value=qq.points??1;
    pts.input.addEventListener('input',()=>{qq.points=Math.max(1,Number(pts.input.value)||1);});
    const opts=container('stack');
    function drawOptions(){
     opts.replaceChildren();
     qq.options.forEach((opt,oi)=>{
      const row=container('survey-question-row');
      const radio=el('input');radio.type='radio';radio.name='correct-'+qi;radio.checked=qq.correctIndex===oi;
      radio.setAttribute('aria-label','Marcar como correcta');
      radio.addEventListener('change',()=>{qq.correctIndex=oi;});
      const input=el('input');input.type='text';input.className='search';input.maxLength=300;input.value=opt||'';
      input.placeholder='Opción '+(oi+1);input.setAttribute('aria-label','Texto de la opción');
      input.addEventListener('input',()=>{qq.options[oi]=input.value;});
      const rm=button('Quitar','btn');
      rm.addEventListener('click',()=>{if(qq.options.length<=2){ctx.notice('Cada pregunta necesita al menos dos opciones.',true);return;}
       qq.options.splice(oi,1);if(qq.correctIndex===oi)qq.correctIndex=0;else if(qq.correctIndex>oi)qq.correctIndex--;drawOptions();},{signal:ctx.signal});
      row.append(radio,input,rm);opts.append(row);
     });
    }
    drawOptions();
    const addOpt=button('Añadir opción','btn');
    addOpt.addEventListener('click',()=>{if(qq.options.length>=6){ctx.notice('Máximo seis opciones por pregunta.',true);return;}qq.options.push('');drawOptions();},{signal:ctx.signal});
    const rmQ=button('Eliminar pregunta','btn btn-danger');
    rmQ.addEventListener('click',()=>{questions.splice(qi,1);drawQuestions();},{signal:ctx.signal});
    card.append(line('Pregunta '+(qi+1),'group-label'),text,opts,addOpt,pts.holder,rmQ);qList.append(card);
   });
  }
  drawQuestions();
  const addQ=button('Añadir pregunta','btn');
  addQ.addEventListener('click',()=>{
   if(questions.length>=50){ctx.notice('Máximo 50 preguntas por quiz.',true);return;}
   questions.push({id:'q'+Date.now().toString(36),text:'',options:['',''],correctIndex:0,points:1});drawQuestions();
  },{signal:ctx.signal});
  const saveQ=button('Guardar quiz','btn btn-primary');
  saveQ.addEventListener('click',async()=>{
   if(!questions.length)return ctx.notice('El quiz necesita al menos una pregunta.',true);
   for(const [i,qq] of questions.entries()){
    if(!qq.text.trim())return ctx.notice('La pregunta '+(i+1)+' no tiene texto.',true);
    if(qq.options.length<2||qq.options.some(o=>!String(o).trim()))return ctx.notice('La pregunta '+(i+1)+' necesita al menos dos opciones con texto.',true);
    if(!Number.isInteger(qq.correctIndex)||qq.correctIndex<0||qq.correctIndex>=qq.options.length)return ctx.notice('Marca la respuesta correcta de la pregunta '+(i+1)+'.',true);
   }
   saveQ.disabled=true;
   try{
    await write(base+'/courses/'+selectedCourseId+'/modules/'+m.id+'/quiz','PUT',
     {passingScore:Math.max(0,Math.min(100,Math.round(Number(qf.passing.input.value)||0))),
      maxAttempts:qf.attempts.input.value===''?null:Math.max(1,Math.round(Number(qf.attempts.input.value)||1)),
      questions:questions.map(qq=>({id:qq.id,text:qq.text.trim(),options:qq.options.map(o=>String(o).trim()),correctIndex:qq.correctIndex,points:qq.points}))});
    ctx.notice('Quiz guardado.');await loadModules();
   }catch(e){ctx.notice('No se pudo guardar el quiz: '+e.message,true);}
   finally{saveQ.disabled=false;}
  },{signal:ctx.signal});
  quizPanel.append(qGrid,qList,addQ,saveQ);
  drawAttemptPlayer();
 }
 // Jugador de quiz: RH selecciona la inscripción, contesta y registra el intento.
 async function loadAttempts(moduleId,enrollmentId){
  try{
   const query=enrollmentId?('?enrollmentId='+encodeURIComponent(enrollmentId)):'';
   const d=await api(base+'/courses/'+selectedCourseId+'/modules/'+moduleId+'/attempts'+query);
   attempts=d.attempts||[];
  }catch(e){attempts=[];}
 }
 function drawAttemptPlayer(){
  const m=modules.find(x=>x.id===selectedModuleId);
  attemptPanel.replaceChildren();
  if(!m||m.type!=='certification'||!m.quiz?.hasQuiz)return;
  attemptPanel.append(line('Responder quiz · '+m.title,'group-label'));
  const enrSel=el('select');enrSel.className='search';enrSel.setAttribute('aria-label','Inscripción que responde');
  enrSel.add(new Option('Selecciona una inscripción',''));
  const courseEnrollments=enrollments.filter(x=>x.courseId===selectedCourseId&&x.status!=='cancelado');
  for(const x of courseEnrollments)enrSel.add(new Option((x.employeeName||'Empleado')+' · '+(ENROLL_STATUSES[x.status]||x.status),x.id));
  enrSel.value=selectedEnrollmentId||'';
  const quizBox=container('stack');
  attemptPanel.append(enrSel,quizBox);
  async function renderQuiz(){
   quizBox.replaceChildren(line('Cargando quiz…','help'));
   if(!enrSel.value){quizBox.replaceChildren(line('Selecciona la inscripción del empleado que responde el quiz.','help'));return;}
   try{
    const d=await api(base+'/courses/'+selectedCourseId+'/modules/'+m.id+'/quiz');
    const quiz=d.module;
    const form=el('form');form.className='stack';
    const answers={};
    for(const qq of quiz.questions){
     const card=container('card-soft');
     card.append(line(qq.text+' ('+qq.points+' punto(s))','survey-question-label'));
     qq.options.forEach((opt,oi)=>{
      const label=el('label',opt,'survey-required');
      const radio=el('input');radio.type='radio';radio.name='ans-'+qq.id;radio.value=String(oi);
      radio.addEventListener('change',()=>{answers[qq.id]=oi;});
      label.prepend(radio);card.append(label);
     });
     form.append(card);
    }
    const submit=button('Enviar respuestas','btn btn-primary');submit.type='submit';
    const result=container('stack');
    form.append(submit,result);
    form.addEventListener('submit',async ev=>{
     ev.preventDefault();
     if(Object.keys(answers).length<quiz.questions.length)return ctx.notice('Responde todas las preguntas antes de enviar.',true);
     submit.disabled=true;
     try{
      const out=await write(base+'/courses/'+selectedCourseId+'/modules/'+m.id+'/attempts','POST',{enrollmentId:enrSel.value,answers});
      const a=out.attempt;
      result.replaceChildren(line('Puntaje: '+a.score+' de 100 · '+(a.passed?'Aprobado':'Reprobado')+' · Intento '+a.attemptNumber+' · Aciertos: '+a.correctCount+' de '+a.totalQuestions,'help'));
      ctx.notice(a.passed?'Quiz aprobado.':'Quiz reprobado. Revisa el historial de intentos.');
      await loadAttempts(m.id,enrSel.value);drawAttempts(m);await loadDashboard();
     }catch(e){ctx.notice('No se pudo registrar el intento: '+e.message,true);}
     finally{submit.disabled=false;}
    },{signal:ctx.signal});
    quizBox.replaceChildren(form);
    await loadAttempts(m.id,enrSel.value);drawAttempts(m);
   }catch(e){quizBox.replaceChildren(errLine('el quiz',e));}
  }
  enrSel.addEventListener('change',()=>{selectedEnrollmentId=enrSel.value||null;void renderQuiz();},{signal:ctx.signal});
  void renderQuiz();
 }
 function drawAttempts(m){
  const old=attemptPanel.querySelector('.attempt-history');
  if(old)old.remove();
  const hist=container('stack');hist.className='stack attempt-history';
  hist.append(line('Historial de intentos','group-label'));
  if(!attempts.length)hist.append(line('Sin intentos registrados todavía.','empty'));
  for(const a of attempts){
   hist.append(line((a.employeeName||'Empleado')+' · '+a.score+' de 100 · '+(a.passed?'Aprobado':'Reprobado')+' · Intento '+a.attemptNumber+' · '+date(a.createdAt),'help'));
  }
  attemptPanel.append(hist);
 }
 // ---------- Sesiones ----------
 const sessionsPanel=container('stack');
 const sessionForm=el('form');sessionForm.className='stack';
 const sf={
  course:field('tr-session-course','Curso','select',[]),
  startsAt:field('tr-session-start','Fecha y hora de inicio','datetime-local'),
  endsAt:field('tr-session-end','Fecha y hora de fin','datetime-local'),
  placeOrLink:field('tr-session-place','Lugar o enlace'),
  capacity:field('tr-session-capacity','Cupo','number'),instructor:field('tr-session-instructor','Instructor')
 };
 sf.startsAt.input.required=true;sf.endsAt.input.required=true;sf.capacity.input.min='1';sf.capacity.input.value='10';
 const sessionGrid=container('field-grid');
 for(const f of Object.values(sf))sessionGrid.append(f.holder);
 const sessionSave=button('Crear sesión','btn btn-primary');sessionSave.type='submit';
 const sessionCancel=button('Cancelar edición');sessionCancel.hidden=true;
 const sessionActions=container('toolbar');sessionActions.append(sessionSave,sessionCancel);
 sessionForm.append(line('Crear o editar sesión','group-label'),sessionGrid,sessionActions);
 let editingSession=null;
 function resetSessionForm(){
  editingSession=null;sessionForm.reset();sf.capacity.input.value='10';sessionSave.textContent='Crear sesión';sessionCancel.hidden=true;
 }
 sessionCancel.addEventListener('click',resetSessionForm,{signal:ctx.signal});
 sessionForm.addEventListener('submit',async ev=>{
  ev.preventDefault();sessionSave.disabled=true;
  const body={courseId:sf.course.input.value,startsAt:sf.startsAt.input.value?new Date(sf.startsAt.input.value).toISOString():null,
   endsAt:sf.endsAt.input.value?new Date(sf.endsAt.input.value).toISOString():null,
   placeOrLink:sf.placeOrLink.input.value.trim(),capacity:Math.max(1,Number(sf.capacity.input.value)||1),
   instructor:sf.instructor.input.value.trim()};
  try{
   if(editingSession)await write(base+'/sessions/'+editingSession,'PATCH',body);
   else await write(base+'/sessions','POST',body);
   ctx.notice(editingSession?'Sesión actualizada.':'Sesión creada.');
   resetSessionForm();await loadSessions();await loadDashboard();
  }catch(e){ctx.notice('No se pudo guardar la sesión: '+e.message,true);}
  finally{sessionSave.disabled=false;}
 },{signal:ctx.signal});
 const sessionList=container('stack');
 async function loadSessions(){
  try{const d=await api(base+'/sessions');sessions=d.sessions||[];}catch(e){sessions=[];sessionList.replaceChildren(errLine('las sesiones',e));return;}
  drawSessions();
 }
 function drawSessions(){
  sessionsPanel.replaceChildren();
  sf.course.input.replaceChildren();
  for(const c of courses)sf.course.input.add(new Option(c.name,c.id));
  if(canWrite)sessionsPanel.append(sessionForm);
  sessionsPanel.append(line('Sesiones','group-label'),sessionList);
  const visible=sessions.filter(s=>((s.courseName||'')+' '+(s.placeOrLink||'')).toLowerCase().includes(q()));
  $('record-count').textContent=visible.length+' sesiones';
  sessionList.replaceChildren();
  if(!visible.length){sessionList.append(line(sessions.length?'Sin sesiones con ese criterio.':'Sin sesiones todavía. Crea la primera desde un curso.','empty'));return;}
  for(const s of [...visible].sort((a,b)=>(a.startsAt||'').localeCompare(b.startsAt||''))){
   const row=container('record survey-card'),info=container('stack');
   info.append(el('strong',s.courseName||'Curso'),
    line([date(s.startsAt)+' – '+date(s.endsAt),s.placeOrLink||'',s.capacity?('Cupo: '+s.capacity):'',s.instructor?('Instructor: '+s.instructor):'',(s.attendance??0)+' asistencias'].filter(Boolean).join(' · '),'help'));
   const actions=container('record-actions');
   const att=button('Asistencia','btn');
   att.addEventListener('click',()=>{selectedSessionId=s.id;activeTab='attendance';drawTabs();void showTab();},{signal:ctx.signal});
   actions.append(att);
   if(canWrite){
    const edit=button('Editar','btn');
    edit.addEventListener('click',()=>{editingSession=s.id;sf.course.input.value=s.courseId;
     const toLocal=iso=>{if(!iso)return '';const d=new Date(iso);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
     sf.startsAt.input.value=toLocal(s.startsAt);sf.endsAt.input.value=toLocal(s.endsAt);
     sf.placeOrLink.input.value=s.placeOrLink||'';sf.capacity.input.value=s.capacity??'';sf.instructor.input.value=s.instructor||'';
     sessionSave.textContent='Guardar cambios';sessionCancel.hidden=false;sessionForm.scrollIntoView({block:'center',behavior:'smooth'});},{signal:ctx.signal});
    actions.append(edit);
   }
   row.append(info,actions);sessionList.append(row);
  }
 }
 // ---------- Empleados ----------
 const employeesPanel=container('stack');
 const employeeForm=el('form');employeeForm.className='stack';
 const ef={
  name:field('tr-emp-name','Nombre completo'),email:field('tr-emp-email','Correo','email'),
  position:field('tr-emp-position','Puesto'),area:field('tr-emp-area','Área')
 };
 ef.name.input.required=true;ef.email.input.required=true;
 const employeeGrid=container('field-grid');
 for(const f of Object.values(ef))employeeGrid.append(f.holder);
 const employeeSave=button('Registrar empleado','btn btn-primary');employeeSave.type='submit';
 const employeeCancel=button('Cancelar edición');employeeCancel.hidden=true;
 const employeeActions=container('toolbar');employeeActions.append(employeeSave,employeeCancel);
 employeeForm.append(line('Registrar o editar empleado','group-label'),employeeGrid,employeeActions);
 let editingEmployee=null;
 function resetEmployeeForm(){
  editingEmployee=null;employeeForm.reset();employeeSave.textContent='Registrar empleado';employeeCancel.hidden=true;
 }
 employeeCancel.addEventListener('click',resetEmployeeForm,{signal:ctx.signal});
 employeeForm.addEventListener('submit',async ev=>{
  ev.preventDefault();employeeSave.disabled=true;
  const body={name:ef.name.input.value.trim(),email:ef.email.input.value.trim(),
   position:ef.position.input.value.trim(),area:ef.area.input.value.trim()};
  try{
   if(editingEmployee)await write(base+'/employees/'+editingEmployee,'PATCH',body);
   else await write(base+'/employees','POST',body);
   ctx.notice(editingEmployee?'Empleado actualizado.':'Empleado registrado.');
   resetEmployeeForm();await loadEmployees();await loadDashboard();
  }catch(e){ctx.notice('No se pudo guardar el empleado: '+e.message,true);}
  finally{employeeSave.disabled=false;}
 },{signal:ctx.signal});
 const employeeList=container('stack');
 async function loadEmployees(){
  try{const d=await api(base+'/employees');employees=d.employees||[];}catch(e){employees=[];employeeList.replaceChildren(errLine('los empleados',e));return;}
  drawEmployees();
 }
 function drawEmployees(){
  employeesPanel.replaceChildren();
  if(canWrite)employeesPanel.append(employeeForm);
  employeesPanel.append(line('Empleados','group-label'),employeeList);
  const visible=[...employees].sort(byName).filter(e=>(e.name+' '+(e.email||'')+' '+(e.position||'')+' '+(e.area||'')).toLowerCase().includes(q()));
  $('record-count').textContent=visible.length+' empleados';
  employeeList.replaceChildren();
  if(!visible.length){employeeList.append(line(employees.length?'Sin empleados con ese criterio.':'Sin empleados todavía. Registra al primero con el formulario de arriba.','empty'));return;}
  for(const e of visible){
   const row=container('record survey-card'),info=container('stack');
   info.append(el('strong',e.name),line([e.email,e.position,e.area,(e.enrollments??0)+' inscripciones'].filter(Boolean).join(' · '),'help'));
   const actions=container('record-actions');
   const hist=button('Historial','btn');
   hist.addEventListener('click',()=>{selectedEmployeeId=e.id;activeTab='progress';drawTabs();void showTab();},{signal:ctx.signal});
   actions.append(hist);
   if(canWrite){
    const edit=button('Editar','btn');
    edit.addEventListener('click',()=>{editingEmployee=e.id;ef.name.input.value=e.name||'';ef.email.input.value=e.email||'';
     ef.position.input.value=e.position||'';ef.area.input.value=e.area||'';
     employeeSave.textContent='Guardar cambios';employeeCancel.hidden=false;employeeForm.scrollIntoView({block:'center',behavior:'smooth'});},{signal:ctx.signal});
    actions.append(edit);
   }
   row.append(info,actions);employeeList.append(row);
  }
 }
 // ---------- Inscripciones ----------
 const enrollPanel=container('stack');
 const enrollForm=el('form');enrollForm.className='stack';
 const enf={
  employee:field('tr-enr-employee','Empleado','select',[]),
  course:field('tr-enr-course','Curso','select',[]),
  session:field('tr-enr-session','Sesión (opcional)','select',[['','Sin sesión específica']])
 };
 const enrollGrid=container('field-grid');
 for(const f of Object.values(enf))enrollGrid.append(f.holder);
 const enrollSave=button('Inscribir empleado','btn btn-primary');enrollSave.type='submit';
 enrollForm.append(line('Nueva inscripción','group-label'),enrollGrid,enrollSave);
 enrollForm.addEventListener('submit',async ev=>{
  ev.preventDefault();enrollSave.disabled=true;
  try{
   await write(base+'/enrollments','POST',{employeeId:enf.employee.input.value,courseId:enf.course.input.value,sessionId:enf.session.input.value||null});
   ctx.notice('Empleado inscrito.');enrollForm.reset();await loadEnrollments();await loadDashboard();
  }catch(e){ctx.notice('No se pudo inscribir: '+e.message,true);}
  finally{enrollSave.disabled=false;}
 },{signal:ctx.signal});
 const enrollList=container('stack');
 async function loadEnrollments(){
  try{const d=await api(base+'/enrollments');enrollments=d.enrollments||[];}catch(e){enrollments=[];enrollList.replaceChildren(errLine('las inscripciones',e));return;}
  drawEnrollments();
 }
 function drawEnrollments(){
  enrollPanel.replaceChildren();
  enf.employee.input.replaceChildren();
  for(const e of [...employees].sort(byName))enf.employee.input.add(new Option(e.name+' · '+(e.position||''),e.id));
  enf.course.input.replaceChildren();
  for(const c of courses)enf.course.input.add(new Option(c.name,c.id));
  enf.session.input.replaceChildren(new Option('Sin sesión específica',''));
  for(const s of sessions)enf.session.input.add(new Option((s.courseName||'')+' · '+date(s.startsAt),s.id));
  if(canWrite)enrollPanel.append(enrollForm);
  enrollPanel.append(line('Inscripciones','group-label'),enrollList);
  const visible=enrollments.filter(x=>((x.employeeName||'')+' '+(x.courseName||'')).toLowerCase().includes(q()));
  $('record-count').textContent=visible.length+' inscripciones';
  enrollList.replaceChildren();
  if(!visible.length){enrollList.append(line(enrollments.length?'Sin inscripciones con ese criterio.':'Sin inscripciones todavía. Inscribe a un empleado en un curso.','empty'));return;}
  for(const x of visible){
   const row=container('record survey-card'),info=container('stack');
   info.append(el('strong',(x.employeeName||'Empleado')+' · '+(x.courseName||'Curso')),
    line([(ENROLL_STATUSES[x.status]||x.status),'Avance: '+pct(x.progressPercent),x.createdAt?('Desde: '+fmtDay(x.createdAt)):''].filter(Boolean).join(' · '),'help'));
   const actions=container('record-actions');
   const prog=button('Ver avance','btn');
   prog.addEventListener('click',()=>{selectedEnrollmentId=x.id;activeTab='progress';drawTabs();void showTab();},{signal:ctx.signal});
   actions.append(prog);
   if(canWrite){
    const statusSel=el('select');statusSel.className='search';statusSel.setAttribute('aria-label','Estado de la inscripción');
    for(const [v,l] of Object.entries(ENROLL_STATUSES))statusSel.add(new Option(l,v));
    statusSel.value=x.status||'inscrito';
    statusSel.addEventListener('change',async()=>{
     try{await write(base+'/enrollments/'+x.id,'PATCH',{status:statusSel.value});ctx.notice('Inscripción actualizada.');await loadEnrollments();}
     catch(e){ctx.notice(e.message,true);statusSel.value=x.status||'inscrito';}
    },{signal:ctx.signal});
    actions.append(statusSel);
    if(x.status!=='cancelado'){
     const cancel=button('Dar de baja','btn btn-danger');
     cancel.addEventListener('click',async()=>{
      if(!confirm('¿Dar de baja esta inscripción? Quedará como cancelada en el historial.'))return;
      try{await write(base+'/enrollments/'+x.id,'DELETE');await loadEnrollments();}
      catch(e){ctx.notice(e.message,true);}
     },{signal:ctx.signal});
     actions.append(cancel);
    }
   }
   row.append(info,actions);enrollList.append(row);
  }
 }
 // ---------- Asistencia ----------
 const attendancePanel=container('stack');
 const attSessionSel=el('select');attSessionSel.className='search';attSessionSel.setAttribute('aria-label','Sesión');
 const attList=container('stack');
 async function loadAttendance(){
  if(!selectedSessionId&&sessions.length)selectedSessionId=sessions[0].id;
  drawAttendance();
 }
 function drawAttendance(){
  attendancePanel.replaceChildren(line('Asistencia por sesión','group-label'));
  attSessionSel.replaceChildren();
  for(const s of sessions)attSessionSel.add(new Option((s.courseName||'')+' · '+date(s.startsAt),s.id));
  attSessionSel.value=selectedSessionId||'';
  attendancePanel.append(attSessionSel,attList);
  attList.replaceChildren(line('Cargando asistencia…','help'));
  void (async()=>{
   if(!selectedSessionId){attList.replaceChildren(line('Sin sesiones todavía. Crea una sesión para registrar asistencia.','empty'));return;}
   try{
    const d=await api(base+'/attendance?sessionId='+encodeURIComponent(selectedSessionId));
    const rows=d.attendance||[];
    const session=sessions.find(s=>s.id===selectedSessionId);
    const enrolled=enrollments.filter(x=>x.courseId===session?.courseId&&x.status!=='cancelado');
    attList.replaceChildren();
    if(!enrolled.length){attList.append(line('Sin empleados inscritos en este curso todavía.','empty'));return;}
    for(const x of enrolled){
     const current=rows.find(r=>r.employeeId===x.employeeId);
     const row=container('record survey-card'),info=container('stack');
     info.append(el('strong',x.employeeName||'Empleado'),line([current?('Registrado: '+ATTENDANCE[current.status]):'Sin registro'].filter(Boolean).join(' · '),'help'));
     const actions=container('record-actions');
     if(canWrite){
      const sel=el('select');sel.className='search';sel.setAttribute('aria-label','Asistencia de '+(x.employeeName||'empleado'));
      sel.add(new Option('Sin registro',''));
      for(const [v,l] of Object.entries(ATTENDANCE))sel.add(new Option(l,v));
      sel.value=current?.status||'';
      sel.addEventListener('change',async()=>{
       if(!sel.value)return;
       try{
        await write(base+'/attendance','POST',{sessionId:selectedSessionId,employeeId:x.employeeId,status:sel.value});
        ctx.notice('Asistencia registrada.');await loadAttendance();
       }catch(e){ctx.notice('No se pudo registrar asistencia: '+e.message,true);}
      },{signal:ctx.signal});
      actions.append(sel);
     }
     row.append(info,actions);attList.append(row);
    }
   }catch(e){attList.replaceChildren(errLine('la asistencia',e));}
  })();
 }
 attSessionSel.addEventListener('change',()=>{selectedSessionId=attSessionSel.value||null;drawAttendance();},{signal:ctx.signal});
 // ---------- Avance ----------
 const progressPanel=container('stack');
 const progEnrSel=el('select');progEnrSel.className='search';progEnrSel.setAttribute('aria-label','Inscripción para ver el avance');
 const progEmpSel=el('select');progEmpSel.className='search';progEmpSel.setAttribute('aria-label','Empleado para ver su historial');
 const progDetail=container('stack');
 const progHistory=container('stack');
 async function loadProgress(){
  drawProgress();
  if(selectedEnrollmentId)await loadProgressDetail();
  if(selectedEmployeeId)await loadEmployeeHistory();
 }
 function drawProgress(){
  progressPanel.replaceChildren(line('Avance por empleado y curso','group-label'));
  progEnrSel.replaceChildren(new Option('Selecciona una inscripción para ver su avance',''));
  for(const x of enrollments)progEnrSel.add(new Option((x.employeeName||'Empleado')+' · '+(x.courseName||'Curso')+' · '+pct(x.progressPercent),x.id));
  progEnrSel.value=selectedEnrollmentId||'';
  progEmpSel.replaceChildren(new Option('Historial por empleado: selecciona uno',''));
  for(const e of [...employees].sort(byName))progEmpSel.add(new Option(e.name,e.id));
  progEmpSel.value=selectedEmployeeId||'';
  progressPanel.append(progEnrSel,progDetail,line('Historial por empleado','group-label'),progEmpSel,progHistory);
  const visible=enrollments.filter(x=>((x.employeeName||'')+' '+(x.courseName||'')).toLowerCase().includes(q()));
  $('record-count').textContent=visible.length+' inscripciones';
  if(!selectedEnrollmentId)progDetail.replaceChildren(line('Sin avance registrado todavía. Selecciona una inscripción para ver sus módulos, su avance y marcar lecciones completadas.','empty'));
 }
 async function loadProgressDetail(){
  const x=enrollments.find(e=>e.id===selectedEnrollmentId);
  progDetail.replaceChildren(line('Cargando avance…','help'));
  if(!x){progDetail.replaceChildren(line('Selecciona una inscripción para ver su avance.','empty'));return;}
  try{
   const d=await api(base+'/progress?enrollmentId='+encodeURIComponent(x.id));
   progDetail.replaceChildren(line('Avance · '+(x.employeeName||'Empleado')+' · '+(x.courseName||'Curso'),'group-label'));
   const stats=container('cards');
   for(const [label,value] of [['Avance',pct(d.percent)],['Módulos',d.completedModules+' de '+d.totalModules],['Estado',ENROLL_STATUSES[d.status]||d.status]]){
    const card=container('stat');card.append(el('span',label,'stat-label'),el('div',value,'stat-number'));stats.append(card);
   }
   progDetail.append(stats);
   const list=container('stack');
   if(!d.modules.length){
    list.append(line('Este curso no tiene módulos: el avance se registra a mano.','help'));
    if(canWrite){
     const mf2={done:field('tr-prog-done','Módulos completados','number'),total:field('tr-prog-total','Módulos totales','number')};
     mf2.done.input.value=d.completedModules??0;mf2.total.input.value=d.totalModules??0;
     const grid=container('field-grid');for(const f of Object.values(mf2))grid.append(f.holder);
     const save=button('Guardar avance manual','btn btn-primary');
     save.addEventListener('click',async()=>{
      try{
       await write(base+'/progress','POST',{enrollmentId:x.id,completedModules:Math.max(0,Number(mf2.done.input.value)||0),totalModules:Math.max(0,Number(mf2.total.input.value)||0)});
       ctx.notice('Avance guardado.');await loadEnrollments();await loadProgressDetail();
      }catch(e){ctx.notice('No se pudo guardar el avance: '+e.message,true);}
     },{signal:ctx.signal});
     list.append(grid,save);
    }
   }
   for(const m of d.modules||[]){
    const row=container('record survey-card'),info=container('stack');
    info.append(el('strong',(m.position||0)+'. '+m.title),
     line([(MODULE_TYPES[m.type]||m.type),m.completed?'Completado':'Pendiente',m.type==='certification'&&m.bestScore!==null&&m.bestScore!==undefined?('Mejor intento: '+m.bestScore+' de 100'):''].filter(Boolean).join(' · '),'help'));
    const actions=container('record-actions');
    if(canWrite&&m.type==='learning'&&!m.completed){
     const complete=button('Marcar completado','btn btn-primary');
     complete.addEventListener('click',async()=>{
      try{
       await write(base+'/courses/'+x.courseId+'/modules/'+m.id+'/complete','POST',{enrollmentId:x.id});
       ctx.notice('Módulo "'+m.title+'" marcado como completado.');await loadEnrollments();await loadProgressDetail();await loadDashboard();
      }catch(e){ctx.notice('No se pudo registrar el avance: '+e.message,true);}
     },{signal:ctx.signal});
     actions.append(complete);
    }
    row.append(info,actions);list.append(row);
   }
   progDetail.append(list);
  }catch(e){progDetail.replaceChildren(errLine('el avance',e));}
 }
 async function loadEmployeeHistory(){
  progHistory.replaceChildren(line('Cargando historial…','help'));
  if(!selectedEmployeeId){progHistory.replaceChildren();return;}
  try{
   const d=await api(base+'/employees/'+selectedEmployeeId+'/history');
   progHistory.replaceChildren(line('Historial · '+d.employee.name,'group-label'));
   const list=container('stack');
   if(!d.enrollments.length)list.append(line('Sin historial todavía para este empleado.','empty'));
   for(const x of d.enrollments){
    list.append(line((x.courseName||'Curso')+' · '+(ENROLL_STATUSES[x.status]||x.status)+' · Avance: '+pct(x.progress?.percent)+' ('+(x.progress?.completedModules??0)+' de '+(x.progress?.totalModules??0)+' módulos) · '+(x.evaluation?('Evaluación: '+x.evaluation.score+' · '+(x.evaluation.passed?'Aprobado':'Reprobado')):'Sin evaluación')+' · Constancias: '+(x.certificates||0)+' · Sesiones con asistencia: '+(x.sessionsAttended||0),'help'));
   }
   progHistory.append(list);
  }catch(e){progHistory.replaceChildren(errLine('el historial',e));}
 }
 progEnrSel.addEventListener('change',()=>{selectedEnrollmentId=progEnrSel.value||null;void loadProgressDetail();},{signal:ctx.signal});
 progEmpSel.addEventListener('change',()=>{selectedEmployeeId=progEmpSel.value||null;void loadEmployeeHistory();},{signal:ctx.signal});
 // ---------- Evaluaciones ----------
 const evalPanel=container('stack');
 const evalForm=el('form');evalForm.className='stack';
 const evf={
  enrollment:field('tr-ev-enrollment','Inscripción','select',[]),
  score:field('tr-ev-score','Calificación manual (0–100, vacío = derivar del quiz)','number')
 };
 evf.score.input.min='0';evf.score.input.max='100';
 const evalGrid=container('field-grid');
 for(const f of Object.values(evf))evalGrid.append(f.holder);
 const evalSave=button('Registrar evaluación','btn btn-primary');evalSave.type='submit';
 evalForm.append(line('Registrar evaluación','group-label'),
  line('Si el curso tiene módulos de certificación con quiz, la calificación se deriva del mejor intento de cada quiz. Sin ellos, escribe la calificación manual (por ejemplo, práctica presencial).','help'),
  evalGrid,evalSave);
 evalForm.addEventListener('submit',async ev=>{
  ev.preventDefault();evalSave.disabled=true;
  try{
   const score=evf.score.input.value===''?null:Math.max(0,Math.min(100,Math.round(Number(evf.score.input.value)||0)));
   const out=await write(base+'/evaluations','POST',{enrollmentId:evf.enrollment.input.value,score});
   ctx.notice('Evaluación registrada: '+out.evaluation.score+' de 100 · '+(out.evaluation.passed?'Aprobado':'Reprobado')+(out.evaluation.derived?' (derivada del quiz)':'')+'.');
   evalForm.reset();await loadEvaluations();await loadCertificates();await loadDashboard();
  }catch(e){ctx.notice('No se pudo registrar la evaluación: '+e.message,true);}
  finally{evalSave.disabled=false;}
 },{signal:ctx.signal});
 const evalList=container('stack');
 async function loadEvaluations(){
  try{const d=await api(base+'/evaluations');evaluations=d.evaluations||[];}catch(e){evaluations=[];evalList.replaceChildren(errLine('las evaluaciones',e));return;}
  drawEvaluations();
 }
 function drawEvaluations(){
  evalPanel.replaceChildren();
  evf.enrollment.input.replaceChildren();
  for(const x of enrollments)evf.enrollment.input.add(new Option((x.employeeName||'Empleado')+' · '+(x.courseName||'Curso'),x.id));
  if(canWrite)evalPanel.append(evalForm);
  evalPanel.append(line('Evaluaciones','group-label'),evalList);
  const visible=evaluations.filter(v=>((v.employeeName||'')+' '+(v.courseName||'')).toLowerCase().includes(q()));
  $('record-count').textContent=visible.length+' evaluaciones';
  evalList.replaceChildren();
  if(!visible.length){evalList.append(line(evaluations.length?'Sin evaluaciones con ese criterio.':'Sin evaluaciones todavía. Aprueba un quiz de certificación o registra una evaluación.','empty'));return;}
  for(const v of visible){
   const row=container('record survey-card'),info=container('stack');
   const course=courses.find(c=>c.id===v.courseId);
   info.append(el('strong',(v.employeeName||'Empleado')+' · '+(v.courseName||'Curso')),
    line('Calificación: '+v.score+' de 100 · '+(v.passed?'Aprobado':'Reprobado')+' · Nota mínima del curso: '+(course?.minScore??70)+(v.evaluatedAt?(' · '+date(v.evaluatedAt)):' '),'help'));
   row.append(info);evalList.append(row);
  }
 }
 // ---------- Certificados ----------
 const certPanel=container('stack');
 const certForm=el('form');certForm.className='stack';
 const cf2={enrollment:field('tr-cert-enrollment','Inscripción','select',[])};
 const certGrid=container('field-grid');
 for(const f of Object.values(cf2))certGrid.append(f.holder);
 const certSave=button('Emitir constancia','btn btn-primary');certSave.type='submit';
 certForm.append(line('Emitir constancia','group-label'),
  line('Solo se emite constancia si el empleado aprobó el curso (evaluación aprobada y, si el curso tiene módulos de certificación, quiz aprobado en cada uno).','help'),
  certGrid,certSave);
 certForm.addEventListener('submit',async ev=>{
  ev.preventDefault();certSave.disabled=true;
  try{
   const out=await write(base+'/certificates','POST',{enrollmentId:cf2.enrollment.input.value});
   ctx.notice('Constancia emitida: folio '+(out.certificate?.folio||''));await loadCertificates();
  }catch(e){ctx.notice('No se pudo emitir la constancia: '+e.message,true);}
  finally{certSave.disabled=false;}
 },{signal:ctx.signal});
 const certLookup=container('card-soft');
 const lookupInput=field('tr-cert-lookup','Consultar por folio');
 lookupInput.input.placeholder='Ej. CAP-2026-AB12CD';
 const lookupBtn=button('Consultar constancia','btn');
 const lookupResult=container('stack');
 lookupBtn.addEventListener('click',()=>{
  const folio=lookupInput.input.value.trim();
  if(!folio)return ctx.notice('Escribe el folio de la constancia.',true);
  const c=certificates.find(x=>x.folio===folio);
  if(!c){lookupResult.replaceChildren(line('No hay ninguna constancia con ese folio entre las cargadas.','error'));return;}
  lookupResult.replaceChildren(
   line(CERTIFICATE_THEME.title+' · Folio '+c.folio,'group-label'),
   line((c.employeeName||'Empleado')+' · '+(c.courseName||'Curso'),'help'),
   line('Emitida: '+fmtDay(c.issuedAt),'help'));
 },{signal:ctx.signal});
 certLookup.append(line('Consultar constancia por folio','group-label'),lookupInput.holder,lookupBtn,lookupResult);
 const certList=container('stack');
 async function loadCertificates(){
  try{const d=await api(base+'/certificates');certificates=d.certificates||[];}catch(e){certificates=[];certList.replaceChildren(errLine('los certificados',e));return;}
  drawCertificates();
 }
 function drawCertificates(){
  certPanel.replaceChildren();
  cf2.enrollment.input.replaceChildren();
  for(const x of enrollments)cf2.enrollment.input.add(new Option((x.employeeName||'Empleado')+' · '+(x.courseName||'Curso'),x.id));
  if(canWrite)certPanel.append(certForm);
  certPanel.append(certLookup,line('Constancias emitidas','group-label'),certList);
  const visible=certificates.filter(c=>
   ((c.employeeName||'')+' '+(c.courseName||'')+' '+(c.folio||'')).toLowerCase().includes(q()));
  $('record-count').textContent=visible.length+' constancias';
  certList.replaceChildren();
  if(!visible.length){certList.append(line(certificates.length?'Sin constancias con ese criterio.':'Sin constancias todavía. Se emiten solo al aprobar el curso.','empty'));return;}
  for(const c of visible){
   const card=container('record survey-card'),info=container('stack');
   info.append(el('strong',CERTIFICATE_THEME.title+' · '+c.folio),
    line([(c.employeeName||'Empleado'),(c.courseName||'Curso'),'Emitida: '+fmtDay(c.issuedAt)].join(' · '),'help'));
   card.append(info);certList.append(card);
  }
 }
 // ---------- Exportar CSV ----------
 const exportPanel=container('stack');
 async function exportCsv(kind){
  try{
   if(demoMode){
    const d=await api(base+'/export?kind='+kind);
    saveBlob(new Blob(['\uFEFF'+d.csv],{type:'text/csv;charset=utf-8'}),d.filename);
   }else{
    const response=await fetch(base+'/export?kind='+kind,{credentials:'same-origin'});
    if(!response.ok)throw Error('No se pudo exportar.');
    const name=(response.headers.get('content-disposition')||'').match(/filename="([^"]+)"/)?.[1]||('hubie-capacitacion-'+kind+'.csv');
    saveBlob(await response.blob(),name);
   }
   ctx.notice('Archivo CSV descargado.');
  }catch(e){ctx.notice('No se exportó: '+e.message,true);}
 }
 function drawExport(){
  exportPanel.replaceChildren(line('Exportar a CSV','group-label'),
   line('Descarga real del archivo con columnas y escape CSV correctos.','help'));
  const buttons=container('toolbar');
  for(const [kind,label] of [['progress','Avance'],['attendance','Asistencia']]){
   const btn=button('Descargar '+label+' (CSV)','btn');
   btn.addEventListener('click',()=>void exportCsv(kind),{signal:ctx.signal});
   buttons.append(btn);
  }
  exportPanel.append(buttons);
 }
 // ---------- Cambio de pestaña y arranque ----------
 const panelsByTab={dashboard:dashPanel,courses:coursesPanel,sessions:sessionsPanel,employees:employeesPanel,
  enrollments:enrollPanel,attendance:attendancePanel,progress:progressPanel,evaluations:evalPanel,certificates:certPanel,export:exportPanel};
 async function showTab(){
  panels.replaceChildren(panelsByTab[activeTab]);
  if(activeTab==='dashboard')await loadDashboard();
  if(activeTab==='courses'){await loadCourses();await loadEnrollments();}
  if(activeTab==='sessions'){await loadCourses();await loadSessions();}
  if(activeTab==='employees')await loadEmployees();
  if(activeTab==='enrollments'){await loadEmployees();await loadCourses();await loadSessions();await loadEnrollments();}
  if(activeTab==='attendance'){await loadCourses();await loadSessions();await loadEnrollments();await loadAttendance();}
  if(activeTab==='progress'){await loadEmployees();await loadEnrollments();await loadProgress();}
  if(activeTab==='evaluations'){await loadCourses();await loadEnrollments();await loadEvaluations();}
  if(activeTab==='certificates'){await loadEnrollments();await loadCertificates();}
  if(activeTab==='export')drawExport();
 }
 ctx.search.addEventListener('input',()=>{
  if(activeTab==='courses')drawCourses();
  else if(activeTab==='employees')drawEmployees();
  else if(activeTab==='enrollments')drawEnrollments();
  else if(activeTab==='sessions')drawSessions();
  else if(activeTab==='progress')drawProgress();
  else if(activeTab==='evaluations')drawEvaluations();
  else if(activeTab==='certificates')drawCertificates();
 },{signal:ctx.signal});
 $('module-message').textContent='Capacitaciones: cursos, sesiones, asistencia, avance, evaluaciones y constancias de tu equipo.';
 drawTabs();
 try{
  await loadCourses();await loadEmployees();await loadEnrollments();await loadDashboard();
 }catch(e){ctx.notice('Error al abrir Capacitaciones: '+e.message,true);}
 await showTab();
}
