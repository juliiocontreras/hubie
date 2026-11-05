import {field,line,date,button,container} from './app-workflows.js';
export async function renderStock(ctx){
 const host=document.getElementById('record-list');
 const path='/api/app/'+encodeURIComponent(ctx.config.tenant.slug)+'/workflows/inventory';
 const canWrite=ctx.config.tenant.role!=='viewer';
 const stats=container('cards'),editor=container('card-soft'),list=container('stack'),ledger=container('card-soft');
 const form=document.createElement('form');form.className='stack';
 const fields={
  sku:field('stock-sku','Código SKU'),
  title:field('stock-title','Nombre del producto'),
  location:field('stock-location','Ubicación / almacén'),
  lowStock:field('stock-low','Alerta de stock mínimo','number')
 };
 fields.sku.input.required=true;fields.title.input.required=true;fields.lowStock.input.min='0';fields.lowStock.input.step='1';fields.lowStock.input.value='0';
 const grid=container('field-grid');for(const {holder} of Object.values(fields))grid.append(holder);
 form.append(grid);
 const save=button('Agregar producto','btn btn-primary');save.type='submit';
 const cancel=button('Cancelar edición');cancel.hidden=true;
 const actions=container('toolbar');actions.append(save,cancel);form.append(actions);
 editor.append(line('Inventario · crear o editar ficha de artículo','group-label'),form,line('El stock inicial es cero; registra entradas y salidas para mantener el historial.','help'));
 host.replaceChildren(stats);if(canWrite)host.append(editor);host.append(list,ledger);
 let items=[],movements=[],editing=null;
 const reset=()=>{editing=null;form.reset();fields.sku.input.disabled=false;fields.lowStock.input.value='0';save.textContent='Agregar producto';cancel.hidden=true;};
 cancel.addEventListener('click',reset,{signal:ctx.signal});
 async function reload(){const data=await ctx.api(path);if(ctx.signal.aborted)return;items=data.items||[];movements=data.movements||[];draw();}
 function draw(){
  if(ctx.signal.aborted)return;
  stats.replaceChildren();list.replaceChildren();ledger.replaceChildren();
  const total=items.reduce((sum,i)=>sum+i.quantity,0);
  for(const [name,value] of [['Artículos',items.length],['Unidades totales',total],['Con stock bajo',items.filter(x=>x.isLow).length]]){
   const s=container('stat');s.append(line(name,'stat-label'),line(String(value),'stat-number'));stats.append(s);
  }
  const q=ctx.search.value.toLowerCase().trim();
  const filtered=items.filter(i=>(i.title+' '+i.sku+' '+i.location).toLowerCase().includes(q));
  document.getElementById('record-count').textContent=filtered.length+' productos';
  if(!filtered.length)list.append(line('No hay artículos en inventario. Agrega un producto para comenzar.','empty'));
  for(const item of filtered){
   const card=container('record'),info=container('stack'),title=document.createElement('strong');
   title.textContent=item.sku+' · '+item.title;info.append(title);
   info.append(line('Stock actual: '+item.quantity+' · Mínimo: '+item.lowStock+' · '+(item.location||'Sin ubicación'),'help'));
   if(item.isLow)info.append(line('⚠ Stock en nivel de alerta','message error'));
   card.append(info);
   if(canWrite){
    const controls=container('stack');
    const edit=button('Editar ficha');
    edit.onclick=()=>{
     editing=item.id;fields.sku.input.value=item.sku;fields.sku.input.disabled=true;
     fields.title.input.value=item.title;fields.location.input.value=item.location;fields.lowStock.input.value=String(item.lowStock);
     save.textContent='Guardar ficha';cancel.hidden=false;fields.title.input.focus();
    };
    controls.append(edit);
    const move=document.createElement('form');move.className='toolbar';
    const kind=document.createElement('select');kind.className='search';kind.style.maxWidth='120px';
    kind.add(new Option('Entrada','in'));kind.add(new Option('Salida','out'));
    const qty=document.createElement('input');qty.type='number';qty.className='search';qty.style.maxWidth='100px';qty.min='1';qty.step='1';qty.placeholder='Unidades';qty.required=true;
    const note=document.createElement('input');note.className='search';note.style.maxWidth='150px';note.placeholder='Motivo (opcional)';note.maxLength=400;
    const submit=button('Registrar','btn btn-primary');submit.type='submit';
    move.append(kind,qty,note,submit);
    move.addEventListener('submit',async e=>{
     e.preventDefault();submit.disabled=true;
     try{
      const amount=Number(qty.value);if(!Number.isSafeInteger(amount)||amount<=0)throw Error('Cantidad inválida.');
      const delta=kind.value==='in'?amount:-amount;
      await ctx.write(path+'/'+item.id+'/movements','POST',{delta,note:note.value.trim()});
      ctx.notice((delta>0?'Entrada':'Salida')+' registrada para '+item.sku+'.');await reload();
     }catch(e){ctx.notice(e.message==='Insufficient stock'?'No hay suficientes unidades para esta salida.':'No se registró: '+e.message,true);}
     finally{submit.disabled=false;}
    },{signal:ctx.signal});
    controls.append(move);card.append(controls);
   }
   list.append(card);
  }
  ledger.append(line('Últimos movimientos de inventario','group-label'));
  if(!movements.length){ledger.append(line('El kardex todavía no tiene movimientos.','help'));return;}
  for(const m of movements.slice(0,30)){
   const row=container('line');
   const item=items.find(x=>x.id===m.itemId);
   const delta=m.delta>0?'+'+m.delta:String(m.delta);
   row.append(line((item?.sku||'Artículo')+' · '+delta+' unidades','help'),line(date(m.createdAt)+' · '+(m.note||'Sin motivo'),'help'));
   ledger.append(row);
  }
 }
 form.addEventListener('submit',async e=>{
  e.preventDefault();save.disabled=true;
  try{
   const body={title:fields.title.input.value.trim(),location:fields.location.input.value.trim(),lowStock:Number(fields.lowStock.input.value)};
   if(!editing)body.sku=fields.sku.input.value.trim();
   await ctx.write(path+(editing?'/'+editing:''),editing?'PATCH':'POST',body);
   ctx.notice('Artículo guardado.');reset();await reload();
  }catch(e){ctx.notice('No se guardó: '+e.message,true);}
  finally{save.disabled=false;}
 },{signal:ctx.signal});
 ctx.search.addEventListener('input',draw,{signal:ctx.signal});
 document.getElementById('module-message').textContent='Existencias controladas mediante movimientos auditables por producto; no admite stock negativo.';
 try{await reload();}catch(e){ctx.notice('Error de inventario: '+e.message,true);}
}
