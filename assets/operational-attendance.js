// Asistencia y vacaciones (T027) — registro de jornada y solicitudes.
// Solo registro y aprobación: no hay saldos ni políticas de vacaciones
// inventadas; el resumen muestra días de vacaciones APROBADOS en el año.
// La aprobación/rechazo es solo para dueño/admin.
// Contrato real: platform/attendance-store.mjs + attendance-domain.mjs
// (migración 032). Todo contra /api/app/<slug>/attendance/...; si la API
// falla se muestra el error, nunca se inventan filas.
// Marca Hubie: Nunito, tinta #16123a, morado #7c5cfc, rosa #ec4899.
// Sin emojis como iconografía, sin letras como iconos, sin barras visibles.
import {field,line,button,container} from './app-workflows.js';
const demoMode=new URLSearchParams(location.search).get('demo')==='1';
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const REQUEST_TYPES=[['vacaciones','Vacaciones'],['permiso','Permiso']];
const REQUEST_STATUSES={pendiente:'Pendiente',aprobada:'Aprobada',rechazada:'Rechazada'};
const fmtDay=iso=>iso?new Date(String(iso).slice(0,10)+'T00:00:00').toLocaleDateString('es-MX',{dateStyle:'medium'}):'—';
const fmtHours=minutes=>minutes===null||minutes===undefined?'Sin salida registrada':Math.floor(minutes/60)+' h '+String(minutes%60).padStart(2,'0')+' min';
const byName=(a,b)=>(a.name||'').localeCompare(b.name||'','es');
const todayStr=()=>new Date().toISOString().slice(0,10);

export async function renderAttendance(ctx){
 const slug=encodeURIComponent(ctx.config.tenant.slug),base='/api/app/'+slug+'/attendance';
 const empBase='/api/app/'+slug+'/employees';
 const canWrite=ctx.config.tenant.role!=='viewer';
 const canResolve=['owner','admin'].includes(ctx.config.tenant.role);
 const host=$('record-list');
 const overview=container('cards'),tabsBar=container('toolbar'),panels=container('stack');
 host.replaceChildren(overview,tabsBar,panels);
 $('record-count').textContent='Asistencia y vacaciones';
 if(demoMode)host.prepend(line('Estás en modo demostración: los datos de asistencia son de ejemplo y se guardan solo en esta pestaña.','help'));
 let employees=[],workdays=[],requests=[],summary=null,dash=null;
 let activeTab='workdays',selectedEmployeeId=null,filterStatus='';
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
  for(const [key,label] of [['workdays','Jornada'],['requests','Solicitudes'],['summary','Resumen']])tabsBar.append(tabButton(key,label));
 }
 async function loadEmployees(){
  try{const d=await api(empBase+'/employees');employees=d.employees||[];}
  catch{employees=[];}
 }
 // ---------- Jornada ----------
 const workPanel=container('stack');
 const workForm=el('form');workForm.className='stack';
 const wf={
  employee:field('at-work-employee','Empleado','select',[]),
  fecha:field('at-work-date','Fecha','date'),
  entrada:field('at-work-in','Entrada','time'),salida:field('at-work-out','Salida','time'),
  notas:field('at-work-notes','Notas','textarea')
 };
 wf.fecha.input.value=todayStr();wf.entrada.input.value='09:00';wf.salida.input.value='18:00';
 const workGrid=container('field-grid');
 for(const f of Object.values(wf))workGrid.append(f.holder);
 const workSave=button('Registrar jornada','btn btn-primary');workSave.type='submit';
 workForm.append(line('Registrar jornada','group-label'),
  line('Un registro por empleado y día: si ya existe, se actualiza. Las horas se calculan de entrada y salida.','help'),
  workGrid,workSave);
 workForm.addEventListener('submit',async ev=>{
  ev.preventDefault();workSave.disabled=true;
  try{
   const out=await write(base+'/workdays','POST',{employeeId:wf.employee.input.value,fecha:wf.fecha.input.value,
    entrada:wf.entrada.input.value||null,salida:wf.salida.input.value||null,notas:wf.notas.input.value.trim()});
   ctx.notice('Jornada registrada: '+fmtHours(out.workday.minutes)+'.');
   await loadWorkdays();await loadDashboard();
  }catch(e){ctx.notice('No se pudo registrar la jornada: '+e.message,true);}
  finally{workSave.disabled=false;}
 },{signal:ctx.signal});
 const workEmpSel=el('select');workEmpSel.className='search';workEmpSel.setAttribute('aria-label','Empleado para ver su jornada');
 const workList=container('stack');
 async function loadWorkdays(){
  try{
   const query=selectedEmployeeId?('?employeeId='+encodeURIComponent(selectedEmployeeId)):'';
   const d=await api(base+'/workdays'+query);workdays=d.workdays||[];
  }catch(e){workdays=[];workList.replaceChildren(errLine('la jornada',e));return;}
  drawWorkdays();
 }
 function drawWorkdays(){
  workPanel.replaceChildren();
  wf.employee.input.replaceChildren();
  for(const e of [...employees].sort(byName))wf.employee.input.add(new Option(e.name+' · '+(e.position||''),e.id));
  wf.employee.input.value=selectedEmployeeId||wf.employee.input.value||'';
  workEmpSel.replaceChildren(new Option('Todos los empleados',''));
  for(const e of [...employees].sort(byName))workEmpSel.add(new Option(e.name,e.id));
  workEmpSel.value=selectedEmployeeId||'';
  if(canWrite)workPanel.append(workForm);
  workPanel.append(line('Jornada registrada','group-label'),workEmpSel,workList);
  const visible=workdays.filter(w=>((w.employeeName||'')+' '+(w.fecha||'')).toLowerCase().includes(q()));
  $('record-count').textContent=visible.length+' registros de jornada';
  workList.replaceChildren();
  if(!visible.length){workList.append(line(workdays.length?'Sin jornada con ese criterio.':'Sin jornada registrada todavía. Registra la primera con el formulario de arriba.','empty'));return;}
  for(const w of visible){
   const row=container('record survey-card'),info=container('stack');
   info.append(el('strong',(w.employeeName||'Empleado')+' · '+fmtDay(w.fecha)),
    line([w.entrada?('Entrada: '+w.entrada):'Sin entrada',w.salida?('Salida: '+w.salida):'Sin salida',
     'Horas: '+fmtHours(w.minutes),w.notas||''].filter(Boolean).join(' · '),'help'));
   const actions=container('record-actions');
   if(canWrite){
    const edit=button('Editar','btn');
    edit.addEventListener('click',()=>{selectedEmployeeId=w.employeeId;wf.employee.input.value=w.employeeId;
     wf.fecha.input.value=(w.fecha||'').slice(0,10);wf.entrada.input.value=w.entrada||'';wf.salida.input.value=w.salida||'';
     wf.notas.input.value=w.notas||'';workForm.scrollIntoView({block:'center',behavior:'smooth'});},{signal:ctx.signal});
    actions.append(edit);
   }
   row.append(info,actions);workList.append(row);
  }
 }
 workEmpSel.addEventListener('change',()=>{selectedEmployeeId=workEmpSel.value||null;void loadWorkdays();},{signal:ctx.signal});
 // ---------- Solicitudes ----------
 const reqPanel=container('stack');
 const reqForm=el('form');reqForm.className='stack';
 const rf={
  employee:field('at-req-employee','Empleado','select',[]),
  tipo:field('at-req-type','Tipo','select',REQUEST_TYPES),
  inicio:field('at-req-from','Desde','date'),fin:field('at-req-to','Hasta','date'),
  motivo:field('at-req-reason','Motivo','textarea')
 };
 rf.motivo.input.required=true;
 const reqGrid=container('field-grid');
 for(const f of Object.values(rf))reqGrid.append(f.holder);
 const reqSave=button('Enviar solicitud','btn btn-primary');reqSave.type='submit';
 reqForm.append(line('Nueva solicitud','group-label'),
  line('Las solicitudes quedan pendientes hasta que el dueño o el administrador las apruebe o rechace.','help'),
  reqGrid,reqSave);
 reqForm.addEventListener('submit',async ev=>{
  ev.preventDefault();reqSave.disabled=true;
  try{
   await write(base+'/requests','POST',{employeeId:rf.employee.input.value,tipo:rf.tipo.input.value,
    fechaInicio:rf.inicio.input.value,fechaFin:rf.fin.input.value,motivo:rf.motivo.input.value.trim()});
   ctx.notice('Solicitud enviada: queda pendiente de aprobación.');
   reqForm.reset();await loadRequests();await loadDashboard();
  }catch(e){ctx.notice('No se pudo enviar la solicitud: '+e.message,true);}
  finally{reqSave.disabled=false;}
 },{signal:ctx.signal});
 const reqStatusSel=el('select');reqStatusSel.className='search';reqStatusSel.setAttribute('aria-label','Filtrar solicitudes por estado');
 const reqList=container('stack');
 async function loadRequests(){
  try{
   const query=filterStatus?('?estado='+encodeURIComponent(filterStatus)):'';
   const d=await api(base+'/requests'+query);requests=d.requests||[];
  }catch(e){requests=[];reqList.replaceChildren(errLine('las solicitudes',e));return;}
  drawRequests();
 }
 function drawRequests(){
  reqPanel.replaceChildren();
  rf.employee.input.replaceChildren();
  for(const e of [...employees].sort(byName))rf.employee.input.add(new Option(e.name+' · '+(e.position||''),e.id));
  reqStatusSel.replaceChildren(new Option('Todos los estados',''));
  for(const [v,l] of Object.entries(REQUEST_STATUSES))reqStatusSel.add(new Option(l,v));
  reqStatusSel.value=filterStatus;
  if(canWrite)reqPanel.append(reqForm);
  reqPanel.append(line('Solicitudes','group-label'),reqStatusSel,reqList);
  const visible=requests.filter(r=>((r.employeeName||'')+' '+(r.motivo||'')).toLowerCase().includes(q()));
  $('record-count').textContent=visible.length+' solicitudes';
  reqList.replaceChildren();
  if(!visible.length){reqList.append(line(requests.length?'Sin solicitudes con ese criterio.':'Sin solicitudes todavía. Envía la primera con el formulario de arriba.','empty'));return;}
  for(const r of visible){
   const row=container('record survey-card'),info=container('stack');
   info.append(el('strong',(r.employeeName||'Empleado')+' · '+(REQUEST_TYPES.find(t=>t[0]===r.tipo)?.[1]||r.tipo)),
    line([fmtDay(r.fechaInicio)+' – '+fmtDay(r.fechaFin),r.days+' día(s)',REQUEST_STATUSES[r.estado]||r.estado,
     'Motivo: '+r.motivo,r.resueltaAt?('Resuelta: '+fmtDay(r.resueltaAt)):''].filter(Boolean).join(' · '),'help'));
   const actions=container('record-actions');
   if(canResolve&&r.estado==='pendiente'){
    const okBtn=button('Aprobar','btn btn-primary');
    okBtn.addEventListener('click',async()=>{
     try{await write(base+'/requests/'+r.id+'/resolve','PATCH',{estado:'aprobada'});
      ctx.notice('Solicitud aprobada.');await loadRequests();await loadDashboard();}
     catch(e){ctx.notice('No se pudo aprobar: '+e.message,true);}
    },{signal:ctx.signal});
    const noBtn=button('Rechazar','btn btn-danger');
    noBtn.addEventListener('click',async()=>{
     try{await write(base+'/requests/'+r.id+'/resolve','PATCH',{estado:'rechazada'});
      ctx.notice('Solicitud rechazada.');await loadRequests();await loadDashboard();}
     catch(e){ctx.notice('No se pudo rechazar: '+e.message,true);}
    },{signal:ctx.signal});
    actions.append(okBtn,noBtn);
   }else if(r.estado==='pendiente'){
    actions.append(line('Pendiente de aprobación por el dueño o el administrador.','help'));
   }
   row.append(info,actions);reqList.append(row);
  }
 }
 reqStatusSel.addEventListener('change',()=>{filterStatus=reqStatusSel.value;void loadRequests();},{signal:ctx.signal});
 // ---------- Resumen ----------
 const sumPanel=container('stack');
 const sumList=container('stack');
 async function loadSummary(){
  try{
   const year=new Date().getFullYear();
   const d=await api(base+'/summary?year='+year);summary=d;
   dash=await api(base+'/dashboard');
  }catch(e){summary=null;dash=null;sumPanel.replaceChildren(errLine('el resumen',e));return;}
  drawSummary();
 }
 function drawSummary(){
  sumPanel.replaceChildren(line('Vacaciones aprobadas en el año','group-label'));
  if(!summary){sumPanel.append(line('Cargando resumen…','help'));return;}
  sumPanel.append(line('Días de vacaciones APROBADOS en '+summary.year+' por empleado. No hay saldos ni políticas: es el conteo de solicitudes aprobadas.','help'));
  const stats=container('cards');
  for(const [label,value] of [['Solicitudes pendientes',String(dash?.kpis?.pendingRequests??0)],
   ['Días de vacaciones aprobados',String(dash?.kpis?.approvedVacationDays??0)],
   ['Registros de jornada este mes',String(dash?.kpis?.workdaysThisMonth??0)],
   ['Empleados activos',String(dash?.kpis?.activeEmployees??0)]]){
   const card=container('stat');card.append(el('span',label,'stat-label'),el('div',value,'stat-number'));stats.append(card);
  }
  sumPanel.append(stats,sumList);
  sumList.replaceChildren();
  if(!(summary.employees||[]).length){sumList.append(line('Sin vacaciones aprobadas en '+summary.year+' todavía.','empty'));return;}
  for(const x of summary.employees){
   const row=container('record survey-card'),info=container('stack');
   info.append(el('strong',x.employeeName),line(x.days+' día(s) de vacaciones aprobados en '+summary.year,'help'));
   row.append(info);sumList.append(row);
  }
 }
 // ---------- Cambio de pestaña ----------
 async function showTab(){
  if(activeTab==='workdays'){panels.replaceChildren(workPanel);await loadWorkdays();}
  else if(activeTab==='requests'){panels.replaceChildren(reqPanel);await loadRequests();}
  else if(activeTab==='summary'){panels.replaceChildren(sumPanel);await loadSummary();}
  else panels.replaceChildren(workPanel);
 }
 async function loadDashboard(){
  try{dash=await api(base+'/dashboard');}catch{dash=null;}
  if(!dash)return;
  overview.replaceChildren();
  for(const [label,value] of [['Solicitudes pendientes',String(dash.kpis?.pendingRequests??0)],
   ['Días de vacaciones aprobados',String(dash.kpis?.approvedVacationDays??0)],
   ['Registros de jornada este mes',String(dash.kpis?.workdaysThisMonth??0)],
   ['Empleados activos',String(dash.kpis?.activeEmployees??0)]]){
   const card=container('stat');card.append(el('span',label,'stat-label'),el('div',value,'stat-number'));overview.append(card);
  }
 }
 drawTabs();
 await loadEmployees();
 await loadDashboard();
 await showTab();
}
