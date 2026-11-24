// Punto de venta (T030) — venta rápida con carrito, cobro y ticket.
// Contrato real: platform/pos-store.mjs + pos-domain.mjs (migración 035).
// Todo contra /api/app/<slug>/pos/...; si la API falla se muestra el
// error, nunca se inventan filas. Precios base SIN IVA: el IVA (16%) se
// agrega al cobrar, como en T013. El precio de cada línea lo pone el
// catálogo en el servidor, nunca el cliente.
// Composición (referencia Purr'Coffee, solo composición y densidad):
// fila de chips de categoría arriba (activo con relleno cálido), grid de
// tarjetas con foto, nombre + precio, descripción corta, píldoras de
// variante, stepper (− cantidad +) y botón Agregar; panel lateral
// «Resumen del carrito» con selector Para llevar / En local / A domicilio,
// líneas con miniatura y stepper, subtotal / IVA / total y botón grande
// de cobrar. A 390 px el carrito va como barra inferior fija con el total.
// Marca Hubie: Nunito, tinta #16123a, morado #7c5cfc, rosa #ec4899; el
// tono cálido (crema/durazno) solo es acento de la suite Food.
// Sin emojis como iconografía, sin letras como iconos, sin barras visibles.
import {field,line,button,container,money,date} from './app-workflows.js';
const demoMode=new URLSearchParams(location.search).get('demo')==='1';
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const MODES=[['para_llevar','Para llevar'],['en_local','En local'],['a_domicilio','A domicilio']];
const METHODS=[['efectivo','Efectivo'],['tarjeta','Tarjeta'],['transferencia','Transferencia']];
const POS_CSS='.pos-layout{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:16px;align-items:start}'
 +'.pos-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px}'
 +'.pos-card{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid var(--hatch-widget-border,#e5e3f0);border-radius:16px;background:var(--hatch-widget-surface,#fff)}'
 +'.pos-photo{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:12px;background:#f6e3d3}'
 +'.pos-photo-fallback{width:100%;aspect-ratio:4/3;border-radius:12px;background:#f6e3d3;color:#16123a;display:flex;align-items:center;justify-content:center;font-size:44px;font-weight:800}'
 +'.pos-chips{display:flex;gap:8px;flex-wrap:wrap}.pos-chip{border:1px solid var(--hatch-widget-border,#e5e3f0);border-radius:999px;padding:8px 14px;background:var(--hatch-widget-surface,#fff);color:#16123a;cursor:pointer;font:inherit}'
 +'.pos-chip.active{background:#e9a06b;border-color:#e9a06b;color:#16123a;font-weight:700}'
 +'.pos-pill{border:1px solid var(--hatch-widget-border,#e5e3f0);border-radius:999px;padding:4px 10px;background:var(--hatch-widget-surface,#fff);color:#16123a;cursor:pointer;font:inherit;font-size:13px}'
 +'.pos-pill.active{background:#f6e3d3;border-color:#e9a06b;font-weight:700}'
 +'.pos-stepper{display:inline-flex;align-items:center;gap:4px}.pos-stepper button{min-width:32px;height:32px;border-radius:10px;border:1px solid var(--hatch-widget-border,#e5e3f0);background:var(--hatch-widget-surface,#fff);color:#16123a;font-size:16px;cursor:pointer}'
 +'.pos-mode{display:flex;gap:8px}.pos-mode button{flex:1;border:1px solid var(--hatch-widget-border,#e5e3f0);border-radius:12px;padding:10px 6px;background:var(--hatch-widget-surface,#fff);color:#16123a;cursor:pointer;font:inherit}'
 +'.pos-mode button.active{background:#f6e3d3;border-color:#e9a06b;font-weight:700}'
 +'.pos-bottombar{display:none}'
 +'@media (max-width:760px){.pos-layout{grid-template-columns:minmax(0,1fr)}}'
 +'@media (max-width:640px){.pos-sale{padding-bottom:76px}.pos-bottombar{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:40;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;background:#fff;border-top:1px solid #e5e3f0;color:#16123a;box-shadow:0 -4px 16px rgba(22,18,58,.12)}}';

export async function renderPos(ctx){
 if(!document.getElementById('pos-styles')){
  const st=document.createElement('style');st.id='pos-styles';st.textContent=POS_CSS;document.head.append(st);
 }
 const slug=encodeURIComponent(ctx.config.tenant.slug),base='/api/app/'+slug+'/pos';
 const canWrite=ctx.config.tenant.role!=='viewer';
 const host=$('record-list');
 const overview=container('cards'),tabsBar=container('toolbar'),panels=container('stack');
 host.replaceChildren(overview,tabsBar,panels);
 $('record-count').textContent='Punto de venta';
 if(demoMode)host.prepend(line('Estás en modo demostración: las ventas de ejemplo se guardan solo en esta pestaña y no se cobra nada real.','help'));
 let catalog=[],categories=[],sales=[],dashboardData=null;
 let activeTab='sale',activeCategory='',selectedSaleId=null,lastTicket=null;
 let mode='para_llevar',method='efectivo',clientName='';
 const cart=new Map();
 const selectedVariant=new Map();
 const pendingQty=new Map();
 const q=()=>ctx.search.value.trim().toLowerCase();
 const api=async(path,options)=>ctx.api(path,options);
 const write=(path,method,body)=>ctx.write(path,method,body);
 const errLine=(what,e)=>line('No se pudo cargar '+what+': '+e.message,'error');
 const cartKey=(itemId,variantId)=>itemId+':'+(variantId||'');
 const cartLines=()=>[...cart.values()];
 const cartTotals=()=>{
  const subtotal=cartLines().reduce((s,l)=>s+l.qty*l.item.priceCents,0);
  const vat=Math.round(subtotal*16/100);
  return {subtotal,vat,total:subtotal+vat,count:cartLines().reduce((s,l)=>s+l.qty,0)};
 };
 function tabButton(key,label){
  const b=button(label,activeTab===key?'btn btn-primary':'btn');
  b.addEventListener('click',()=>{activeTab=key;drawTabs();void showTab();},{signal:ctx.signal});
  return b;
 }
 function drawTabs(){
  tabsBar.replaceChildren();
  for(const [key,label] of [['sale','Venta'],['sales','Ventas'],['dashboard','Tablero']])tabsBar.append(tabButton(key,label));
 }
 async function showTab(){
  if(activeTab==='sale')await loadCatalog();
  if(activeTab==='sales')await loadSales();
  if(activeTab==='dashboard')await loadDashboard();
  panels.replaceChildren(activeTab==='sale'?salePanel:activeTab==='sales'?salesPanel:dashPanel);
 }
 // ---------- Venta ----------
 const salePanel=container('stack');salePanel.className='stack pos-sale';
 const chipsRow=container('pos-chips');
 const productGrid=container('pos-grid');
 const cartPanel=container('card-soft');
 const ticketPanel=container('card-soft');
 const bottomBar=el('div',undefined,'pos-bottombar');
 const layout=container('pos-layout');
 const saleLeft=container('stack');
 saleLeft.append(chipsRow,productGrid);
 layout.append(saleLeft,cartPanel);
 salePanel.append(layout,ticketPanel,bottomBar);
 function drawChips(){
  chipsRow.replaceChildren();
  const mkChip=(value,label)=>{
   const b=el('button',label,'pos-chip'+(activeCategory===value?' active':''));
   b.type='button';
   b.addEventListener('click',()=>{activeCategory=value;drawChips();drawProducts();},{signal:ctx.signal});
   return b;
  };
  chipsRow.append(mkChip('','Todas'));
  for(const c of categories)chipsRow.append(mkChip(c,c));
 }
 function photoEl(item,size){
  if(item.photoUrl){
   const img=el('img');img.src=item.photoUrl;img.alt=item.name;img.className='pos-photo';
   if(size)img.style.cssText='width:44px;height:44px;aspect-ratio:auto;flex:none';
   return img;
  }
  const d=el('div',(item.name||'?').trim().charAt(0).toUpperCase(),'pos-photo-fallback');
  if(size)d.style.cssText='width:44px;height:44px;aspect-ratio:auto;flex:none;font-size:20px';
  return d;
 }
 function stepper(qty,onChange){
  const wrap=container('pos-stepper');
  const minus=button('−','');minus.setAttribute('aria-label','Quitar uno');
  minus.addEventListener('click',()=>onChange(qty-1),{signal:ctx.signal});
  const val=el('span',String(qty));
  const plus=button('+','');plus.setAttribute('aria-label','Agregar uno');
  plus.addEventListener('click',()=>onChange(qty+1),{signal:ctx.signal});
  wrap.append(minus,val,plus);
  return wrap;
 }
 function drawProducts(){
  productGrid.replaceChildren();
  const visible=catalog.filter(i=>(!activeCategory||i.category===activeCategory)&&
   ((i.name+' '+(i.description||'')+' '+(i.category||'')).toLowerCase().includes(q())));
  $('record-count').textContent=visible.length+' productos';
  if(!visible.length){productGrid.append(line(catalog.length?'Sin productos con ese criterio.':'Sin productos activos en el catálogo (C006). Agrega productos al catálogo para venderlos aquí.','empty'));return;}
  for(const item of visible){
   const card=container('pos-card');
   card.append(photoEl(item));
   const head=container('stack');
   const nameRow=el('div',undefined,'');
   nameRow.style.cssText='display:flex;justify-content:space-between;gap:8px;align-items:baseline';
   nameRow.append(el('strong',item.name),el('strong',money(item.priceCents)));
   head.append(nameRow);
   if(item.description)head.append(line(item.description,'help'));
   head.append(line(item.stock===null?'Sin existencia registrada':item.stock<=0?'Sin existencias':'Existencias: '+item.stock,'help'));
   card.append(head);
   const variants=item.variants||[];
   let chosenVariantId=selectedVariant.get(item.id)??(variants[0]?.id||null);
   if(variants.length){
    const pills=container('pos-chips');
    for(const v of variants){
     const p=el('button',v.label,'pos-pill'+(chosenVariantId===v.id?' active':''));
     p.type='button';
     p.addEventListener('click',()=>{selectedVariant.set(item.id,v.id);drawProducts();},{signal:ctx.signal});
     pills.append(p);
    }
    const chosen=variants.find(v=>v.id===chosenVariantId);
    if(chosen)pills.append(line('Existencias ('+chosen.label+'): '+chosen.quantity,'help'));
    card.append(pills);
   }
   const qty=pendingQty.get(item.id)??1;
   const row=container('toolbar');
   row.append(stepper(qty,next=>{pendingQty.set(item.id,Math.max(1,next));drawProducts();}));
   const add=button('Agregar','btn btn-primary');
   add.disabled=!canWrite;
   add.addEventListener('click',()=>{
    const variant=variants.find(v=>v.id===chosenVariantId)||null;
    const key=cartKey(item.id,variant?.id||null);
    const existing=cart.get(key);
    if(existing)existing.qty+=qty;
    else cart.set(key,{item,variant,qty});
    pendingQty.set(item.id,1);
    ctx.notice(item.name+' agregado al carrito.');
    drawProducts();drawCart();
   },{signal:ctx.signal});
   row.append(add);
   card.append(row);
   productGrid.append(card);
  }
 }
 function drawCart(){
  cartPanel.replaceChildren(line('Resumen del carrito','group-label'));
  const modeRow=container('pos-mode');
  for(const [value,label] of MODES){
   const b=el('button',label,mode===value?'active':'');
   b.type='button';
   b.addEventListener('click',()=>{mode=value;drawCart();},{signal:ctx.signal});
   modeRow.append(b);
  }
  cartPanel.append(modeRow);
  const lines=cartLines();
  const list=container('stack');
  if(!lines.length)list.append(line('Carrito vacío. Agrega productos del menú.','empty'));
  for(const l of lines){
   const row=container('record survey-card');
   row.style.cssText='display:flex;gap:10px;align-items:center';
   row.append(photoEl(l.item,true));
   const info=container('stack');
   info.append(el('strong',l.item.name+(l.variant?' · '+l.variant.label:'')),
    line(money(l.item.priceCents)+' c/u · '+money(l.qty*l.item.priceCents),'help'));
   const actions=container('record-actions');
   actions.append(stepper(l.qty,next=>{
    if(next<=0)cart.delete(cartKey(l.item.id,l.variant?.id||null));
    else l.qty=next;
    drawCart();
   }));
   const rm=button('Quitar','btn');
   rm.addEventListener('click',()=>{cart.delete(cartKey(l.item.id,l.variant?.id||null));drawCart();},{signal:ctx.signal});
   actions.append(rm);
   row.append(info,actions);list.append(row);
  }
  cartPanel.append(list);
  const t=cartTotals();
  cartPanel.append(
   line('Subtotal: '+money(t.subtotal),'help'),
   line('IVA (16%): '+money(t.vat),'help'),
   line('Total: '+money(t.total),'group-label'));
  const clientF=field('pos-client','Cliente (opcional)');
  clientF.input.value=clientName;
  clientF.input.addEventListener('input',()=>{clientName=clientF.input.value;});
  const methodF=field('pos-method','Método de cobro','select',METHODS);
  methodF.input.value=method;
  methodF.input.addEventListener('change',()=>{method=methodF.input.value;});
  cartPanel.append(clientF.holder,methodF.holder);
  const payBtn=button('Cobrar '+money(t.total),'btn btn-primary');
  payBtn.disabled=!canWrite||!lines.length;
  payBtn.addEventListener('click',async()=>{
   payBtn.disabled=true;
   try{
    const out=await write(base+'/sales','POST',{lines:lines.map(l=>({catalogItemId:l.item.id,variantId:l.variant?.id||null,quantity:l.qty})),
     method,mode,clientName:clientName.trim()});
    lastTicket=out;
    cart.clear();
    ctx.notice('Venta '+out.sale.folioText+' cobrada: '+money(out.sale.totalCents)+'.');
    drawCart();drawTicket();await loadDashboard();
   }catch(e){ctx.notice('No se pudo cobrar la venta: '+e.message,true);}
   finally{payBtn.disabled=false;}
  },{signal:ctx.signal});
  cartPanel.append(payBtn);
  cartPanel.append(line('Precios base sin IVA; el IVA (16%) se agrega al cobrar. El efectivo con caja abierta (T016) registra el movimiento en caja; tarjeta y transferencia no pasan por caja.','help'));
  const total=t.total;
  bottomBar.replaceChildren();
  bottomBar.append(el('strong','Total: '+money(total)));
  const viewCart=button('Ver carrito ('+t.count+')','btn btn-primary');
  viewCart.addEventListener('click',()=>{cartPanel.scrollIntoView({block:'center',behavior:'smooth'});},{signal:ctx.signal});
  bottomBar.append(viewCart);
 }
 function drawTicket(){
  ticketPanel.replaceChildren();
  if(!lastTicket)return;
  const s=lastTicket.sale;
  ticketPanel.append(line('Ticket · '+s.folioText,'group-label'));
  ticketPanel.append(line([(s.clientName||'Venta de mostrador'),(MODES.find(m=>m[0]===s.mode)?.[1]||s.mode),
   (METHODS.find(m=>m[0]===s.method)?.[1]||s.method),'Cobro: '+lastTicket.payment.reference,
   s.createdAt?date(s.createdAt):''].filter(Boolean).join(' · '),'help'));
  for(const l of s.lines||[]){
   ticketPanel.append(line(l.quantity+' × '+l.name+' · '+money(l.unitPriceCents)+' c/u · '+money(l.lineTotalCents)+(l.stockDeducted?'':' · sin descuento de existencias'),'help'));
  }
  ticketPanel.append(
   line('Subtotal: '+money(s.subtotalCents),'help'),
   line('IVA (16%): '+money(s.vatCents),'help'),
   line('Total: '+money(s.totalCents),'group-label'));
  for(const w of lastTicket.warnings||[])ticketPanel.append(line(w,'error'));
  if(lastTicket.cashboxNote)ticketPanel.append(line(lastTicket.cashboxNote,'help'));
  if((lastTicket.stockDeducted||[]).length)ticketPanel.append(line('Existencias descontadas: '+lastTicket.stockDeducted.map(d=>d.sku+' (−'+d.quantity+')').join(', '),'help'));
  const again=button('Nueva venta','btn');
  again.addEventListener('click',()=>{lastTicket=null;drawTicket();},{signal:ctx.signal});
  ticketPanel.append(again);
 }
 async function loadCatalog(){
  try{
   const d=await api(base+'/catalog');
   catalog=d.items||[];categories=d.categories||[];
  }catch(e){catalog=[];categories=[];productGrid.replaceChildren(errLine('el catálogo',e));return;}
  drawChips();drawProducts();drawCart();drawTicket();
 }
 // ---------- Ventas ----------
 const salesPanel=container('stack');
 const salesList=container('stack');
 const saleDetail=container('card-soft');
 async function loadSales(){
  try{const d=await api(base+'/sales');sales=d.sales||[];}catch(e){sales=[];salesList.replaceChildren(errLine('las ventas',e));return;}
  drawSales();
 }
 function drawSales(){
  salesPanel.replaceChildren(line('Ventas','group-label'),salesList);
  const visible=sales.filter(s=>((s.folioText||'')+' '+(s.clientName||'')).toLowerCase().includes(q()));
  $('record-count').textContent=visible.length+' ventas';
  salesList.replaceChildren();
  if(!visible.length){salesList.append(line(sales.length?'Sin ventas con ese criterio.':'Sin ventas todavía. Cobra la primera en la pestaña Venta.','empty'));}
  for(const s of visible){
   const row=container('record survey-card'),info=container('stack');
   info.append(el('strong',s.folioText+' · '+money(s.totalCents)),
    line([(s.clientName||'Venta de mostrador'),(MODES.find(m=>m[0]===s.mode)?.[1]||s.mode),
     (METHODS.find(m=>m[0]===s.method)?.[1]||s.method),(s.lines||0)+' líneas',
     s.createdAt?date(s.createdAt):''].filter(Boolean).join(' · '),'help'));
   const actions=container('record-actions');
   const detail=button('Ver ticket','btn');
   detail.addEventListener('click',()=>{selectedSaleId=s.id;void showSaleDetail();},{signal:ctx.signal});
   actions.append(detail);
   row.append(info,actions);salesList.append(row);
  }
  salesPanel.append(saleDetail);
 }
 async function showSaleDetail(){
  if(!selectedSaleId)return;
  saleDetail.replaceChildren(line('Cargando ticket…','help'));
  try{
   const d=await api(base+'/sales/'+selectedSaleId);
   const s=d.sale;
   saleDetail.replaceChildren(line('Ticket · '+s.folioText,'group-label'));
   saleDetail.append(line([(s.clientName||'Venta de mostrador'),(MODES.find(m=>m[0]===s.mode)?.[1]||s.mode),
    (METHODS.find(m=>m[0]===s.method)?.[1]||s.method),'Cobro: '+(s.paymentId||'—'),
    s.createdAt?date(s.createdAt):''].filter(Boolean).join(' · '),'help'));
   for(const l of s.lines||[]){
    saleDetail.append(line(l.quantity+' × '+l.name+' · '+money(l.unitPriceCents)+' c/u · '+money(l.lineTotalCents)+(l.stockDeducted?'':' · sin descuento de existencias'),'help'));
   }
   saleDetail.append(line('Subtotal: '+money(s.subtotalCents),'help'),
    line('IVA (16%): '+money(s.vatCents),'help'),
    line('Total: '+money(s.totalCents),'group-label'));
  }catch(e){saleDetail.replaceChildren(errLine('el ticket',e));}
 }
 // ---------- Tablero ----------
 const dashPanel=container('stack');
 async function loadDashboard(){
  try{dashboardData=await api(base+'/dashboard');}catch(e){dashboardData=null;dashPanel.replaceChildren(errLine('el tablero',e));return;}
  drawDashboard();
 }
 function drawDashboard(){
  dashPanel.replaceChildren(line('Tablero de ventas','group-label'));
  if(!dashboardData){dashPanel.append(line('Cargando tablero…','help'));return;}
  const stats=container('cards');
  for(const [label,value] of [['Ventas de hoy',String(dashboardData.today?.count??0)],
   ['Total de hoy',money(dashboardData.today?.totalCents??0)],
   ['Ventas totales',String(dashboardData.totals?.count??0)],
   ['Total acumulado',money(dashboardData.totals?.totalCents??0)]]){
   const card=container('stat');card.append(el('span',label,'stat-label'),el('div',value,'stat-number'));stats.append(card);
  }
  dashPanel.append(stats);
  const byMethod=container('stack');
  for(const [m,v] of Object.entries(dashboardData.byMethod||{})){
   byMethod.append(line((METHODS.find(x=>x[0]===m)?.[1]||m)+': '+v.count+' ventas · '+money(v.totalCents),'help'));
  }
  if(!Object.keys(dashboardData.byMethod||{}).length)byMethod.append(line('Sin ventas todavía.','empty'));
  dashPanel.append(line('Por método de cobro','group-label'),byMethod);
  const recent=container('stack');
  for(const s of dashboardData.recent||[])recent.append(line(s.folioText+' · '+money(s.totalCents)+' · '+(s.clientName||'Venta de mostrador'),'help'));
  dashPanel.append(line('Ventas recientes','group-label'),recent);
  overview.replaceChildren();
  for(const [label,value] of [['Ventas de hoy',String(dashboardData.today?.count??0)],['Total de hoy',money(dashboardData.today?.totalCents??0)],
   ['Ventas totales',String(dashboardData.totals?.count??0)],['Total acumulado',money(dashboardData.totals?.totalCents??0)]]){
   const card=container('stat');card.append(el('span',label,'stat-label'),el('div',value,'stat-number'));overview.append(card);
  }
 }
 drawTabs();
 await loadCatalog();
 await showTab();
}
