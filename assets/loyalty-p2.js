// T002 Programa de lealtad. Configuración por tenant, saldos por cliente y
// libro de movimientos. Los puntos se ganan solo desde cobros confirmados
// (botón "Otorgar puntos" por cobro) y se canjean con las reglas del tenant.
import {field,line,money,button,container} from './app-workflows.js';
export async function renderLoyalty(ctx){
 const base='/api/app/'+encodeURIComponent(ctx.config.tenant.slug)+'/workflows/loyalty';
 const canWrite=ctx.config.tenant.role!=='viewer',isAdmin=['owner','admin'].includes(ctx.config.tenant.role);
 const host=document.getElementById('record-list'),stats=container('cards'),editor=container('card-soft'),list=container('stack');
 const form=document.createElement('form');form.className='stack';
 const fields={
  pointsPerPeso:field('loyalty-per-peso','Puntos por cada $1 MXN cobrado','number'),
  pointValueCents:field('loyalty-value','Valor de cada punto (centavos)','number'),
  minRedeemPoints:field('loyalty-min','Mínimo de puntos para canjear','number')
 };
 const grid=container('field-grid');for(const entry of Object.values(fields))grid.append(entry.holder);
 form.append(grid);
 const save=button('Guardar reglas de lealtad','btn btn-primary');save.type='submit';
 form.append(save);
 editor.append(line('Reglas del programa (por empresa)','group-label'),form);
 const redeemForm=document.createElement('form');redeemForm.className='stack';
 const redeemFields={clientId:field('loyalty-client','Cliente','select',[['','Elige un cliente']]),points:field('loyalty-points','Puntos a canjear','number'),note:field('loyalty-note','Motivo del canje')};
 const redeemGrid=container('field-grid');for(const entry of Object.values(redeemFields))redeemGrid.append(entry.holder);
 redeemForm.append(redeemGrid);
 const redeemSave=button('Canjear puntos','btn btn-primary');redeemSave.type='submit';
 redeemForm.append(redeemSave);
 const redeemCard=container('card-soft');redeemCard.append(line('Canjear puntos','group-label'),redeemForm);
 host.replaceChildren(stats);
 if(isAdmin)host.append(editor);
 if(canWrite)host.append(redeemCard);
 host.append(list);
 let data=null;
 async function reload(){
  data=await ctx.api(base);if(ctx.signal.aborted)return;
  fields.pointsPerPeso.input.value=String(data.config.pointsPerPeso);
  fields.pointValueCents.input.value=String(data.config.pointValueCents);
  fields.minRedeemPoints.input.value=String(data.config.minRedeemPoints);
  const previous=redeemFields.clientId.input.value;
  redeemFields.clientId.input.replaceChildren(new Option('Elige un cliente',''));
  for(const c of data.clients)redeemFields.clientId.input.add(new Option(c.name+' · '+c.points+' pts',c.id));
  redeemFields.clientId.input.value=data.clients.some(x=>x.id===previous)?previous:'';
  draw();
 }
 function draw(){
  stats.replaceChildren();list.replaceChildren();
  const total=data.clients.reduce((s,c)=>s+c.points,0);
  for(const [label,value] of [['Clientes con puntos',data.clients.filter(c=>c.points>0).length],['Puntos en circulación',total],['Movimientos',data.movements.length]]){
   const card=container('stat');card.append(line(label,'stat-label'),line(String(value),'stat-number'));stats.append(card);
  }
  for(const c of data.clients){
   const card=container('card-soft');
   card.append(line(c.name+(c.company?' · '+c.company:''),'group-label'),line(c.points+' puntos','stat-number'));
   if(canWrite){
    const earn=button('Otorgar puntos por cobro');earn.addEventListener('click',async()=>{const paymentId=prompt('ID del cobro confirmado (tenant_collections) para este cliente:');if(!paymentId)return;const result=await ctx.api(base+'/earn/'+encodeURIComponent(paymentId),{method:'POST',body:'{}'});alert(result.awarded+' puntos otorgados. Saldo: '+result.balance);await reload();},{signal:ctx.signal});
    card.append(earn);
   }
   list.append(card);
  }
  for(const m of data.movements){
   const card=container('card-soft');
   const client=data.clients.find(c=>c.id===m.clientId);
   card.append(line((client?.name||m.clientId)+' · '+(m.deltaPoints>0?'+':'')+m.deltaPoints+' pts · '+m.kind,'group-label'),line('Saldo tras el movimiento: '+m.balanceAfter+' · '+m.createdAt,'stat-label'));
   list.append(card);
  }
 }
 form.addEventListener('submit',async event=>{event.preventDefault();await ctx.api(base+'/config',{method:'PATCH',body:JSON.stringify({pointsPerPeso:Number(fields.pointsPerPeso.input.value),pointValueCents:Number(fields.pointValueCents.input.value),minRedeemPoints:Number(fields.minRedeemPoints.input.value),active:true})});await reload();},{signal:ctx.signal});
 redeemForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const result=await ctx.api(base+'/redeem',{method:'POST',body:JSON.stringify({clientId:redeemFields.clientId.input.value,points:Number(redeemFields.points.input.value),note:redeemFields.note.input.value})});
  alert('Canje aplicado: '+result.redeemed+' puntos = '+money(result.valueCents)+'. Saldo: '+result.balance);
  await reload();
 },{signal:ctx.signal});
 await reload();
}
