// Pedidos de venta (T024) — pedidos desde cotización aceptada de T013,
// con entrega, conversión a cobro (T014), a factura (T015) y a CxC (T017).
// Contrato real: platform/sales-orders-store.mjs + sales-orders-domain.mjs
// (migración 029). Todo contra /api/app/<slug>/sales-orders/...; si la API
// falla se muestra el error, nunca se inventan filas.
// Composición: referencia Dropify de Julio (KPIs con mini-gráfica, tarjeta
// de detalle con origen → destino, línea de tiempo de estados con % y
// panel lateral de envío). Sin mapas reales: el panel de ruta es un
// esquema con los datos reales de origen (empresa) y destino (cliente).
// Marca Hubie: Nunito, tinta #16123a, morado #7c5cfc, rosa #ec4899.
// Sin emojis como iconografía, sin letras como iconos, sin barras visibles.
import {field,line,button,container,money} from './app-workflows.js';
const demoMode=new URLSearchParams(location.search).get('demo')==='1';
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
export const ORDER_STATUSES={borrador:'Borrador',confirmado:'Confirmado','en preparación':'En preparación',enviado:'Enviado',entregado:'Entregado',cancelado:'Cancelado'};
const ORDER_NEXT={borrador:'confirmado',confirmado:'en preparación','en preparación':'enviado',enviado:'entregado',entregado:null,cancelado:null};
const ORDER_PROGRESS={borrador:0,confirmado:25,'en preparación':50,enviado:75,entregado:100,cancelado:0};
const TIMELINE=[['confirmado','Recibido'],['en preparación','Preparación'],['enviado','Enviado'],['entregado','Entregado']];
const ORDER_STEP_INDEX={borrador:-1,confirmado:0,'en preparación':1,enviado:2,entregado:3,cancelado:-1};
const fmtDay=iso=>iso?new Date(String(iso).slice(0,10)+'T00:00:00').toLocaleDateString('es-MX',{dateStyle:'medium'}):'—';
// Mini-gráfica de barras SVG con datos reales (pedidos por día del mes).
function sparkBars(daily){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 120 36');svg.setAttribute('width','120');svg.setAttribute('height','36');
 svg.setAttribute('role','img');svg.setAttribute('aria-label','Pedidos por día del mes');
 const max=Math.max(1,...daily.map(d=>d.count));
 const bw=120/Math.max(1,daily.length);
 daily.forEach((d,i)=>{
  const h=d.count>0?Math.max(2,Math.round(d.count/max*30)):0;
  const r=document.createElementNS('http://www.w3.org/2000/svg','rect');
  r.setAttribute('x',String(i*bw+1));r.setAttribute('y',String(34-h));
  r.setAttribute('width',String(Math.max(1,bw-2)));r.setAttribute('height',String(h));
  r.setAttribute('rx','1');r.setAttribute('fill','#7c5cfc');svg.append(r);
 });
 return svg;
}
// Barra de proporción real (parte del total) para las tarjetas 2 y 3.
function shareBar(part,total){
 const wrap=container('stack');
 const track=el('div');track.className='share-track';
 track.style.cssText='height:8px;border-radius:4px;background:#ececf3;overflow:hidden';
 const fill=el('div');fill.style.cssText='height:100%;background:#7c5cfc;width:'+(total>0?Math.round(100*part/total):0)+'%';
 track.append(fill);wrap.append(track);
 return wrap;
}
// Flecha de ruta (SVG de línea, sin caracteres de texto como icono).
function routeArrow(){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('viewBox','0 0 60 12');svg.setAttribute('width','60');svg.setAttribute('height','12');
 svg.setAttribute('aria-hidden','true');
 const l=document.createElementNS('http://www.w3.org/2000/svg','line');
 l.setAttribute('x1','2');l.setAttribute('y1','6');l.setAttribute('x2','50');l.setAttribute('y2','6');
 l.setAttribute('stroke','currentColor');l.setAttribute('stroke-width','1.8');svg.append(l);
 const p=document.createElementNS('http://www.w3.org/2000/svg','polyline');
 p.setAttribute('points','46,1 56,6 46,11');p.setAttribute('fill','none');
 p.setAttribute('stroke','currentColor');p.setAttribute('stroke-width','1.8');
 p.setAttribute('stroke-linecap','round');p.setAttribute('stroke-linejoin','round');svg.append(p);
 return svg;
}

export async function renderSalesOrders(ctx){
 const slug=encodeURIComponent(ctx.config.tenant.slug),base='/api/app/'+slug+'/sales-orders';
 const canWrite=ctx.config.tenant.role!=='viewer';
 const host=$('record-list');
 const overview=container('client-dashboard-kpis'),tabsBar=container('toolbar'),panels=container('stack');
 host.replaceChildren(overview,tabsBar,panels);
 $('record-count').textContent='Pedidos de venta';
 host.prepend(line('Pedidos desde cotizaciones aceptadas: se cobra con IVA del 16% sobre el precio base, como en Cotizaciones.','help'));
 if(demoMode)host.prepend(line('Estás en modo demostración: los datos de pedidos son de ejemplo y se guardan solo en esta pestaña.','help'));
 let orders=[],availableQuotes=[],dashboardData=null,selectedOrder=null;
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
  for(const [key,label] of [['dashboard','Tablero'],['orders','Pedidos']])tabsBar.append(tabButton(key,label));
 }
 function drawOverview(){
  overview.replaceChildren();
  if(!dashboardData){overview.append(line('Cargando tablero…','help'));return;}
  const k=dashboardData.kpis||{};
  const c1=container('stat');
  c1.append(el('span','Pedidos del mes','stat-label'),el('div',String(k.monthOrders??0),'stat-number'),sparkBars(dashboardData.daily||[]));
  const c2=container('stat');
  c2.append(el('span','En preparación','stat-label'),el('div',String(k.preparing??0),'stat-number'),
   shareBar(k.preparing??0,k.monthOrders??0),line('Del total del mes.','help'));
  const c3=container('stat');
  c3.append(el('span','Enviados','stat-label'),el('div',String(k.shipped??0),'stat-number'),
   shareBar(k.shipped??0,k.monthOrders??0),line('Del total del mes.','help'));
  overview.append(c1,c2,c3);
 }
 // ---------- Tablero (ref Dropify) ----------
 const dashPanel=container('stack');
 async function loadDashboard(){
  try{dashboardData=await api(base+'/dashboard');}catch(e){dashboardData=null;dashPanel.replaceChildren(errLine('el tablero',e));return;}
  drawOverview();drawDashboard();
 }
 function drawDashboard(){
  dashPanel.replaceChildren(line('Tablero de pedidos','group-label'));
  if(!dashboardData){dashPanel.append(line('Cargando tablero…','help'));return;}
  const k=dashboardData.kpis||{};
  const stats=container('cards');
  for(const [label,value] of [['Pedidos totales',String(k.total??0)],['Entregados',String(k.delivered??0)],
   ['Saldo pendiente de cobro',money(k.openBalanceCents)],['Total en pedidos abiertos',money(k.openCents)]]){
   const card=container('stat');card.append(el('span',label,'stat-label'),el('div',value,'stat-number'));stats.append(card);
  }
  dashPanel.append(stats);
  const recent=container('stack');
  recent.append(line('Pedidos recientes','group-label'));
  const list=[...orders].slice(0,8);
  if(!list.length)recent.append(line('Sin pedidos todavía. Crea el primero desde una cotización aceptada.','empty'));
  for(const o of list){
   const row=container('record survey-card'),info=container('stack');
   info.append(el('strong',(o.folioLabel||'')+' · '+o.title),
    line([(ORDER_STATUSES[o.status]||o.status),o.clientName,money(o.totalCents),'Cobrado '+money(o.paidCents),'Saldo '+money(o.balanceCents)].join(' · '),'help'));
   const actions=container('record-actions');
   const detail=button('Detalle','btn');
   detail.addEventListener('click',()=>{selectedOrder=o.id;activeTab='orders';drawTabs();void showTab();},{signal:ctx.signal});
   actions.append(detail);row.append(info,actions);recent.append(row);
  }
  dashPanel.append(recent);
 }
 // ---------- Pedidos ----------
 const ordersPanel=container('stack');
 const createForm=el('form');createForm.className='stack';
 const cf={quote:field('so-order-quote','Cotización aceptada','select',[])};
 const createSave=button('Crear pedido','btn btn-primary');createSave.type='submit';
 const createActions=container('toolbar');createActions.append(createSave);
 createForm.append(line('Nuevo pedido desde cotización aceptada','group-label'),
  line('Se copian las partidas, el cliente y los totales de la cotización. Un pedido activo por cotización.','help'),
  cf.quote.holder,createActions);
 createForm.addEventListener('submit',async ev=>{
  ev.preventDefault();createSave.disabled=true;
  try{
   const d=await write(base+'/orders','POST',{quoteId:cf.quote.input.value});
   ctx.notice('Pedido '+(d.order?.folioLabel||'')+' creado en borrador.');
   selectedOrder=d.order.id;await loadOrders();await loadDashboard();
  }catch(e){ctx.notice('No se pudo crear el pedido: '+e.message,true);}
  finally{createSave.disabled=false;}
 },{signal:ctx.signal});
 const orderList=container('stack');
 const detailPanel=container('card-soft');
 async function loadOrders(){
  try{
   const d=await api(base+'/orders');
   orders=d.orders||[];availableQuotes=d.availableQuotes||[];
  }catch(e){orders=[];availableQuotes=[];orderList.replaceChildren(errLine('los pedidos',e));return;}
  drawOrders();
 }
 function drawOrders(){
  ordersPanel.replaceChildren();
  if(canWrite)ordersPanel.append(createForm);
  ordersPanel.append(line('Pedidos','group-label'),orderList);
  cf.quote.input.replaceChildren();
  if(!availableQuotes.length)cf.quote.input.add(new Option('Sin cotizaciones aceptadas disponibles',''));
  for(const quote of availableQuotes)cf.quote.input.add(new Option(quote.title+' · '+quote.clientName+' · '+money(quote.totalCents),quote.id));
  const visible=orders.filter(o=>(o.title||'').toLowerCase().includes(q())||(o.clientName||'').toLowerCase().includes(q()));
  $('record-count').textContent=visible.length+' pedidos';
  orderList.replaceChildren();
  if(!visible.length){orderList.append(line(orders.length?'Sin pedidos con ese nombre o cliente.':'Sin pedidos todavía. Acepta una cotización (T013) y crea el primero.','empty'));}
  for(const o of visible){
   const row=container('record survey-card'),info=container('stack');
   info.append(el('strong',(o.folioLabel||'')+' · '+o.title),
    line([(ORDER_STATUSES[o.status]||o.status),o.clientName,money(o.totalCents),'Cobrado '+money(o.paidCents),'Saldo '+money(o.balanceCents)].join(' · '),'help'));
   const actions=container('record-actions');
   const detail=button('Detalle','btn');
   detail.addEventListener('click',()=>{selectedOrder=o.id;void showOrderDetail();},{signal:ctx.signal});
   actions.append(detail);
   if(canWrite){
    const next=ORDER_NEXT[o.status];
    if(next){
     const adv=button(next==='confirmado'?'Confirmar':next==='en preparación'?'A preparación':next==='enviado'?'Enviar':'Entregar','btn');
     adv.addEventListener('click',async()=>{
      try{await write(base+'/orders/'+o.id+'/status','PATCH',{status:next});ctx.notice('Pedido actualizado.');await loadOrders();await loadDashboard();}
      catch(e){ctx.notice(e.message,true);}
     },{signal:ctx.signal});
     actions.append(adv);
    }
    if(o.status!=='entregado'&&o.status!=='cancelado'){
     const cancel=button('Cancelar','btn');
     cancel.addEventListener('click',async()=>{
      try{await write(base+'/orders/'+o.id+'/status','PATCH',{status:'cancelado'});ctx.notice('Pedido cancelado.');await loadOrders();await loadDashboard();}
      catch(e){ctx.notice(e.message,true);}
     },{signal:ctx.signal});
     actions.append(cancel);
    }
   }
   row.append(info,actions);orderList.append(row);
  }
  ordersPanel.append(detailPanel);
  if(selectedOrder)void showOrderDetail();
 }
 // ---------- Detalle: ruta, línea de tiempo y panel de envío ----------
 async function showOrderDetail(){
  if(!selectedOrder)return;
  detailPanel.replaceChildren(line('Cargando detalle…','help'));
  try{
   const d=await api(base+'/orders/'+selectedOrder);
   const o=d.order;
   detailPanel.replaceChildren(line('Detalle · '+(o.folioLabel||'')+' · '+o.title,'group-label'));
   // Ruta esquemática: origen (empresa) → destino (cliente). Sin geografía.
   const route=container('card-soft');
   const routeRow=container('toolbar');
   const origin=container('stack');
   origin.append(el('span','Origen','stat-label'),el('strong',ctx.config.tenant.displayName||'Tu empresa'));
   const dest=container('stack');
   dest.append(el('span','Destino','stat-label'),el('strong',o.clientName||'Cliente'));
   routeRow.append(origin,routeArrow(),dest);
   route.append(routeRow);
   if(o.deliveryDate||o.carrier||o.trackingCode){
    route.append(line(['Entrega: '+fmtDay(o.deliveryDate),o.carrier?('Paquetería: '+o.carrier):'',o.trackingCode?('Guía: '+o.trackingCode):''].filter(Boolean).join(' · '),'help'));
   }
   // Línea de tiempo de estados + barra de progreso real por estatus.
   const timeline=container('stack');
   timeline.append(el('strong','Avance del pedido'));
   const progress=el('div');progress.className='share-track';
   progress.style.cssText='height:8px;border-radius:4px;background:#ececf3;overflow:hidden';
   const fill=el('div');fill.style.cssText='height:100%;background:#7c5cfc;width:'+(ORDER_PROGRESS[o.status]??0)+'%';
   progress.append(fill);
   timeline.append(progress,line((ORDER_PROGRESS[o.status]??0)+'% completado · '+(ORDER_STATUSES[o.status]||o.status),'help'));
   const currentStep=ORDER_STEP_INDEX[o.status]??-1;
   for(let i=0;i<TIMELINE.length;i++){
    const done=i<currentStep||o.status==='entregado'&&i<=currentStep;
    const current=i===currentStep;
    timeline.append(line((done?'Completado: ':current?'En curso: ':'Pendiente: ')+TIMELINE[i][1],'help'));
   }
   if(o.status==='cancelado')timeline.append(line('Pedido cancelado.','help'));
   // Panel lateral de envío: partidas, totales, cobro, factura y CxC.
   const ship=container('stack');
   ship.append(el('strong','Envío y cobro'));
   const linesList=container('stack');
   for(const l of o.lines||[]){
    linesList.append(line(l.description+' · '+l.quantity+' × '+money(l.unitPriceCents)+' = '+money(l.lineTotalCents),'help'));
   }
   ship.append(linesList,line('Subtotal '+money(o.subtotalCents)+' · IVA '+money(o.vatCents)+' · Total '+money(o.totalCents),'help'),
    line('Cobrado '+money(o.paidCents)+' · Saldo '+money(o.balanceCents),'help'));
   if(o.invoice)ship.append(line('Factura '+(o.invoice.folioLabel||'')+' · '+(o.invoice.status==='draft'?'Borrador':o.invoice.status)+' · '+money(o.invoice.totalCents)+' · Sin CFDI (pendiente PAC)','help'));
   if(o.receivable)ship.append(line('CxC abierta · vence '+fmtDay(o.receivable.dueOn)+' · Saldo '+money(o.receivable.balanceCents),'help'));
   detailPanel.append(route,timeline,ship);
   if(canWrite)detailPanel.append(deliveryForm(o),paymentForm(o),conversionButtons(o),notesForm(o));
  }catch(e){detailPanel.replaceChildren(errLine('el detalle del pedido',e));}
 }
 function deliveryForm(o){
  const form=el('form');form.className='stack';
  const df={date:field('so-delivery-date','Fecha de entrega','date'),
   carrier:field('so-delivery-carrier','Paquetería'),
   tracking:field('so-delivery-tracking','Guía / código de seguimiento')};
  df.date.input.value=(o.deliveryDate||'').slice(0,10);
  df.carrier.input.value=o.carrier||'';df.tracking.input.value=o.trackingCode||'';
  const grid=container('field-grid');
  for(const f of Object.values(df))grid.append(f.holder);
  const save=button('Guardar entrega','btn btn-primary');save.type='submit';
  form.append(line('Entrega','group-label'),grid,save);
  form.addEventListener('submit',async ev=>{
   ev.preventDefault();save.disabled=true;
   try{
    await write(base+'/orders/'+o.id+'/delivery','PATCH',{deliveryDate:df.date.input.value||null,carrier:df.carrier.input.value.trim(),trackingCode:df.tracking.input.value.trim()});
    ctx.notice('Entrega guardada.');await loadOrders();await loadDashboard();
   }catch(e){ctx.notice('No se pudo guardar la entrega: '+e.message,true);}
   finally{save.disabled=false;}
  },{signal:ctx.signal});
  return form;
 }
 function paymentForm(o){
  const form=el('form');form.className='stack';
  const pf={amount:field('so-pay-amount','Monto a cobrar (MXN)','number'),
   paidOn:field('so-pay-date','Fecha de cobro','date'),
   method:field('so-pay-method','Método','select',[['efectivo','Efectivo'],['transferencia','Transferencia'],['tarjeta','Tarjeta']]),
   reference:field('so-pay-reference','Referencia')};
  pf.paidOn.input.value=new Date().toISOString().slice(0,10);
  pf.amount.input.min='0.01';pf.amount.input.step='0.01';
  const grid=container('field-grid');
  for(const f of Object.values(pf))grid.append(f.holder);
  const save=button('Registrar cobro','btn btn-primary');save.type='submit';
  form.append(line('Registrar cobro (T014)','group-label'),
   line('Saldo pendiente: '+money(o.balanceCents)+'. El cobro no puede superar el saldo.','help'),grid,save);
  form.addEventListener('submit',async ev=>{
   ev.preventDefault();save.disabled=true;
   try{
    const d=await write(base+'/orders/'+o.id+'/payment','POST',{amountCents:Math.round((Number(pf.amount.input.value)||0)*100),
     paidOn:pf.paidOn.input.value,method:pf.method.input.value,reference:pf.reference.input.value.trim()});
    ctx.notice('Cobro registrado. Saldo: '+money(d.balanceCents)+'.');
    await loadOrders();await loadDashboard();
   }catch(e){ctx.notice('No se pudo registrar el cobro: '+e.message,true);}
   finally{save.disabled=false;}
  },{signal:ctx.signal});
  return form;
 }
 function conversionButtons(o){
  const box=container('toolbar');
  const inv=button(o.invoice?'Ver factura '+o.invoice.folioLabel:'Generar factura','btn');
  inv.addEventListener('click',async()=>{
   try{
    const d=await write(base+'/orders/'+o.id+'/invoice','POST',{});
    ctx.notice(d.existing?'La factura ya existía.':'Factura '+(d.invoice?.folioLabel||'')+' creada en borrador.');
    await loadOrders();
   }catch(e){ctx.notice('No se pudo generar la factura: '+e.message,true);}
  },{signal:ctx.signal});
  const rec=button(o.receivable?'Ver CxC':'Abrir cuenta por cobrar','btn');
  rec.addEventListener('click',async()=>{
   try{
    const d=await write(base+'/orders/'+o.id+'/receivable','POST',{});
    ctx.notice(d.existing?'La cuenta por cobrar ya existía.':'Cuenta por cobrar abierta.');
    await loadOrders();
   }catch(e){ctx.notice('No se pudo abrir la CxC: '+e.message,true);}
  },{signal:ctx.signal});
  box.append(inv,rec);
  return box;
 }
 function notesForm(o){
  const form=el('form');form.className='stack';
  const nf={notes:field('so-order-notes','Notas del pedido','textarea')};
  nf.notes.input.value=o.notes||'';
  const save=button('Guardar notas','btn');save.type='submit';
  form.append(nf.notes.holder,save);
  form.addEventListener('submit',async ev=>{
   ev.preventDefault();save.disabled=true;
   try{await write(base+'/orders/'+o.id+'/notes','PATCH',{notes:nf.notes.input.value.trim()});ctx.notice('Notas guardadas.');await loadOrders();}
   catch(e){ctx.notice('No se pudieron guardar las notas: '+e.message,true);}
   finally{save.disabled=false;}
  },{signal:ctx.signal});
  return form;
 }
 // ---------- Cambio de pestaña y arranque ----------
 const panelsByTab={dashboard:dashPanel,orders:ordersPanel};
 async function showTab(){
  panels.replaceChildren(panelsByTab[activeTab]);
  if(activeTab==='dashboard'){await loadOrders();await loadDashboard();}
  if(activeTab==='orders')await loadOrders();
 }
 ctx.search.addEventListener('input',()=>{
  if(activeTab==='orders')drawOrders();
 },{signal:ctx.signal});
 $('module-message').textContent='Pedidos de venta: desde cotización aceptada hasta entrega, cobro, factura y CxC.';
 drawTabs();
 try{
  await loadOrders();await loadDashboard();
 }catch(e){ctx.notice('Error al abrir Pedidos de venta: '+e.message,true);}
 await showTab();
}
