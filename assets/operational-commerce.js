// Commerce UI real: cotizaciones (T013), catálogo (C006), gastos (C007),
// cobros (T014), facturación sin CFDI (T015) y reportes (T020).
// Marca Hubie: Nunito, tinta #16123a, morado #7c5cfc, rosa #ec4899.
// Sin emojis como iconografía, sin letras como iconos, sin barras visibles.
import {field,line,money,button,container} from './app-workflows.js';
import {createImportPanel,CATALOG_CSV_TEMPLATE} from './import-ui.js';
import {renderExpenseBudgetsPanel} from './operational-p1b.js';
const demoMode=new URLSearchParams(location.search).get('demo')==='1';
const baseFor=(ctx,module)=>'/api/app/'+encodeURIComponent(ctx.config.tenant.slug)+'/workflows/'+module;
const canWrite=ctx=>ctx.config.tenant.role!=='viewer';
const today=()=>new Date().toISOString().slice(0,10);
const fmtDate=iso=>iso?new Date(iso+'T00:00:00').toLocaleDateString('es-MX',{dateStyle:'medium'}):'—';
const mxn=cents=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(cents||0)/100);
const pesosToCents=value=>{const n=Number(value);if(!Number.isFinite(n)||n<0)throw Error('Ingresa un monto válido.');return Math.round(n*100);};
function saveBlob(blob,filename){
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function printDocument(title,innerHtml){
 const win=window.open('','_blank','width=820,height=900');
 if(!win){throw Error('El navegador bloqueó la ventana de impresión.');}
 win.document.write('<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>'+String(title).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))+'</title><style>'+
  'body{font-family:Nunito,Arial,sans-serif;color:#16123a;margin:40px}'+
  'h1{font-size:22px;margin:0}h2{font-size:15px;margin:24px 0 8px}'+
  '.brand{color:#7c5cfc;font-weight:800;letter-spacing:.04em}'+
  '.badge{display:inline-block;border:1.5px solid #7c5cfc;color:#7c5cfc;border-radius:999px;padding:2px 10px;font-size:12px;font-weight:700}'+
  '.warn{border-color:#b45309;color:#b45309}'+
  'table{width:100%;border-collapse:collapse;margin-top:8px}th,td{border-bottom:1px solid #e5e7eb;padding:8px 4px;text-align:left;font-size:13px}'+
  'th{color:#6b7280;text-transform:uppercase;font-size:11px}td.num,th.num{text-align:right}'+
  '.totals{margin-left:auto;width:260px}.totals div{display:flex;justify-content:space-between;padding:4px 0;font-size:14px}'+
  '.totals .grand{font-weight:800;border-top:2px solid #16123a}'+
  '.muted{color:#6b7280;font-size:12px}</style></head><body>'+innerHtml+
  '<script>window.addEventListener("load",()=>window.print())<\/script></body></html>');
 win.document.close();
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const quoteDocHtml=(q,tenantName)=>'<p class="brand">HUBIE · '+esc(tenantName)+'</p><h1>Cotización · '+esc(q.title)+'</h1>'+
 '<p>Cliente: <strong>'+esc(q.clientName)+'</strong> · Estatus: <span class="badge">'+esc(q.statusLabel)+'</span>'+
 (q.validUntil?' · Vigente hasta '+fmtDate(q.validUntil):'')+'</p>'+
 (q.notes?'<p>'+esc(q.notes)+'</p>':'')+
 '<h2>Partidas</h2><table><tr><th>Concepto</th><th class="num">Cantidad</th><th class="num">Precio unitario</th><th class="num">Importe</th></tr>'+
 q.lines.map(l=>'<tr><td>'+esc(l.description)+'</td><td class="num">'+l.quantity+'</td><td class="num">'+mxn(l.unitPriceCents)+'</td><td class="num">'+mxn(l.lineTotalCents)+'</td></tr>').join('')+'</table>'+
 '<div class="totals"><div><span>Subtotal</span><span>'+mxn(q.subtotalCents)+'</span></div>'+
 '<div><span>IVA '+q.vatRate+'%</span><span>'+mxn(q.vatCents)+'</span></div>'+
 '<div class="grand"><span>Total</span><span>'+mxn(q.totalCents)+'</span></div>'+
 '<div><span>Cobrado</span><span>'+mxn(q.paidCents)+'</span></div>'+
 '<div><span>Saldo pendiente</span><span>'+mxn(q.balanceCents)+'</span></div></div>'+
 '<p class="muted">Aceptación del cliente por enlace con token o directamente en la app. Cotización generada con Hubie.</p>';
const invoiceDocHtml=(inv,tenantName)=>'<p class="brand">HUBIE · '+esc(tenantName)+'</p><h1>Factura '+esc(inv.folioLabel)+'</h1>'+
 '<p><span class="badge warn">Sin CFDI (pendiente PAC)</span></p>'+
 '<p>Cliente: <strong>'+esc(inv.clientName)+'</strong>'+(inv.rfc?' · RFC: '+esc(inv.rfc):'')+' · Estatus: '+esc(inv.statusLabel)+'</p>'+
 '<h2>Conceptos</h2><table><tr><th>Concepto</th><th class="num">Cantidad</th><th class="num">Precio unitario</th><th class="num">Importe</th></tr>'+
 inv.items.map(l=>'<tr><td>'+esc(l.description)+'</td><td class="num">'+l.quantity+'</td><td class="num">'+mxn(l.unitPriceCents)+'</td><td class="num">'+mxn(l.lineTotalCents)+'</td></tr>').join('')+'</table>'+
 '<div class="totals"><div><span>Subtotal</span><span>'+mxn(inv.subtotalCents)+'</span></div>'+
 '<div><span>IVA '+inv.vatRate+'%</span><span>'+mxn(inv.vatCents)+'</span></div>'+
 '<div class="grand"><span>Total</span><span>'+mxn(inv.totalCents)+'</span></div></div>'+
 '<p class="muted">Documento administrativo interno. No es un comprobante fiscal: no tiene timbrado CFDI, folio fiscal, sello ni cadena original. El timbrado con PAC está pendiente de integración.</p>';

function statRow(host,entries){
 host.replaceChildren();
 for(const [label,value] of entries){
  const card=container('stat');card.append(line(label,'stat-label'),line(String(value),'stat-number'));host.append(card);
 }
}
// Estado vacío con acción: sin búsqueda muestra el texto de alta; con
// búsqueda activa muestra "Sin resultados" + botón Limpiar búsqueda.
function emptyState(q,emptyText,clearSearch){
 const wrap=container('empty empty-state');
 if(q){
  wrap.append(line('Sin resultados para tu búsqueda',''));
  const clear=button('Limpiar búsqueda','btn');clear.type='button';
  clear.addEventListener('click',clearSearch);
  wrap.append(clear);
 }else{
  wrap.append(line(emptyText,''));
 }
 return wrap;
}
function linesEditor(){
 const wrap=container('stack');
 const head=line('Partidas de la cotización','group-label');
 const rows=container('stack');
 const add=button('Agregar partida','btn');
 const totals=line('','help');
 const compute=()=>{
  let subtotal=0,valid=true;
  for(const row of rows.querySelectorAll('.quote-line')){
   const qty=Number(row.querySelector('[data-qty]').value),price=Number(row.querySelector('[data-price]').value);
   if(!Number.isFinite(qty)||qty<=0||!Number.isFinite(price)||price<0)valid=false;
   else subtotal+=Math.round(qty*100)*Math.round(price*100)/100;
  }
  totals.textContent=valid?'Subtotal estimado: '+mxn(Math.round(subtotal*100))+' (sin IVA)':'Revisa cantidades y precios de las partidas.';
 };
 const addRow=(values={})=>{
  const row=document.createElement('div');row.className='toolbar quote-line';
  const desc=document.createElement('input');desc.className='search';desc.placeholder='Concepto';desc.required=true;desc.value=values.description||'';desc.style.flex='2';
  const qty=document.createElement('input');qty.className='search';qty.type='number';qty.min='1';qty.step='1';qty.placeholder='Cant.';qty.required=true;qty.value=values.quantity??1;qty.dataset.qty='1';qty.style.maxWidth='90px';
  const price=document.createElement('input');price.className='search';price.type='number';price.min='0';price.step='0.01';price.placeholder='Precio MXN';price.required=true;price.value=values.unitPriceCents!==undefined?String(values.unitPriceCents/100):'';price.dataset.price='1';price.style.maxWidth='140px';
  const remove=button('Quitar','btn btn-danger');
  remove.addEventListener('click',()=>{row.remove();compute();});
  for(const input of [desc,qty,price])input.addEventListener('input',compute);
  row.append(desc,qty,price,remove);rows.append(row);compute();
 };
 add.addEventListener('click',()=>addRow());
 wrap.append(head,rows,add,totals);
 return {element:wrap,addRow,read(){
  const lines=[];
  for(const row of rows.querySelectorAll('.quote-line')){
   const description=row.querySelector('input').value.trim();
   const quantity=Number(row.querySelector('[data-qty]').value);
   const unitPriceCents=pesosToCents(row.querySelector('[data-price]').value);
   if(!description||!Number.isSafeInteger(quantity)||quantity<=0)throw Error('Cada partida necesita concepto y cantidad válida.');
   lines.push({description,quantity,unitPriceCents});
  }
  if(!lines.length)throw Error('Agrega al menos una partida.');
  return lines;
 },reset(){rows.replaceChildren();addRow();}};
}

export async function renderQuotes(ctx){
 const path=baseFor(ctx,'quotes'),host=document.getElementById('record-list');
 const stats=container('cards'),editor=container('card-soft'),detail=container('card-soft'),list=container('stack');
 const form=document.createElement('form');form.className='stack';
 const lines=linesEditor();
 const fields={
  title:field('quote-title','Título de la cotización'),
  clientId:field('quote-client','Cliente registrado (C001)','select',[['','Sin vincular / cliente externo']]),
  clientName:field('quote-client-name','Nombre del cliente'),
  validUntil:field('quote-valid','Vigencia','date'),
  vatRate:field('quote-vat','IVA','select',[['16','IVA 16%'],['8','IVA 8%'],['0','Sin IVA']]),
  notes:field('quote-notes','Notas','textarea')
 };
 fields.title.input.required=true;fields.clientName.input.required=true;
 const grid=container('field-grid');for(const entry of Object.values(fields))grid.append(entry.holder);
 form.append(grid,lines.element);
 const save=button('Crear cotización','btn btn-primary');save.type='submit';
 const cancel=button('Cancelar edición');cancel.hidden=true;
 const actions=container('toolbar');actions.append(save,cancel);form.append(actions);
 editor.append(line('Cotizaciones · partidas, IVA y aceptación del cliente','group-label'),form);
 detail.hidden=true;
 host.replaceChildren(stats);if(canWrite(ctx))host.append(editor);host.append(detail,list);
 ctx.attachmentsPanel?.update([]);
 let quotes=[],clients=[],editing=null,selected=null,statusFilter='';
 const labels={draft:'Borrador',sent:'Enviada',accepted:'Aceptada',rejected:'Rechazada'};
 const reset=()=>{
  editing=null;selected=null;form.reset();lines.reset();fields.vatRate.input.value='16';
  save.textContent='Crear cotización';cancel.hidden=true;detail.hidden=true;
 };
 cancel.addEventListener('click',reset,{signal:ctx.signal});
 fields.clientId.input.addEventListener('change',()=>{
  const c=clients.find(x=>x.id===fields.clientId.input.value);
  if(c)fields.clientName.input.value=c.name;
 },{signal:ctx.signal});
 async function reload(){
  const data=await ctx.api(path);if(ctx.signal.aborted)return;
  quotes=data.quotes||[];clients=data.clients||[];
  const prev=fields.clientId.input.value;
  fields.clientId.input.replaceChildren(new Option('Sin vincular / cliente externo',''));
  for(const c of clients)fields.clientId.input.add(new Option(c.name+(c.company?' · '+c.company:''),c.id));
  fields.clientId.input.value=clients.some(x=>x.id===prev)?prev:'';
  draw();
 }
 function draw(){
  if(ctx.signal.aborted)return;
  statRow(stats,[['Cotizaciones',quotes.length],['Enviadas',quotes.filter(q=>q.status==='sent').length],
   ['Aceptadas',quotes.filter(q=>q.status==='accepted').length],
   ['Por cobrar',money(quotes.filter(q=>q.status==='accepted').reduce((s,q)=>s+q.balanceCents,0))]]);
  list.replaceChildren();
  const q=ctx.search.value.trim().toLowerCase();
  const visible=quotes.filter(x=>(!statusFilter||x.status===statusFilter)&&(x.title+' '+x.clientName).toLowerCase().includes(q));
  document.getElementById('record-count').textContent=visible.length+' cotizaciones';
  const filterRow=container('toolbar');
  const select=document.createElement('select');select.className='search';select.style.maxWidth='180px';
  select.add(new Option('Todos los estados',''));
  for(const [value,label] of Object.entries(labels))select.add(new Option(label,value));
  select.value=statusFilter;
  select.addEventListener('change',()=>{statusFilter=select.value;draw();},{signal:ctx.signal});
  filterRow.append(line('Filtrar por estado:','help'),select);list.append(filterRow);
  if(!visible.length){list.append(emptyState(q,'Sin cotizaciones; crea la primera con partidas y totales reales.',()=>{ctx.search.value='';draw();}));return;}
  for(const quote of visible){
   const card=container('record'),info=container('stack');
   const title=document.createElement('strong');title.textContent=quote.title;info.append(title);
   info.append(line(quote.clientName+' · '+labels[quote.status]+' · Total '+money(quote.totalCents),'help'));
   info.append(line('Cobrado '+money(quote.paidCents)+' · Saldo '+money(quote.balanceCents)+(quote.validUntil?' · Vigencia '+fmtDate(quote.validUntil):''),'help'));
   card.append(info);
   const buttons=container('record-actions');
   const view=button('Ver detalle');
   view.addEventListener('click',()=>showDetail(quote),{signal:ctx.signal});
   buttons.append(view);
   if(canWrite(ctx)&&['draft','rejected'].includes(quote.status)){
    const edit=button('Editar');
    edit.addEventListener('click',()=>{
     editing=quote.id;selected=null;detail.hidden=true;
     fields.title.input.value=quote.title;fields.clientName.input.value=quote.clientName;
     fields.clientId.input.value=quote.clientId||'';fields.validUntil.input.value=quote.validUntil||'';
     fields.vatRate.input.value=String(quote.vatRate);fields.notes.input.value=quote.notes||'';
     lines.reset();
     void ctx.api(path+'/'+quote.id).then(data=>{
      lines.element.querySelectorAll('.quote-line').forEach(r=>r.remove());
      for(const l of data.quote.lines)lines.addRow(l);
     });
     save.textContent='Guardar cambios';cancel.hidden=false;fields.title.input.focus();
    },{signal:ctx.signal});
    const archive=button('Archivar','btn btn-danger');
    archive.addEventListener('click',async()=>{
     if(!confirm('¿Archivar esta cotización?'))return;
     try{await ctx.api(path+'/'+quote.id,{method:'DELETE'});ctx.notice('Cotización archivada.');await reload();}
     catch(e){ctx.notice(e.message,true);}
    },{signal:ctx.signal});
    buttons.append(edit,archive);
   }
   card.append(buttons);list.append(card);
  }
 }
 async function showDetail(quote){
  selected=quote.id;
  const data=await ctx.api(path+'/'+quote.id);
  const full={...data.quote,statusLabel:labels[data.quote.status]};
  detail.hidden=false;detail.replaceChildren();
  detail.append(line('Detalle · '+full.title,'group-label'));
  const table=document.createElement('table');table.className='quote-lines';
  table.innerHTML='<tr><th>Concepto</th><th>Cantidad</th><th>Precio unitario</th><th>Importe</th></tr>';
  for(const l of full.lines){
   const tr=document.createElement('tr');
   for(const text of [l.description,String(l.quantity),mxn(l.unitPriceCents),mxn(l.lineTotalCents)]){
    const td=document.createElement('td');td.textContent=text;tr.append(td);
   }
   table.append(tr);
  }
  detail.append(table);
  detail.append(line('Subtotal '+money(full.subtotalCents)+' · IVA '+full.vatRate+'% '+money(full.vatCents)+' · Total '+money(full.totalCents),'help'));
  detail.append(line('Cobrado '+money(full.paidCents)+' · Saldo pendiente '+money(full.balanceCents),'help'));
  const actionsRow=container('toolbar');
  const doStatus=async(next,label)=>{
   try{await ctx.write(path+'/'+full.id+'/'+next,'POST',{});ctx.notice('Cotización '+label+'.');detail.hidden=true;await reload();}
   catch(e){ctx.notice('No se actualizó: '+e.message,true);}
  };
  if(canWrite(ctx)){
   if(full.status==='draft'){
    const send=button('Enviar al cliente','btn btn-primary');
    send.addEventListener('click',()=>doStatus('send','enviada'),{signal:ctx.signal});actionsRow.append(send);
   }
   if(['draft','sent'].includes(full.status)){
    const accept=button('Marcar aceptada','btn btn-primary');
    accept.addEventListener('click',()=>doStatus('accept','aceptada'),{signal:ctx.signal});
    const reject=button('Marcar rechazada','btn');
    reject.addEventListener('click',()=>doStatus('reject','rechazada'),{signal:ctx.signal});
    actionsRow.append(accept,reject);
   }
   if(full.status==='rejected'){
    const back=button('Volver a borrador','btn');
    back.addEventListener('click',()=>doStatus('draft','devuelta a borrador'),{signal:ctx.signal});
    actionsRow.append(back);
   }
  }
  const printBtn=button('Imprimir / PDF','btn');
  printBtn.addEventListener('click',()=>{
   try{printDocument('Cotización · '+full.title,quoteDocHtml(full,ctx.config.tenant.displayName));}
   catch(e){ctx.notice(e.message,true);}
  },{signal:ctx.signal});
  const copy=button('Copiar enlace para el cliente','btn');
  copy.addEventListener('click',async()=>{
   const url=location.origin+'/cotizacion.html?token='+full.publicToken;
   try{await navigator.clipboard.writeText(url);ctx.notice('Enlace copiado: el cliente puede aceptar o rechazar desde ahí.');}
   catch{ctx.notice('Enlace: '+url);}
  },{signal:ctx.signal});
  const close=button('Cerrar detalle','btn');
  close.addEventListener('click',()=>{detail.hidden=true;},{signal:ctx.signal});
  actionsRow.append(printBtn,copy,close);
  detail.append(actionsRow);
  detail.append(line('El enlace lleva a la página pública de la cotización, donde el cliente acepta o rechaza sin iniciar sesión.','help'));
  detail.scrollIntoView({block:'nearest'});
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();save.disabled=true;
  try{
   const body={title:fields.title.input.value.trim(),clientId:fields.clientId.input.value||null,
    clientName:fields.clientName.input.value.trim(),validUntil:fields.validUntil.input.value||null,
    vatRate:Number(fields.vatRate.input.value),notes:fields.notes.input.value.trim(),lines:lines.read()};
   await ctx.write(path+(editing?'/'+editing:''),editing?'PATCH':'POST',body);
   ctx.notice('Cotización guardada con totales calculados.');reset();await reload();
  }catch(e){ctx.notice('No se guardó: '+e.message,true);}
  finally{save.disabled=false;}
 },{signal:ctx.signal});
 ctx.search.addEventListener('input',draw,{signal:ctx.signal});
 document.getElementById('module-message').textContent='Cotizaciones con partidas, IVA configurable y aceptación del cliente por enlace o en la app.';
 try{await reload();}catch(e){ctx.notice('Error al cargar cotizaciones: '+e.message,true);}
}

export async function renderCatalog(ctx){
 const path=baseFor(ctx,'catalog'),host=document.getElementById('record-list');
 const stats=container('cards'),editor=container('card-soft'),list=container('stack');
 const form=document.createElement('form');form.className='stack';
 const fields={
  name:field('catalog-name','Nombre del producto o servicio'),
  sku:field('catalog-sku','SKU (opcional)'),
  price:field('catalog-price','Precio MXN','number'),
  category:field('catalog-category','Categoría'),
  description:field('catalog-description','Descripción','textarea')
 };
 fields.name.input.required=true;fields.price.input.required=true;
 fields.price.input.min='0';fields.price.input.step='0.01';fields.category.input.value='General';
 const activeWrap=container('toolbar');
 const activeInput=document.createElement('input');activeInput.type='checkbox';activeInput.id='catalog-active';activeInput.checked=true;
 const activeLabel=document.createElement('label');activeLabel.htmlFor='catalog-active';activeLabel.textContent='Activo (visible en el catálogo)';
 activeWrap.append(activeInput,activeLabel);
 const grid=container('field-grid');for(const entry of Object.values(fields))grid.append(entry.holder);
 form.append(grid,activeWrap);
 const save=button('Agregar al catálogo','btn btn-primary');save.type='submit';
 const cancel=button('Cancelar edición');cancel.hidden=true;
 const actions=container('toolbar');actions.append(save,cancel);form.append(actions);
 editor.append(line('Catálogo · fichas con precio, categoría y foto','group-label'),form,
  line('La foto se adjunta abajo, en “Archivos adjuntos”: sube una imagen por ficha (máx. 10 MB).','help'));
 if(canWrite(ctx)){
  editor.append(createImportPanel({title:'Importar catálogo desde CSV',description:'Columnas: SKU, Nombre, Descripción, Precio, Categoría. También se reconocen encabezados en inglés (SKU, Name, Description, Price, Category). Los SKU duplicados se omiten sin borrar nada.',
   templateName:'hubie-catalogo-plantilla.csv',templateText:CATALOG_CSV_TEMPLATE,accept:'.csv,text/csv',
   notice:ctx.notice,
   onSubmit:async csv=>{const data=await ctx.write(path+'/import','POST',{csv});await reload();return data;}}));
 }
 host.replaceChildren(stats);if(canWrite(ctx))host.append(editor);host.append(list);
 let items=[],categories=[],editing=null,categoryFilter='',showInactive=false;
 const reset=()=>{editing=null;form.reset();fields.category.input.value='General';activeInput.checked=true;save.textContent='Agregar al catálogo';cancel.hidden=true;};
 cancel.addEventListener('click',reset,{signal:ctx.signal});
 async function reload(){
  const data=await ctx.api(path);if(ctx.signal.aborted)return;
  items=data.items||[];categories=data.categories||[];
  draw();ctx.attachmentsPanel?.update(items.map(i=>({id:i.id,title:i.sku?i.sku+' · '+i.name:i.name})));
 }
 function draw(){
  if(ctx.signal.aborted)return;
  statRow(stats,[['Artículos',items.length],['Activos',items.filter(i=>i.active).length],
   ['Categorías',new Set(items.map(i=>i.category)).size],
   ['Precio promedio',money(items.length?Math.round(items.reduce((s,i)=>s+i.priceCents,0)/items.length):0)]]);
  list.replaceChildren();
  const q=ctx.search.value.trim().toLowerCase();
  const visible=items.filter(i=>(!categoryFilter||i.category===categoryFilter)&&(showInactive||i.active)&&
   (i.name+' '+i.sku+' '+i.description+' '+i.category).toLowerCase().includes(q));
  document.getElementById('record-count').textContent=visible.length+' artículos';
  const filterRow=container('toolbar');
  const select=document.createElement('select');select.className='search';select.style.maxWidth='180px';
  select.add(new Option('Todas las categorías',''));
  for(const c of categories)select.add(new Option(c,c));
  select.value=categoryFilter;
  select.addEventListener('change',()=>{categoryFilter=select.value;draw();},{signal:ctx.signal});
  const toggle=document.createElement('label');toggle.className='help';
  const check=document.createElement('input');check.type='checkbox';check.checked=showInactive;
  check.addEventListener('change',()=>{showInactive=check.checked;draw();},{signal:ctx.signal});
  toggle.append(check,document.createTextNode(' Mostrar inactivos'));
  filterRow.append(select,toggle);list.append(filterRow);
  if(!visible.length){list.append(emptyState(q,'Sin artículos en el catálogo. Agrega la primera ficha.',()=>{ctx.search.value='';draw();}));return;}
  for(const item of visible){
   const card=container('record'),info=container('stack');
   if(item.photoUrl){
    const img=document.createElement('img');img.src=item.photoUrl;img.alt=item.name;
    img.style.cssText='width:72px;height:72px;object-fit:cover;border-radius:12px';
    info.append(img);
   }
   const title=document.createElement('strong');title.textContent=item.name;info.append(title);
   info.append(line((item.sku?item.sku+' · ':'')+item.category+' · '+money(item.priceCents)+(item.active?'':' · Inactivo'),'help'));
   if(item.description)info.append(line(item.description,'help'));
   card.append(info);
   if(canWrite(ctx)){
    const buttons=container('record-actions');
    const edit=button('Editar');
    edit.addEventListener('click',()=>{
     editing=item.id;
     fields.name.input.value=item.name;fields.sku.input.value=item.sku;fields.price.input.value=String(item.priceCents/100);
     fields.category.input.value=item.category;fields.description.input.value=item.description;activeInput.checked=item.active;
     save.textContent='Guardar ficha';cancel.hidden=false;fields.name.input.focus();
    },{signal:ctx.signal});
    const toggleActive=button(item.active?'Desactivar':'Activar');
    toggleActive.addEventListener('click',async()=>{
     try{await ctx.write(path+'/'+item.id,'PATCH',{...item,active:!item.active});ctx.notice('Ficha actualizada.');await reload();}
     catch(e){ctx.notice(e.message,true);}
    },{signal:ctx.signal});
    const archive=button('Eliminar','btn btn-danger');
    archive.addEventListener('click',async()=>{
     if(!confirm('¿Eliminar esta ficha del catálogo?'))return;
     try{await ctx.api(path+'/'+item.id,{method:'DELETE'});ctx.notice('Ficha eliminada.');await reload();}
     catch(e){ctx.notice(e.message,true);}
    },{signal:ctx.signal});
    buttons.append(edit,toggleActive,archive);card.append(buttons);
   }
   list.append(card);
  }
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();save.disabled=true;
  try{
   const body={name:fields.name.input.value.trim(),sku:fields.sku.input.value.trim(),
    priceCents:pesosToCents(fields.price.input.value),category:fields.category.input.value.trim()||'General',
    description:fields.description.input.value.trim(),active:activeInput.checked};
   await ctx.write(path+(editing?'/'+editing:''),editing?'PATCH':'POST',body);
   ctx.notice('Ficha guardada en el catálogo.');reset();await reload();
  }catch(e){ctx.notice('No se guardó: '+(e.message==='Duplicate SKU'?'Ese SKU ya existe en tu catálogo.':e.message),true);}
  finally{save.disabled=false;}
 },{signal:ctx.signal});
 ctx.search.addEventListener('input',draw,{signal:ctx.signal});
 document.getElementById('module-message').textContent='Fichas de producto o servicio con precio, categoría y foto adjunta; activa o desactiva sin borrar.';
 try{await reload();}catch(e){ctx.notice('Error al cargar el catálogo: '+e.message,true);}
}

export async function renderExpenses(ctx){
 const path=baseFor(ctx,'expenses'),host=document.getElementById('record-list');
 const stats=container('cards'),editor=container('card-soft'),list=container('stack');
 const form=document.createElement('form');form.className='stack';
 const categories=[['insumos','Insumos'],['renta','Renta'],['servicios','Servicios'],['transporte','Transporte'],['marketing','Marketing'],['personal','Personal'],['impuestos','Impuestos'],['otros','Otros']];
 const fields={
  description:field('expense-description','Concepto del gasto'),
  amount:field('expense-amount','Monto MXN','number'),
  occurredOn:field('expense-date','Fecha','date'),
  category:field('expense-category','Categoría','select',categories),
  vendor:field('expense-vendor','Proveedor'),
  supplier:field('expense-supplier','Proveedor registrado','select',[])
 };
 fields.description.input.required=true;fields.amount.input.required=true;
 fields.amount.input.min='0.01';fields.amount.input.step='0.01';fields.occurredOn.input.value=today();
 const grid=container('field-grid');for(const entry of Object.values(fields))grid.append(entry.holder);
 form.append(grid);
 const save=button('Registrar gasto','btn btn-primary');save.type='submit';
 const cancel=button('Cancelar edición');cancel.hidden=true;
 const actions=container('toolbar');actions.append(save,cancel);form.append(actions);
 editor.append(line('Control de gastos · comprobante adjunto por gasto','group-label'),form,
  line('El comprobante (foto o PDF) se adjunta abajo, en “Archivos adjuntos”, eligiendo el gasto. Máx. 10 MB por archivo.','help'));
 const budgetsPanel=container('card-soft');
 host.replaceChildren(stats);if(canWrite(ctx))host.append(editor);host.append(list,budgetsPanel);
 void renderExpenseBudgetsPanel(ctx,budgetsPanel).catch(e=>ctx.notice(e.message,true));
 let expenses=[],summary=null,editing=null,from='',to='',categoryFilter='',suppliers=[];
 const reset=()=>{editing=null;form.reset();fields.occurredOn.input.value=today();save.textContent='Registrar gasto';cancel.hidden=true;};
 cancel.addEventListener('click',reset,{signal:ctx.signal});
 async function reload(){
  const params=new URLSearchParams();
  if(from)params.set('from',from);if(to)params.set('to',to);if(categoryFilter)params.set('category',categoryFilter);
  const data=await ctx.api(path+(params.toString()?'?'+params.toString():''));if(ctx.signal.aborted)return;
  expenses=data.expenses||[];summary=data.summary||null;suppliers=data.suppliers||[];
  fields.supplier.input.replaceChildren();
  fields.supplier.input.add(new Option('Sin proveedor registrado',''));
  for(const s of suppliers)fields.supplier.input.add(new Option(s.name,s.id));
  draw();ctx.attachmentsPanel?.update(expenses.map(e=>({id:e.id,title:e.description+' · '+mxn(e.amountCents)})));
 }
 function draw(){
  if(ctx.signal.aborted)return;
  const byCat=summary?.byCategory||{};
  const topEntry=Object.entries(byCat).sort((a,b)=>b[1]-a[1])[0];
  const topLabel=topEntry?((categories.find(c=>c[0]===topEntry[0])||[])[1]||topEntry[0])+' · '+money(topEntry[1]):'—';
  statRow(stats,[['Gastos del filtro',expenses.length],
   ['Total',money(summary?.totalCents||0)],
   ['Mayor categoría',topLabel]]);
  list.replaceChildren();
  const q=ctx.search.value.trim().toLowerCase();
  const visible=expenses.filter(e=>(e.description+' '+e.vendor).toLowerCase().includes(q));
  document.getElementById('record-count').textContent=visible.length+' gastos';
  const filterRow=container('toolbar');
  const fromInput=document.createElement('input');fromInput.type='date';fromInput.className='search';fromInput.value=from;fromInput.setAttribute('aria-label','Desde');
  const toInput=document.createElement('input');toInput.type='date';toInput.className='search';toInput.value=to;toInput.setAttribute('aria-label','Hasta');
  const select=document.createElement('select');select.className='search';select.style.maxWidth='160px';
  select.add(new Option('Todas las categorías',''));
  for(const [value,label] of categories)select.add(new Option(label,value));
  select.value=categoryFilter;
  const apply=button('Filtrar','btn');
  apply.addEventListener('click',()=>{from=fromInput.value;to=toInput.value;categoryFilter=select.value;void reload();},{signal:ctx.signal});
  filterRow.append(line('Desde','help'),fromInput,line('Hasta','help'),toInput,select,apply);list.append(filterRow);
  if(summary){
   const cats=container('cards');
   for(const [key,label] of categories){
    if(!byCat[key])continue;
    const card=container('stat');card.append(line(label,'stat-label'),line(money(byCat[key]),'stat-number'));cats.append(card);
   }
   if(cats.children.length)list.append(cats);
  }
  if(!visible.length){list.append(emptyState(q,'Sin gastos en este rango. Registra el primero con fecha, categoría y monto.',()=>{ctx.search.value='';draw();}));return;}
  for(const e of visible){
   const card=container('record'),info=container('stack');
   const title=document.createElement('strong');title.textContent=e.description;info.append(title);
   info.append(line(fmtDate(e.occurredOn)+' · '+(categories.find(c=>c[0]===e.category)||[])[1]+' · '+money(e.amountCents),'help'));
   info.append(line((e.supplierName?'Proveedor: '+e.supplierName+' · ':e.vendor?'Proveedor: '+e.vendor+' · ':'')+(e.receiptCount?'Comprobante adjunto ('+e.receiptCount+')':'Sin comprobante'),'help'));
   card.append(info);
   if(canWrite(ctx)){
    const buttons=container('record-actions');
    const edit=button('Editar');
    edit.addEventListener('click',()=>{
     editing=e.id;
     fields.description.input.value=e.description;fields.amount.input.value=String(e.amountCents/100);
     fields.occurredOn.input.value=e.occurredOn;fields.category.input.value=e.category;fields.vendor.input.value=e.vendor;
     fields.supplier.input.value=e.supplierId||'';
     save.textContent='Guardar cambios';cancel.hidden=false;fields.description.input.focus();
    },{signal:ctx.signal});
    const archive=button('Eliminar','btn btn-danger');
    archive.addEventListener('click',async()=>{
     if(!confirm('¿Eliminar este gasto?'))return;
     try{await ctx.api(path+'/'+e.id,{method:'DELETE'});ctx.notice('Gasto eliminado.');await reload();}
     catch(e){ctx.notice(e.message,true);}
    },{signal:ctx.signal});
    buttons.append(edit,archive);card.append(buttons);
   }
   list.append(card);
  }
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();save.disabled=true;
  try{
   const body={description:fields.description.input.value.trim(),amountCents:pesosToCents(fields.amount.input.value),
    occurredOn:fields.occurredOn.input.value,category:fields.category.input.value,vendor:fields.vendor.input.value.trim(),
    supplierId:fields.supplier.input.value||null};
   await ctx.write(path+(editing?'/'+editing:''),editing?'PATCH':'POST',body);
   ctx.notice('Gasto registrado.');reset();await reload();
  }catch(e){ctx.notice('No se guardó: '+e.message,true);}
  finally{save.disabled=false;}
 },{signal:ctx.signal});
 ctx.search.addEventListener('input',draw,{signal:ctx.signal});
 document.getElementById('module-message').textContent='Gastos con fecha, categoría y comprobante; totales por categoría y por mes.';
 try{await reload();}catch(e){ctx.notice('Error al cargar gastos: '+e.message,true);}
}

export async function renderPayments(ctx){
 const path=baseFor(ctx,'payments'),host=document.getElementById('record-list');
 const stats=container('cards'),editor=container('card-soft'),list=container('stack');
 const form=document.createElement('form');form.className='stack';
 const fields={
  clientId:field('payment-client','Cliente registrado (C001)','select',[['','Sin vincular']]),
  clientName:field('payment-client-name','Nombre del cliente'),
  quoteId:field('payment-quote','Cotización a conciliar','select',[['','Cobro sin cotización']]),
  amount:field('payment-amount','Monto recibido MXN','number'),
  paidOn:field('payment-date','Fecha del cobro','date'),
  method:field('payment-method','Método','select',[['efectivo','Efectivo'],['transferencia','Transferencia'],['tarjeta','Tarjeta']]),
  reference:field('payment-reference','Referencia / folio'),
  notes:field('payment-notes','Notas','textarea')
 };
 fields.clientName.input.required=true;fields.amount.input.required=true;
 fields.amount.input.min='0.01';fields.amount.input.step='0.01';fields.paidOn.input.value=today();
 const grid=container('field-grid');for(const entry of Object.values(fields))grid.append(entry.holder);
 form.append(grid);
 const save=button('Registrar cobro','btn btn-primary');save.type='submit';
 const cancel=button('Cancelar edición');cancel.hidden=true;
 const actions=container('toolbar');actions.append(save,cancel);form.append(actions);
 editor.append(line('Cobros manuales · conciliación contra cotizaciones aceptadas','group-label'),form,
  line('Esto registra cobros que ya recibiste fuera de Hubie (efectivo, transferencia o tarjeta). No es un cobro en línea ni usa Stripe.','help'));
 host.replaceChildren(stats);if(canWrite(ctx))host.append(editor);host.append(list);
 ctx.attachmentsPanel?.update([]);
 let payments=[],quotes=[],clients=[],editing=null;
 const reset=()=>{editing=null;form.reset();fields.paidOn.input.value=today();save.textContent='Registrar cobro';cancel.hidden=true;};
 cancel.addEventListener('click',reset,{signal:ctx.signal});
 fields.quoteId.input.addEventListener('change',()=>{
  const q=quotes.find(x=>x.id===fields.quoteId.input.value);
  if(q){fields.clientName.input.value=q.clientName;fields.amount.input.max=String(q.balanceCents/100);}
  else fields.amount.input.removeAttribute('max');
 },{signal:ctx.signal});
 async function reload(){
  const data=await ctx.api(path);if(ctx.signal.aborted)return;
  payments=data.payments||[];quotes=data.quotes||[];clients=data.clients||[];
  const prevClient=fields.clientId.input.value,prevQuote=fields.quoteId.input.value;
  fields.clientId.input.replaceChildren(new Option('Sin vincular',''));
  for(const c of clients)fields.clientId.input.add(new Option(c.name+(c.company?' · '+c.company:''),c.id));
  fields.clientId.input.value=clients.some(x=>x.id===prevClient)?prevClient:'';
  fields.quoteId.input.replaceChildren(new Option('Cobro sin cotización',''));
  for(const q of quotes)fields.quoteId.input.add(new Option(q.title+' · saldo '+money(q.balanceCents),q.id));
  fields.quoteId.input.value=quotes.some(x=>x.id===prevQuote)?prevQuote:'';
  draw();
 }
 function draw(){
  if(ctx.signal.aborted)return;
  const month=today().slice(0,7);
  statRow(stats,[['Cobros',payments.length],
   ['Cobrado este mes',money(payments.filter(p=>p.paidOn.slice(0,7)===month).reduce((s,p)=>s+p.amountCents,0))],
   ['Saldo pendiente (cotizaciones)',money(quotes.reduce((s,q)=>s+q.balanceCents,0))]]);
  list.replaceChildren();
  const q=ctx.search.value.trim().toLowerCase();
  const visible=payments.filter(p=>(p.clientName+' '+(p.quoteTitle||'')+' '+p.reference).toLowerCase().includes(q));
  document.getElementById('record-count').textContent=visible.length+' cobros';
  if(!visible.length){list.append(emptyState(q,'Sin cobros registrados. Registra el primero y concílialo con una cotización aceptada.',()=>{ctx.search.value='';draw();}));return;}
  for(const p of visible){
   const card=container('record'),info=container('stack');
   const title=document.createElement('strong');title.textContent=p.clientName+' · '+money(p.amountCents);info.append(title);
   info.append(line(fmtDate(p.paidOn)+' · '+({efectivo:'Efectivo',transferencia:'Transferencia',tarjeta:'Tarjeta'}[p.method]||p.method)+(p.reference?' · Ref. '+p.reference:''),'help'));
   if(p.quoteTitle)info.append(line('Conciliado con: '+p.quoteTitle+' · Saldo restante de la cotización: '+money(p.quoteBalanceCents),'help'));
   if(p.notes)info.append(line(p.notes,'help'));
   card.append(info);
   if(canWrite(ctx)){
    const buttons=container('record-actions');
    const edit=button('Editar');
    edit.addEventListener('click',()=>{
     editing=p.id;
     fields.clientName.input.value=p.clientName;fields.clientId.input.value=p.clientId||'';
     fields.quoteId.input.value=p.quoteId||'';fields.amount.input.value=String(p.amountCents/100);
     fields.paidOn.input.value=p.paidOn;fields.method.input.value=p.method;
     fields.reference.input.value=p.reference;fields.notes.input.value=p.notes||'';
     save.textContent='Guardar cambios';cancel.hidden=false;fields.clientName.input.focus();
    },{signal:ctx.signal});
    const archive=button('Anular','btn btn-danger');
    archive.addEventListener('click',async()=>{
     if(!confirm('¿Anular este cobro? Se excluye de los saldos.'))return;
     try{await ctx.api(path+'/'+p.id,{method:'DELETE'});ctx.notice('Cobro anulado.');await reload();}
     catch(e){ctx.notice(e.message,true);}
    },{signal:ctx.signal});
    buttons.append(edit,archive);card.append(buttons);
   }
   list.append(card);
  }
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();save.disabled=true;
  try{
   if(editing){
    await ctx.write(path+'/'+editing,'PATCH',{paidOn:fields.paidOn.input.value,method:fields.method.input.value,
     reference:fields.reference.input.value.trim(),notes:fields.notes.input.value.trim()});
   }else{
    const body={clientId:fields.clientId.input.value||null,clientName:fields.clientName.input.value.trim(),
     quoteId:fields.quoteId.input.value||null,amountCents:pesosToCents(fields.amount.input.value),
     paidOn:fields.paidOn.input.value,method:fields.method.input.value,
     reference:fields.reference.input.value.trim(),notes:fields.notes.input.value.trim()};
    await ctx.write(path,'POST',body);
   }
   ctx.notice('Cobro registrado y conciliado.');reset();await reload();
  }catch(e){ctx.notice('No se guardó: '+(e.message==='Invalid payment'?'El monto supera el saldo pendiente de la cotización.':e.message),true);}
  finally{save.disabled=false;}
 },{signal:ctx.signal});
 ctx.search.addEventListener('input',draw,{signal:ctx.signal});
 document.getElementById('module-message').textContent='Cobros manuales recibidos fuera de Hubie, con saldo pendiente visible por cotización.';
 try{await reload();}catch(e){ctx.notice('Error al cargar cobros: '+e.message,true);}
}

export async function renderInvoices(ctx){
 const path=baseFor(ctx,'invoices'),host=document.getElementById('record-list');
 const stats=container('cards'),editor=container('card-soft'),detail=container('card-soft'),list=container('stack');
 const form=document.createElement('form');form.className='stack';
 const lines=linesEditor();
 const fields={
  quoteId:field('invoice-quote','Desde cotización aceptada','select',[['','Factura manual (sin cotización)']]),
  clientName:field('invoice-client','Razón social / cliente'),
  rfc:field('invoice-rfc','RFC (opcional)'),
  vatRate:field('invoice-vat','IVA','select',[['16','IVA 16%'],['8','IVA 8%'],['0','Sin IVA']]),
  notes:field('invoice-notes','Notas','textarea')
 };
 fields.clientName.input.required=true;
 const grid=container('field-grid');for(const entry of Object.values(fields))grid.append(entry.holder);
 form.append(grid,lines.element);
 const save=button('Crear factura','btn btn-primary');save.type='submit';
 const actions=container('toolbar');actions.append(save);form.append(actions);
 editor.append(line('Facturación administrativa · sin CFDI (pendiente PAC)','group-label'),form,
  line('Este documento es interno: guarda folio, emisor, receptor, conceptos y totales. NO timbra ante el SAT, no genera folio fiscal, sello ni cadena original.','help'));
 detail.hidden=true;
 host.replaceChildren(stats);if(canWrite(ctx))host.append(editor);host.append(detail,list);
 ctx.attachmentsPanel?.update([]);
 let invoices=[],acceptedQuotes=[];
 const labels={draft:'Borrador',issued:'Emitida',cancelled:'Cancelada'};
 fields.quoteId.input.addEventListener('change',()=>{
  const q=acceptedQuotes.find(x=>x.id===fields.quoteId.input.value);
  if(q){
   fields.clientName.input.value=q.clientName;
   lines.element.querySelectorAll('.quote-line').forEach(r=>r.remove());
   lines.addRow({description:'Total de la cotización (con IVA)',quantity:1,unitPriceCents:q.totalCents});
   ctx.notice('La factura copiará las partidas exactas de la cotización al guardarse.');
  }
 },{signal:ctx.signal});
 async function reload(){
  const data=await ctx.api(path);if(ctx.signal.aborted)return;
  invoices=data.invoices||[];acceptedQuotes=data.acceptedQuotes||[];
  const prev=fields.quoteId.input.value;
  fields.quoteId.input.replaceChildren(new Option('Factura manual (sin cotización)',''));
  for(const q of acceptedQuotes)fields.quoteId.input.add(new Option(q.title+' · '+money(q.totalCents),q.id));
  fields.quoteId.input.value=acceptedQuotes.some(x=>x.id===prev)?prev:'';
  draw();
 }
 function draw(){
  if(ctx.signal.aborted)return;
  statRow(stats,[['Facturas',invoices.length],['Emitidas',invoices.filter(i=>i.status==='issued').length],
   ['Total emitido',money(invoices.filter(i=>i.status==='issued').reduce((s,i)=>s+i.totalCents,0))]]);
  list.replaceChildren();
  const q=ctx.search.value.trim().toLowerCase();
  const visible=invoices.filter(i=>(i.clientName+' '+i.folioLabel+' '+i.rfc).toLowerCase().includes(q));
  document.getElementById('record-count').textContent=visible.length+' facturas';
  if(!visible.length){list.append(emptyState(q,'Sin facturas. Crea una desde una cotización aceptada o manual.',()=>{ctx.search.value='';draw();}));return;}
  for(const inv of visible){
   const card=container('record'),info=container('stack');
   const title=document.createElement('strong');title.textContent=inv.folioLabel+' · '+inv.clientName;info.append(title);
   info.append(line(labels[inv.status]+' · Total '+money(inv.totalCents)+(inv.rfc?' · RFC '+inv.rfc:''),'help'));
   info.append(line('Sin CFDI (pendiente PAC)','help'));
   card.append(info);
   const buttons=container('record-actions');
   const view=button('Ver / imprimir');
   view.addEventListener('click',()=>{
    const full={...inv,statusLabel:labels[inv.status]};
    detail.hidden=false;detail.replaceChildren();
    detail.append(line('Factura '+full.folioLabel,'group-label'));
    detail.append(line('Sin CFDI (pendiente PAC): documento administrativo interno, sin timbrado.','help'));
    const printBtn=button('Imprimir / PDF','btn btn-primary');
    printBtn.addEventListener('click',()=>{
     try{printDocument('Factura '+full.folioLabel,invoiceDocHtml(full,ctx.config.tenant.displayName));}
     catch(e){ctx.notice(e.message,true);}
    },{signal:ctx.signal});
    const close=button('Cerrar');
    close.addEventListener('click',()=>{detail.hidden=true;},{signal:ctx.signal});
    const row=container('toolbar');row.append(printBtn,close);detail.append(row);
    detail.scrollIntoView({block:'nearest'});
   },{signal:ctx.signal});
   buttons.append(view);
   if(canWrite(ctx)){
    if(inv.status==='draft'){
     const issue=button('Emitir','btn btn-primary');
     issue.addEventListener('click',async()=>{
      try{await ctx.write(path+'/'+inv.id+'/issued','POST',{});ctx.notice('Factura emitida (sin CFDI).');await reload();}
      catch(e){ctx.notice(e.message,true);}
     },{signal:ctx.signal});
     buttons.append(issue);
    }
    if(inv.status!=='cancelled'){
     const cancelBtn=button('Cancelar','btn btn-danger');
     cancelBtn.addEventListener('click',async()=>{
      if(!confirm('¿Cancelar esta factura?'))return;
      try{await ctx.write(path+'/'+inv.id+'/cancelled','POST',{});ctx.notice('Factura cancelada.');await reload();}
      catch(e){ctx.notice(e.message,true);}
     },{signal:ctx.signal});
     buttons.append(cancelBtn);
    }
    const archive=button('Archivar','btn');
    archive.addEventListener('click',async()=>{
     if(!confirm('¿Archivar esta factura?'))return;
     try{await ctx.api(path+'/'+inv.id,{method:'DELETE'});ctx.notice('Factura archivada.');await reload();}
     catch(e){ctx.notice(e.message,true);}
    },{signal:ctx.signal});
    buttons.append(archive);
   }
   card.append(buttons);list.append(card);
  }
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();save.disabled=true;
  try{
   const quoteId=fields.quoteId.input.value||null;
   const body=quoteId?{quoteId,rfc:fields.rfc.input.value.trim(),notes:fields.notes.input.value.trim()}:{
    clientName:fields.clientName.input.value.trim(),rfc:fields.rfc.input.value.trim(),
    vatRate:Number(fields.vatRate.input.value),notes:fields.notes.input.value.trim(),lines:lines.read()};
   await ctx.write(path,'POST',body);
   ctx.notice('Factura guardada con folio interno. Recuerda: sin CFDI (pendiente PAC).');
   form.reset();lines.reset();await reload();
  }catch(e){ctx.notice('No se guardó: '+e.message,true);}
  finally{save.disabled=false;}
 },{signal:ctx.signal});
 ctx.search.addEventListener('input',draw,{signal:ctx.signal});
 document.getElementById('module-message').textContent='Facturación administrativa sin timbrado CFDI. El timbrado con PAC está pendiente de integración.';
 try{await reload();}catch(e){ctx.notice('Error al cargar facturación: '+e.message,true);}
}

export async function renderReports(ctx){
 const path=baseFor(ctx,'reports'),host=document.getElementById('record-list');
 const stats=container('cards'),summaryCard=container('card-soft'),seriesCard=container('card-soft'),exportCard=container('card-soft');
 const monthInput=document.createElement('input');monthInput.type='month';monthInput.className='search';
 monthInput.value=today().slice(0,7);monthInput.style.maxWidth='180px';
 const refreshBtn=button('Actualizar','btn btn-primary');
 refreshBtn.addEventListener('click',()=>void reload(),{signal:ctx.signal});
 const toolbar=container('toolbar');toolbar.append(line('Mes:','help'),monthInput,refreshBtn);
 summaryCard.append(line('Resumen del mes','group-label'),toolbar);
 host.replaceChildren(stats,summaryCard,seriesCard,exportCard);
 ctx.attachmentsPanel?.update([]);
 async function reload(){
  const data=await ctx.api(path+'?month='+monthInput.value);if(ctx.signal.aborted)return;
  const t=data.totals||{};
  statRow(stats,[['Cotizaciones aceptadas',t.acceptedQuotes||0],
   ['Cobrado en el mes',money(t.paymentsCents||0)],
   ['Gastado en el mes',money(t.expensesCents||0)],
   ['Balance del mes',money(t.balanceCents||0)]]);
  summaryCard.replaceChildren(line('Resumen del mes','group-label'),toolbar);
  const cats=container('cards');
  for(const [label,value] of Object.entries(data.expensesByCategory||{})){
   const card=container('stat');card.append(line(label,'stat-label'),line(money(value),'stat-number'));cats.append(card);
  }
  summaryCard.append(cats.children.length?cats:line('Sin gastos registrados en este mes.','help'));
  summaryCard.append(line('Clientes nuevos en el mes: '+(t.newClients||0)+' · Gastos: '+(t.expensesCount||0),'help'));
  seriesCard.replaceChildren(line('Últimos 6 meses · cobros vs. gastos','group-label'));
  const table=document.createElement('table');
  table.innerHTML='<tr><th>Mes</th><th>Cobros</th><th>Gastos</th><th>Balance</th></tr>';
  for(const row of data.byMonth||[]){
   const tr=document.createElement('tr');
   for(const text of [row.month,money(row.paymentsCents),money(row.expensesCents),money(row.paymentsCents-row.expensesCents)]){
    const td=document.createElement('td');td.textContent=text;tr.append(td);
   }
   table.append(tr);
  }
  seriesCard.append(table);
  exportCard.replaceChildren(line('Exportar a CSV','group-label'),
   line('Descarga real del archivo con columnas y escape CSV correctos.','help'));
  const buttons=container('toolbar');
  for(const [kind,label] of [['clients','Clientes'],['quotes','Cotizaciones'],['payments','Cobros'],['expenses','Gastos']]){
   const btn=button('Descargar '+label+' (CSV)','btn');
   btn.addEventListener('click',async()=>{
    btn.disabled=true;
    try{
     if(demoMode){
      const data=await ctx.api(path+'/export?kind='+kind);
      saveBlob(new Blob(['\uFEFF'+data.csv],{type:'text/csv;charset=utf-8'}),data.filename);
     }else{
      const response=await fetch(path+'/export?kind='+kind,{credentials:'same-origin'});
      if(!response.ok)throw Error('No se pudo exportar.');
      const name=(response.headers.get('content-disposition')||'').match(/filename="([^"]+)"/)?.[1]||('hubie-'+kind+'.csv');
      saveBlob(await response.blob(),name);
     }
     ctx.notice('Archivo CSV descargado.');
    }catch(e){ctx.notice('No se exportó: '+e.message,true);}
    finally{btn.disabled=false;}
   },{signal:ctx.signal});
   buttons.append(btn);
  }
  exportCard.append(buttons);
 }
 monthInput.addEventListener('change',()=>void reload(),{signal:ctx.signal});
 document.getElementById('module-message').textContent='Resumen mensual y exportación CSV real de clientes, cotizaciones, cobros y gastos.';
 document.getElementById('record-count').textContent='Reportes';
 try{await reload();}catch(e){ctx.notice('Error al cargar reportes: '+e.message,true);}
}
