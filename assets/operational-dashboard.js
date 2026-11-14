// C008 Dashboard real (frente P1-A): filtros, métricas de operación, metas
// mensuales de cobros y serie de 12 semanas con gráfica SVG del servidor.
import {field,line,money,button,container} from './app-workflows.js';
export async function renderDashboard(ctx){
 const host=document.getElementById('record-list');
 const path='/api/app/'+encodeURIComponent(ctx.config.tenant.slug)+'/workflows/dashboard';
 const canWrite=ctx.config.tenant.role!=='viewer';
 const stats=container('cards'),filters=container('toolbar'),goalCard=container('card-soft'),
  chartCard=container('card-soft'),list=container('stack');
 const fromF=field('dash-from','Desde','date'),toF=field('dash-to','Hasta','date');
 const moduleF=field('dash-module','Módulo','select',[['','Todos los módulos'],
  ['C001','Clientes'],['T013','Cotizaciones'],['T014','Cobros'],['C007','Gastos'],
  ['C004','Agenda'],['C005','Inventario']]);
 const apply=button('Aplicar filtros','btn btn-primary');
 filters.append(fromF.holder,toF.holder,moduleF.holder,apply);
 const goalForm=document.createElement('form');goalForm.className='toolbar';
 const goalMonth=document.createElement('input');goalMonth.type='month';goalMonth.className='search';
 goalMonth.value=new Date().toISOString().slice(0,7);
 const goalTarget=document.createElement('input');goalTarget.type='number';goalTarget.className='search';
 goalTarget.min='0';goalTarget.step='1';goalTarget.placeholder='Objetivo de cobros (centavos)';
 goalTarget.title='Objetivo mensual de cobros en centavos';
 const goalSave=button('Guardar objetivo','btn btn-primary');goalSave.type='submit';
 goalForm.append(line('Objetivo mensual de cobros:','help'),goalMonth,goalTarget,goalSave);
 goalCard.append(line('Meta del mes','group-label'),goalForm,container('stack'));
 host.replaceChildren(stats,filters);if(canWrite)host.append(goalCard);host.append(chartCard,list);
 let data=null;
 async function reload(){
  const query=new URLSearchParams();
  if(fromF.input.value)query.set('from',fromF.input.value);
  if(toF.input.value)query.set('to',toF.input.value);
  if(moduleF.input.value)query.set('module',moduleF.input.value);
  data=await ctx.api(path+(query.toString()?'?'+query.toString():''));
  if(ctx.signal.aborted)return;
  draw();
 }
 function draw(){
  if(ctx.signal.aborted)return;
  stats.replaceChildren();chartCard.replaceChildren();list.replaceChildren();
  const m=data.metrics||{};
  const entries=[['Clientes activos',m.activeClients],['Cotizaciones abiertas',m.openQuotes],
   ['Monto abierto',m.openQuotesCents!==undefined?money(m.openQuotesCents):undefined],
   ['Cobros del periodo',m.paymentsCents!==undefined?money(m.paymentsCents):undefined],
   ['Gastos del periodo',m.expensesCents!==undefined?money(m.expensesCents):undefined],
   ['Citas de hoy',m.appointmentsToday],['Stock bajo',m.lowStockItems]]
   .filter(([,v])=>v!==undefined);
  for(const [name,value] of entries){
   const s=container('stat');s.append(line(name,'stat-label'),line(String(value),'stat-number'));stats.append(s);
  }
  document.getElementById('record-count').textContent='Periodo '+data.from+' → '+data.to;
  const goal=data.goal;
  const goalInfo=goalCard.querySelector('.stack');
  if(goalInfo){
   goalInfo.replaceChildren();
   if(goal){
    goalInfo.append(line('Meta '+goal.month+': '+money(goal.targetCents)+' · Cobrado: '+money(goal.actualCents)+
     ' · '+goal.percent+'% · Falta: '+money(goal.remainingCents),'help'));
    const bar=document.createElement('div');bar.className='progress';
    const fill=document.createElement('div');fill.className='progress-fill';fill.style.width=Math.min(100,goal.percent)+'%';
    bar.append(fill);goalInfo.append(bar);
   }else{
    goalInfo.append(line('Sin objetivo para '+data.month+'. Guárdalo arriba para ver el progreso.','help'));
   }
  }
  chartCard.append(line('Últimas 12 semanas: cotizaciones creadas y cobros','group-label'));
  const chart=document.createElement('div');
  chart.innerHTML=data.chartSvg||'';
  chartCard.append(chart);
  for(const point of data.series||[]){
   const row=container('line');
   row.append(line('Semana '+point.weekStart+' → '+point.weekEnd,'help'),
    line(point.quotesCreated+' cotizaciones · '+money(point.paymentsCents)+' cobrados','help'));
   list.append(row);
  }
 }
 apply.addEventListener('click',()=>void reload(),{signal:ctx.signal});
 goalForm.addEventListener('submit',async e=>{
  e.preventDefault();goalSave.disabled=true;
  try{
   await ctx.write(path+'/goals','POST',{month:goalMonth.value,targetCents:Number(goalTarget.value)});
   ctx.notice('Objetivo guardado.');await reload();
  }catch(ex){ctx.notice('No se guardó el objetivo: '+ex.message,true);}
  finally{goalSave.disabled=false;}
 },{signal:ctx.signal});
 ctx.search.addEventListener('input',draw,{signal:ctx.signal});
 document.getElementById('module-message').textContent='Métricas reales de operación con filtros por fecha y módulo.';
 try{await reload();}catch(e){ctx.notice('Error al consultar el dashboard: '+e.message,true);}
}
