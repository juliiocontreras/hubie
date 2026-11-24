// T019 Comisiones. Reglas por tenant (por miembro, por producto o general),
// cálculo por periodo desde cobros confirmados y reporte por miembro.
// Sin cobro confirmado no hay comisión. La regla por producto se aplica al
// registrar la comisión de un cobro concreto con su producto.
import {field,line,money,button,container} from './app-workflows.js';
export async function renderCommissions(ctx){
 const base='/api/app/'+encodeURIComponent(ctx.config.tenant.slug)+'/workflows/commissions';
 const canWrite=ctx.config.tenant.role!=='viewer',isAdmin=['owner','admin'].includes(ctx.config.tenant.role);
 const host=document.getElementById('record-list'),stats=container('cards'),rulesCard=container('card-soft'),calcCard=container('card-soft'),list=container('stack');
 const form=document.createElement('form');form.className='stack';
 const fields={
  scope:field('commission-scope','Regla para','select',[['default','Toda la empresa (general)'],['member','Un miembro'],['product','Un producto']]),
  memberUserId:field('commission-member','Miembro','select',[['','Elige un miembro']]),
  catalogItemId:field('commission-item','Producto','select',[['','Elige un producto']]),
  percentBp:field('commission-percent','Porcentaje (puntos base: 1000 = 10%)','number')
 };
 const grid=container('field-grid');for(const entry of Object.values(fields))grid.append(entry.holder);
 form.append(grid);
 const save=button('Crear regla','btn btn-primary');save.type='submit';
 form.append(save);
 rulesCard.append(line('Reglas de comisión (solo owner/admin)','group-label'),form);
 const calcForm=document.createElement('form');calcForm.className='stack';
 const calcFields={from:field('commission-from','Periodo desde (AAAA-MM)'),to:field('commission-to','Periodo hasta (AAAA-MM)')};
 const calcGrid=container('field-grid');for(const entry of Object.values(calcFields))calcGrid.append(entry.holder);
 calcForm.append(calcGrid);
 const calcBtn=button('Calcular comisiones del periodo','btn btn-primary');calcBtn.type='submit';
 calcForm.append(calcBtn);
 calcCard.append(line('Cálculo por periodo (desde cobros confirmados)','group-label'),line('Solo se generan comisiones para cobros confirmados sin comisión aún. Un cobro no genera dos comisiones.','stat-label'),calcForm);
 host.replaceChildren(stats);
 if(isAdmin)host.append(rulesCard);
 if(canWrite)host.append(calcCard);
 host.append(list);
 let data=null;
 async function reload(){
  data=await ctx.api(base);if(ctx.signal.aborted)return;
  const prevMember=fields.memberUserId.input.value,prevItem=fields.catalogItemId.input.value;
  fields.memberUserId.input.replaceChildren(new Option('Elige un miembro',''));
  for(const m of data.members)fields.memberUserId.input.add(new Option(m.email+' · '+m.role,m.id));
  fields.memberUserId.input.value=data.members.some(x=>x.id===prevMember)?prevMember:'';
  fields.catalogItemId.input.replaceChildren(new Option('Elige un producto',''));
  for(const i of data.items)fields.catalogItemId.input.add(new Option(i.sku+' · '+i.name,i.id));
  fields.catalogItemId.input.value=data.items.some(x=>x.id===prevItem)?prevItem:'';
  draw();
 }
 function draw(){
  stats.replaceChildren();list.replaceChildren();
  for(const [label,value] of [['Comisiones del periodo',money(data.summary.totalCents)],['Entradas',data.summary.count],['Reglas activas',data.rules.filter(r=>r.active).length]]){
   const card=container('stat');card.append(line(label,'stat-label'),line(String(value),'stat-number'));stats.append(card);
  }
  for(const r of data.rules){
   const card=container('card-soft');
   const who=r.scope==='member'?(data.members.find(m=>m.id===r.memberUserId)?.email||r.memberUserId):r.scope==='product'?(data.items.find(i=>i.id===r.catalogItemId)?.name||r.catalogItemId):'Toda la empresa';
   card.append(line('Regla '+r.scope+' · '+who,'group-label'),line((r.percentBp/100).toFixed(2)+'% · '+(r.active?'activa':'inactiva'),'stat-label'));
   list.append(card);
  }
  for(const e of data.entries){
   const card=container('card-soft');
   const member=data.members.find(m=>m.id===e.memberUserId);
   card.append(line((member?.email||'Sin miembro')+' · '+e.period,'group-label'),line('Base '+money(e.baseCents)+' · '+(e.percentBp/100).toFixed(2)+'% = '+money(e.amountCents),'stat-label'));
   list.append(card);
  }
 }
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  await ctx.api(base+'/rules',{method:'POST',body:JSON.stringify({scope:fields.scope.input.value,memberUserId:fields.memberUserId.input.value||undefined,catalogItemId:fields.catalogItemId.input.value||undefined,percentBp:Number(fields.percentBp.input.value),active:true})});
  await reload();
 },{signal:ctx.signal});
 calcForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const result=await ctx.api(base+'/calculate',{method:'POST',body:JSON.stringify({from:calcFields.from.input.value,to:calcFields.to.input.value})});
  alert(result.created+' comisiones generadas en el periodo.');
  await reload();
 },{signal:ctx.signal});
 await reload();
}
