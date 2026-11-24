// Contabilidad (T023) — plan de cuentas, pólizas con partida doble,
// balanza de comprobación, estado de resultados y balance general.
// Contrato real: platform/accounting-store.mjs + accounting-domain.mjs
// (migración 028). Todo contra /api/app/<slug>/accounting/...; si la API
// falla se muestra el error, nunca se inventan filas.
// Composición: referencia ecommerce de Julio (KPIs con delta, gráfica de
// ingresos, alertas a la derecha, movimientos recientes y top clientes).
// Marca Hubie: Nunito, tinta #16123a, morado #7c5cfc, rosa #ec4899.
// Sin emojis como iconografía, sin letras como iconos, sin barras visibles.
// Etiqueta: "Sin conexión al SAT" — cálculo y reportes, sin timbrado.
import {field,line,button,container,money} from './app-workflows.js';
const demoMode=new URLSearchParams(location.search).get('demo')==='1';
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
function saveBlob(blob,filename){
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export const ACCOUNT_TYPES=[['activo','Activo'],['pasivo','Pasivo'],['capital','Capital'],['ingreso','Ingreso'],['gasto','Gasto']];
export const ACCOUNT_TYPE_LABELS={activo:'Activo',pasivo:'Pasivo',capital:'Capital',ingreso:'Ingreso',gasto:'Gasto'};
export const ENTRY_STATUSES={borrador:'Borrador',registrada:'Registrada',cancelada:'Cancelada'};
const fmtDay=iso=>iso?new Date(String(iso).slice(0,10)+'T00:00:00').toLocaleDateString('es-MX',{dateStyle:'medium'}):'—';
const deltaText=d=>{
 if(d===null||d===undefined)return 'sin mes anterior para comparar';
 if(d===0)return 'igual que el mes anterior';
 return Math.abs(d)+'% '+(d>0?'más':'menos')+' que el mes anterior';
};
// Gráfica de línea SVG con datos reales (serie diaria de ingresos).
function incomeChart(series){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 600 180');svg.setAttribute('width','100%');svg.setAttribute('height','180');
 svg.setAttribute('role','img');svg.setAttribute('aria-label','Ingresos por día del mes');
 const W=600,H=180,pad=8;
 const max=Math.max(1,...series.map(d=>d.cents));
 const x=i=>series.length<=1?W/2:pad+i*(W-2*pad)/(series.length-1);
 const y=v=>H-24-(v/max)*(H-48);
 const grid=document.createElementNS('http://www.w3.org/2000/svg','line');
 grid.setAttribute('x1',pad);grid.setAttribute('x2',W-pad);grid.setAttribute('y1',H-24);grid.setAttribute('y2',H-24);
 grid.setAttribute('stroke','#e5e7eb');grid.setAttribute('stroke-width','1');svg.append(grid);
 if(!series.length||series.every(d=>d.cents===0)){
  const t=document.createElementNS('http://www.w3.org/2000/svg','text');
  t.setAttribute('x',W/2);t.setAttribute('y',H/2);t.setAttribute('text-anchor','middle');
  t.setAttribute('fill','#5b5872');t.setAttribute('font-size','13');t.textContent='Sin ingresos registrados en el mes.';
  svg.append(t);return svg;
 }
 const points=series.map((d,i)=>x(i)+','+y(d.cents)).join(' ');
 const area=document.createElementNS('http://www.w3.org/2000/svg','polygon');
 area.setAttribute('points',pad+','+(H-24)+' '+points+' '+(W-pad)+','+(H-24));
 area.setAttribute('fill','rgba(124,92,252,.10)');svg.append(area);
 const poly=document.createElementNS('http://www.w3.org/2000/svg','polyline');
 poly.setAttribute('points',points);poly.setAttribute('fill','none');
 poly.setAttribute('stroke','#7c5cfc');poly.setAttribute('stroke-width','2');
 poly.setAttribute('stroke-linecap','round');poly.setAttribute('stroke-linejoin','round');svg.append(poly);
 series.forEach((d,i)=>{
  if(d.cents<=0)return;
  const c=document.createElementNS('http://www.w3.org/2000/svg','circle');
  c.setAttribute('cx',x(i));c.setAttribute('cy',y(d.cents));c.setAttribute('r','3');
  c.setAttribute('fill','#7c5cfc');svg.append(c);
 });
 return svg;
}

export async function renderAccounting(ctx){
 const slug=encodeURIComponent(ctx.config.tenant.slug),base='/api/app/'+slug+'/accounting';
 const canWrite=ctx.config.tenant.role!=='viewer';
 const host=$('record-list');
 const overview=container('client-dashboard-kpis'),tabsBar=container('toolbar'),panels=container('stack');
 host.replaceChildren(overview,tabsBar,panels);
 $('record-count').textContent='Contabilidad';
 host.prepend(line('Contabilidad sin conexión al SAT: cálculo y reportes sobre los movimientos de tu empresa. Precios base sin IVA; el IVA se agrega al cobrar.','help'));
 if(demoMode)host.prepend(line('Estás en modo demostración: los datos de contabilidad son de ejemplo y se guardan solo en esta pestaña.','help'));
 let accounts=[],entries=[],dashboardData=null;
 let activeTab='dashboard',selectedEntryId=null;
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
  for(const [key,label] of [['dashboard','Tablero'],['accounts','Plan de cuentas'],['entries','Pólizas'],
   ['trial','Balanza'],['income','Resultados'],['balance','Balance'],['export','Exportar']])tabsBar.append(tabButton(key,label));
 }
 function kpiCard(label,value,delta){
  const card=container('stat');
  card.append(el('span',label,'stat-label'),el('div',value,'stat-number'));
  if(delta!==undefined&&delta!==null)card.append(line(delta,'help'));
  return card;
 }
 function drawOverview(){
  overview.replaceChildren();
  if(!dashboardData){overview.append(line('Cargando tablero…','help'));return;}
  const k=dashboardData.kpis||{};
  overview.append(
   kpiCard('Ingresos del mes',money(k.monthIncomeCents),deltaText(k.monthIncomeDelta)),
   kpiCard('Gastos del mes',money(k.monthExpenseCents),deltaText(k.monthExpenseDelta)),
   kpiCard('Utilidad del mes',money(k.monthProfitCents),deltaText(k.monthProfitDelta)),
   kpiCard('Cuentas por cobrar',money(k.receivablesCents),(k.receivablesCount||0)+' por cobrar abiertas'));
 }
 // ---------- Tablero (ref ecommerce) ----------
 const dashPanel=container('stack');
 async function loadDashboard(){
  try{dashboardData=await api(base+'/dashboard');}catch(e){dashboardData=null;dashPanel.replaceChildren(errLine('el tablero',e));return;}
  drawOverview();drawDashboard();
 }
 function drawDashboard(){
  dashPanel.replaceChildren(line('Tablero de contabilidad','group-label'));
  if(!dashboardData){dashPanel.append(line('Cargando tablero…','help'));return;}
  const k=dashboardData.kpis||{};
  const split=container('overview-insights');
  const chartCard=container('card-soft');
  chartCard.append(el('strong','Ingresos del mes'));
  chartCard.append(line('Total: '+money(k.monthIncomeCents)+' · Mes anterior: '+money(dashboardData.prevMonthIncomeCents??null)+' (comparativa real, sin proyección).','help'));
  chartCard.append(incomeChart(dashboardData.incomeDaily||[]));
  const alertsCard=container('card-soft');
  alertsCard.append(el('strong','Alertas'));
  const alerts=dashboardData.alerts||{};
  if((alerts.draftEntries||0)>0)alertsCard.append(line((alerts.draftEntries)+' póliza(s) en borrador sin registrar.','help'));
  if(!(alerts.overdueReceivables||[]).length)alertsCard.append(line('Sin cuentas por cobrar vencidas.','help'));
  for(const r of alerts.overdueReceivables||[]){
   alertsCard.append(line('CxC vencida: '+(r.clientName||'Cliente')+' · '+money(r.balanceCents)+' · venció '+fmtDay(r.dueOn),'help'));
  }
  const top=dashboardData.topClients||[];
  alertsCard.append(el('strong','Clientes con más ingreso'));
  if(!top.length)alertsCard.append(line('Sin pedidos de venta registrados todavía.','help'));
  for(const t of top)alertsCard.append(line((t.clientName||'Cliente')+' · '+money(t.totalCents)+' · '+(t.orders||0)+' pedido(s)','help'));
  split.append(chartCard,alertsCard);
  dashPanel.append(split);
  const recent=container('stack');
  recent.append(line('Movimientos recientes','group-label'));
  const regs=(entries||[]).filter(e=>e.status==='registrada').slice(0,8);
  if(!regs.length)recent.append(line('Sin pólizas registradas todavía.','empty'));
  for(const e of regs){
   recent.append(line((e.folioLabel||'')+' · '+fmtDay(e.entryDate)+' · '+e.concept+' · '+money(e.totalDebitCents)+' · '+(ENTRY_STATUSES[e.status]||e.status),'help'));
  }
  dashPanel.append(recent);
 }
 // ---------- Plan de cuentas ----------
 const accountsPanel=container('stack');
 const accountForm=el('form');accountForm.className='stack';
 const af={
  code:field('ac-account-code','Código'),
  name:field('ac-account-name','Nombre de la cuenta'),
  type:field('ac-account-type','Tipo','select',ACCOUNT_TYPES)
 };
 af.code.input.required=true;af.name.input.required=true;
 const accountGrid=container('field-grid');
 for(const f of Object.values(af))accountGrid.append(f.holder);
 const accountSave=button('Crear cuenta','btn btn-primary');accountSave.type='submit';
 const accountActions=container('toolbar');accountActions.append(accountSave);
 accountForm.append(line('Nueva cuenta','group-label'),
  line('La naturaleza se define por el tipo: activo y gasto son deudoras; pasivo, capital e ingreso son acreedoras.','help'),
  accountGrid,accountActions);
 accountForm.addEventListener('submit',async ev=>{
  ev.preventDefault();accountSave.disabled=true;
  try{
   await write(base+'/accounts','POST',{code:af.code.input.value.trim(),name:af.name.input.value.trim(),type:af.type.input.value});
   ctx.notice('Cuenta creada.');accountForm.reset();await loadAccounts();
  }catch(e){ctx.notice('No se pudo crear la cuenta: '+e.message,true);}
  finally{accountSave.disabled=false;}
 },{signal:ctx.signal});
 const accountList=container('stack');
 const seedBtn=button('Cargar catálogo base','btn');
 seedBtn.addEventListener('click',async()=>{
  try{await write(base+'/accounts/seed','POST',{});ctx.notice('Catálogo base cargado.');await loadAccounts();}
  catch(e){ctx.notice('No se pudo cargar el catálogo base: '+e.message,true);}
 },{signal:ctx.signal});
 async function loadAccounts(){
  try{const d=await api(base+'/accounts');accounts=d.accounts||[];}catch(e){accounts=[];accountList.replaceChildren(errLine('las cuentas',e));return;}
  drawAccounts();
 }
 function drawAccounts(){
  accountsPanel.replaceChildren();
  if(canWrite)accountsPanel.append(accountForm,seedBtn);
  accountsPanel.append(line('Plan de cuentas','group-label'),accountList);
  const visible=accounts.filter(a=>(a.name||'').toLowerCase().includes(q())||(a.code||'').toLowerCase().includes(q()));
  $('record-count').textContent=visible.length+' cuentas';
  accountList.replaceChildren();
  if(!visible.length){accountList.append(line(accounts.length?'Sin cuentas con ese nombre o código.':'Sin cuentas todavía. Carga el catálogo base o crea la primera.','empty'));}
  for(const type of ACCOUNT_TYPES.map(t=>t[0])){
   const group=visible.filter(a=>a.type===type);
   if(!group.length)continue;
   accountList.append(line(ACCOUNT_TYPE_LABELS[type],'group-label'));
   for(const a of group){
    const row=container('record survey-card'),info=container('stack');
    info.append(el('strong',a.code+' · '+a.name),
     line([(a.nature==='deudora'?'Deudora':'Acreedora'),a.active?'Activa':'Inactiva'].join(' · '),'help'));
    const actions=container('record-actions');
    if(canWrite){
     const toggle=button(a.active?'Desactivar':'Activar','btn');
     toggle.addEventListener('click',async()=>{
      try{await write(base+'/accounts/'+a.id+'/active','PATCH',{active:!a.active});await loadAccounts();}
      catch(e){ctx.notice(e.message,true);}
     },{signal:ctx.signal});
     actions.append(toggle);
    }
    row.append(info,actions);accountList.append(row);
   }
  }
 }
 // ---------- Pólizas ----------
 const entriesPanel=container('stack');
 const entryForm=el('form');entryForm.className='stack';
 const ef={
  date:field('ac-entry-date','Fecha','date'),
  concept:field('ac-entry-concept','Concepto')
 };
 ef.date.input.value=new Date().toISOString().slice(0,10);ef.concept.input.required=true;
 const entryGrid=container('field-grid');
 for(const f of Object.values(ef))entryGrid.append(f.holder);
 const linesBox=container('stack');
 const lineRows=[];
 function accountOptions(){
  return accounts.filter(a=>a.active).map(a=>[a.id,a.code+' · '+a.name]);
 }
 function addLineRow(prefill){
  const row=container('field-grid');
  const accountSel=document.createElement('select');
  for(const [value,text] of accountOptions())accountSel.add(new Option(text,value));
  if(prefill?.accountId)accountSel.value=prefill.accountId;
  const debit=document.createElement('input');debit.type='number';debit.min='0';debit.step='0.01';
  debit.placeholder='Debe (MXN)';debit.value=prefill?.debit??'';
  const credit=document.createElement('input');credit.type='number';credit.min='0';credit.step='0.01';
  credit.placeholder='Haber (MXN)';credit.value=prefill?.credit??'';
  const memo=document.createElement('input');memo.placeholder='Nota de la línea';memo.value=prefill?.memo||'';
  const remove=button('Quitar','btn');
  remove.addEventListener('click',()=>{row.remove();const i=lineRows.indexOf(refs);if(i>=0)lineRows.splice(i,1);},{signal:ctx.signal});
  row.append(accountSel,debit,credit,memo,remove);
  const refs={row,accountSel,debit,credit,memo};
  lineRows.push(refs);linesBox.append(row);
  return refs;
 }
 const addLineBtn=button('Agregar línea','btn');
 addLineBtn.addEventListener('click',()=>{addLineRow();},{signal:ctx.signal});
 const entrySave=button('Crear póliza','btn btn-primary');entrySave.type='submit';
 const entryActions=container('toolbar');entryActions.append(addLineBtn,entrySave);
 entryForm.append(line('Nueva póliza (partida doble)','group-label'),
  line('Cada línea lleva debe O haber, nunca ambos. La póliza solo se guarda si debe es igual a haber.','help'),
  entryGrid,linesBox,entryActions);
 entryForm.addEventListener('submit',async ev=>{
  ev.preventDefault();entrySave.disabled=true;
  const lines=lineRows.filter(r=>r.row.isConnected).map(r=>({
   accountId:r.accountSel.value,
   debitCents:Math.round((Number(r.debit.value)||0)*100),
   creditCents:Math.round((Number(r.credit.value)||0)*100),
   memo:r.memo.value.trim()}));
  try{
   const d=await write(base+'/entries','POST',{entryDate:ef.date.input.value,concept:ef.concept.input.value.trim(),lines});
   ctx.notice('Póliza '+(d.entry?.folioLabel||'')+' creada en borrador.');
   entryForm.reset();ef.date.input.value=new Date().toISOString().slice(0,10);
   linesBox.replaceChildren();lineRows.length=0;addLineRow();addLineRow();
   await loadEntries();await loadDashboard();
  }catch(e){ctx.notice('No se pudo crear la póliza: '+e.message,true);}
  finally{entrySave.disabled=false;}
 },{signal:ctx.signal});
 const entryList=container('stack');
 const entryDetail=container('card-soft');
 async function loadEntries(){
  try{const d=await api(base+'/entries');entries=d.entries||[];}catch(e){entries=[];entryList.replaceChildren(errLine('las pólizas',e));return;}
  drawEntries();
 }
 function drawEntries(){
  entriesPanel.replaceChildren();
  if(canWrite)entriesPanel.append(entryForm);
  entriesPanel.append(line('Pólizas','group-label'),entryList);
  const visible=entries.filter(e=>(e.concept||'').toLowerCase().includes(q()));
  $('record-count').textContent=visible.length+' pólizas';
  entryList.replaceChildren();
  if(!visible.length){entryList.append(line(entries.length?'Sin pólizas con ese concepto.':'Sin pólizas todavía. Crea la primera con el formulario de arriba.','empty'));}
  for(const e of visible){
   const row=container('record survey-card'),info=container('stack');
   info.append(el('strong',(e.folioLabel||'')+' · '+e.concept),
    line([fmtDay(e.entryDate),(ENTRY_STATUSES[e.status]||e.status),'Debe '+money(e.totalDebitCents),'Haber '+money(e.totalCreditCents)].join(' · '),'help'));
   const actions=container('record-actions');
   const detail=button('Detalle','btn');
   detail.addEventListener('click',()=>{selectedEntryId=e.id;void showEntryDetail();},{signal:ctx.signal});
   actions.append(detail);
   if(canWrite&&e.status==='borrador'){
    const reg=button('Registrar','btn');
    reg.addEventListener('click',async()=>{
     try{await write(base+'/entries/'+e.id+'/status','PATCH',{status:'registrada'});ctx.notice('Póliza registrada.');await loadEntries();await loadDashboard();}
     catch(e2){ctx.notice(e2.message,true);}
    },{signal:ctx.signal});
    actions.append(reg);
   }
   if(canWrite&&e.status!=='cancelada'){
    const cancel=button('Cancelar','btn');
    cancel.addEventListener('click',async()=>{
     try{await write(base+'/entries/'+e.id+'/status','PATCH',{status:'cancelada'});ctx.notice('Póliza cancelada.');await loadEntries();await loadDashboard();}
     catch(e2){ctx.notice(e2.message,true);}
    },{signal:ctx.signal});
    actions.append(cancel);
   }
   row.append(info,actions);entryList.append(row);
  }
  entriesPanel.append(entryDetail);
  if(selectedEntryId)void showEntryDetail();
 }
 async function showEntryDetail(){
  if(!selectedEntryId)return;
  entryDetail.replaceChildren(line('Cargando detalle…','help'));
  try{
   const d=await api(base+'/entries/'+selectedEntryId);
   const e=d.entry;
   entryDetail.replaceChildren(line('Detalle · '+(e.folioLabel||'')+' · '+e.concept,'group-label'));
   const list=container('stack');
   for(const l of e.lines||[]){
    list.append(line((l.accountCode||'')+' · '+(l.accountName||'')+' · Debe '+money(l.debitCents)+' · Haber '+money(l.creditCents)+(l.memo?(' · '+l.memo):''),'help'));
   }
   entryDetail.append(list,line('Total debe '+money(e.totalDebitCents)+' · Total haber '+money(e.totalCreditCents)+' · '+(ENTRY_STATUSES[e.status]||e.status),'help'));
  }catch(e2){entryDetail.replaceChildren(errLine('el detalle de la póliza',e2));}
 }
 // ---------- Balanza / Resultados / Balance ----------
 const trialPanel=container('stack');
 const tf={from:field('ac-trial-from','Desde','date'),to:field('ac-trial-to','Hasta','date')};
 const trialGrid=container('field-grid');
 for(const f of Object.values(tf))trialGrid.append(f.holder);
 const trialBtn=button('Consultar balanza','btn btn-primary');
 const trialList=container('stack');
 trialBtn.addEventListener('click',()=>void loadTrial(),{signal:ctx.signal});
 trialPanel.append(line('Balanza de comprobación','group-label'),
  line('Solo pólizas registradas. La balanza cuadra cuando el total del debe es igual al del haber.','help'),trialGrid,trialBtn,trialList);
 async function loadTrial(){
  const params=new URLSearchParams();
  if(tf.from.input.value)params.set('from',tf.from.input.value);
  if(tf.to.input.value)params.set('to',tf.to.input.value);
  trialList.replaceChildren(line('Cargando balanza…','help'));
  try{
   const d=await api(base+'/trial-balance?'+params.toString());
   trialList.replaceChildren();
   for(const r of d.rows||[]){
    trialList.append(line(r.code+' · '+r.name+' · '+ACCOUNT_TYPE_LABELS[r.type]+' · Debe '+money(r.debitCents)+' · Haber '+money(r.creditCents)+' · Saldo '+money(r.balanceCents),'help'));
   }
   trialList.append(line('Total debe '+money(d.totalDebitCents)+' · Total haber '+money(d.totalCreditCents)+' · '+(d.balanced?'Balanza cuadrada.':'La balanza no cuadra.'),'help'));
  }catch(e){trialList.replaceChildren(errLine('la balanza',e));}
 }
 const incomePanel=container('stack');
 const inf={from:field('ac-income-from','Desde','date'),to:field('ac-income-to','Hasta','date')};
 const incomeGrid=container('field-grid');
 for(const f of Object.values(inf))incomeGrid.append(f.holder);
 const incomeBtn=button('Consultar resultados','btn btn-primary');
 const incomeList=container('stack');
 incomeBtn.addEventListener('click',()=>void loadIncome(),{signal:ctx.signal});
 incomePanel.append(line('Estado de resultados','group-label'),
  line('Ingresos menos gastos del periodo, solo con pólizas registradas.','help'),incomeGrid,incomeBtn,incomeList);
 async function loadIncome(){
  const params=new URLSearchParams();
  if(inf.from.input.value)params.set('from',inf.from.input.value);
  if(inf.to.input.value)params.set('to',inf.to.input.value);
  incomeList.replaceChildren(line('Cargando resultados…','help'));
  try{
   const d=await api(base+'/income-statement?'+params.toString());
   incomeList.replaceChildren();
   const stats=container('cards');
   for(const [label,value] of [['Ingresos',money(d.incomeCents)],['Gastos',money(d.expenseCents)],['Utilidad',money(d.profitCents)]]){
    const card=container('stat');card.append(el('span',label,'stat-label'),el('div',value,'stat-number'));stats.append(card);
   }
   incomeList.append(stats);
  }catch(e){incomeList.replaceChildren(errLine('el estado de resultados',e));}
 }
 const balancePanel=container('stack');
 const bf={asOf:field('ac-balance-asof','A la fecha','date')};
 bf.asOf.input.value=new Date().toISOString().slice(0,10);
 const balanceGrid=container('field-grid');
 for(const f of Object.values(bf))balanceGrid.append(f.holder);
 const balanceBtn=button('Consultar balance','btn btn-primary');
 const balanceList=container('stack');
 balanceBtn.addEventListener('click',()=>void loadBalance(),{signal:ctx.signal});
 balancePanel.append(line('Balance general','group-label'),
  line('Activo frente a pasivo + capital + utilidad, con movimientos acumulados hasta la fecha.','help'),balanceGrid,balanceBtn,balanceList);
 async function loadBalance(){
  const params=new URLSearchParams();
  if(bf.asOf.input.value)params.set('asOf',bf.asOf.input.value);
  balanceList.replaceChildren(line('Cargando balance…','help'));
  try{
   const d=await api(base+'/balance-sheet?'+params.toString());
   balanceList.replaceChildren();
   const stats=container('cards');
   for(const [label,value] of [['Activo',money(d.assetsCents)],['Pasivo',money(d.liabilitiesCents)],
    ['Capital',money(d.equityCents)],['Utilidad del ejercicio',money(d.profitCents)],
    ['Pasivo + capital + utilidad',money(d.totalLiabilitiesEquityCents)]]){
    const card=container('stat');card.append(el('span',label,'stat-label'),el('div',value,'stat-number'));stats.append(card);
   }
   balanceList.append(stats,line(d.balanced?'El balance cuadra: activo igual a pasivo + capital + utilidad.':'El balance no cuadra.','help'));
  }catch(e){balanceList.replaceChildren(errLine('el balance general',e));}
 }
 // ---------- Exportar CSV ----------
 const exportPanel=container('stack');
 async function exportCsv(){
  try{
   if(demoMode){
    const d=await api(base+'/export?kind=trial-balance');
    saveBlob(new Blob(['\uFEFF'+d.csv],{type:'text/csv;charset=utf-8'}),d.filename);
   }else{
    const response=await fetch(base+'/export?kind=trial-balance',{credentials:'same-origin'});
    if(!response.ok)throw Error('No se pudo exportar.');
    const name=(response.headers.get('content-disposition')||'').match(/filename="([^"]+)"/)?.[1]||'hubie-contabilidad-balanza.csv';
    saveBlob(await response.blob(),name);
   }
   ctx.notice('Archivo CSV descargado.');
  }catch(e){ctx.notice('No se exportó: '+e.message,true);}
 }
 function drawExport(){
  exportPanel.replaceChildren(line('Exportar a CSV','group-label'),
   line('Descarga real de la balanza de comprobación con columnas y escape CSV correctos.','help'));
  const btn=button('Descargar balanza (CSV)','btn');
  btn.addEventListener('click',()=>void exportCsv(),{signal:ctx.signal});
  exportPanel.append(btn);
 }
 // ---------- Cambio de pestaña y arranque ----------
 const panelsByTab={dashboard:dashPanel,accounts:accountsPanel,entries:entriesPanel,trial:trialPanel,income:incomePanel,balance:balancePanel,export:exportPanel};
 async function showTab(){
  panels.replaceChildren(panelsByTab[activeTab]);
  if(activeTab==='dashboard'){await loadEntries();await loadDashboard();}
  if(activeTab==='accounts')await loadAccounts();
  if(activeTab==='entries'){await loadAccounts();linesBox.replaceChildren();lineRows.length=0;addLineRow();addLineRow();await loadEntries();}
  if(activeTab==='trial')await loadTrial();
  if(activeTab==='income')await loadIncome();
  if(activeTab==='balance')await loadBalance();
  if(activeTab==='export')drawExport();
 }
 ctx.search.addEventListener('input',()=>{
  if(activeTab==='accounts')drawAccounts();
  else if(activeTab==='entries')drawEntries();
 },{signal:ctx.signal});
 $('module-message').textContent='Contabilidad: plan de cuentas, pólizas, balanza, resultados y balance. Sin conexión al SAT.';
 drawTabs();
 try{
  await loadAccounts();await loadEntries();await loadDashboard();
 }catch(e){ctx.notice('Error al abrir Contabilidad: '+e.message,true);}
 await showTab();
}
