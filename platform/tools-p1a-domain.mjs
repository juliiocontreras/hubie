// Validación y cálculo puros del frente TOOLS P1-A (C004, C005, C008, T003, T004, T007).
// Sin acceso a base de datos: todo lo de aquí es testeable con node:test sin mocks.
// Moneda siempre en centavos enteros; fechas en ISO UTC (YYYY-MM-DD o ...T...Z).
import {buildCsv} from './commerce-domain.mjs';

export const appointmentStatuses=Object.freeze(['scheduled','confirmed','completed','cancelled']);
export const appointmentStatusLabels=Object.freeze({
 scheduled:'Programada',confirmed:'Confirmada',completed:'Completada',cancelled:'Cancelada'});
export const taskStatuses=Object.freeze(['pending','in_progress','done']);
export const taskStatusLabels=Object.freeze({pending:'Pendiente',in_progress:'En curso',done:'Hecha'});
export const taskPriorities=Object.freeze(['low','normal','high']);
export const formFieldTypes=Object.freeze(['text','number','date','select','checkbox']);
export const checklistStatuses=Object.freeze(['open','completed']);

const trimmed=(v,max=180)=>typeof v==='string'&&v.trim().length<=max?v.trim():null;
const positiveInt=(x,max=1_000_000_000)=>Number.isSafeInteger(x)&&x>=0&&x<=max;
const dateOnly=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&
 Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;
const dateTime=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(v)&&
 Number.isFinite(Date.parse(v))&&(new Date(v).toISOString()===v||new Date(v).toISOString().replace(/\.000Z$/,'Z')===v);
const entityId=value=>value===undefined||value===null||value===''?null:
 typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)?value:undefined;
const monthKey=v=>typeof v==='string'&&/^\d{4}-\d{2}$/.test(v)&&
 Number(v.slice(5,7))>=1&&Number(v.slice(5,7))<=12?v:null;

// --- C004 Agenda: cita con responsable real y recordatorio -----------------
// Extiende normalizeEvent (workflows.mjs): añade estado 'confirmed',
// assigneeUserId (miembro del equipo) y remindMinutesBefore (minutos antes
// de la cita; null = sin recordatorio). Los calendarios externos
// (Google/Outlook) quedan fuera de alcance: se etiquetan en la UI.
export function normalizeAppointment(input){
 const title=trimmed(input?.title);
 const customer=trimmed(input?.customer??'',160);
 const resource=trimmed(input?.resource??'general',80)?.toLowerCase();
 const notes=trimmed(input?.notes??'',1000);
 const {startsAt,endsAt}=input??{};
 const clientId=entityId(input?.clientId),dealId=entityId(input?.dealId);
 const assigneeUserId=entityId(input?.assigneeUserId);
 const status=input?.status??'scheduled';
 const remind=input?.remindMinutesBefore??null;
 if(!title||title.length<2||customer===null||!resource||notes===null||
  !dateTime(startsAt)||!dateTime(endsAt)||!appointmentStatuses.includes(status)||
  clientId===undefined||dealId===undefined||assigneeUserId===undefined||
  remind!==null&&(!Number.isSafeInteger(remind)||remind<0||remind>10080))throw Error('Invalid appointment');
 const start=Date.parse(startsAt),end=Date.parse(endsAt);
 if(end<=start||end-start>7*86400000)throw Error('Invalid appointment');
 return {title,customer,resource,notes,startsAt:new Date(start).toISOString(),
  endsAt:new Date(end).toISOString(),status,clientId,dealId,assigneeUserId,
  remindMinutesBefore:remind};
}
// Inicio/fin del día o de la semana (lunes-domingo) que contiene `date` (YYYY-MM-DD).
export function agendaRange(view,dateStr){
 const day=dateOnly(dateStr)?dateStr:new Date().toISOString().slice(0,10);
 if(view==='day')return {from:day,to:day};
 if(view==='week'){
  const d=new Date(day+'T00:00:00Z'),dow=(d.getUTCDay()+6)%7; // lunes = 0
  const from=new Date(d.getTime()-dow*86400000).toISOString().slice(0,10);
  const to=new Date(d.getTime()+(6-dow)*86400000).toISOString().slice(0,10);
  return {from,to};
 }
 return {from:null,to:null};
}
export function reminderNotifyAt(startsAt,remindMinutesBefore){
 if(remindMinutesBefore===null||remindMinutesBefore===undefined)return null;
 return new Date(Date.parse(startsAt)-remindMinutesBefore*60000).toISOString();
}

// --- C005 Inventario: variante con SKU propio, almacén, lote y proveedor --
// El multi-almacén con transferencias es T010 (frente p1b): aquí `warehouse`
// es un único campo de texto por variante y el almacén por defecto del artículo.
// La orden de compra real es T008 (frente p1b): aquí `supplier` es solo el
// proveedor registrado en la variante.
export function normalizeVariant(input){
 const label=trimmed(input?.label,120);
 const sku=input?.sku===undefined||input?.sku===null||input?.sku==='' ? null :
  trimmed(input.sku,48)?.toUpperCase();
 const warehouse=trimmed(input?.warehouse??'',120);
 const lot=trimmed(input?.lot??'',80);
 const supplier=trimmed(input?.supplier??'',160);
 const expiresOn=input?.expiresOn??null;
 const lowStock=input?.lowStock??0;
 if(!label||label.length<2||sku===undefined||warehouse===null||lot===null||supplier===null||
  expiresOn!==null&&!dateOnly(expiresOn)||!positiveInt(lowStock))throw Error('Invalid inventory variant');
 if(sku!==null&&!/^[A-Z0-9][A-Z0-9._-]{1,47}$/.test(sku))throw Error('Invalid inventory variant');
 return {label,sku,warehouse,lot,expiresOn,supplier,lowStock};
}
export function normalizeVariantUpdate(input){
 if(input===null||typeof input!=='object'||Array.isArray(input)||
  Object.keys(input).some(k=>!['label','warehouse','lot','expiresOn','supplier','lowStock'].includes(k)))
  throw Error('Invalid inventory variant');
 const data=normalizeVariant({...input,sku:undefined});
 return {label:data.label,warehouse:data.warehouse,lot:data.lot,expiresOn:data.expiresOn,
  supplier:data.supplier,lowStock:data.lowStock};
}
export const isVariantLow=v=>Number(v.quantity)<=Number(v.lowStock);
export const isVariantExpired=(v,now=new Date())=>Boolean(v.expiresOn)&&v.expiresOn<now.toISOString().slice(0,10);
export const isVariantExpiringSoon=(v,days=30,now=new Date())=>{
 if(!v.expiresOn)return false;
 const diff=(Date.parse(v.expiresOn+'T00:00:00Z')-Date.parse(now.toISOString().slice(0,10)+'T00:00:00Z'))/86400000;
 return diff>=0&&diff<=days;
};

// --- T003 Checklists: plantillas, ítems verificables, evidencia, progreso --
export function normalizeChecklistTemplate(input){
 const title=trimmed(input?.title);
 const description=trimmed(input?.description??'',1000);
 const items=input?.items;
 if(!title||title.length<2||description===null||!Array.isArray(items)||!items.length||items.length>100)
  throw Error('Invalid checklist template');
 const clean=items.map((raw,i)=>{
  const t=trimmed(raw?.title??raw,180);
  if(!t||t.length<2)throw Error('Invalid checklist template');
  return {title:t,position:i};
 });
 return {title,description,items:clean};
}
export function normalizeChecklist(input){
 const title=trimmed(input?.title);
 const templateId=entityId(input?.templateId);
 const sourceToolId=typeof input?.sourceToolId==='string'&&/^[A-Z][0-9]{3}$/.test(input.sourceToolId)?input.sourceToolId:null;
 const sourceRecordId=entityId(input?.sourceRecordId);
 const items=input?.items;
 if(!title||title.length<2||templateId===undefined||sourceRecordId===undefined||
  items!==undefined&&(!Array.isArray(items)||items.length>100))throw Error('Invalid checklist');
 const clean=Array.isArray(items)?items.map((raw,i)=>{
  const t=trimmed(raw?.title??raw,180);
  if(!t||t.length<2)throw Error('Invalid checklist');
  return {title:t,position:i,assigneeUserId:entityId(raw?.assigneeUserId)??null,
   dueOn:raw?.dueOn??null};
 }):[];
 for(const item of clean){
  if(item.assigneeUserId===undefined||item.dueOn!==null&&!dateOnly(item.dueOn))throw Error('Invalid checklist');
 }
 return {title,templateId,sourceToolId,sourceRecordId,items:clean};
}
export function normalizeChecklistItem(input){
 const title=trimmed(input?.title);
 const assigneeUserId=entityId(input?.assigneeUserId);
 const dueOn=input?.dueOn??null;
 const evidenceMediaId=entityId(input?.evidenceMediaId);
 if(!title||title.length<2||assigneeUserId===undefined||evidenceMediaId===undefined||
  dueOn!==null&&!dateOnly(dueOn))throw Error('Invalid checklist item');
 return {title,assigneeUserId,dueOn,evidenceMediaId};
}
export function checklistProgress(items){
 const total=Array.isArray(items)?items.length:0;
 const checked=Array.isArray(items)?items.filter(i=>i.checkedAt).length:0;
 return {total,checked,percent:total?Math.round(checked*100/total):0,
  done:total>0&&checked===total};
}

// --- T004 Tareas: responsable real, vencimiento, estados, aviso al vencer --
export function normalizeTask(input){
 const title=trimmed(input?.title);
 const notes=trimmed(input?.notes??'',2000);
 const assigneeUserId=entityId(input?.assigneeUserId);
 const dueOn=input?.dueOn??null;
 const status=input?.status??'pending';
 const priority=input?.priority??'normal';
 const sourceToolId=typeof input?.sourceToolId==='string'&&/^[A-Z][0-9]{3}$/.test(input.sourceToolId)?input.sourceToolId:null;
 const sourceRecordId=entityId(input?.sourceRecordId);
 if(!title||title.length<2||notes===null||assigneeUserId===undefined||
  dueOn!==null&&!dateOnly(dueOn)||!taskStatuses.includes(status)||
  !taskPriorities.includes(priority)||sourceRecordId===undefined)throw Error('Invalid task');
 return {title,notes,assigneeUserId,dueOn,status,priority,sourceToolId,sourceRecordId};
}
export const isTaskOverdue=(task,now=new Date())=>
 Boolean(task?.dueOn)&&task.status!=='done'&&task.dueOn<now.toISOString().slice(0,10);
export function taskDueBucket(task,now=new Date()){
 if(!task?.dueOn)return 'no-date';
 const today=now.toISOString().slice(0,10);
 if(task.dueOn<today)return 'overdue';
 if(task.dueOn===today)return 'today';
 const soon=new Date(Date.parse(today+'T00:00:00Z')+7*86400000).toISOString().slice(0,10);
 return task.dueOn<=soon?'week':'later';
}

// --- T007 Formularios personalizados: constructor, validación, respuestas --
export function normalizeCustomForm(input){
 const title=trimmed(input?.title);
 const description=trimmed(input?.description??'',1000);
 const fields=input?.fields;
 if(!title||title.length<2||description===null||!Array.isArray(fields)||!fields.length||fields.length>50)
  throw Error('Invalid form');
 const seen=new Set();
 const clean=fields.map((raw,i)=>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid form');
  const key=typeof raw.key==='string'?raw.key.trim().toLowerCase().replace(/[^a-z0-9_]/g,''):null;
  const label=trimmed(raw.label,120);
  const type=raw.type;
  const required=raw.required===true;
  const options=type==='select'?(Array.isArray(raw.options)?raw.options.map(o=>trimmed(o,80)).filter(Boolean):[]):[];
  if(!key||key.length<2||key.length>40||seen.has(key)||!label||label.length<2||
   !formFieldTypes.includes(type)||type==='select'&&options.length<2)throw Error('Invalid form');
  seen.add(key);
  return {key,label,type,required,options,position:i};
 });
 return {title,description,fields:clean};
}
// Valida respuestas contra la definición del formulario; devuelve las
// respuestas normalizadas (checkbox → booleano, number → número) o lanza.
export function validateFormSubmission(form,answers){
 const fields=Array.isArray(form?.fields)?form.fields:[];
 if(!answers||typeof answers!=='object'||Array.isArray(answers))throw Error('Invalid form submission');
 const allowed=new Set(fields.map(f=>f.key));
 if(Object.keys(answers).some(k=>!allowed.has(k)))throw Error('Invalid form submission');
 const clean={};
 for(const f of fields){
  const raw=answers[f.key];
  const empty=raw===undefined||raw===null||raw==='';
  if(empty){
   if(f.required)throw Error('Invalid form submission');
   clean[f.key]=null;continue;
  }
  if(f.type==='text'){
   const v=trimmed(raw,1000);if(v===null)throw Error('Invalid form submission');clean[f.key]=v;
  }else if(f.type==='number'){
   const n=typeof raw==='number'?raw:Number(raw);
   if(!Number.isFinite(n)||Math.abs(n)>1e12)throw Error('Invalid form submission');clean[f.key]=n;
  }else if(f.type==='date'){
   if(!dateOnly(raw))throw Error('Invalid form submission');clean[f.key]=raw;
  }else if(f.type==='select'){
   if(!f.options.includes(raw))throw Error('Invalid form submission');clean[f.key]=raw;
  }else if(f.type==='checkbox'){
   if(typeof raw!=='boolean')throw Error('Invalid form submission');clean[f.key]=raw;
  }
 }
 return clean;
}
export function formSubmissionsCsv(form,submissions){
 const columns=[{key:'submittedAt',label:'Fecha de respuesta'},{key:'submittedBy',label:'Respondido por'},
  ...form.fields.map(f=>({key:f.key,label:f.label}))];
 const rows=(submissions||[]).map(s=>({
  submittedAt:s.createdAt||'',submittedBy:s.submittedBy||'',
  ...Object.fromEntries(form.fields.map(f=>[f.key,
   s.answers?.[f.key]===true?'Sí':s.answers?.[f.key]===false?'No':s.answers?.[f.key]??''])),
 }));
 return buildCsv(columns,rows);
}

// --- C008 Dashboard: metas, filtros y series temporales --------------------
export function normalizeDashboardGoal(input){
 const month=monthKey(input?.month);
 const targetCents=input?.targetCents??0;
 if(!month||!positiveInt(targetCents,100_000_000_000))throw Error('Invalid dashboard goal');
 return {month,targetCents};
}
export function normalizeDashboardQuery(input){
 const from=input?.from??null,to=input?.to??null;
 const module=input?.module??null;
 const modules=['C001','C002','C004','C005','C007','T013','T014','T020',null];
 if(from!==null&&!dateOnly(from)||to!==null&&!dateOnly(to)||from&&to&&to<from||
  !modules.includes(module))throw Error('Invalid dashboard query');
 return {from,to,module};
}
// Últimas `weeks` semanas (lunes-domingo) hasta `now`: cada punto suma las
// cotizaciones creadas y los cobros (centavos) cuya fecha cae en la semana.
export function weeklySeries(quotes,payments,weeks=12,now=new Date()){
 const today=new Date(now.toISOString().slice(0,10)+'T00:00:00Z');
 const dow=(today.getUTCDay()+6)%7;
 const thisMonday=new Date(today.getTime()-dow*86400000);
 const out=[];
 for(let i=weeks-1;i>=0;i--){
  const start=new Date(thisMonday.getTime()-i*7*86400000);
  const end=new Date(start.getTime()+6*86400000);
  const s=start.toISOString().slice(0,10),e=end.toISOString().slice(0,10);
  out.push({weekStart:s,weekEnd:e,
   quotesCreated:(quotes||[]).filter(q=>(q.createdAt||'').slice(0,10)>=s&&(q.createdAt||'').slice(0,10)<=e).length,
   paymentsCents:(payments||[]).filter(p=>p.paidOn>=s&&p.paidOn<=e)
    .reduce((sum,p)=>sum+Number(p.amountCents||0),0)});
 }
 return out;
}
export function goalProgress(goalTargetCents,actualCents){
 const target=Number(goalTargetCents||0),actual=Number(actualCents||0);
 return {targetCents:target,actualCents:actual,
  percent:target>0?Math.round(Math.min(100,actual*100/target)):actual>0?100:0,
  remainingCents:Math.max(0,target-actual)};
}
// Gráfica SVG simple (barras = cotizaciones, línea = cobros), sin librerías.
// Colores de marca Hubie: tinta #16123a, morado #7c5cfc, rosa #ec4899.
export function dashboardSvg(series){
 const points=Array.isArray(series)&&series.length?series:[];
 const w=640,h=220,pad=28,innerW=w-pad*2,innerH=h-pad*2;
 const maxQ=Math.max(1,...points.map(p=>p.quotesCreated));
 const maxP=Math.max(1,...points.map(p=>p.paymentsCents));
 const barW=points.length?innerW/points.length*0.45:0;
 const step=points.length>1?innerW/(points.length-1):0;
 const bars=points.map((p,i)=>{
  const x=pad+i*(innerW/points.length)+(innerW/points.length-barW)/2;
  const bh=p.quotesCreated/maxQ*innerH*0.85;
  return `<rect x="${x.toFixed(1)}" y="${(pad+innerH-bh).toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="#7c5cfc"><title>${p.weekStart}: ${p.quotesCreated} cotizaciones</title></rect>`;
 }).join('');
 const linePts=points.map((p,i)=>{
  const x=pad+i*step,y=pad+innerH-(p.paymentsCents/maxP*innerH*0.85);
  return `${x.toFixed(1)},${y.toFixed(1)}`;
 }).join(' ');
 const dots=points.map((p,i)=>{
  const x=pad+i*step,y=pad+innerH-(p.paymentsCents/maxP*innerH*0.85);
  return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#ec4899"><title>${p.weekStart}: $${(p.paymentsCents/100).toFixed(2)} MXN cobrados</title></circle>`;
 }).join('');
 const labels=points.filter((_,i)=>i%2===0).map((p,i)=>{
  const x=pad+(i*2)*step;
  return `<text x="${x.toFixed(1)}" y="${h-6}" font-size="9" fill="#16123a" text-anchor="middle">${p.weekStart.slice(5)}</text>`;
 }).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" role="img" aria-label="Cotizaciones creadas y cobros de las últimas ${points.length} semanas" style="width:100%;height:auto;display:block"><rect x="0" y="0" width="${w}" height="${h}" fill="#ffffff"/><line x1="${pad}" y1="${pad+innerH}" x2="${w-pad}" y2="${pad+innerH}" stroke="#16123a" stroke-width="1"/>${bars}${linePts?`<polyline points="${linePts}" fill="none" stroke="#ec4899" stroke-width="2"/>`:''}${dots}${labels}<text x="${pad}" y="16" font-size="11" fill="#16123a">Cotizaciones (barras moradas) y cobros MXN (línea rosa)</text></svg>`;
}
