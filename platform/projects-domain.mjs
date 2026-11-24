import {randomBytes} from 'node:crypto';
// T025 Proyectos: validación/normalización pura, sin acceso a BD.
// Estilo de training-domain.mjs: funciones puras que lanzan
// 'Invalid ...' con claves estrictas (sin campos extra).
//
// El avance es DERIVADO, nunca se guarda: projectProgress() combina
// % de hitos completados y % de tareas hechas (tenant_tasks con
// source_tool_id='T025'). Si solo hay de un tipo, ese manda; si no hay
// ni hitos ni tareas, el avance es 0.
export const PROJECT_STATUSES=new Set(['planificado','en curso','en pausa','completado','cancelado']);
export const MILESTONE_STATUSES=new Set(['pendiente','completado','cancelado']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const dateOnly=/^\d{4}-\d{2}-\d{2}$/;
function strictKeys(input,allowed,label){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!allowed.includes(k)))throw Error(label);
}
function str(v,max,def=''){
 if(v===undefined||v===null)return def;
 if(typeof v!=='string')throw Error('Invalid value');
 const t=v.trim();
 if(t.length>max)throw Error('Invalid value');
 return t;
}
function reqStr(v,min,max){
 const t=str(v,max);
 if(t.length<min)throw Error('Invalid value');
 return t;
}
function optId(v,label){
 if(v===undefined||v===null)return null;
 if(typeof v!=='string'||!uuid.test(v))throw Error(label);
 return v;
}
function validDate(v){
 if(v===undefined||v===null)return null;
 if(typeof v!=='string'||!dateOnly.test(v)||Number.isNaN(Date.parse(v+'T00:00:00Z')))throw Error('Invalid value');
 return v;
}
export function normalizeProject(input){
 strictKeys(input,['name','description','clientId','startsOn','endsOn','status','ownerUserId','kanbanBoardId'],'Invalid project');
 const startsOn=validDate(input.startsOn),endsOn=validDate(input.endsOn);
 if(startsOn&&endsOn&&endsOn<startsOn)throw Error('Invalid project');
 return {
  name:reqStr(input.name,3,160),
  description:str(input.description,4000),
  clientId:optId(input.clientId,'Invalid project'),
  startsOn,
  endsOn,
  status:input.status===undefined?'planificado':PROJECT_STATUSES.has(input.status)?input.status:(()=>{throw Error('Invalid project');})(),
  ownerUserId:optId(input.ownerUserId,'Invalid project'),
  kanbanBoardId:optId(input.kanbanBoardId,'Invalid project')
 };
}
export function normalizeMilestone(input){
 strictKeys(input,['projectId','title','dueOn','status'],'Invalid milestone');
 if(typeof input.projectId!=='string'||!uuid.test(input.projectId))throw Error('Invalid milestone');
 return {
  projectId:input.projectId,
  title:reqStr(input.title,2,160),
  dueOn:validDate(input.dueOn),
  status:input.status===undefined?'pendiente':MILESTONE_STATUSES.has(input.status)?input.status:(()=>{throw Error('Invalid milestone');})()
 };
}
export function progressPercent(completed,total){
 if(!total)return 0;
 return Math.max(0,Math.min(100,Math.round(100*completed/total)));
}
// Avance derivado del proyecto: combina hitos y tareas por conteo total
// (hechos / totales), no promediando los dos porcentajes, para que un
// proyecto con 1 hito y 20 tareas no pese el hito como la mitad.
export function projectProgress({milestonesDone=0,milestonesTotal=0,tasksDone=0,tasksTotal=0}={}){
 const done=milestonesDone+tasksDone,total=milestonesTotal+tasksTotal;
 return {
  milestones:{done:milestonesDone,total:milestonesTotal,percent:progressPercent(milestonesDone,milestonesTotal)},
  tasks:{done:tasksDone,total:tasksTotal,percent:progressPercent(tasksDone,tasksTotal)},
  percent:progressPercent(done,total)
 };
}
