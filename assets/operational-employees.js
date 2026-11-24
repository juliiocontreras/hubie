// Empleados (T026) — directorio de Recursos Humanos sobre la misma tabla
// de T022 (tenant_training_employees). Ficha completa (puesto, área,
// contrato, documentos) con CRUD; los documentos son solo metadatos.
// Contrato real: platform/employees-store.mjs + employees-domain.mjs
// (migración 031). Todo contra /api/app/<slug>/employees/...; si la API
// falla se muestra el error, nunca se inventan filas.
// Tablero con la composición de la referencia de Julio (dashboard fitness
// morado, suite Health): tarjeta héroe con gráfica de área (ingresos por
// mes) y 3 chips KPI dentro (empleados activos, asistencia hoy, vacaciones
// pendientes), tarjetas de actividad por empleado con barra de progreso y %
// (avance de capacitación, asistencia del mes) y lista lateral del equipo
// con avatar y estado. La marca sigue siendo Hubie: Nunito, tinta #16123a,
// gradiente morado-rosa. Sin emojis como iconografía, sin letras como
// iconos, sin barras visibles.
import {field,line,button,container,money} from './app-workflows.js';
import {icon} from './ui-icons.js';
const demoMode=new URLSearchParams(location.search).get('demo')==='1';
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const CONTRACTS=[['indefinido','Indefinido'],['temporal','Temporal'],['por obra','Por obra'],['prácticas','Prácticas']];
const STATUSES={activo:'Activo',inactivo:'Inactivo'};
const DOC_TYPES=[['contrato','Contrato'],['identificación','Identificación'],['comprobante','Comprobante'],['certificado','Certificado'],['otro','Otro']];
const fmtDay=iso=>iso?new Date(String(iso).slice(0,10)+'T00:00:00').toLocaleDateString('es-MX',{dateStyle:'medium'}):'—';
const fmtMoney=cents=>cents===null||cents===undefined?'Sin salario registrado':money(cents);
const byName=(a,b)=>(a.name||'').localeCompare(b.name||'','es');
const initials=name=>(name||'?').trim().split(/\s+/).slice(0,2).map(w=>w[0]||'').join('').toUpperCase();
const MONTHS=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
const monthLabel=ym=>{const [y,m]=ym.split('-').map(Number);return MONTHS[(m||1)-1]+' '+(y||'');};
// Gráfica de área (SVG de línea, sin librerías): ingresos por mes.
function areaChart(points){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 300 90');svg.setAttribute('width','100%');svg.setAttribute('height','90');
 svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');
 const max=Math.max(1,...points.map(p=>p.count));
 const xs=i=>points.length===1?150:10+i*(280/Math.max(1,points.length-1));
 const ys=c=>78-(c/max)*62;
 const linePts=points.map((p,i)=>xs(i)+','+ys(p.count)).join(' ');
 const area=document.createElementNS('http://www.w3.org/2000/svg','polygon');
 area.setAttribute('points','10,84 '+linePts+' '+(points.length?xs(points.length-1):290)+',84');
 area.setAttribute('fill','rgba(255,255,255,.25)');
 const lineEl=document.createElementNS('http://www.w3.org/2000/svg','polyline');
 lineEl.setAttribute('points',linePts);lineEl.setAttribute('fill','none');
 lineEl.setAttribute('stroke','#fff');lineEl.setAttribute('stroke-width','2.5');
 lineEl.setAttribute('stroke-linecap','round');lineEl.setAttribute('stroke-linejoin','round');
 svg.append(area,lineEl);
 for(let i=0;i<points.length;i++){
  const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');
  dot.setAttribute('cx',String(xs(i)));dot.setAttribute('cy',String(ys(points[i].count)));dot.setAttribute('r','3.5');
  dot.setAttribute('fill','#fff');svg.append(dot);
 }
 return svg;
}
function progressBar(pct){
 const track=el('div');track.className='hr-progress';
 const fill=el('i');fill.style.width=Math.max(0,Math.min(100,pct||0))+'%';
 track.append(fill);return track;
}

export async function renderEmployees(ctx){
 const slug=encodeURIComponent(ctx.config.tenant.slug),base='/api/app/'+slug+'/employees';
 const canWrite=ctx.config.tenant.role!=='viewer';
 const host=$('record-list');
 const overview=container('cards'),tabsBar=container('toolbar'),panels=container('stack');
 host.replaceChildren(overview,tabsBar,panels);
 $('record-count').textContent='Empleados';
 if(demoMode)host.prepend(line('Estás en modo demostración: los datos de empleados son de ejemplo y se guardan solo en esta pestaña.','help'));
 let employees=[],dashboard=null,documents=[];
 let activeTab='dashboard',selectedEmployeeId=null;
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
  for(const [key,label] of [['dashboard','Tablero'],['directory','Directorio'],['documents','Documentos']])tabsBar.append(tabButton(key,label));
 }
 // ---------- Tablero (composición ref. Health) ----------
 const dashPanel=container('stack');
 async function loadDashboard(){
  try{dashboard=await api(base+'/dashboard');}catch(e){dashboard=null;dashPanel.replaceChildren(errLine('el tablero',e));return;}
  drawDashboard();
 }
 function drawDashboard(){
  dashPanel.replaceChildren();
  if(!dashboard){dashPanel.append(line('Cargando tablero…','help'));return;}
  const k=dashboard.kpis||{};
  const grid=container('hr-hero-grid');
  const hero=el('div');hero.className='hr-hero';
  hero.append(el('h3','Resumen del equipo'),
   line('Ingresos por mes (últimos 6 meses) y actividad del equipo.','help'));
  const points=(dashboard.hiresByMonth||[]).slice(-6);
  if(points.length)hero.append(areaChart(points));
  else hero.append(line('Sin fechas de ingreso registradas todavía: la gráfica aparece cuando los empleados tengan fecha de ingreso.','help'));
  const labels=el('div');labels.className='hr-hero-kpis';
  for(const [label,value] of [['Empleados activos',String(k.activos??0)],['Asistencia hoy',String(k.asistenciaHoy??0)],['Vacaciones pendientes',String(k.vacacionesPendientes??0)]]){
   const chip=el('div');chip.className='hr-hero-kpi';
   chip.append(el('b',value),el('span',label));labels.append(chip);
  }
  hero.append(labels);
  const monthRow=container('stack');
  if(points.length){
   monthRow.append(line(points.map(p=>monthLabel(p.month)+': '+p.count).join(' · '),'help'));
   hero.append(monthRow);
  }
  const teamCard=container('card-soft');
  teamCard.append(line('Equipo','group-label'));
  const teamList=container('stack');
  const team=dashboard.team||[];
  if(!team.length)teamList.append(line('Sin empleados activos todavía.','empty'));
  for(const t of team){
   const row=container('record survey-card');
   const avatar=el('div',initials(t.name),'hr-avatar'+(t.estado==='inactivo'?' hr-avatar--inactive':''));
   const info=container('stack');
   info.append(el('strong',t.name),line([t.position,t.area].filter(Boolean).join(' · ')||'Sin puesto registrado','help'));
   const status=el('span',STATUSES[t.estado]||t.estado,'hr-status'+(t.estado==='inactivo'?' hr-status--inactive':''));
   row.append(avatar,info,status);teamList.append(row);
  }
  teamCard.append(teamList);
  grid.append(hero,teamCard);
  dashPanel.append(grid);
  // Tarjetas de actividad por empleado: avance de capacitación y asistencia del mes.
  const activity=container('stack');
  activity.append(line('Actividad por empleado','group-label'));
  const cards=container('cards');
  const acts=dashboard.activity||[];
  if(!acts.length)activity.append(line('Sin actividad todavía: registra empleados y su asistencia para ver su avance aquí.','empty'));
  for(const a of acts){
   const card=container('card-soft');
   const head=container('record');
   const ic=el('div');ic.className='hr-activity-icon';ic.append(icon('users',20));
   const info=container('stack');
   info.append(el('strong',a.name),line([a.position,a.area].filter(Boolean).join(' · ')||'Sin puesto registrado','help'));
   head.append(ic,info);card.append(head);
   if(a.trainingProgress===null||a.trainingProgress===undefined){
    card.append(line('Capacitación: sin inscripciones todavía.','help'));
   }else{
    card.append(line('Avance de capacitación: '+a.trainingProgress+'%','help'),progressBar(a.trainingProgress));
   }
   card.append(line('Asistencia del mes: '+a.attendanceMonthPct+'% ('+(a.workdaysThisMonth||0)+' días con registro)','help'),
    progressBar(a.attendanceMonthPct));
   cards.append(card);
  }
  activity.append(cards);
  dashPanel.append(activity);
  overview.replaceChildren();
  for(const [label,value] of [['Empleados activos',String(k.activos??0)],['Asistencia hoy',String(k.asistenciaHoy??0)],
   ['Vacaciones pendientes',String(k.vacacionesPendientes??0)],['Documentos',String(k.documentos??0)]]){
   const card=container('stat');card.append(el('span',label,'stat-label'),el('div',value,'stat-number'));overview.append(card);
  }
 }
 // ---------- Directorio ----------
 const dirPanel=container('stack');
 const empForm=el('form');empForm.className='stack';
 const ef={
  name:field('hr-emp-name','Nombre completo'),email:field('hr-emp-email','Correo','email'),
  position:field('hr-emp-position','Puesto'),area:field('hr-emp-area','Área'),
  fechaIngreso:field('hr-emp-hired','Fecha de ingreso','date'),
  tipoContrato:field('hr-emp-contract','Tipo de contrato','select',CONTRACTS),
  salario:field('hr-emp-salary','Salario mensual (MXN)','number'),
  estado:field('hr-emp-status','Estado','select',Object.entries(STATUSES))
 };
 ef.name.input.required=true;ef.email.input.required=true;ef.salario.input.min='0';ef.salario.input.step='0.01';
 const empGrid=container('field-grid');
 for(const f of Object.values(ef))empGrid.append(f.holder);
 const empSave=button('Registrar empleado','btn btn-primary');empSave.type='submit';
 const empCancel=button('Cancelar edición');empCancel.hidden=true;
 const empActions=container('toolbar');empActions.append(empSave,empCancel);
 empForm.append(line('Registrar o editar empleado','group-label'),
  line('El salario mensual alimenta la nómina (T031) y solo lo ven quienes abren este directorio.','help'),
  empGrid,empActions);
 let editingEmployee=null;
 function resetEmpForm(){
  editingEmployee=null;empForm.reset();ef.tipoContrato.input.value='indefinido';ef.estado.input.value='activo';
  empSave.textContent='Registrar empleado';empCancel.hidden=true;
 }
 empCancel.addEventListener('click',resetEmpForm,{signal:ctx.signal});
 empForm.addEventListener('submit',async ev=>{
  ev.preventDefault();empSave.disabled=true;
  const salaryRaw=ef.salario.input.value===''?null:Math.round(Number(ef.salario.input.value)*100);
  const body={name:ef.name.input.value.trim(),email:ef.email.input.value.trim(),
   position:ef.position.input.value.trim(),area:ef.area.input.value.trim(),
   fechaIngreso:ef.fechaIngreso.input.value||null,
   tipoContrato:ef.tipoContrato.input.value||null,
   salarioMensualCents:salaryRaw===null?null:Math.max(0,salaryRaw),
   estado:ef.estado.input.value};
  try{
   if(editingEmployee)await write(base+'/employees/'+editingEmployee,'PATCH',body);
   else await write(base+'/employees','POST',body);
   ctx.notice(editingEmployee?'Empleado actualizado.':'Empleado registrado.');
   resetEmpForm();await loadEmployees();await loadDashboard();
  }catch(e){ctx.notice('No se pudo guardar el empleado: '+e.message,true);}
  finally{empSave.disabled=false;}
 },{signal:ctx.signal});
 const empList=container('stack');
 async function loadEmployees(){
  try{const d=await api(base+'/employees');employees=d.employees||[];}catch(e){employees=[];empList.replaceChildren(errLine('los empleados',e));return;}
  drawDirectory();
 }
 function drawDirectory(){
  dirPanel.replaceChildren();
  if(canWrite)dirPanel.append(empForm);
  dirPanel.append(line('Directorio','group-label'),empList);
  const visible=[...employees].sort(byName).filter(e=>(e.name+' '+(e.email||'')+' '+(e.position||'')+' '+(e.area||'')).toLowerCase().includes(q()));
  $('record-count').textContent=visible.length+' empleados';
  empList.replaceChildren();
  if(!visible.length){empList.append(line(employees.length?'Sin empleados con ese criterio.':'Sin empleados todavía. Registra al primero con el formulario de arriba.','empty'));return;}
  for(const e of visible){
   const row=container('record survey-card');
   const avatar=el('div',initials(e.name),'hr-avatar'+(e.estado==='inactivo'?' hr-avatar--inactive':''));
   const info=container('stack');
   info.append(el('strong',e.name),
    line([e.email,e.position,e.area,
     e.fechaIngreso?('Ingreso: '+fmtDay(e.fechaIngreso)):'',
     e.tipoContrato?('Contrato: '+(CONTRACTS.find(c=>c[0]===e.tipoContrato)?.[1]||e.tipoContrato)):'',
     'Salario: '+fmtMoney(e.salarioMensualCents),
     (e.documents??0)+' documento(s)'].filter(Boolean).join(' · '),'help'));
   const actions=container('record-actions');
   const docs=button('Documentos','btn');
   docs.addEventListener('click',()=>{selectedEmployeeId=e.id;activeTab='documents';drawTabs();void showTab();},{signal:ctx.signal});
   actions.append(docs);
   if(canWrite){
    const edit=button('Editar','btn');
    edit.addEventListener('click',()=>{editingEmployee=e.id;ef.name.input.value=e.name||'';ef.email.input.value=e.email||'';
     ef.position.input.value=e.position||'';ef.area.input.value=e.area||'';ef.fechaIngreso.input.value=(e.fechaIngreso||'').slice(0,10);
     ef.tipoContrato.input.value=e.tipoContrato||'indefinido';
     ef.salario.input.value=e.salarioMensualCents===null||e.salarioMensualCents===undefined?'':(e.salarioMensualCents/100).toFixed(2);
     ef.estado.input.value=e.estado||'activo';
     empSave.textContent='Guardar cambios';empCancel.hidden=false;empForm.scrollIntoView({block:'center',behavior:'smooth'});},{signal:ctx.signal});
    const toggle=button(e.estado==='activo'?'Dar de baja':'Reactivar','btn');
    toggle.addEventListener('click',async()=>{
     try{await write(base+'/employees/'+e.id+'/status','PATCH',{estado:e.estado==='activo'?'inactivo':'activo'});
      await loadEmployees();await loadDashboard();}
     catch(err){ctx.notice(err.message,true);}
    },{signal:ctx.signal});
    actions.append(edit,toggle);
   }
   row.append(avatar,info,actions);empList.append(row);
  }
 }
 // ---------- Documentos ----------
 const docsPanel=container('stack');
 const docForm=el('form');docForm.className='stack';
 const df={
  employee:field('hr-doc-employee','Empleado','select',[]),
  tipo:field('hr-doc-type','Tipo de documento','select',DOC_TYPES),
  nombre:field('hr-doc-name','Nombre del documento'),fecha:field('hr-doc-date','Fecha','date'),
  notas:field('hr-doc-notes','Notas','textarea')
 };
 df.nombre.input.required=true;
 const docGrid=container('field-grid');
 for(const f of Object.values(df))docGrid.append(f.holder);
 const docSave=button('Registrar documento','btn btn-primary');docSave.type='submit';
 docForm.append(line('Registrar documento','group-label'),
  line('Solo se guardan los datos del documento (tipo, nombre, fecha y notas). El archivo físico se guarda fuera de Hubie por ahora.','help'),
  docGrid,docSave);
 docForm.addEventListener('submit',async ev=>{
  ev.preventDefault();if(!df.employee.input.value)return ctx.notice('Selecciona un empleado.',true);
  docSave.disabled=true;
  try{
   await write(base+'/employees/'+df.employee.input.value+'/documents','POST',
    {tipo:df.tipo.input.value,nombre:df.nombre.input.value.trim(),fecha:df.fecha.input.value||null,notas:df.notas.input.value.trim()});
   ctx.notice('Documento registrado.');docForm.reset();await loadDocuments();await loadEmployees();
  }catch(e){ctx.notice('No se pudo registrar el documento: '+e.message,true);}
  finally{docSave.disabled=false;}
 },{signal:ctx.signal});
 const docEmpSel=el('select');docEmpSel.className='search';docEmpSel.setAttribute('aria-label','Empleado para ver sus documentos');
 const docList=container('stack');
 async function loadDocuments(){
  try{
   const d=selectedEmployeeId
    ?await api(base+'/employees/'+selectedEmployeeId+'/documents')
    :await api(base+'/documents');
   documents=d.documents||[];
  }catch(e){documents=[];docList.replaceChildren(errLine('los documentos',e));return;}
  drawDocuments();
 }
 function drawDocuments(){
  docsPanel.replaceChildren();
  df.employee.input.replaceChildren();
  for(const e of [...employees].sort(byName))df.employee.input.add(new Option(e.name+' · '+(e.position||''),e.id));
  df.employee.input.value=selectedEmployeeId||'';
  docEmpSel.replaceChildren(new Option('Todos los empleados',''));
  for(const e of [...employees].sort(byName))docEmpSel.add(new Option(e.name,e.id));
  docEmpSel.value=selectedEmployeeId||'';
  if(canWrite)docsPanel.append(docForm);
  docsPanel.append(line('Documentos por empleado','group-label'),docEmpSel,docList);
  const visible=documents.filter(d=>(!selectedEmployeeId||d.employeeId===selectedEmployeeId)&&
   ((d.nombre||'')+' '+(d.employeeName||'')).toLowerCase().includes(q()));
  $('record-count').textContent=visible.length+' documentos';
  docList.replaceChildren();
  if(!visible.length){docList.append(line(documents.length?'Sin documentos con ese criterio.':'Sin documentos todavía. Registra el primero con el formulario de arriba.','empty'));return;}
  for(const d of visible){
   const row=container('record survey-card'),info=container('stack');
   info.append(el('strong',d.nombre),
    line([(DOC_TYPES.find(t=>t[0]===d.tipo)?.[1]||d.tipo),d.employeeName||'',d.fecha?('Fecha: '+fmtDay(d.fecha)):'',d.notas||''].filter(Boolean).join(' · '),'help'));
   const actions=container('record-actions');
   if(canWrite){
    const del=button('Eliminar','btn btn-danger');
    del.addEventListener('click',async()=>{
     if(!confirm('¿Eliminar este documento del registro? Solo se borra el dato; el archivo físico no está en Hubie.'))return;
     try{await write(base+'/documents/'+d.id,'DELETE');await loadDocuments();await loadEmployees();}
     catch(e){ctx.notice('No se pudo eliminar el documento: '+e.message,true);}
    },{signal:ctx.signal});
    actions.append(del);
   }
   row.append(info,actions);docList.append(row);
  }
 }
 docEmpSel.addEventListener('change',()=>{selectedEmployeeId=docEmpSel.value||null;df.employee.input.value=selectedEmployeeId||'';void loadDocuments();},{signal:ctx.signal});
 // ---------- Cambio de pestaña ----------
 async function showTab(){
  if(activeTab==='dashboard'){panels.replaceChildren(dashPanel);await loadDashboard();}
  else if(activeTab==='directory'){panels.replaceChildren(dirPanel);await loadEmployees();}
  else if(activeTab==='documents'){panels.replaceChildren(docsPanel);await loadDocuments();}
 }
 drawTabs();
 await loadEmployees();
 await showTab();
}
