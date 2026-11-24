// T011 Lotes y caducidades. Trazabilidad por lote ligada al inventario (C005):
// lote, cantidad y caducidad, con estado calculado (caducado, próximo a
// caducar, vigente). Las alertas se listan aquí; la escritura en
// tenant_notifications está pendiente porque esa tabla la posee el frente
// search y aún no existe en esta copia.
import {field,line,button,container} from './app-workflows.js';
export async function renderLots(ctx){
 const base='/api/app/'+encodeURIComponent(ctx.config.tenant.slug)+'/workflows/lots';
 const canWrite=ctx.config.tenant.role!=='viewer';
 const host=document.getElementById('record-list'),stats=container('cards'),editor=container('card-soft'),list=container('stack');
 const form=document.createElement('form');form.className='stack';
 const fields={
  itemId:field('lot-item','Ítem de inventario','select',[['','Elige un ítem']]),
  lotCode:field('lot-code','Código de lote'),
  quantity:field('lot-qty','Cantidad','number'),
  expiresAt:field('lot-expires','Caducidad','date'),
  receivedOn:field('lot-received','Fecha de recepción','date')
 };
 const grid=container('field-grid');for(const entry of Object.values(fields))grid.append(entry.holder);
 form.append(grid);
 const save=button('Registrar lote','btn btn-primary');save.type='submit';
 form.append(save);
 editor.append(line('Lotes y caducidades','group-label'),form);
 const alertsNote=line('Alertas de caducidad: se listan los lotes caducados y próximos a caducar. La notificación automática en tenant_notifications está pendiente (tabla del frente search).','group-label');
 host.replaceChildren(stats);
 if(canWrite)host.append(editor);
 host.append(alertsNote,list);
 let data=null;
 async function reload(){
  data=await ctx.api(base);if(ctx.signal.aborted)return;
  const previous=fields.itemId.input.value;
  fields.itemId.input.replaceChildren(new Option('Elige un ítem',''));
  for(const i of data.items)fields.itemId.input.add(new Option(i.sku+' · '+i.title+' ('+i.quantity+')',i.id));
  fields.itemId.input.value=data.items.some(x=>x.id===previous)?previous:'';
  draw();
 }
 function draw(){
  stats.replaceChildren();list.replaceChildren();
  const expired=data.lots.filter(l=>l.status==='expired').length;
  const soon=data.lots.filter(l=>l.status==='expiring_soon').length;
  for(const [label,value] of [['Lotes',data.lots.length],['Caducados',expired],['Próximos a caducar ('+data.thresholdDays+' días)',soon]]){
   const card=container('stat');card.append(line(label,'stat-label'),line(String(value),'stat-number'));stats.append(card);
  }
  for(const lot of data.lots){
   const card=container('card-soft');
   const statusLabel=lot.status==='expired'?'Caducado':lot.status==='expiring_soon'?'Próximo a caducar ('+lot.daysLeft+' días)':lot.status==='no_expiry'?'Sin caducidad':'Vigente ('+lot.daysLeft+' días)';
   card.append(line(lot.lotCode+' · '+lot.itemTitle,'group-label'),line('Cantidad: '+lot.quantity+' · Caducidad: '+(lot.expiresAt||'sin fecha')+' · '+statusLabel,'stat-label'));
   list.append(card);
  }
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  await ctx.api(base,{method:'POST',body:JSON.stringify({itemId:fields.itemId.input.value,lotCode:fields.lotCode.input.value,quantity:Number(fields.quantity.input.value),expiresAt:fields.expiresAt.input.value||null,receivedOn:fields.receivedOn.input.value||null})});
  form.reset();await reload();
 },{signal:ctx.signal});
 await reload();
}
