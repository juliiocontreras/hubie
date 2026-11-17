import {randomBytes} from 'node:crypto';
// T022 Capacitaciones: validación/normalización pura, sin acceso a BD.
// Estilo de satisfaction-domain.mjs: funciones puras que lanzan
// 'Invalid ...' con claves estrictas (sin campos extra).
//
// PUNTOS AJUSTABLES (segunda pasada con las referencias de Julio):
// - COURSE_CATEGORIES no existe como enum cerrado: `category` es texto libre
//   (máx. 80) para que las categorías reales se definan sin migrar nada.
// - El folio de constancia es CAP-AAAA-XXXXXX (FOLIO_PREFIX + año + 6
//   caracteres sin 0/O/1/I para no confundirlos). Cambiar el formato es
//   tocar FOLIO_PREFIX/FOLIO_SUFFIX_LENGTH y certificateFolio().
export const COURSE_MODALITIES=new Set(['presencial','en línea','mixta']);
export const COURSE_STATUSES=new Set(['borrador','activo','archivado']);
export const MODULE_TYPES=new Set(['learning','certification']);
export const MODULE_STATUSES=new Set(['borrador','activo','archivado']);
export const ENROLLMENT_STATUSES=new Set(['inscrito','en curso','completado','cancelado']);
export const ATTENDANCE_STATUSES=new Set(['presente','ausente','justificado']);
export const DEFAULT_MIN_SCORE=70;
export const FOLIO_PREFIX='CAP';
const FOLIO_ALPHABET='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const FOLIO_SUFFIX_LENGTH=6;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const email=/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const dateOnly=/^\d{4}-\d{2}-\d{2}$/;
const questionId=/^[a-z][a-z0-9_]{1,24}$/;
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
function intScore(v,def){
 if(v===undefined||v===null)return def;
 if(!Number.isInteger(v)||v<0||v>100)throw Error('Invalid value');
 return v;
}
function validDate(v){
 if(v===undefined||v===null)return null;
 if(typeof v!=='string'||!dateOnly.test(v)||Number.isNaN(Date.parse(v+'T00:00:00Z')))throw Error('Invalid value');
 return v;
}
function validDatetime(v){
 if(typeof v!=='string'||Number.isNaN(Date.parse(v)))throw Error('Invalid value');
 return v;
}
export function normalizeCourse(input){
 strictKeys(input,['name','description','durationHours','modality','instructor','materials','validUntil','status','minScore','category'],'Invalid course');
 let durationHours=0;
 if(input.durationHours!==undefined&&input.durationHours!==null){
  if(typeof input.durationHours!=='number'||!Number.isFinite(input.durationHours)||input.durationHours<0||input.durationHours>10000)throw Error('Invalid course');
  durationHours=input.durationHours;
 }
 return {
  name:reqStr(input.name,4,140),
  description:str(input.description,2000),
  durationHours,
  modality:input.modality===undefined?'en línea':COURSE_MODALITIES.has(input.modality)?input.modality:(()=>{throw Error('Invalid course');})(),
  instructor:str(input.instructor,160),
  materials:str(input.materials,4000),
  validUntil:validDate(input.validUntil),
  status:input.status===undefined?'borrador':COURSE_STATUSES.has(input.status)?input.status:(()=>{throw Error('Invalid course');})(),
  minScore:intScore(input.minScore,DEFAULT_MIN_SCORE),
  category:str(input.category,80)
 };
}
export function normalizeSession(input){
 strictKeys(input,['courseId','startsAt','endsAt','placeOrLink','capacity','instructor'],'Invalid session');
 if(typeof input.courseId!=='string'||!uuid.test(input.courseId))throw Error('Invalid session');
 const startsAt=validDatetime(input.startsAt),endsAt=validDatetime(input.endsAt);
 if(Date.parse(endsAt)<=Date.parse(startsAt))throw Error('Invalid session');
 if(!Number.isInteger(input.capacity)||input.capacity<1||input.capacity>10000)throw Error('Invalid session');
 return {courseId:input.courseId,startsAt,endsAt,placeOrLink:str(input.placeOrLink,300),capacity:input.capacity,instructor:str(input.instructor,160)};
}
export function normalizeEmployee(input){
 strictKeys(input,['name','email','position','area'],'Invalid employee');
 const name=reqStr(input.name,2,160);
 const mail=typeof input.email==='string'?input.email.trim().toLowerCase():'';
 if(!email.test(mail)||mail.length>200)throw Error('Invalid employee');
 return {name,email:mail,position:str(input.position,120),area:str(input.area,120)};
}
export function normalizeEnrollment(input){
 strictKeys(input,['employeeId','courseId','sessionId'],'Invalid enrollment');
 if(typeof input.employeeId!=='string'||!uuid.test(input.employeeId)||
  typeof input.courseId!=='string'||!uuid.test(input.courseId)||
  input.sessionId!==undefined&&input.sessionId!==null&&(typeof input.sessionId!=='string'||!uuid.test(input.sessionId)))throw Error('Invalid enrollment');
 return {employeeId:input.employeeId,courseId:input.courseId,sessionId:input.sessionId??null};
}
export function normalizeAttendance(input){
 strictKeys(input,['sessionId','employeeId','status'],'Invalid attendance');
 if(typeof input.sessionId!=='string'||!uuid.test(input.sessionId)||
  typeof input.employeeId!=='string'||!uuid.test(input.employeeId)||
  !ATTENDANCE_STATUSES.has(input.status))throw Error('Invalid attendance');
 return {sessionId:input.sessionId,employeeId:input.employeeId,status:input.status};
}
export function progressPercent(completed,total){
 if(!total)return 0;
 return Math.max(0,Math.min(100,Math.round(100*completed/total)));
}
export function normalizeProgress(input){
 strictKeys(input,['enrollmentId','completedModules','totalModules'],'Invalid progress');
 if(typeof input.enrollmentId!=='string'||!uuid.test(input.enrollmentId)||
  !Number.isInteger(input.completedModules)||input.completedModules<0||
  !Number.isInteger(input.totalModules)||input.totalModules<0||
  input.completedModules>input.totalModules)throw Error('Invalid progress');
 return {enrollmentId:input.enrollmentId,completedModules:input.completedModules,totalModules:input.totalModules,percent:progressPercent(input.completedModules,input.totalModules)};
}
export function normalizeEvaluation(input){
 strictKeys(input,['enrollmentId','score'],'Invalid evaluation');
 if(typeof input.enrollmentId!=='string'||!uuid.test(input.enrollmentId))throw Error('Invalid evaluation');
 // score null = derivar de los quizzes de certificación del curso.
 if(input.score!==undefined&&input.score!==null&&(!Number.isInteger(input.score)||input.score<0||input.score>100))throw Error('Invalid evaluation');
 return {enrollmentId:input.enrollmentId,score:input.score??null};
}
export function isApproved(score,minScore){
 return Number.isInteger(score)&&score>=minScore;
}
export function normalizeModule(input){
 strictKeys(input,['type','title','description','content','position','status'],'Invalid module');
 if(input.position!==undefined&&(!Number.isInteger(input.position)||input.position<0||input.position>10000))throw Error('Invalid module');
 return {
  type:input.type===undefined?'learning':MODULE_TYPES.has(input.type)?input.type:(()=>{throw Error('Invalid module');})(),
  title:reqStr(input.title,2,160),
  description:str(input.description,2000),
  content:str(input.content,8000),
  position:input.position===undefined?0:input.position,
  status:input.status===undefined?'borrador':MODULE_STATUSES.has(input.status)?input.status:(()=>{throw Error('Invalid module');})()
 };
}
export function normalizeQuizConfig(input){
 strictKeys(input,['passingScore','maxAttempts','questions'],'Invalid quiz');
 if(input.passingScore!==undefined&&input.passingScore!==null&&(!Number.isInteger(input.passingScore)||input.passingScore<0||input.passingScore>100))throw Error('Invalid quiz');
 if(input.maxAttempts!==undefined&&input.maxAttempts!==null&&(!Number.isInteger(input.maxAttempts)||input.maxAttempts<1||input.maxAttempts>20))throw Error('Invalid quiz');
 if(!Array.isArray(input.questions)||input.questions.length<1||input.questions.length>50)throw Error('Invalid quiz');
 const used=new Set(),questions=[];
 input.questions.forEach((q,i)=>{
  if(!q||typeof q!=='object'||Array.isArray(q)||Object.keys(q).some(k=>!['id','text','options','correctIndex','points'].includes(k)))throw Error('Invalid quiz');
  const id=q.id===undefined||q.id===null?'q'+(i+1):q.id;
  if(typeof id!=='string'||!questionId.test(id)||used.has(id))throw Error('Invalid quiz');
  used.add(id);
  const text=reqStr(q.text,2,500);
  if(!Array.isArray(q.options)||q.options.length<2||q.options.length>6)throw Error('Invalid quiz');
  const options=q.options.map(o=>reqStr(o,1,300));
  if(!Number.isInteger(q.correctIndex)||q.correctIndex<0||q.correctIndex>=options.length)throw Error('Invalid quiz');
  const points=q.points===undefined||q.points===null?1:q.points;
  if(!Number.isInteger(points)||points<1||points>100)throw Error('Invalid quiz');
  questions.push({id,text,options,correctIndex:q.correctIndex,points});
 });
 return {passingScore:input.passingScore??null,maxAttempts:input.maxAttempts??null,questions};
}
// Respuestas: {questionId: índice elegido}. Sin responder vale como error.
export function normalizeQuizAnswers(quiz,input){
 if(!quiz||!Array.isArray(quiz.questions)||!input||typeof input!=='object'||Array.isArray(input))throw Error('Invalid attempt');
 const ids=new Set(quiz.questions.map(q=>q.id));
 if(Object.keys(input).some(k=>!ids.has(k)))throw Error('Invalid attempt');
 const answers={};
 for(const q of quiz.questions){
  const v=input[q.id];
  if(v===undefined||v===null)continue;
  if(!Number.isInteger(v)||v<0||v>=q.options.length)throw Error('Invalid attempt');
  answers[q.id]=v;
 }
 return answers;
}
// Puntaje SIEMPRE en servidor: nunca se confía en el score del cliente.
// passingScore del módulo; si es null, usa la nota mínima del curso.
export function scoreQuiz(quiz,answers,minScore=DEFAULT_MIN_SCORE){
 const totalPoints=quiz.questions.reduce((a,q)=>a+q.points,0);
 let earnedPoints=0,correctCount=0;
 for(const q of quiz.questions){
  if(answers[q.id]===q.correctIndex){earnedPoints+=q.points;correctCount++;}
 }
 const score=totalPoints?Math.round(100*earnedPoints/totalPoints):0;
 const passing=quiz.passingScore??minScore;
 return {score,passed:score>=passing,earnedPoints,totalPoints,correctCount,totalQuestions:quiz.questions.length,answeredCount:Object.keys(answers).length};
}
// Preguntas para presentar el quiz: sin índice correcto.
export function publicQuizQuestions(quiz){
 if(!quiz||!Array.isArray(quiz.questions))throw Error('Invalid quiz');
 return quiz.questions.map(q=>({id:q.id,text:q.text,options:q.options,points:q.points}));
}
export function certificateFolio(year,suffix){
 if(!Number.isInteger(year)||year<2000||year>2100||typeof suffix!=='string'||!new RegExp('^['+FOLIO_ALPHABET+']{'+FOLIO_SUFFIX_LENGTH+'}$').test(suffix))throw Error('Invalid certificate');
 return FOLIO_PREFIX+'-'+year+'-'+suffix;
}
export function generateCertificateFolio(now=new Date()){
 const bytes=randomBytes(FOLIO_SUFFIX_LENGTH);
 let suffix='';
 for(const b of bytes)suffix+=FOLIO_ALPHABET[b%FOLIO_ALPHABET.length];
 return certificateFolio(now.getFullYear(),suffix);
}
