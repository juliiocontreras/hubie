// UI real P1-B: proveedores (T009), compras (T008), almacenes (T010),
// caja (T016), cuentas por cobrar (T017), cuentas por pagar (T018) y
// presupuestos/reporte mensual de gastos (C007).
// Marca Hubie: Nunito, tinta #16123a, morado #7c5cfc, rosa #ec4899.
// Sin emojis como iconografía, sin letras como iconos, sin barras visibles.
import {field,line,money,button,container} from './app-workflows.js';
const baseFor=(ctx,module)=>'/api/app/'+encodeURIComponent(ctx.config.tenant.slug)+'/workflows/'+module;
const canWrite=ctx=>ctx.config.tenant.role!=='viewer';
const today=()=>new Date().toISOString().slice(0,10);
const thisMonth=()=>new Date().toISOString().slice(0,7);
const fmtDate=iso=>iso?new Date(iso+'T00:00:00').toLocaleDateString('es-MX',{dateStyle:'medium'}):'—';
const mxn=cents=>new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN'}).format(Number(cents||0)/100);
const pesosToCents=value=>{const n=Number(value);if(!Number.isFinite(n)||n<0)throw Error('Ingresa un monto válido.');return Math.round(n*100);};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function statRow(host,entries){
 host.replaceChildren();
 for(const [label,value] of entries){
  const card=container('stat');card.append(line(label,'stat-label'),line(String(value),'stat-number'));host.append(card);
 }
}
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
function saveBlob(text,filename){
 const blob=new Blob([text],{type:'text/csv; charset=utf-8'}),url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
const paymentTermOptions=[['contado','Contado'],['credito_7','Crédito 7 días'],['credito_15','Crédito 15 días'],['credito_30','Crédito 30 días'],['credito_60','Crédito 60 días']];
const methodOptions=[['efectivo','Efectivo'],['transferencia','Transferencia'],['tarjeta','Tarjeta']];

export async function renderSuppliers(ctx){
 const path=baseFor(ctx,'suppliers'),host=document.getElementById('record-list');
 const stats=container('cards'),editor=container('card-soft'),list=container('stack');
 const form=document.createElement('form');form.className='stack';
 const fields={
  name:field('supplier-name','Nombre del proveedor'),
  contact:field('supplier-contact','Contacto'),
  email:field('supplier-email','Correo','email'),
  phone:field('supplier-phone','Teléfono','tel'),
  paymentTerms:field('supplier-terms','Condiciones de pago','select',paymentTermOptions),
  notes:field('supplier-notes','Notas','textarea')
 };
 fields.name.input.required=true;
 const grid=container('field-grid');for(const entry of Object.values(fields))grid.append(entry.holder);
 form.append(grid);
 const save=button('Guardar proveedor','btn btn-primary');save.type='submit';
 const cancel=button('Cancelar edición');cancel.hidden=true;
 const actions=container('toolbar');actions.append(save,cancel);form.append(actions);
 editor.append(line('Directorio maestro de proveedores','group-label'),form,
  line('Las condiciones de pago se usan en compras y cuentas por pagar. Los documentos del proveedor se ligan a un adjunto ya subido (pestaña Archivos adjuntos).','help'));
 host.replaceChildren(stats);if(canWrite(ctx))host.append(editor);host.append(list);
 let suppliers=[],editing=null;
 const reset=()=>{editing=null;form.reset();save.textContent='Guardar proveedor';cancel.hidden=true;};
 cancel.addEventListener('click',reset,{signal:ctx.signal});
 async function reload(){
  const data=await ctx.api(path);if(ctx.signal.aborted)return;
  suppliers=data.suppliers||[];draw();
 }
 function draw(){
  if(ctx.signal.aborted)return;
  statRow(stats,[['Proveedores',suppliers.length],['Con compras',suppliers.filter(s=>s.purchaseOrders>0).length],['Con cuentas por pagar',suppliers.filter(s=>s.payables>0).length]]);
  list.replaceChildren();
  const q=ctx.search.value.trim().toLowerCase();
  const visible=suppliers.filter(s=>(s.name+' '+s.contact+' '+s.email).toLowerCase().includes(q));
  document.getElementById('record-count').textContent=visible.length+' proveedores';
  if(!visible.length){list.append(emptyState(q,'Sin proveedores. Registra el primero con nombre y contacto.',()=>{ctx.search.value='';draw();}));return;}
  for(const s of visible){
   const card=container('record'),info=container('stack');
   const title=document.createElement('strong');title.textContent=s.name;info.append(title);
   info.append(line([s.contact,s.email,s.phone].filter(Boolean).join(' · ')||'Sin contacto','help'));
   info.append(line('Pago: '+((paymentTermOptions.find(p=>p[0]===s.paymentTerms)||[])[1]||s.paymentTerms)+' · Compras: '+s.purchaseOrders+' · Documentos: '+s.documents+' · Por pagar: '+s.payables,'help'));
   if(s.notes)info.append(line(s.notes,'help'));
   card.append(info);
   if(canWrite(ctx)){
    const buttons=container('record-actions');
    const docs=button('Documentos');
    docs.addEventListener('click',()=>{void renderSupplierDocs(ctx,s);},{signal:ctx.signal});
    const edit=button('Editar');
    edit.addEventListener('click',()=>{
     editing=s.id;
     fields.name.input.value=s.name;fields.contact.input.value=s.contact;fields.email.input.value=s.email;
     fields.phone.input.value=s.phone;fields.paymentTerms.input.value=s.paymentTerms;fields.notes.input.value=s.notes;
     save.textContent='Guardar cambios';cancel.hidden=false;fields.name.input.focus();
    },{signal:ctx.signal});
    const archive=button('Eliminar','btn btn-danger');
    archive.addEventListener('click',async()=>{
     if(!confirm('¿Eliminar este proveedor? No se puede si tiene compras abiertas.'))return;
     try{await ctx.api(path+'/'+s.id,{method:'DELETE'});ctx.notice('Proveedor eliminado.');await reload();}
     catch(e){ctx.notice(e.message,true);}
    },{signal:ctx.signal});
    buttons.append(docs,edit,archive);card.append(buttons);
   }
   list.append(card);
  }
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();save.disabled=true;
  try{
   const body={name:fields.name.input.value.trim(),contact:fields.contact.input.value.trim(),email:fields.email.input.value.trim(),
    phone:fields.phone.input.value.trim(),paymentTerms:fields.paymentTerms.input.value,notes:fields.notes.input.value.trim()};
   await ctx.write(path+(editing?'/'+editing:''),editing?'PATCH':'POST',body);
   ctx.notice('Proveedor guardado.');reset();await reload();
  }catch(e){ctx.notice('No se guardó: '+e.message,true);}
  finally{save.disabled=false;}
 },{signal:ctx.signal});
 ctx.search.addEventListener('input',draw,{signal:ctx.signal});
 await reload();
}
async function renderSupplierDocs(ctx,supplier){
 const path=baseFor(ctx,'suppliers')+'/'+supplier.id+'/documents';
 const data=await ctx.api(path);if(ctx.signal.aborted)return;
 const docs=data.documents||[];
 const msg=docs.length?docs.map(d=>'· '+d.documentType+(d.fileName?' ('+d.fileName+')':'')+(d.notes?' — '+d.notes:'')).join('\n'):'Sin documentos ligados.';
 const documentType=prompt('Documentos de '+supplier.name+'\n'+msg+'\n\nTipo de documento a ligar (p. ej. Contrato, INE, Comprobante fiscal):');
 if(!documentType)return;
 const mediaId=prompt('ID del adjunto en pwa_media (cópialo de Archivos adjuntos):');
 if(!mediaId)return;
 try{
  await ctx.write(path,'POST',{mediaId:mediaId.trim(),documentType:documentType.trim(),notes:''});
  ctx.notice('Documento ligado al proveedor.');
 }catch(e){ctx.notice('No se ligó: '+e.message,true);}
}

export async function renderPurchases(ctx){
 const path=baseFor(ctx,'purchases'),host=document.getElementById('record-list');
 const stats=container('cards'),editor=container('card-soft'),list=container('stack');
 const form=document.createElement('form');form.className='stack';
 const supplierField=field('po-supplier','Proveedor','select',[]);
 const expectedField=field('po-expected','Fecha esperada','date');
 const notesField=field('po-notes','Notas','textarea');
 const linesWrap=container('stack'),linesRows=container('stack');
 const addLine=button('Agregar partida','btn');
 const totals=line('','help');
 let itemList=[];
 const itemOptions=()=>itemList;
 const readLines=()=>{
  const lines=[];
  for(const row of linesRows.querySelectorAll('.po-line')){
   const description=row.querySelector('[data-desc]').value.trim();
   const quantity=Number(row.querySelector('[data-qty]').value);
   const unitPriceCents=pesosToCents(row.querySelector('[data-price]').value);
   const itemId=row.querySelector('[data-item]').value||null;
   if(!description||!Number.isSafeInteger(quantity)||quantity<=0)throw Error('Cada partida necesita concepto y cantidad válida.');
   lines.push({description,quantity,unitPriceCents,itemId});
  }
  if(!lines.length)throw Error('Agrega al menos una partida.');
  return lines;
 };
 const compute=()=>{
  let total=0,valid=true;
  for(const row of linesRows.querySelectorAll('.po-line')){
   const qty=Number(row.querySelector('[data-qty]').value),price=Number(row.querySelector('[data-price]').value);
   if(!Number.isFinite(qty)||qty<=0||!Number.isFinite(price)||price<0)valid=false;
   else total+=qty*price;
  }
  totals.textContent=valid?'Total estimado: '+mxn(Math.round(total*100)):'Revisa cantidades y precios de las partidas.';
 };
 const addRow=(values={})=>{
  const row=document.createElement('div');row.className='toolbar po-line';
  const desc=document.createElement('input');desc.className='search';desc.placeholder='Concepto';desc.required=true;desc.value=values.description||'';desc.dataset.desc='1';desc.style.flex='2';
  const item=document.createElement('select');item.className='search';item.dataset.item='1';item.style.maxWidth='170px';
  item.add(new Option('Sin artículo de inventario',''));
  for(const it of itemOptions())item.add(new Option(it.sku+' · '+it.title,it.id));
  item.value=values.itemId||'';
  const qty=document.createElement('input');qty.className='search';qty.type='number';qty.min='1';qty.step='1';qty.placeholder='Cant.';qty.required=true;qty.value=values.quantity??1;qty.dataset.qty='1';qty.style.maxWidth='80px';
  const price=document.createElement('input');price.className='search';price.type='number';price.min='0';price.step='0.01';price.placeholder='Precio MXN';price.required=true;price.value=values.unitPriceCents!==undefined?String(values.unitPriceCents/100):'';price.dataset.price='1';price.style.maxWidth='130px';
  const remove=button('Quitar','btn btn-danger');
  remove.addEventListener('click',()=>{row.remove();compute();});
  for(const input of [desc,qty,price])input.addEventListener('input',compute);
  row.append(desc,item,qty,price,remove);linesRows.append(row);compute();
 };
 addLine.addEventListener('click',()=>addRow(),{signal:ctx.signal});
 linesWrap.append(line('Partidas de la orden','group-label'),linesRows,addLine,totals);
 const grid=container('field-grid');grid.append(supplierField.holder,expectedField.holder,notesField.holder);
 form.append(grid,linesWrap);
 const save=button('Crear orden de compra','btn btn-primary');save.type='submit';
 const actions=container('toolbar');actions.append(save);form.append(actions);
 editor.append(line('Órdenes de compra por partidas','group-label'),form,
  line('Al recibir, las partidas ligadas a un artículo suben el inventario. La recepción parcial está permitida.','help'));
 host.replaceChildren(stats);if(canWrite(ctx))host.append(editor);host.append(list);
 let orders=[],suppliers=[],items=[],warehouses=[];
 async function reload(){
  const data=await ctx.api(path);if(ctx.signal.aborted)return;
  orders=data.orders||[];suppliers=data.suppliers||[];items=data.items||[];
  supplierField.input.replaceChildren();
  for(const s of suppliers)supplierField.input.add(new Option(s.name,s.id));
  itemList=items;
  const wh=await ctx.api(baseFor(ctx,'warehouses')).catch(()=>({warehouses:[]}));
  warehouses=wh.warehouses||[];
  draw();
 }
 function draw(){
  if(ctx.signal.aborted)return;
  statRow(stats,[['Órdenes',orders.length],['Enviadas',orders.filter(o=>o.status==='sent').length],['Recibidas',orders.filter(o=>o.status==='received').length],['Total en órdenes',money(orders.filter(o=>o.status!=='cancelled').reduce((s,o)=>s+o.totalCents,0))]]);
  list.replaceChildren();
  const q=ctx.search.value.trim().toLowerCase();
  const visible=orders.filter(o=>((o.supplierName||'')+' '+o.notes).toLowerCase().includes(q));
  document.getElementById('record-count').textContent=visible.length+' órdenes de compra';
  if(!visible.length){list.append(emptyState(q,'Sin órdenes de compra. Crea la primera con proveedor y partidas.',()=>{ctx.search.value='';draw();}));return;}
  const labels={draft:'Borrador',sent:'Enviada',partially_received:'Recibida parcialmente',received:'Recibida',cancelled:'Cancelada'};
  for(const o of visible){
   const card=container('record'),info=container('stack');
   const title=document.createElement('strong');title.textContent='Orden · '+(o.supplierName||'Proveedor');info.append(title);
   info.append(line(labels[o.status]+' · Total '+money(o.totalCents)+' · Recibido '+o.receivedQuantity+' de '+o.orderedQuantity+(o.expectedOn?' · Esperada '+fmtDate(o.expectedOn):''),'help'));
   if(o.notes)info.append(line(o.notes,'help'));
   card.append(info);
   if(canWrite(ctx)){
    const buttons=container('record-actions');
    const detail=button('Ver partidas');
    detail.addEventListener('click',()=>{void showOrder(ctx,o,warehouses,reload);},{signal:ctx.signal});
    buttons.append(detail);
    if(o.status==='draft'){
     const send=button('Enviar','btn btn-primary');
     send.addEventListener('click',async()=>{try{await ctx.write(path+'/'+o.id+'/send','POST',{});ctx.notice('Orden enviada.');await reload();}catch(e){ctx.notice(e.message,true);}},{signal:ctx.signal});
     buttons.append(send);
    }
    if(['draft','sent','partially_received'].includes(o.status)){
     const cancel=button('Cancelar','btn btn-danger');
     cancel.addEventListener('click',async()=>{if(!confirm('¿Cancelar esta orden?'))return;try{await ctx.write(path+'/'+o.id+'/cancel','POST',{});ctx.notice('Orden cancelada.');await reload();}catch(e){ctx.notice(e.message,true);}},{signal:ctx.signal});
     buttons.append(cancel);
    }
    card.append(buttons);
   }
   list.append(card);
  }
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();save.disabled=true;
  try{
   const body={supplierId:supplierField.input.value,expectedOn:expectedField.input.value||null,notes:notesField.input.value.trim(),lines:readLines()};
   await ctx.write(path,'POST',body);
   ctx.notice('Orden de compra creada.');form.reset();linesRows.replaceChildren();addRow();await reload();
  }catch(e){ctx.notice('No se guardó: '+e.message,true);}
  finally{save.disabled=false;}
 },{signal:ctx.signal});
 ctx.search.addEventListener('input',draw,{signal:ctx.signal});
 addRow();
 await reload();
}
async function showOrder(ctx,order,warehouses,reload){
 const path=baseFor(ctx,'purchases')+'/'+order.id;
 const data=await ctx.api(path);if(ctx.signal.aborted)return;
 const o=data.order;
 const linesText=o.lines.map(l=>'· '+l.description+' — '+l.receivedQuantity+' de '+l.quantity+' recibidos ('+mxn(l.unitPriceCents)+' c/u)').join('\n');
 if(!['sent','partially_received'].includes(o.status)){alert('Orden '+o.status+'\n'+linesText);return;}
 const lineId=prompt('Partidas:\n'+linesText+'\n\nID de la partida a recibir (usa el orden: 1..'+o.lines.length+'):');
 const idx=Number(lineId)-1;
 if(!o.lines[idx])return;
 const qty=prompt('Cantidad a recibir de "'+o.lines[idx].description+'" (pendiente '+(o.lines[idx].quantity-o.lines[idx].receivedQuantity)+'):');
 const quantity=Number(qty);
 if(!Number.isSafeInteger(quantity)||quantity<=0)return;
 let warehouseId=null;
 if(warehouses.length){
  const whName=prompt('Almacén destino (vacío = solo inventario general):\n'+warehouses.map((w,i)=>(i+1)+'. '+w.name).join('\n'));
  const whIdx=Number(whName)-1;
  if(warehouses[whIdx])warehouseId=warehouses[whIdx].id;
 }
 try{
  const result=await ctx.write(path+'/receive','POST',{receipts:[{lineId:o.lines[idx].id,quantity,warehouseId}]});
  ctx.notice('Recepción registrada. Estatus: '+result.status+'.');
  await reload();
 }catch(e){ctx.notice('No se recibió: '+e.message,true);}
}

export async function renderWarehouses(ctx){
 const path=baseFor(ctx,'warehouses'),host=document.getElementById('record-list');
 const stats=container('cards'),editor=container('card-soft'),transferBox=container('card-soft'),list=container('stack');
 const form=document.createElement('form');form.className='stack';
 const fields={
  name:field('warehouse-name','Nombre del almacén'),
  location:field('warehouse-location','Ubicación'),
  responsible:field('warehouse-responsible','Responsable')
 };
 fields.name.input.required=true;
 const grid=container('field-grid');for(const entry of Object.values(fields))grid.append(entry.holder);
 form.append(grid);
 const save=button('Guardar almacén','btn btn-primary');save.type='submit';
 const cancel=button('Cancelar edición');cancel.hidden=true;
 const actions=container('toolbar');actions.append(save,cancel);form.append(actions);
 editor.append(line('Almacenes de la empresa','group-label'),form);
 const tForm=document.createElement('form');tForm.className='stack';
 const tFields={
  from:field('transfer-from','Origen','select',[]),
  to:field('transfer-to','Destino','select',[]),
  item:field('transfer-item','Artículo','select',[]),
  quantity:field('transfer-qty','Cantidad','number'),
  note:field('transfer-note','Nota')
 };
 tFields.quantity.input.min='1';tFields.quantity.input.step='1';tFields.quantity.input.required=true;
 const tGrid=container('field-grid');for(const entry of Object.values(tFields))tGrid.append(entry.holder);
 tForm.append(tGrid);
 const tSave=button('Transferir','btn btn-primary');tSave.type='submit';
 tForm.append(container('toolbar')).lastChild.append(tSave);
 transferBox.append(line('Transferencia entre almacenes','group-label'),tForm,
  line('Se valida stock suficiente en el origen; el movimiento queda en el historial.','help'));
 host.replaceChildren(stats);if(canWrite(ctx)){host.append(editor);host.append(transferBox);}host.append(list);
 let warehouses=[],transfers=[],items=[],editing=null;
 const reset=()=>{editing=null;form.reset();save.textContent='Guardar almacén';cancel.hidden=true;};
 cancel.addEventListener('click',reset,{signal:ctx.signal});
 async function reload(){
  const data=await ctx.api(path);if(ctx.signal.aborted)return;
  warehouses=data.warehouses||[];transfers=data.transfers||[];items=data.items||[];
  for(const select of [tFields.from.input,tFields.to.input]){
   select.replaceChildren();
   for(const w of warehouses)select.add(new Option(w.name,w.id));
  }
  tFields.item.input.replaceChildren();
  for(const it of items)tFields.item.input.add(new Option(it.sku+' · '+it.title+' ('+it.quantity+')',it.id));
  draw();
 }
 function draw(){
  if(ctx.signal.aborted)return;
  const totalStock=warehouses.reduce((s,w)=>s+w.stock.reduce((a,i)=>a+i.quantity,0),0);
  statRow(stats,[['Almacenes',warehouses.length],['Unidades en almacenes',totalStock],['Transferencias',transfers.length]]);
  list.replaceChildren();
  const q=ctx.search.value.trim().toLowerCase();
  const visible=warehouses.filter(w=>(w.name+' '+w.location+' '+w.responsible).toLowerCase().includes(q));
  document.getElementById('record-count').textContent=visible.length+' almacenes';
  if(!visible.length){list.append(emptyState(q,'Sin almacenes. Crea el primero con nombre y responsable.',()=>{ctx.search.value='';draw();}));return;}
  for(const w of visible){
   const card=container('record'),info=container('stack');
   const title=document.createElement('strong');title.textContent=w.name;info.append(title);
   info.append(line([w.location,w.responsible].filter(Boolean).join(' · ')||'Sin ubicación','help'));
   info.append(line(w.stock.length?w.stock.map(i=>i.sku+' × '+i.quantity).join(' · '):'Sin existencias','help'));
   card.append(info);
   if(canWrite(ctx)){
    const buttons=container('record-actions');
    const edit=button('Editar');
    edit.addEventListener('click',()=>{
     editing=w.id;
     fields.name.input.value=w.name;fields.location.input.value=w.location;fields.responsible.input.value=w.responsible;
     save.textContent='Guardar cambios';cancel.hidden=false;fields.name.input.focus();
    },{signal:ctx.signal});
    const archive=button('Eliminar','btn btn-danger');
    archive.addEventListener('click',async()=>{
     if(!confirm('¿Eliminar este almacén? Debe estar sin existencias.'))return;
     try{await ctx.api(path+'/'+w.id,{method:'DELETE'});ctx.notice('Almacén eliminado.');await reload();}
     catch(e){ctx.notice(e.message,true);}
    },{signal:ctx.signal});
    buttons.append(edit,archive);card.append(buttons);
   }
   list.append(card);
  }
  if(transfers.length){
   list.append(line('Historial de transferencias','group-label'));
   for(const t of transfers.slice(0,20)){
    const card=container('record'),info=container('stack');
    info.append(line(t.fromName+' → '+t.toName+' · '+t.sku+' × '+t.quantity+' · '+fmtDate(t.createdAt.slice(0,10)),'help'));
    if(t.note)info.append(line(t.note,'help'));
    card.append(info);list.append(card);
   }
  }
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();save.disabled=true;
  try{
   const body={name:fields.name.input.value.trim(),location:fields.location.input.value.trim(),responsible:fields.responsible.input.value.trim()};
   await ctx.write(path+(editing?'/'+editing:''),editing?'PATCH':'POST',body);
   ctx.notice('Almacén guardado.');reset();await reload();
  }catch(e){ctx.notice('No se guardó: '+e.message,true);}
  finally{save.disabled=false;}
 },{signal:ctx.signal});
 tForm.addEventListener('submit',async event=>{
  event.preventDefault();tSave.disabled=true;
  try{
   await ctx.write(path+'/transfer','POST',{fromWarehouseId:tFields.from.input.value,toWarehouseId:tFields.to.input.value,
    itemId:tFields.item.input.value,quantity:Number(tFields.quantity.input.value),note:tFields.note.input.value.trim()});
   ctx.notice('Transferencia registrada.');tForm.reset();await reload();
  }catch(e){ctx.notice('No se transfirió: '+e.message,true);}
  finally{tSave.disabled=false;}
 },{signal:ctx.signal});
 ctx.search.addEventListener('input',draw,{signal:ctx.signal});
 await reload();
}

export async function renderCashbox(ctx){
 const path=baseFor(ctx,'cashbox'),host=document.getElementById('record-list');
 const stats=container('cards'),editor=container('card-soft'),list=container('stack');
 const form=document.createElement('form');form.className='stack';
 const fields={
  opening:field('cashbox-opening','Monto inicial MXN','number'),
  responsible:field('cashbox-responsible','Responsable'),
  shift:field('cashbox-shift','Turno')
 };
 fields.opening.input.min='0';fields.opening.input.step='0.01';fields.opening.input.required=true;
 fields.responsible.input.required=true;
 const grid=container('field-grid');for(const entry of Object.values(fields))grid.append(entry.holder);
 form.append(grid);
 const save=button('Abrir caja','btn btn-primary');save.type='submit';
 form.append(container('toolbar')).lastChild.append(save);
 editor.append(line('Apertura de caja','group-label'),form,
  line('Solo puede haber una caja abierta por empresa. Los movimientos se ligan a cobros y gastos.','help'));
 host.replaceChildren(stats);if(canWrite(ctx))host.append(editor);host.append(list);
 let boxes=[],open=null;
 async function reload(){
  const data=await ctx.api(path);if(ctx.signal.aborted)return;
  boxes=data.cashboxes||[];open=data.open||null;draw();
 }
 function draw(){
  if(ctx.signal.aborted)return;
  statRow(stats,[['Caja abierta',open?money(open.expectedCents):'Ninguna'],['Ingresos (caja abierta)',money(open?.inCents||0)],['Egresos (caja abierta)',money(open?.outCents||0)],['Cierres registrados',boxes.filter(b=>b.status==='closed').length]]);
  list.replaceChildren();
  document.getElementById('record-count').textContent=boxes.length+' cajas';
  if(open&&canWrite(ctx)){
   const panel=container('card-soft');
   const mForm=document.createElement('form');mForm.className='stack';
   const mFields={
    direction:field('cashbox-direction','Movimiento','select',[['in','Ingreso'],['out','Egreso']]),
    amount:field('cashbox-amount','Monto MXN','number'),
    kind:field('cashbox-kind','Concepto'),
    notes:field('cashbox-notes','Notas')
   };
   mFields.amount.input.min='0.01';mFields.amount.input.step='0.01';mFields.amount.input.required=true;
   const mGrid=container('field-grid');for(const entry of Object.values(mFields))mGrid.append(entry.holder);
   mForm.append(mGrid);
   const mSave=button('Registrar movimiento','btn btn-primary');mSave.type='submit';
   mForm.append(container('toolbar')).lastChild.append(mSave);
   const cForm=document.createElement('form');cForm.className='stack';
   const cField=field('cashbox-counted','Conteo físico MXN','number');
   cField.input.min='0';cField.input.step='0.01';cField.input.required=true;
   cForm.append(cField.holder);
   const countBtn=button('Registrar arqueo');
   const closeBtn=button('Cerrar caja','btn btn-danger');
   const cActions=container('toolbar');cActions.append(countBtn,closeBtn);cForm.append(cActions);
   panel.append(line('Caja abierta · '+open.responsible+(open.shift?' · Turno '+open.shift:''),'group-label'),
    line('Apertura '+money(open.openingCents)+' · Esperado en sistema '+money(open.expectedCents),'help'),mForm,cForm);
   mForm.addEventListener('submit',async event=>{
    event.preventDefault();mSave.disabled=true;
    try{
     await ctx.write(path+'/'+open.id+'/movements','POST',{direction:mFields.direction.input.value,
      amountCents:pesosToCents(mFields.amount.input.value),kind:mFields.kind.input.value.trim(),
      notes:mFields.notes.input.value.trim(),sourceType:'manual',sourceId:null});
     ctx.notice('Movimiento registrado.');mForm.reset();await reload();
    }catch(e){ctx.notice('No se guardó: '+e.message,true);}
    finally{mSave.disabled=false;}
   },{signal:ctx.signal});
   countBtn.addEventListener('click',async()=>{
    try{
     const result=await ctx.write(path+'/'+open.id+'/count','POST',{countedCents:pesosToCents(cField.input.value),notes:''});
     ctx.notice('Arqueo registrado. Diferencia: '+money(result.count.differenceCents)+'.');await reload();
    }catch(e){ctx.notice('No se registró: '+e.message,true);}
   },{signal:ctx.signal});
   closeBtn.addEventListener('click',async()=>{
    if(!confirm('¿Cerrar la caja con el conteo indicado? La diferencia queda registrada.'))return;
    try{
     const result=await ctx.write(path+'/'+open.id+'/close','POST',{countedCents:pesosToCents(cField.input.value),notes:''});
     ctx.notice('Caja cerrada. Diferencia: '+money(result.cashbox.differenceCents)+'.');await reload();
    }catch(e){ctx.notice('No se cerró: '+e.message,true);}
   },{signal:ctx.signal});
   list.append(panel);
   if(open.movements?.length){
    for(const m of open.movements){
     const card=container('record'),info=container('stack');
     info.append(line((m.direction==='in'?'+ ':'− ')+money(m.amountCents)+' · '+(m.kind||'Movimiento')+' · '+fmtDate(m.createdAt.slice(0,10)),'help'));
     if(m.notes)info.append(line(m.notes,'help'));
     card.append(info);list.append(card);
    }
   }
  }
  if(!boxes.length){list.append(emptyState('','Sin cajas. Abre la primera con monto inicial y responsable.',()=>{}));return;}
  for(const b of boxes.filter(x=>x.status==='closed')){
   const card=container('record'),info=container('stack');
   const title=document.createElement('strong');title.textContent='Caja · '+b.responsible+(b.shift?' · '+b.shift:'');info.append(title);
   info.append(line('Cerrada · Apertura '+money(b.openingCents)+' · Contado '+money(b.countedCents)+' · Diferencia '+money(b.differenceCents),'help'));
   card.append(info);list.append(card);
  }
 }
 ctx.search.addEventListener('input',draw,{signal:ctx.signal});
 form.addEventListener('submit',async event=>{
  event.preventDefault();save.disabled=true;
  try{
   await ctx.write(path,'POST',{openingCents:pesosToCents(fields.opening.input.value),
    responsible:fields.responsible.input.value.trim(),shift:fields.shift.input.value.trim(),notes:''});
   ctx.notice('Caja abierta.');form.reset();await reload();
  }catch(e){ctx.notice('No se abrió: '+e.message,true);}
  finally{save.disabled=false;}
 },{signal:ctx.signal});
 await reload();
}

export async function renderReceivables(ctx){
 const path=baseFor(ctx,'receivables'),host=document.getElementById('record-list');
 const stats=container('cards'),editor=container('card-soft'),list=container('stack');
 const form=document.createElement('form');form.className='stack';
 const quoteField=field('receivable-quote','Cotización aceptada','select',[]);
 const dueField=field('receivable-due','Vencimiento','date');
 const grid=container('field-grid');grid.append(quoteField.holder,dueField.holder);
 form.append(grid);
 const save=button('Abrir cuenta por cobrar','btn btn-primary');save.type='submit';
 form.append(container('toolbar')).lastChild.append(save);
 editor.append(line('Cuentas por cobrar ligadas a cotización','group-label'),form,
  line('El saldo es el total de la cotización aceptada menos los cobros registrados. Los abonos descuentan del saldo.','help'));
 host.replaceChildren(stats);if(canWrite(ctx))host.append(editor);host.append(list);
 let receivables=[],available=[],aging=null;
 async function reload(){
  const data=await ctx.api(path);if(ctx.signal.aborted)return;
  receivables=data.receivables||[];available=data.availableQuotes||[];aging=data.aging||null;
  quoteField.input.replaceChildren();
  for(const q of available)quoteField.input.add(new Option(q.title+' · '+q.clientName+' · '+mxn(q.totalCents),q.id));
  draw();
 }
 function draw(){
  if(ctx.signal.aborted)return;
  statRow(stats,[['Saldo por cobrar',money(aging?.totalCents||0)],['Vencido',money(aging?.overdueCents||0)],['Cuentas abiertas',receivables.filter(r=>r.balanceCents>0).length],['Cotizaciones por abrir',available.length]]);
  list.replaceChildren();
  const q=ctx.search.value.trim().toLowerCase();
  const visible=receivables.filter(r=>(r.clientName+' '+(r.quoteTitle||'')).toLowerCase().includes(q));
  document.getElementById('record-count').textContent=visible.length+' cuentas por cobrar';
  if(!visible.length){list.append(emptyState(q,'Sin cuentas por cobrar. Abre una desde una cotización aceptada.',()=>{ctx.search.value='';draw();}));return;}
  const bucketLabels={corriente:'Corriente',vencido_30:'Vencido 1–30 días',vencido_60:'Vencido 31–60 días',vencido_90:'Vencido 61–90 días',vencido_mas_90:'Vencido más de 90 días'};
  for(const r of visible){
   const card=container('record'),info=container('stack');
   const title=document.createElement('strong');title.textContent=r.quoteTitle||r.clientName;info.append(title);
   info.append(line(r.clientName+' · Saldo '+money(r.balanceCents)+' de '+money(r.totalCents)+' · '+(bucketLabels[r.bucket]||r.bucket)+(r.dueOn?' · Vence '+fmtDate(r.dueOn):''),'help'));
   card.append(info);
   if(canWrite(ctx)&&r.balanceCents>0){
    const buttons=container('record-actions');
    const pay=button('Registrar abono','btn btn-primary');
    pay.addEventListener('click',async()=>{
     const amount=prompt('Abono MXN para "'+(r.quoteTitle||r.clientName)+'" (saldo '+money(r.balanceCents)+'):');
     if(amount===null)return;
     const reference=prompt('Referencia (opcional):')||'';
     try{
      await ctx.write(path+'/'+r.id+'/installments','POST',{amountCents:pesosToCents(amount),paidOn:today(),method:'transferencia',reference:reference.trim(),notes:''});
      ctx.notice('Abono registrado.');await reload();
     }catch(e){ctx.notice('No se registró: '+e.message,true);}
    },{signal:ctx.signal});
    buttons.append(pay);card.append(buttons);
   }
   list.append(card);
  }
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();save.disabled=true;
  try{
   await ctx.write(path,'POST',{quoteId:quoteField.input.value,dueOn:dueField.input.value||null,notes:''});
   ctx.notice('Cuenta por cobrar abierta.');form.reset();await reload();
  }catch(e){ctx.notice('No se abrió: '+e.message,true);}
  finally{save.disabled=false;}
 },{signal:ctx.signal});
 ctx.search.addEventListener('input',draw,{signal:ctx.signal});
 await reload();
}

export async function renderPayables(ctx){
 const path=baseFor(ctx,'payables'),host=document.getElementById('record-list');
 const stats=container('cards'),editor=container('card-soft'),list=container('stack');
 const form=document.createElement('form');form.className='stack';
 const fields={
  supplier:field('payable-supplier','Proveedor','select',[]),
  order:field('payable-order','Compra (opcional)','select',[]),
  description:field('payable-description','Concepto'),
  total:field('payable-total','Total MXN','number'),
  due:field('payable-due','Vencimiento','date'),
  notes:field('payable-notes','Notas','textarea')
 };
 fields.description.input.required=true;fields.total.input.min='0.01';fields.total.input.step='0.01';fields.total.input.required=true;
 const grid=container('field-grid');for(const entry of Object.values(fields))grid.append(entry.holder);
 form.append(grid);
 const save=button('Registrar cuenta por pagar','btn btn-primary');save.type='submit';
 form.append(container('toolbar')).lastChild.append(save);
 editor.append(line('Cuentas por pagar a proveedores','group-label'),form,
  line('Flujo: pendiente → aprobada → pagada. La aprobación registra quién y cuándo.','help'));
 host.replaceChildren(stats);if(canWrite(ctx))host.append(editor);host.append(list);
 let payables=[],suppliers=[],orders=[];
 async function reload(){
  const data=await ctx.api(path);if(ctx.signal.aborted)return;
  payables=data.payables||[];suppliers=data.suppliers||[];orders=data.purchaseOrders||[];
  fields.supplier.input.replaceChildren();
  for(const s of suppliers)fields.supplier.input.add(new Option(s.name,s.id));
  fields.order.input.replaceChildren();
  fields.order.input.add(new Option('Sin compra ligada',''));
  for(const o of orders)fields.order.input.add(new Option(o.supplierName+' · '+mxn(o.totalCents),o.id));
  draw();
 }
 function draw(){
  if(ctx.signal.aborted)return;
  statRow(stats,[['Por pagar',money(payables.filter(p=>p.status!=='paid'&&p.status!=='cancelled').reduce((s,p)=>s+p.balanceCents,0))],
   ['Pendientes',payables.filter(p=>p.status==='pending').length],['Vencidas',payables.filter(p=>p.overdue).length],['Pagadas',payables.filter(p=>p.status==='paid').length]]);
  list.replaceChildren();
  const q=ctx.search.value.trim().toLowerCase();
  const visible=payables.filter(p=>((p.supplierName||'')+' '+p.description).toLowerCase().includes(q));
  document.getElementById('record-count').textContent=visible.length+' cuentas por pagar';
  if(!visible.length){list.append(emptyState(q,'Sin cuentas por pagar. Registra la primera con proveedor y vencimiento.',()=>{ctx.search.value='';draw();}));return;}
  const labels={pending:'Pendiente',approved:'Aprobada',paid:'Pagada',cancelled:'Cancelada'};
  for(const p of visible){
   const card=container('record'),info=container('stack');
   const title=document.createElement('strong');title.textContent=p.description;info.append(title);
   info.append(line((p.supplierName||'Proveedor')+' · '+labels[p.status]+' · Saldo '+money(p.balanceCents)+' de '+money(p.totalCents)+' · Vence '+fmtDate(p.dueOn)+(p.overdue?' · VENCIDA':''),'help'));
   if(p.approvedBy)info.append(line('Aprobada: '+fmtDate(p.approvedAt?.slice(0,10)||''),'help'));
   card.append(info);
   if(canWrite(ctx)){
    const buttons=container('record-actions');
    if(p.status==='pending'){
     const approve=button('Aprobar','btn btn-primary');
     approve.addEventListener('click',async()=>{try{await ctx.write(path+'/'+p.id+'/approve','POST',{});ctx.notice('Cuenta aprobada.');await reload();}catch(e){ctx.notice(e.message,true);}},{signal:ctx.signal});
     buttons.append(approve);
    }
    if(['pending','approved'].includes(p.status)&&p.balanceCents>0){
     const pay=button('Registrar abono');
     pay.addEventListener('click',async()=>{
      const amount=prompt('Abono MXN para "'+p.description+'" (saldo '+money(p.balanceCents)+'):');
      if(amount===null)return;
      try{
       await ctx.write(path+'/'+p.id+'/installments','POST',{amountCents:pesosToCents(amount),paidOn:today(),method:'transferencia',reference:'',notes:''});
       ctx.notice('Abono registrado.');await reload();
      }catch(e){ctx.notice('No se registró: '+e.message,true);}
     },{signal:ctx.signal});
     buttons.append(pay);
    }
    if(p.status==='approved'&&p.balanceCents===0){
     const markPaid=button('Marcar pagada','btn btn-primary');
     markPaid.addEventListener('click',async()=>{try{await ctx.write(path+'/'+p.id+'/pay','POST',{});ctx.notice('Cuenta pagada.');await reload();}catch(e){ctx.notice(e.message,true);}},{signal:ctx.signal});
     buttons.append(markPaid);
    }
    if(['pending','approved'].includes(p.status)){
     const cancel=button('Cancelar','btn btn-danger');
     cancel.addEventListener('click',async()=>{if(!confirm('¿Cancelar esta cuenta por pagar?'))return;try{await ctx.write(path+'/'+p.id+'/cancel','POST',{});ctx.notice('Cuenta cancelada.');await reload();}catch(e){ctx.notice(e.message,true);}},{signal:ctx.signal});
     buttons.append(cancel);
    }
    card.append(buttons);
   }
   list.append(card);
  }
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();save.disabled=true;
  try{
   const body={supplierId:fields.supplier.input.value,purchaseOrderId:fields.order.input.value||null,
    description:fields.description.input.value.trim(),totalCents:pesosToCents(fields.total.input.value),
    dueOn:fields.due.input.value,notes:fields.notes.input.value.trim()};
   await ctx.write(path,'POST',body);
   ctx.notice('Cuenta por pagar registrada.');form.reset();await reload();
  }catch(e){ctx.notice('No se guardó: '+e.message,true);}
  finally{save.disabled=false;}
 },{signal:ctx.signal});
 ctx.search.addEventListener('input',draw,{signal:ctx.signal});
 await reload();
}

// Panel de presupuestos + reporte mensual para C007 (lo monta renderExpenses).
export async function renderExpenseBudgetsPanel(ctx,host){
 const budgetsPath=baseFor(ctx,'expenses')+'/budgets';
 const reportPath=baseFor(ctx,'expenses')+'/report';
 let month=thisMonth();
 const form=document.createElement('form');form.className='stack';
 const monthField=field('budget-month','Mes','month');
 monthField.input.value=month;
 const categoryField=field('budget-category','Categoría','select',[['insumos','Insumos'],['renta','Renta'],['servicios','Servicios'],['transporte','Transporte'],['marketing','Marketing'],['personal','Personal'],['impuestos','Impuestos'],['otros','Otros']]);
 const limitField=field('budget-limit','Límite MXN','number');
 limitField.input.min='0.01';limitField.input.step='0.01';limitField.input.required=true;
 const grid=container('field-grid');grid.append(monthField.holder,categoryField.holder,limitField.holder);
 form.append(grid);
 const save=button('Guardar presupuesto','btn btn-primary');save.type='submit';
 const download=button('Descargar reporte CSV del mes');
 form.append(container('toolbar')).lastChild.append(save,download);
 const listEl=container('stack');
 host.append(line('Presupuestos por categoría y mes','group-label'),form,listEl);
 async function reload(){
  const [budgets,report]=await Promise.all([
   ctx.api(budgetsPath+'?month='+month),
   ctx.api(reportPath+'?month='+month)
  ]);
  if(ctx.signal.aborted)return;
  listEl.replaceChildren();
  const over=report.overBudget||[];
  listEl.append(line('Total del mes: '+money(report.totalCents)+' en '+report.count+' gastos'+(over.length?' · Presupuesto superado en: '+over.join(', '):''),'help'));
  for(const row of report.byCategory||[]){
   const card=container('record'),info=container('stack');
   info.append(line(row.category+' · Gastado '+money(row.spentCents)+(row.limitCents!==null?' · Límite '+money(row.limitCents)+(row.over?' · SUPERADO':''):' · Sin presupuesto'),'help'));
   card.append(info);listEl.append(card);
  }
  for(const b of budgets.budgets||[]){
   const card=container('record'),info=container('stack');
   info.append(line('Presupuesto '+b.category+': '+money(b.limitCents)+' · Gastado '+money(b.spentCents)+(b.over?' · SUPERADO':''),'help'));
   card.append(info);listEl.append(card);
  }
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();save.disabled=true;
  try{
   await ctx.write(budgetsPath,'POST',{category:categoryField.input.value,month:monthField.input.value,limitCents:pesosToCents(limitField.input.value)});
   month=monthField.input.value;ctx.notice('Presupuesto guardado.');await reload();
  }catch(e){ctx.notice('No se guardó: '+e.message,true);}
  finally{save.disabled=false;}
 },{signal:ctx.signal});
 download.addEventListener('click',async()=>{
  try{
   const report=await ctx.api(reportPath+'?month='+month);
   saveBlob(report.csv,report.filename);
  }catch(e){ctx.notice('No se descargó: '+e.message,true);}
 },{signal:ctx.signal});
 monthField.input.addEventListener('change',()=>{month=monthField.input.value||thisMonth();void reload();},{signal:ctx.signal});
 await reload();
}
