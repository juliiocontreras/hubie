// Nómina (T031) — periodos, conceptos configurables y recibos por empleado.
// LÍMITE HONESTO: cálculo básico, sin timbrado CFDI de nómina ni cálculo
// real de IMSS/ISR. El salario base se toma del directorio de empleados
// (T026); un periodo quincenal usa la mitad del mensual. El neto se calcula
// en servidor, nunca se confía en el del cliente.
// Contrato real: platform/payroll-store.mjs + payroll-domain.mjs
// (migración 036). Todo contra /api/app/<slug>/payroll/...; si la API falla
// se muestra el error, nunca se inventan filas.
// Marca Hubie: Nunito, tinta #16123a, morado #7c5cfc, rosa #ec4899.
// Sin emojis como iconografía, sin letras como iconos, sin barras visibles.
import {field,line,button,container,money} from './app-workflows.js';
const demoMode=new URLSearchParams(location.search).get('demo')==='1';
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const PERIOD_TYPES=[['quincenal','Quincenal'],['mensual','Mensual']];
const PERIOD_STATUSES={borrador:'Borrador',calculado:'Calculado',pagado:'Pagado'};
const CONCEPT_TYPES=[['percepcion','Percepción'],['deduccion','Deducción']];
const CONCEPT_MODES=[['fijo','Monto fijo (MXN)'],['porcentaje','Porcentaje del salario base']];
const LIMIT_LINE='Cálculo básico, sin timbrado CFDI de nómina ni cálculo real de IMSS/ISR.';
const fmtDay=iso=>iso?new Date(String(iso).slice(0,10)+'T00:00:00').toLocaleDateString('es-MX',{dateStyle:'medium'}):'—';
const byName=(a,b)=>(a.name||'').localeCompare(b.name||'','es');

export async function renderPayroll(ctx){
 const slug=encodeURIComponent(ctx.config.tenant.slug),base='/api/app/'+slug+'/payroll';
 const canWrite=ctx.config.tenant.role!=='viewer';
 const host=$('record-list');
 const overview=container('cards'),tabsBar=container('toolbar'),panels=container('stack');
 host.replaceChildren(overview,tabsBar,panels);
 $('record-count').textContent='Nómina';
 host.prepend(line(LIMIT_LINE,'help'));
 if(demoMode)host.prepend(line('Estás en modo demostración: los datos de nómina son de ejemplo y se guardan solo en esta pestaña.','help'));
 let periods=[],concepts=[],receipts=[],dash=null;
 let activeTab='periods',selectedPeriodId=null,selectedReceiptId=null;
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
  for(const [key,label] of [['periods','Periodos'],['concepts','Conceptos'],['receipts','Recibos']])tabsBar.append(tabButton(key,label));
 }
 // ---------- Periodos ----------
 const periodPanel=container('stack');
 const periodForm=el('form');periodForm.className='stack';
 const pf={
  tipo:field('py-period-type','Tipo de periodo','select',PERIOD_TYPES),
  inicio:field('py-period-from','Desde','date'),fin:field('py-period-to','Hasta','date')
 };
 const periodGrid=container('field-grid');
 for(const f of Object.values(pf))periodGrid.append(f.holder);
 const periodSave=button('Crear periodo','btn btn-primary');periodSave.type='submit';
 periodForm.append(line('Crear periodo','group-label'),
  line('El periodo nace en borrador. Al calcular, el salario base de cada empleado activo se toma de su ficha (T026).','help'),
  periodGrid,periodSave);
 periodForm.addEventListener('submit',async ev=>{
  ev.preventDefault();periodSave.disabled=true;
  try{
   await write(base+'/periods','POST',{tipo:pf.tipo.input.value,fechaInicio:pf.inicio.input.value,fechaFin:pf.fin.input.value});
   ctx.notice('Periodo creado.');periodForm.reset();await loadPeriods();
  }catch(e){ctx.notice('No se pudo crear el periodo: '+e.message,true);}
  finally{periodSave.disabled=false;}
 },{signal:ctx.signal});
 const periodList=container('stack');
 async function loadPeriods(){
  try{const d=await api(base+'/periods');periods=d.periods||[];}catch(e){periods=[];periodList.replaceChildren(errLine('los periodos',e));return;}
  drawPeriods();
 }
 function drawPeriods(){
  periodPanel.replaceChildren();
  if(canWrite)periodPanel.append(periodForm);
  periodPanel.append(line('Periodos','group-label'),line(LIMIT_LINE,'help'),periodList);
  const visible=[...periods].sort((a,b)=>(b.fechaInicio||'').localeCompare(a.fechaInicio||''));
  $('record-count').textContent=visible.length+' periodos';
  periodList.replaceChildren();
  if(!visible.length){periodList.append(line('Sin periodos todavía. Crea el primero con el formulario de arriba.','empty'));return;}
  for(const p of visible){
   const row=container('record survey-card'),info=container('stack');
   info.append(el('strong',(PERIOD_TYPES.find(t=>t[0]===p.tipo)?.[1]||p.tipo)+' · '+fmtDay(p.fechaInicio)+' – '+fmtDay(p.fechaFin)),
    line([PERIOD_STATUSES[p.estado]||p.estado,(p.receipts??0)+' recibo(s)','Total neto: '+money(p.totalNetoCents||0)].filter(Boolean).join(' · '),'help'));
   const actions=container('record-actions');
   const view=button('Ver recibos','btn');
   view.addEventListener('click',()=>{selectedPeriodId=p.id;activeTab='receipts';drawTabs();void showTab();},{signal:ctx.signal});
   actions.append(view);
   if(canWrite&&p.estado==='borrador'){
    const calc=button('Calcular nómina','btn btn-primary');
    calc.addEventListener('click',async()=>{
     calc.disabled=true;
     try{
      const out=await write(base+'/periods/'+p.id+'/calculate','POST',{});
      ctx.notice('Nómina calculada: '+out.receipts.length+' recibo(s)'+(out.skipped.length?' · '+out.skipped.length+' empleado(s) sin salario no entraron':'')+'.');
      await loadPeriods();await loadDashboard();
     }catch(e){ctx.notice('No se pudo calcular la nómina: '+e.message,true);}
     finally{calc.disabled=false;}
    },{signal:ctx.signal});
    actions.append(calc);
   }
   if(canWrite&&p.estado==='calculado'){
    const pay=button('Marcar pagado','btn btn-primary');
    pay.addEventListener('click',async()=>{
     if(!confirm('¿Marcar este periodo como pagado? Los recibos quedan en pagado.'))return;
     try{await write(base+'/periods/'+p.id+'/pay','POST',{});ctx.notice('Periodo marcado como pagado.');await loadPeriods();await loadDashboard();}
     catch(e){ctx.notice('No se pudo marcar como pagado: '+e.message,true);}
    },{signal:ctx.signal});
    actions.append(pay);
   }
   row.append(info,actions);periodList.append(row);
  }
 }
 // ---------- Conceptos ----------
 const conceptPanel=container('stack');
 const conceptForm=el('form');conceptForm.className='stack';
 const cf={
  nombre:field('py-concept-name','Nombre del concepto'),
  tipo:field('py-concept-type','Tipo','select',CONCEPT_TYPES),
  modo:field('py-concept-mode','Modo','select',CONCEPT_MODES),
  monto:field('py-concept-amount','Monto fijo (MXN)','number'),
  porcentaje:field('py-concept-pct','Porcentaje (0–100)','number')
 };
 cf.nombre.input.required=true;cf.monto.input.min='0';cf.monto.input.step='0.01';
 cf.porcentaje.input.min='0';cf.porcentaje.input.max='100';cf.porcentaje.input.step='0.01';
 const conceptGrid=container('field-grid');
 for(const f of Object.values(cf))conceptGrid.append(f.holder);
 const conceptSave=button('Crear concepto','btn btn-primary');conceptSave.type='submit';
 const conceptCancel=button('Cancelar edición');conceptCancel.hidden=true;
 const conceptActions=container('toolbar');conceptActions.append(conceptSave,conceptCancel);
 conceptForm.append(line('Crear o editar concepto','group-label'),
  line('Percepción suma al salario base; deducción resta. Fijo es un monto en pesos; porcentaje se calcula sobre el salario base del periodo.','help'),
  conceptGrid,conceptActions);
 let editingConcept=null;
 function resetConceptForm(){
  editingConcept=null;conceptForm.reset();cf.modo.input.value='fijo';
  conceptSave.textContent='Crear concepto';conceptCancel.hidden=true;
 }
 conceptCancel.addEventListener('click',resetConceptForm,{signal:ctx.signal});
 conceptForm.addEventListener('submit',async ev=>{
  ev.preventDefault();conceptSave.disabled=true;
  const modo=cf.modo.input.value;
  const body={nombre:cf.nombre.input.value.trim(),tipo:cf.tipo.input.value,modo,
   montoCents:modo==='fijo'?Math.max(0,Math.round(Number(cf.monto.input.value||0)*100)):null,
   porcentaje:modo==='porcentaje'?Number(cf.porcentaje.input.value||0):null,activo:true};
  try{
   if(editingConcept)await write(base+'/concepts/'+editingConcept,'PATCH',body);
   else await write(base+'/concepts','POST',body);
   ctx.notice(editingConcept?'Concepto actualizado.':'Concepto creado.');
   resetConceptForm();await loadConcepts();
  }catch(e){ctx.notice('No se pudo guardar el concepto: '+e.message,true);}
  finally{conceptSave.disabled=false;}
 },{signal:ctx.signal});
 const conceptList=container('stack');
 async function loadConcepts(){
  try{const d=await api(base+'/concepts');concepts=d.concepts||[];}catch(e){concepts=[];conceptList.replaceChildren(errLine('los conceptos',e));return;}
  drawConcepts();
 }
 function drawConcepts(){
  conceptPanel.replaceChildren();
  if(canWrite)conceptPanel.append(conceptForm);
  conceptPanel.append(line('Conceptos','group-label'),conceptList);
  const visible=[...concepts].sort(byName).filter(c=>(c.nombre||'').toLowerCase().includes(q()));
  $('record-count').textContent=visible.length+' conceptos';
  conceptList.replaceChildren();
  if(!visible.length){conceptList.append(line(concepts.length?'Sin conceptos con ese criterio.':'Sin conceptos todavía. Crea el primero: una percepción o una deducción.','empty'));return;}
  for(const c of visible){
   const row=container('record survey-card'),info=container('stack');
   info.append(el('strong',c.nombre),
    line([(CONCEPT_TYPES.find(t=>t[0]===c.tipo)?.[1]||c.tipo),
     c.modo==='fijo'?('Fijo: '+money(c.montoCents||0)):('Porcentaje: '+(c.porcentaje??0)+'%'),
     c.activo?'Activo':'Inactivo'].filter(Boolean).join(' · '),'help'));
   const actions=container('record-actions');
   if(canWrite){
    const edit=button('Editar','btn');
    edit.addEventListener('click',()=>{editingConcept=c.id;cf.nombre.input.value=c.nombre||'';
     cf.tipo.input.value=c.tipo||'percepcion';cf.modo.input.value=c.modo||'fijo';
     cf.monto.input.value=c.montoCents===null||c.montoCents===undefined?'':(c.montoCents/100).toFixed(2);
     cf.porcentaje.input.value=c.porcentaje??'';
     conceptSave.textContent='Guardar cambios';conceptCancel.hidden=false;conceptForm.scrollIntoView({block:'center',behavior:'smooth'});},{signal:ctx.signal});
    const del=button('Eliminar','btn btn-danger');
    del.addEventListener('click',async()=>{
     if(!confirm('¿Eliminar este concepto? No se puede eliminar si ya se usó en recibos.'))return;
     try{await write(base+'/concepts/'+c.id,'DELETE');await loadConcepts();}
     catch(e){ctx.notice('No se pudo eliminar el concepto: '+e.message,true);}
    },{signal:ctx.signal});
    actions.append(edit,del);
   }
   row.append(info,actions);conceptList.append(row);
  }
 }
 // ---------- Recibos ----------
 const receiptPanel=container('stack');
 const receiptPeriodSel=el('select');receiptPeriodSel.className='search';receiptPeriodSel.setAttribute('aria-label','Periodo para ver sus recibos');
 const receiptList=container('stack');
 const receiptDetail=container('stack');
 async function loadReceipts(){
  receiptList.replaceChildren(line('Cargando recibos…','help'));
  if(!selectedPeriodId){receipts=[];drawReceipts();return;}
  try{
   const d=await api(base+'/receipts?periodId='+encodeURIComponent(selectedPeriodId));receipts=d.receipts||[];
  }catch(e){receipts=[];receiptList.replaceChildren(errLine('los recibos',e));return;}
  drawReceipts();
 }
 function drawReceipts(){
  receiptPanel.replaceChildren();
  receiptPeriodSel.replaceChildren(new Option('Selecciona un periodo',''));
  for(const p of periods)receiptPeriodSel.add(new Option((PERIOD_TYPES.find(t=>t[0]===p.tipo)?.[1]||p.tipo)+' · '+fmtDay(p.fechaInicio)+' – '+fmtDay(p.fechaFin)+' · '+(PERIOD_STATUSES[p.estado]||p.estado),p.id));
  receiptPeriodSel.value=selectedPeriodId||'';
  receiptPanel.append(line('Recibos','group-label'),line(LIMIT_LINE,'help'),receiptPeriodSel,receiptList,receiptDetail);
  const visible=receipts.filter(r=>((r.employeeName||'')).toLowerCase().includes(q()));
  $('record-count').textContent=visible.length+' recibos';
  receiptList.replaceChildren();
  if(!visible.length){receiptList.append(line(!selectedPeriodId?'Selecciona un periodo para ver sus recibos.':(receipts.length?'Sin recibos con ese criterio.':'Sin recibos en este periodo todavía. Calcula la nómina desde la pestaña Periodos.'),'empty'));return;}
  for(const r of visible){
   const row=container('record survey-card'),info=container('stack');
   info.append(el('strong',r.employeeName||'Empleado'),
    line(['Base: '+money(r.salarioBaseCents||0),'Percepciones: '+money(r.percepcionesCents||0),
     'Deducciones: '+money(r.deduccionesCents||0),'Neto: '+money(r.netoCents||0),
     r.estado==='pagado'?'Pagado':'Calculado'].filter(Boolean).join(' · '),'help'));
   const actions=container('record-actions');
   const detail=button('Ver detalle','btn');
   detail.addEventListener('click',()=>{selectedReceiptId=r.id;drawReceiptDetail();},{signal:ctx.signal});
   actions.append(detail);
   row.append(info,actions);receiptList.append(row);
  }
  if(selectedReceiptId)drawReceiptDetail();
 }
 function drawReceiptDetail(){
  const r=receipts.find(x=>x.id===selectedReceiptId);
  receiptDetail.replaceChildren();
  if(!r)return;
  receiptDetail.append(line('Detalle del recibo · '+(r.employeeName||'Empleado'),'group-label'));
  const list=container('stack');
  list.append(line('Salario base del periodo: '+money(r.salarioBaseCents||0),'help'));
  if(!(r.items||[]).length)list.append(line('Sin conceptos en este recibo.','empty'));
  for(const item of r.items||[]){
   list.append(line((item.tipo==='percepcion'?'+ ':'− ')+item.nombre+': '+money(item.montoCents||0),'help'));
  }
  list.append(line('Percepciones: '+money(r.percepcionesCents||0)+' · Deducciones: '+money(r.deduccionesCents||0)+' · Neto: '+money(r.netoCents||0),'help'));
  list.append(line(LIMIT_LINE,'help'));
  receiptDetail.append(list);
 }
 receiptPeriodSel.addEventListener('change',()=>{selectedPeriodId=receiptPeriodSel.value||null;selectedReceiptId=null;void loadReceipts();},{signal:ctx.signal});
 // ---------- Cambio de pestaña ----------
 async function showTab(){
  if(activeTab==='periods'){panels.replaceChildren(periodPanel);await loadPeriods();}
  else if(activeTab==='concepts'){panels.replaceChildren(conceptPanel);await loadConcepts();}
  else if(activeTab==='receipts'){panels.replaceChildren(receiptPanel);await loadPeriods();await loadReceipts();}
 }
 async function loadDashboard(){
  try{dash=await api(base+'/dashboard');}catch{dash=null;}
  if(!dash)return;
  overview.replaceChildren();
  const last=dash.lastPeriod;
  for(const [label,value] of [['Periodos',String(dash.kpis?.periods??0)],
   ['Conceptos activos',String(dash.kpis?.activeConcepts??0)],
   ['Empleados con salario',String(dash.kpis?.employeesWithSalary??0)],
   ['Neto último periodo',money(dash.kpis?.lastPeriodNetoCents||0)]]){
   const card=container('stat');card.append(el('span',label,'stat-label'),el('div',value,'stat-number'));overview.append(card);
  }
  if(last)overview.append(line('Último periodo: '+(PERIOD_TYPES.find(t=>t[0]===last.tipo)?.[1]||last.tipo)+' · '+fmtDay(last.fechaInicio)+' – '+fmtDay(last.fechaFin)+' · '+(PERIOD_STATUSES[last.estado]||last.estado),'help'));
 }
 drawTabs();
 await loadDashboard();
 await showTab();
}
