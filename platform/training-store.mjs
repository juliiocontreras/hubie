import {randomUUID} from 'node:crypto';
import {executeSql as realExecuteSql,executeBatch as realExecuteBatch} from '../database.mjs';
import {authorizeTool as realAuthorize} from './records.mjs';
import {createNotification} from './notifications.mjs';
import {buildCsv} from './commerce-domain.mjs';
import {normalizeCourse,normalizeSession,normalizeEmployee,normalizeEnrollment,normalizeAttendance,normalizeProgress,normalizeEvaluation,normalizeModule,normalizeQuizConfig,normalizeQuizAnswers,scoreQuiz,publicQuizQuestions,progressPercent,isApproved,generateCertificateFolio} from './training-domain.mjs';
// Patrón de inyección de dependencias como billing-store y
// operations-checklists: `deps` permite probar el store con una base falsa
// sin tocar Turso; sin deps usa los clientes reales.
const depsOf=d=>({executeSql:d?.executeSql||realExecuteSql,executeBatch:d?.executeBatch||realExecuteBatch,authorize:d?.authorize||realAuthorize});
const rows=r=>r?.rows?.map(a=>a.map(c=>c?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function validId(id,label){if(typeof id!=='string'||!uuid.test(id))throw Error(label);}
const link=(slug,id)=>'/app/?tenant='+slug+'&tool=T022&record='+id;
const num=v=>Number(v||0);
function decodeQuiz(raw){
 if(raw===null||raw===undefined)return null;
 const q=JSON.parse(raw);
 if(!q||typeof q!=='object'||!Array.isArray(q.questions))throw Error('Invalid quiz');
 return q;
}
async function courseFor(db,org,id){
 validId(id,'Invalid course');
 const row=rows(await db.executeSql('SELECT id,name,description,duration_hours,modality,instructor,materials,valid_until,status,min_score,category,created_at,updated_at FROM tenant_training_courses WHERE organization_id=? AND id=?',[org,id]))[0];
 if(!row)throw Error('Not found');
 return {id:row[0],name:row[1],description:row[2],durationHours:num(row[3]),modality:row[4],instructor:row[5],materials:row[6],validUntil:row[7],status:row[8],minScore:num(row[9]),category:row[10],createdAt:row[11],updatedAt:row[12]};
}
async function sessionFor(db,org,id){
 validId(id,'Invalid session');
 const row=rows(await db.executeSql('SELECT id,course_id,starts_at,ends_at,place_or_link,capacity,instructor,created_at,updated_at FROM tenant_training_sessions WHERE organization_id=? AND id=?',[org,id]))[0];
 if(!row)throw Error('Not found');
 return {id:row[0],courseId:row[1],startsAt:row[2],endsAt:row[3],placeOrLink:row[4],capacity:num(row[5]),instructor:row[6],createdAt:row[7],updatedAt:row[8]};
}
async function employeeFor(db,org,id){
 validId(id,'Invalid employee');
 const row=rows(await db.executeSql('SELECT id,name,email,position,area,created_at,updated_at FROM tenant_training_employees WHERE organization_id=? AND id=?',[org,id]))[0];
 if(!row)throw Error('Not found');
 return {id:row[0],name:row[1],email:row[2],position:row[3],area:row[4],createdAt:row[5],updatedAt:row[6]};
}
async function enrollmentFor(db,org,id){
 validId(id,'Invalid enrollment');
 const row=rows(await db.executeSql('SELECT id,employee_id,course_id,session_id,status,created_at,updated_at FROM tenant_training_enrollments WHERE organization_id=? AND id=?',[org,id]))[0];
 if(!row)throw Error('Not found');
 return {id:row[0],employeeId:row[1],courseId:row[2],sessionId:row[3],status:row[4],createdAt:row[5],updatedAt:row[6]};
}
async function moduleFor(db,org,courseId,id){
 validId(id,'Invalid module');
 const row=rows(await db.executeSql('SELECT id,course_id,type,title,description,content,position,status,quiz_config_json,created_at,updated_at FROM tenant_training_modules WHERE organization_id=? AND course_id=? AND id=?',[org,courseId,id]))[0];
 if(!row)throw Error('Not found');
 return {id:row[0],courseId:row[1],type:row[2],title:row[3],description:row[4],content:row[5],position:num(row[6]),status:row[7],quizConfig:decodeQuiz(row[8]),createdAt:row[9],updatedAt:row[10]};
}
async function modulesOfCourse(db,org,courseId,{activeOnly=false}={}){
 const r=await db.executeSql('SELECT id,course_id,type,title,description,content,position,status,quiz_config_json,created_at,updated_at FROM tenant_training_modules WHERE organization_id=? AND course_id=?'+(activeOnly?" AND status!='archivado'":'')+' ORDER BY position ASC,created_at ASC',[org,courseId]);
 return rows(r).map(x=>({id:x[0],courseId:x[1],type:x[2],title:x[3],description:x[4],content:x[5],position:num(x[6]),status:x[7],quizConfig:decodeQuiz(x[8]),createdAt:x[9],updatedAt:x[10]}));
}
function moduleView(m){
 const q=m.quizConfig;
 return {...m,quizConfig:m.quizConfig,quiz:q?{hasQuiz:true,passingScore:q.passingScore,maxAttempts:q.maxAttempts,questionCount:q.questions.length}:{hasQuiz:false,passingScore:null,maxAttempts:null,questionCount:0}};
}
// Avance derivado de los módulos: completados = módulos con registro en
// tenant_training_module_completions (learning marcados + certification con
// quiz aprobado). Sin módulos, el agregado queda en 0/0 y setProgress manual
// es la vía.
async function recomputeProgress(db,org,enrollmentId){
 const enr=await enrollmentFor(db,org,enrollmentId);
 const [totalRow,doneRow]=await Promise.all([
  db.executeSql("SELECT COUNT(*) FROM tenant_training_modules WHERE organization_id=? AND course_id=? AND status!='archivado'",[org,enr.courseId]),
  db.executeSql(`SELECT COUNT(*) FROM tenant_training_module_completions c
   JOIN tenant_training_modules m ON m.organization_id=c.organization_id AND m.id=c.module_id
   WHERE c.organization_id=? AND c.enrollment_id=? AND m.status!='archivado'`,[org,enrollmentId])
 ]);
 const total=num(rows(totalRow)[0]?.[0]),completed=num(rows(doneRow)[0]?.[0]);
 const percent=progressPercent(completed,total);
 const id=randomUUID();
 await db.executeBatch([
  {sql:'UPDATE tenant_training_progress SET completed_modules=?,total_modules=?,percent=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND enrollment_id=?',args:[completed,total,percent,org,enrollmentId]},
  {sql:`INSERT INTO tenant_training_progress(organization_id,id,enrollment_id,completed_modules,total_modules,percent)
   SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM tenant_training_progress WHERE organization_id=? AND enrollment_id=?)`,
   args:[org,id,enrollmentId,completed,total,percent,org,enrollmentId]}
 ]);
 return {enrollmentId,completedModules:completed,totalModules:total,percent};
}
async function progressFor(db,org,enrollmentId){
 const row=rows(await db.executeSql('SELECT completed_modules,total_modules,percent,updated_at FROM tenant_training_progress WHERE organization_id=? AND enrollment_id=?',[org,enrollmentId]))[0];
 if(!row)return {enrollmentId,completedModules:0,totalModules:0,percent:0,updatedAt:null};
 return {enrollmentId,completedModules:num(row[0]),totalModules:num(row[1]),percent:num(row[2]),updatedAt:row[3]};
}
async function evaluationFor(db,org,enrollmentId){
 const row=rows(await db.executeSql('SELECT id,score,passed,evaluated_at FROM tenant_training_evaluations WHERE organization_id=? AND enrollment_id=?',[org,enrollmentId]))[0];
 return row?{id:row[0],enrollmentId,score:num(row[1]),passed:row[2]===1,evaluatedAt:row[3]}:null;
}
async function bestAttemptScore(db,org,enrollmentId,moduleId){
 const row=rows(await db.executeSql('SELECT MAX(score) FROM tenant_training_quiz_attempts WHERE organization_id=? AND enrollment_id=? AND module_id=?',[org,enrollmentId,moduleId]))[0];
 return row?.[0]===null||row?.[0]===undefined?null:num(row[0]);
}
async function hasPassedAttempt(db,org,enrollmentId,moduleId){
 const row=rows(await db.executeSql('SELECT 1 FROM tenant_training_quiz_attempts WHERE organization_id=? AND enrollment_id=? AND module_id=? AND passed=1 LIMIT 1',[org,enrollmentId,moduleId]))[0];
 return Boolean(row);
}
// Recordatorios en app (tenant_notifications, tipo 'info'): idempotentes por
// el dedupe de createNotification (misma type+link sin leer no se duplica).
// Sin correo: el envío por Resend no existe aquí; solo aviso en la app.
async function notifyCourseExpiry(db,org,slug,course,now=new Date()){
 if(course.status!=='activo'||!course.validUntil)return {created:false};
 const in30=new Date(now.getTime()+30*86400000).toISOString().slice(0,10);
 if(course.validUntil>in30)return {created:false};
 try{
  return await createNotification(org,{type:'info',title:'Curso por vencer: '+course.name,
   body:'Vigencia: '+course.validUntil+'. Revisa si se renueva o se archiva.',link:link(slug,course.id)},{executeSql:db.executeSql});
 }catch{return {created:false};}
}
async function notifySessionSoon(db,org,slug,session,courseName,now=new Date()){
 const starts=Date.parse(session.startsAt);
 if(Number.isNaN(starts)||starts<now.getTime()||starts>now.getTime()+3*86400000)return {created:false};
 try{
  return await createNotification(org,{type:'info',title:'Sesión próxima: '+courseName,
   body:'Inicia: '+new Date(session.startsAt).toLocaleString('es-MX',{dateStyle:'medium',timeStyle:'short'})+(session.placeOrLink?'. Lugar o enlace: '+session.placeOrLink:'')+'.',link:link(slug,session.id)},{executeSql:db.executeSql});
 }catch{return {created:false};}
}
export async function trainingReminders(token,slug,now=new Date(),deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T022');
 const org=tenant.id,in30=new Date(now.getTime()+30*86400000).toISOString().slice(0,10);
 const in3d=new Date(now.getTime()+3*86400000).toISOString();
 const [courses,sessions]=await Promise.all([
  db.executeSql("SELECT id,name,valid_until,status FROM tenant_training_courses WHERE organization_id=? AND status='activo' AND valid_until IS NOT NULL AND valid_until<=?",[org,in30]),
  db.executeSql('SELECT s.id,s.starts_at,s.place_or_link,c.name FROM tenant_training_sessions s JOIN tenant_training_courses c ON c.organization_id=s.organization_id AND c.id=s.course_id WHERE s.organization_id=? AND s.starts_at>=? AND s.starts_at<=?',[org,now.toISOString(),in3d])
 ]);
 let created=0;
 for(const c of rows(courses)){
  const r=await notifyCourseExpiry(db,org,slug,{id:c[0],name:c[1],validUntil:c[2],status:c[3]},now);
  if(r.created)created++;
 }
 for(const s of rows(sessions)){
  const r=await notifySessionSoon(db,org,slug,{id:s[0],startsAt:s[1],placeOrLink:s[2]},s[3],now);
  if(r.created)created++;
 }
 return {created,courses:rows(courses).length,sessions:rows(sessions).length};
}
// ---- Cursos ----
export async function listCourses(token,slug,{status=null}={},deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T022');
 const r=await db.executeSql(`SELECT c.id,c.name,c.description,c.duration_hours,c.modality,c.instructor,c.materials,c.valid_until,c.status,c.min_score,c.category,c.created_at,c.updated_at,
  (SELECT COUNT(*) FROM tenant_training_sessions s WHERE s.organization_id=c.organization_id AND s.course_id=c.id),
  (SELECT COUNT(*) FROM tenant_training_enrollments e WHERE e.organization_id=c.organization_id AND e.course_id=c.id AND e.status!='cancelado'),
  (SELECT COUNT(*) FROM tenant_training_modules m WHERE m.organization_id=c.organization_id AND m.course_id=c.id AND m.status!='archivado')
  FROM tenant_training_courses c WHERE c.organization_id=?`+(status?` AND c.status=?`:'')+` ORDER BY c.created_at DESC LIMIT 100`,
  status?[tenant.id,status]:[tenant.id]);
 return {courses:rows(r).map(x=>({id:x[0],name:x[1],description:x[2],durationHours:num(x[3]),modality:x[4],instructor:x[5],materials:x[6],validUntil:x[7],status:x[8],minScore:num(x[9]),category:x[10],createdAt:x[11],updatedAt:x[12],sessions:num(x[13]),enrollments:num(x[14]),modules:num(x[15])}))};
}
export async function createCourse(token,slug,input,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T022',true);
 const course=normalizeCourse(input);
 const id=randomUUID();
 await db.executeSql('INSERT INTO tenant_training_courses(organization_id,id,name,description,duration_hours,modality,instructor,materials,valid_until,status,min_score,category,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',
  [tenant.id,id,course.name,course.description,course.durationHours,course.modality,course.instructor,course.materials,course.validUntil,course.status,course.minScore,course.category,session.userId]);
 await notifyCourseExpiry(db,tenant.id,slug,{id,...course});
 return {course:{id,...course}};
}
export async function updateCourse(token,slug,id,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T022',true);
 const current=await courseFor(db,tenant.id,id);
 const base={name:current.name,description:current.description,durationHours:current.durationHours,modality:current.modality,instructor:current.instructor,materials:current.materials,validUntil:current.validUntil,status:current.status,minScore:current.minScore,category:current.category};
 const next=normalizeCourse({...base,...input});
 const r=await db.executeSql('UPDATE tenant_training_courses SET name=?,description=?,duration_hours=?,modality=?,instructor=?,materials=?,valid_until=?,status=?,min_score=?,category=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',
  [next.name,next.description,next.durationHours,next.modality,next.instructor,next.materials,next.validUntil,next.status,next.minScore,next.category,tenant.id,id]);
 if(!changed(r))throw Error('Not found');
 await notifyCourseExpiry(db,tenant.id,slug,{id,...next});
 return {course:{id,...next}};
}
export async function setCourseStatus(token,slug,id,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T022',true);
 if(!input||Object.keys(input).length!==1||!['borrador','activo','archivado'].includes(input.status))throw Error('Invalid course');
 validId(id,'Invalid course');
 const r=await db.executeSql("UPDATE tenant_training_courses SET status=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?",[input.status,tenant.id,id]);
 if(!changed(r))throw Error('Not found');
 const course=await courseFor(db,tenant.id,id);
 await notifyCourseExpiry(db,tenant.id,slug,course);
 return {ok:true,status:input.status};
}
// ---- Sesiones ----
export async function listSessions(token,slug,{courseId=null}={},deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T022');
 if(courseId)await courseFor(db,tenant.id,courseId);
 const r=await db.executeSql(`SELECT s.id,s.course_id,s.starts_at,s.ends_at,s.place_or_link,s.capacity,s.instructor,s.created_at,c.name,
  (SELECT COUNT(*) FROM tenant_training_attendance a WHERE a.organization_id=s.organization_id AND a.session_id=s.id)
  FROM tenant_training_sessions s JOIN tenant_training_courses c ON c.organization_id=s.organization_id AND c.id=s.course_id
  WHERE s.organization_id=?`+(courseId?' AND s.course_id=?':'')+` ORDER BY s.starts_at DESC LIMIT 200`,courseId?[tenant.id,courseId]:[tenant.id]);
 return {sessions:rows(r).map(x=>({id:x[0],courseId:x[1],startsAt:x[2],endsAt:x[3],placeOrLink:x[4],capacity:num(x[5]),instructor:x[6],createdAt:x[7],courseName:x[8],attendance:num(x[9])}))};
}
export async function createSession(token,slug,input,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T022',true);
 const data=normalizeSession(input);
 const course=await courseFor(db,tenant.id,data.courseId);
 const id=randomUUID();
 await db.executeSql('INSERT INTO tenant_training_sessions(organization_id,id,course_id,starts_at,ends_at,place_or_link,capacity,instructor,created_by) VALUES(?,?,?,?,?,?,?,?,?)',
  [tenant.id,id,data.courseId,data.startsAt,data.endsAt,data.placeOrLink,data.capacity,data.instructor,session.userId]);
 await notifySessionSoon(db,tenant.id,slug,{id,...data},course.name);
 return {session:{id,...data}};
}
export async function updateSession(token,slug,id,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T022',true);
 const current=await sessionFor(db,tenant.id,id);
 const base={courseId:current.courseId,startsAt:current.startsAt,endsAt:current.endsAt,placeOrLink:current.placeOrLink,capacity:current.capacity,instructor:current.instructor};
 const next=normalizeSession({...base,...input});
 const r=await db.executeSql('UPDATE tenant_training_sessions SET starts_at=?,ends_at=?,place_or_link=?,capacity=?,instructor=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',
  [next.startsAt,next.endsAt,next.placeOrLink,next.capacity,next.instructor,tenant.id,id]);
 if(!changed(r))throw Error('Not found');
 const course=await courseFor(db,tenant.id,next.courseId);
 await notifySessionSoon(db,tenant.id,slug,{id,...next},course.name);
 return {session:{id,...next}};
}
// ---- Empleados ----
export async function listEmployees(token,slug,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T022');
 const r=await db.executeSql(`SELECT e.id,e.name,e.email,e.position,e.area,e.created_at,
  (SELECT COUNT(*) FROM tenant_training_enrollments n WHERE n.organization_id=e.organization_id AND n.employee_id=e.id AND n.status!='cancelado')
  FROM tenant_training_employees e WHERE e.organization_id=? ORDER BY e.name LIMIT 200`,[tenant.id]);
 return {employees:rows(r).map(x=>({id:x[0],name:x[1],email:x[2],position:x[3],area:x[4],createdAt:x[5],enrollments:num(x[6])}))};
}
export async function createEmployee(token,slug,input,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T022',true);
 const emp=normalizeEmployee(input);
 const id=randomUUID();
 try{
  await db.executeSql('INSERT INTO tenant_training_employees(organization_id,id,name,email,position,area,created_by) VALUES(?,?,?,?,?,?,?)',
   [tenant.id,id,emp.name,emp.email,emp.position,emp.area,session.userId]);
 }catch(e){
  if(/UNIQUE constraint failed/i.test(e?.message||''))throw Error('Duplicate employee email');
  throw e;
 }
 return {employee:{id,...emp}};
}
export async function updateEmployee(token,slug,id,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T022',true);
 const current=await employeeFor(db,tenant.id,id);
 const base={name:current.name,email:current.email,position:current.position,area:current.area};
 const next=normalizeEmployee({...base,...input});
 try{
  const r=await db.executeSql('UPDATE tenant_training_employees SET name=?,email=?,position=?,area=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',
   [next.name,next.email,next.position,next.area,tenant.id,id]);
  if(!changed(r))throw Error('Not found');
 }catch(e){
  if(e?.message==='Not found')throw e;
  if(/UNIQUE constraint failed/i.test(e?.message||''))throw Error('Duplicate employee email');
  throw e;
 }
 return {employee:{id,...next}};
}
// ---- Inscripciones ----
export async function listEnrollments(token,slug,{courseId=null,employeeId=null,status=null}={},deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T022');
 const conds=['n.organization_id=?'],args=[tenant.id];
 if(courseId){await courseFor(db,tenant.id,courseId);conds.push('n.course_id=?');args.push(courseId);}
 if(employeeId){await employeeFor(db,tenant.id,employeeId);conds.push('n.employee_id=?');args.push(employeeId);}
 if(status){if(!['inscrito','en curso','completado','cancelado'].includes(status))throw Error('Invalid enrollment');conds.push('n.status=?');args.push(status);}
 const r=await db.executeSql(`SELECT n.id,n.employee_id,n.course_id,n.session_id,n.status,n.created_at,e.name,c.name,p.percent
  FROM tenant_training_enrollments n
  JOIN tenant_training_employees e ON e.organization_id=n.organization_id AND e.id=n.employee_id
  JOIN tenant_training_courses c ON c.organization_id=n.organization_id AND c.id=n.course_id
  LEFT JOIN tenant_training_progress p ON p.organization_id=n.organization_id AND p.enrollment_id=n.id
  WHERE ${conds.join(' AND ')} ORDER BY n.created_at DESC LIMIT 200`,args);
 return {enrollments:rows(r).map(x=>({id:x[0],employeeId:x[1],courseId:x[2],sessionId:x[3],status:x[4],createdAt:x[5],employeeName:x[6],courseName:x[7],progressPercent:x[8]===null?0:num(x[8])}))};
}
export async function enroll(token,slug,input,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T022',true);
 const data=normalizeEnrollment(input);
 await employeeFor(db,tenant.id,data.employeeId);
 const course=await courseFor(db,tenant.id,data.courseId);
 if(data.sessionId){
  const s=await sessionFor(db,tenant.id,data.sessionId);
  if(s.courseId!==data.courseId)throw Error('Invalid enrollment');
 }
 const dup=rows(await db.executeSql("SELECT id FROM tenant_training_enrollments WHERE organization_id=? AND employee_id=? AND course_id=? AND status IN ('inscrito','en curso','completado') LIMIT 1",[tenant.id,data.employeeId,data.courseId]))[0];
 if(dup)throw Error('Duplicate enrollment');
 const id=randomUUID();
 await db.executeBatch([
  {sql:'INSERT INTO tenant_training_enrollments(organization_id,id,employee_id,course_id,session_id,created_by) VALUES(?,?,?,?,?,?)',
   args:[tenant.id,id,data.employeeId,data.courseId,data.sessionId,session.userId]},
  {sql:'INSERT INTO tenant_training_progress(organization_id,id,enrollment_id,completed_modules,total_modules,percent) VALUES(?,?,?,?,?,?)',
   args:[tenant.id,randomUUID(),id,0,0,0]}
 ]);
 // El avance es derivado: al inscribir, el total ya debe reflejar los
 // módulos activos del curso (si no, el inscrito ve 0/0 hasta el primer
 // módulo completado o quiz aprobado).
 await recomputeProgress(db,tenant.id,id);
 return {enrollment:{id,...data,status:'inscrito'}};
}
export async function unenroll(token,slug,id,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T022',true);
 validId(id,'Invalid enrollment');
 const r=await db.executeSql("UPDATE tenant_training_enrollments SET status='cancelado',updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND status!='cancelado'",[tenant.id,id]);
 if(!changed(r))throw Error('Not found');
 return {ok:true,status:'cancelado'};
}
export async function setEnrollmentStatus(token,slug,id,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T022',true);
 if(!input||Object.keys(input).length!==1||!['inscrito','en curso','completado','cancelado'].includes(input.status))throw Error('Invalid enrollment');
 validId(id,'Invalid enrollment');
 const r=await db.executeSql('UPDATE tenant_training_enrollments SET status=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',[input.status,tenant.id,id]);
 if(!changed(r))throw Error('Not found');
 return {ok:true,status:input.status};
}
// ---- Asistencia ----
export async function markAttendance(token,slug,input,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T022',true);
 const data=normalizeAttendance(input);
 const s=await sessionFor(db,tenant.id,data.sessionId);
 await employeeFor(db,tenant.id,data.employeeId);
 const enr=rows(await db.executeSql("SELECT id FROM tenant_training_enrollments WHERE organization_id=? AND employee_id=? AND course_id=? AND status!='cancelado' LIMIT 1",[tenant.id,data.employeeId,s.courseId]))[0];
 if(!enr)throw Error('Invalid attendance');
 const id=randomUUID();
 await db.executeBatch([
  {sql:'UPDATE tenant_training_attendance SET status=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND session_id=? AND employee_id=?',args:[data.status,tenant.id,data.sessionId,data.employeeId]},
  {sql:`INSERT INTO tenant_training_attendance(organization_id,id,session_id,employee_id,status,created_by)
   SELECT ?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM tenant_training_attendance WHERE organization_id=? AND session_id=? AND employee_id=?)`,
   args:[tenant.id,id,data.sessionId,data.employeeId,data.status,session.userId,tenant.id,data.sessionId,data.employeeId]}
 ]);
 const saved=rows(await db.executeSql("SELECT id FROM tenant_training_attendance WHERE organization_id=? AND session_id=? AND employee_id=?",[tenant.id,data.sessionId,data.employeeId]))[0];
 return {attendance:{id:saved?.id??id,...data}};
}
export async function listAttendance(token,slug,{sessionId=null,employeeId=null}={},deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T022');
 const conds=['a.organization_id=?'],args=[tenant.id];
 if(sessionId){await sessionFor(db,tenant.id,sessionId);conds.push('a.session_id=?');args.push(sessionId);}
 if(employeeId){await employeeFor(db,tenant.id,employeeId);conds.push('a.employee_id=?');args.push(employeeId);}
 const r=await db.executeSql(`SELECT a.id,a.session_id,a.employee_id,a.status,a.created_at,e.name,s.starts_at,c.name
  FROM tenant_training_attendance a
  JOIN tenant_training_employees e ON e.organization_id=a.organization_id AND e.id=a.employee_id
  JOIN tenant_training_sessions s ON s.organization_id=a.organization_id AND s.id=a.session_id
  JOIN tenant_training_courses c ON c.organization_id=s.organization_id AND c.id=s.course_id
  WHERE ${conds.join(' AND ')} ORDER BY a.created_at DESC LIMIT 500`,args);
 return {attendance:rows(r).map(x=>({id:x[0],sessionId:x[1],employeeId:x[2],status:x[3],createdAt:x[4],employeeName:x[5],sessionStartsAt:x[6],courseName:x[7]}))};
}
// ---- Módulos y quizzes ----
export async function listModules(token,slug,courseId,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T022');
 await courseFor(db,tenant.id,courseId);
 const modules=await modulesOfCourse(db,tenant.id,courseId);
 return {modules:modules.map(moduleView)};
}
export async function createModule(token,slug,courseId,input,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T022',true);
 await courseFor(db,tenant.id,courseId);
 const data=normalizeModule(input);
 const id=randomUUID();
 await db.executeSql('INSERT INTO tenant_training_modules(organization_id,id,course_id,type,title,description,content,position,status,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)',
  [tenant.id,id,courseId,data.type,data.title,data.description,data.content,data.position,data.status,session.userId]);
 const m=await moduleFor(db,tenant.id,courseId,id);
 await recomputeProgressForCourse(db,tenant.id,courseId);
 return {module:moduleView(m)};
}
export async function updateModule(token,slug,courseId,id,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T022',true);
 const current=await moduleFor(db,tenant.id,courseId,id);
 const base={type:current.type,title:current.title,description:current.description,content:current.content,position:current.position,status:current.status};
 const next=normalizeModule({...base,...input});
 const r=await db.executeSql('UPDATE tenant_training_modules SET type=?,title=?,description=?,content=?,position=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND course_id=? AND id=?',
  [next.type,next.title,next.description,next.content,next.position,next.status,tenant.id,courseId,id]);
 if(!changed(r))throw Error('Not found');
 return {module:moduleView({...next,id,courseId,quizConfig:current.quizConfig})};
}
export async function deleteModule(token,slug,courseId,id,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T022',true);
 await moduleFor(db,tenant.id,courseId,id);
 const attempts=num(rows(await db.executeSql('SELECT COUNT(*) FROM tenant_training_quiz_attempts WHERE organization_id=? AND module_id=?',[tenant.id,id]))[0]?.[0]);
 if(attempts>0)throw Error('Invalid module');
 const r=await db.executeSql('DELETE FROM tenant_training_modules WHERE organization_id=? AND course_id=? AND id=?',[tenant.id,courseId,id]);
 if(!changed(r))throw Error('Not found');
 await recomputeProgressForCourse(db,tenant.id,courseId);
 return {ok:true};
}
async function recomputeProgressForCourse(db,org,courseId){
 const enrs=rows(await db.executeSql("SELECT id FROM tenant_training_enrollments WHERE organization_id=? AND course_id=? AND status!='cancelado'",[org,courseId]));
 for(const e of enrs)await recomputeProgress(db,org,e[0]);
}
export async function setModuleQuiz(token,slug,courseId,id,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T022',true);
 const current=await moduleFor(db,tenant.id,courseId,id);
 if(current.type!=='certification')throw Error('Invalid quiz');
 const quiz=normalizeQuizConfig(input);
 const attempts=num(rows(await db.executeSql('SELECT COUNT(*) FROM tenant_training_quiz_attempts WHERE organization_id=? AND module_id=?',[tenant.id,id]))[0]?.[0]);
 if(attempts>0)throw Error('Invalid quiz');
 const r=await db.executeSql('UPDATE tenant_training_modules SET quiz_config_json=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND course_id=? AND id=?',
  [JSON.stringify(quiz),tenant.id,courseId,id]);
 if(!changed(r))throw Error('Not found');
 return {module:moduleView({...current,quizConfig:quiz})};
}
export async function getModuleQuiz(token,slug,courseId,id,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T022');
 const m=await moduleFor(db,tenant.id,courseId,id);
 if(m.type!=='certification'||!m.quizConfig)throw Error('Not found');
 const course=await courseFor(db,tenant.id,courseId);
 return {module:{id:m.id,courseId:m.courseId,title:m.title,passingScore:m.quizConfig.passingScore??course.minScore,maxAttempts:m.quizConfig.maxAttempts,questions:publicQuizQuestions(m.quizConfig)}};
}
export async function submitAttempt(token,slug,courseId,moduleId,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T022',true);
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['enrollmentId','answers'].includes(k)))throw Error('Invalid attempt');
 const m=await moduleFor(db,tenant.id,courseId,moduleId);
 if(m.type!=='certification'||!m.quizConfig)throw Error('Invalid attempt');
 const enr=await enrollmentFor(db,tenant.id,input.enrollmentId);
 if(enr.courseId!==courseId||enr.status==='cancelado')throw Error('Invalid attempt');
 const course=await courseFor(db,tenant.id,courseId);
 const answers=normalizeQuizAnswers(m.quizConfig,input.answers);
 const result=scoreQuiz(m.quizConfig,answers,course.minScore);
 const count=num(rows(await db.executeSql('SELECT COUNT(*) FROM tenant_training_quiz_attempts WHERE organization_id=? AND module_id=? AND enrollment_id=?',[tenant.id,moduleId,enr.id]))[0]?.[0]);
 if(m.quizConfig.maxAttempts!==null&&count>=m.quizConfig.maxAttempts)throw Error('Invalid attempt');
 const attemptNumber=count+1,attemptId=randomUUID();
 const statements=[
  {sql:'INSERT INTO tenant_training_quiz_attempts(organization_id,id,module_id,employee_id,enrollment_id,answers_json,score,passed,attempt_number) VALUES(?,?,?,?,?,?,?,?,?)',
   args:[tenant.id,attemptId,moduleId,enr.employeeId,enr.id,JSON.stringify(answers),result.score,result.passed?1:0,attemptNumber]}
 ];
 if(result.passed){
  statements.push({sql:`INSERT INTO tenant_training_module_completions(organization_id,id,enrollment_id,module_id)
   SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM tenant_training_module_completions WHERE organization_id=? AND enrollment_id=? AND module_id=?)`,
   args:[tenant.id,randomUUID(),enr.id,moduleId,tenant.id,enr.id,moduleId]});
 }
 if(enr.status==='inscrito'){
  statements.push({sql:"UPDATE tenant_training_enrollments SET status='en curso',updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?",args:[tenant.id,enr.id]});
 }
 await db.executeBatch(statements);
 const progress=await recomputeProgress(db,tenant.id,enr.id);
 return {attempt:{id:attemptId,moduleId,enrollmentId:enr.id,employeeId:enr.employeeId,score:result.score,passed:result.passed,attemptNumber,correctCount:result.correctCount,totalQuestions:result.totalQuestions},progress};
}
export async function listAttempts(token,slug,{moduleId=null,employeeId=null,enrollmentId=null}={},deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T022');
 const conds=['a.organization_id=?'],args=[tenant.id];
 if(moduleId){validId(moduleId,'Invalid module');conds.push('a.module_id=?');args.push(moduleId);}
 if(employeeId){await employeeFor(db,tenant.id,employeeId);conds.push('a.employee_id=?');args.push(employeeId);}
 if(enrollmentId){await enrollmentFor(db,tenant.id,enrollmentId);conds.push('a.enrollment_id=?');args.push(enrollmentId);}
 const r=await db.executeSql(`SELECT a.id,a.module_id,a.employee_id,a.enrollment_id,a.answers_json,a.score,a.passed,a.attempt_number,a.created_at,m.title,e.name
  FROM tenant_training_quiz_attempts a
  JOIN tenant_training_modules m ON m.organization_id=a.organization_id AND m.id=a.module_id
  JOIN tenant_training_employees e ON e.organization_id=a.organization_id AND e.id=a.employee_id
  WHERE ${conds.join(' AND ')} ORDER BY a.created_at DESC LIMIT 200`,args);
 return {attempts:rows(r).map(x=>({id:x[0],moduleId:x[1],employeeId:x[2],enrollmentId:x[3],answers:JSON.parse(x[4]),score:num(x[5]),passed:x[6]===1,attemptNumber:num(x[7]),createdAt:x[8],moduleTitle:x[9],employeeName:x[10]}))};
}
// Marcar un módulo 'learning' como completado por el empleado inscrito.
export async function completeModule(token,slug,courseId,moduleId,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T022',true);
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['enrollmentId'].includes(k)))throw Error('Invalid module');
 const m=await moduleFor(db,tenant.id,courseId,moduleId);
 if(m.type!=='learning'||m.status==='archivado')throw Error('Invalid module');
 const enr=await enrollmentFor(db,tenant.id,input.enrollmentId);
 if(enr.courseId!==courseId||enr.status==='cancelado')throw Error('Invalid module');
 const statements=[
  {sql:`INSERT INTO tenant_training_module_completions(organization_id,id,enrollment_id,module_id)
   SELECT ?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM tenant_training_module_completions WHERE organization_id=? AND enrollment_id=? AND module_id=?)`,
   args:[tenant.id,randomUUID(),enr.id,moduleId,tenant.id,enr.id,moduleId]}
 ];
 if(enr.status==='inscrito'){
  statements.push({sql:"UPDATE tenant_training_enrollments SET status='en curso',updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?",args:[tenant.id,enr.id]});
 }
 await db.executeBatch(statements);
 const progress=await recomputeProgress(db,tenant.id,enr.id);
 return {completed:true,moduleId,enrollmentId:enr.id,progress};
}
// ---- Avance ----
export async function getProgress(token,slug,enrollmentId,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T022');
 const enr=await enrollmentFor(db,tenant.id,enrollmentId);
 const [progress,modules]=await Promise.all([progressFor(db,tenant.id,enr.id),modulesOfCourse(db,tenant.id,enr.courseId,{activeOnly:true})]);
 const done=new Set(rows(await db.executeSql('SELECT module_id FROM tenant_training_module_completions WHERE organization_id=? AND enrollment_id=?',[tenant.id,enr.id])).map(x=>x[0]));
 const detail=[];
 for(const m of modules){
  const best=m.type==='certification'?await bestAttemptScore(db,tenant.id,enr.id,m.id):null;
  detail.push({id:m.id,title:m.title,type:m.type,position:m.position,completed:done.has(m.id),bestScore:best});
 }
 return {enrollmentId:enr.id,employeeId:enr.employeeId,courseId:enr.courseId,status:enr.status,...progress,modules:detail};
}
export async function setProgress(token,slug,input,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T022',true);
 const data=normalizeProgress(input);
 const enr=await enrollmentFor(db,tenant.id,data.enrollmentId);
 const modules=await modulesOfCourse(db,tenant.id,enr.courseId,{activeOnly:true});
 // Con módulos, el avance es derivado: no se edita a mano.
 if(modules.length>0)throw Error('Invalid progress');
 const r=await db.executeSql('UPDATE tenant_training_progress SET completed_modules=?,total_modules=?,percent=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND enrollment_id=?',
  [data.completedModules,data.totalModules,data.percent,tenant.id,data.enrollmentId]);
 if(!changed(r)){
  await db.executeSql('INSERT INTO tenant_training_progress(organization_id,id,enrollment_id,completed_modules,total_modules,percent) VALUES(?,?,?,?,?,?)',
   [tenant.id,randomUUID(),data.enrollmentId,data.completedModules,data.totalModules,data.percent]);
 }
 return {progress:{enrollmentId:data.enrollmentId,completedModules:data.completedModules,totalModules:data.totalModules,percent:data.percent}};
}
// ---- Evaluaciones ----
// Calificación derivada de los quizzes cuando el curso tiene módulos de
// certificación con quiz: promedio del mejor intento por módulo. Sin ellos,
// calificación manual 0-100. En ambos casos aprueba con la nota mínima.
export async function evaluate(token,slug,input,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T022',true);
 const data=normalizeEvaluation(input);
 const enr=await enrollmentFor(db,tenant.id,data.enrollmentId);
 const course=await courseFor(db,tenant.id,enr.courseId);
 const certModules=(await modulesOfCourse(db,tenant.id,enr.courseId,{activeOnly:true})).filter(m=>m.type==='certification'&&m.quizConfig);
 let score=data.score;
 if(certModules.length>0){
  const bests=[];
  for(const m of certModules){
   const best=await bestAttemptScore(db,tenant.id,enr.id,m.id);
   if(best===null)throw Error('Invalid evaluation');
   bests.push(best);
  }
  score=Math.round(bests.reduce((a,b)=>a+b,0)/bests.length);
 }else if(score===null){
  throw Error('Invalid evaluation');
 }
 const passed=isApproved(score,course.minScore)?1:0;
 const id=randomUUID();
 const r=await db.executeSql('UPDATE tenant_training_evaluations SET score=?,passed=?,evaluated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND enrollment_id=?',
  [score,passed,tenant.id,enr.id]);
 if(!changed(r)){
  await db.executeSql('INSERT INTO tenant_training_evaluations(organization_id,id,enrollment_id,employee_id,course_id,score,passed,created_by) VALUES(?,?,?,?,?,?,?,?)',
   [tenant.id,id,enr.id,enr.employeeId,enr.courseId,score,passed,session.userId]);
 }
 return {evaluation:{enrollmentId:enr.id,employeeId:enr.employeeId,courseId:enr.courseId,score,passed:passed===1,derived:certModules.length>0}};
}
export async function listEvaluations(token,slug,{courseId=null,employeeId=null}={},deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T022');
 const conds=['v.organization_id=?'],args=[tenant.id];
 if(courseId){await courseFor(db,tenant.id,courseId);conds.push('v.course_id=?');args.push(courseId);}
 if(employeeId){await employeeFor(db,tenant.id,employeeId);conds.push('v.employee_id=?');args.push(employeeId);}
 const r=await db.executeSql(`SELECT v.id,v.enrollment_id,v.employee_id,v.course_id,v.score,v.passed,v.evaluated_at,e.name,c.name
  FROM tenant_training_evaluations v
  JOIN tenant_training_employees e ON e.organization_id=v.organization_id AND e.id=v.employee_id
  JOIN tenant_training_courses c ON c.organization_id=v.organization_id AND c.id=v.course_id
  WHERE ${conds.join(' AND ')} ORDER BY v.evaluated_at DESC LIMIT 200`,args);
 return {evaluations:rows(r).map(x=>({id:x[0],enrollmentId:x[1],employeeId:x[2],courseId:x[3],score:num(x[4]),passed:x[5]===1,evaluatedAt:x[6],employeeName:x[7],courseName:x[8]}))};
}
// ---- Constancias ----
export async function issueCertificate(token,slug,input,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T022',true);
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['enrollmentId'].includes(k)))throw Error('Invalid certificate');
 const enr=await enrollmentFor(db,tenant.id,input.enrollmentId);
 const course=await courseFor(db,tenant.id,enr.courseId);
 const certModules=(await modulesOfCourse(db,tenant.id,enr.courseId,{activeOnly:true})).filter(m=>m.type==='certification');
 for(const m of certModules){
  if(!m.quizConfig||!(await hasPassedAttempt(db,tenant.id,enr.id,m.id)))throw Error('Invalid certificate');
 }
 const ev=await evaluationFor(db,tenant.id,enr.id);
 if(!ev||!ev.passed)throw Error('Invalid certificate');
 const existing=rows(await db.executeSql('SELECT id,folio,issued_at FROM tenant_training_certificates WHERE organization_id=? AND enrollment_id=? LIMIT 1',[tenant.id,enr.id]))[0];
 if(existing)return {certificate:{id:existing[0],employeeId:enr.employeeId,courseId:enr.courseId,enrollmentId:enr.id,folio:existing[1],issuedAt:existing[2]}};
 let folio=null,id=randomUUID(),issued=null;
 for(let attempt=0;attempt<5&&!folio;attempt++){
  const candidate=generateCertificateFolio();
  try{
   const r=await db.executeSql('INSERT INTO tenant_training_certificates(organization_id,id,employee_id,course_id,enrollment_id,folio,created_by) VALUES(?,?,?,?,?,?,?)',
    [tenant.id,id,enr.employeeId,enr.courseId,enr.id,candidate,session.userId]);
   if(changed(r)){folio=candidate;}
  }catch(e){
   if(!/UNIQUE constraint failed/i.test(e?.message||''))throw e;
   id=randomUUID();
  }
 }
 if(!folio)throw Error('Invalid certificate');
 const row=rows(await db.executeSql('SELECT issued_at FROM tenant_training_certificates WHERE organization_id=? AND id=?',[tenant.id,id]))[0];
 issued=row?.[0]||new Date().toISOString();
 return {certificate:{id,employeeId:enr.employeeId,courseId:enr.courseId,enrollmentId:enr.id,folio,issuedAt:issued}};
}
export async function listCertificates(token,slug,{courseId=null,employeeId=null}={},deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T022');
 const conds=['t.organization_id=?'],args=[tenant.id];
 if(courseId){await courseFor(db,tenant.id,courseId);conds.push('t.course_id=?');args.push(courseId);}
 if(employeeId){await employeeFor(db,tenant.id,employeeId);conds.push('t.employee_id=?');args.push(employeeId);}
 const r=await db.executeSql(`SELECT t.id,t.employee_id,t.course_id,t.enrollment_id,t.folio,t.issued_at,e.name,c.name
  FROM tenant_training_certificates t
  JOIN tenant_training_employees e ON e.organization_id=t.organization_id AND e.id=t.employee_id
  JOIN tenant_training_courses c ON c.organization_id=t.organization_id AND c.id=t.course_id
  WHERE ${conds.join(' AND ')} ORDER BY t.issued_at DESC LIMIT 200`,args);
 return {certificates:rows(r).map(x=>({id:x[0],employeeId:x[1],courseId:x[2],enrollmentId:x[3],folio:x[4],issuedAt:x[5],employeeName:x[6],courseName:x[7]}))};
}
// ---- Panel, historiales y exportación ----
export async function dashboard(token,slug,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T022');
 const org=tenant.id;
 let reminders={created:0};
 try{reminders=await trainingReminders(token,slug,undefined,deps);}catch{/* el panel no falla por los recordatorios */}
 const in30=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
 const [inTraining,avg,expiring,pending,totals]=await Promise.all([
  db.executeSql("SELECT COUNT(DISTINCT employee_id) FROM tenant_training_enrollments WHERE organization_id=? AND status IN ('inscrito','en curso')",[org]),
  db.executeSql(`SELECT AVG(p.percent) FROM tenant_training_progress p
   JOIN tenant_training_enrollments n ON n.organization_id=p.organization_id AND n.id=p.enrollment_id
   WHERE p.organization_id=? AND n.status IN ('inscrito','en curso','completado')`,[org]),
  db.executeSql("SELECT id,name,valid_until FROM tenant_training_courses WHERE organization_id=? AND status='activo' AND valid_until IS NOT NULL AND valid_until<=? ORDER BY valid_until ASC LIMIT 20",[org,in30]),
  db.executeSql(`SELECT n.id,n.employee_id,n.course_id,e.name,c.name FROM tenant_training_enrollments n
   JOIN tenant_training_employees e ON e.organization_id=n.organization_id AND e.id=n.employee_id
   JOIN tenant_training_courses c ON c.organization_id=n.organization_id AND c.id=n.course_id
   LEFT JOIN tenant_training_evaluations v ON v.organization_id=n.organization_id AND v.enrollment_id=n.id
   LEFT JOIN tenant_training_progress p ON p.organization_id=n.organization_id AND p.enrollment_id=n.id
   WHERE n.organization_id=? AND n.status!='cancelado' AND v.id IS NULL AND (n.status='completado' OR p.percent=100) ORDER BY n.created_at DESC LIMIT 20`,[org]),
  db.executeSql(`SELECT
   (SELECT COUNT(*) FROM tenant_training_courses WHERE organization_id=? AND status='activo'),
   (SELECT COUNT(*) FROM tenant_training_employees WHERE organization_id=?),
   (SELECT COUNT(*) FROM tenant_training_enrollments WHERE organization_id=? AND status!='cancelado'),
   (SELECT COUNT(*) FROM tenant_training_certificates WHERE organization_id=?),
   (SELECT COUNT(*) FROM tenant_training_sessions WHERE organization_id=? AND starts_at>=datetime('now'))`,[org,org,org,org,org])
 ]);
 const t=rows(totals)[0]||[];
 return {
  kpis:{employeesInTraining:num(rows(inTraining)[0]?.[0]),globalProgress:rows(avg)[0]?.[0]===null?null:Math.round(num(rows(avg)[0]?.[0])),activeCourses:num(t[0]),totalEmployees:num(t[1]),activeEnrollments:num(t[2]),certificatesIssued:num(t[3]),upcomingSessions:num(t[4])},
  coursesExpiring:rows(expiring).map(x=>({id:x[0],name:x[1],validUntil:x[2]})),
  pendingEvaluations:rows(pending).map(x=>({enrollmentId:x[0],employeeId:x[1],courseId:x[2],employeeName:x[3],courseName:x[4]})),
  reminders
 };
}
export async function employeeHistory(token,slug,employeeId,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T022');
 const employee=await employeeFor(db,tenant.id,employeeId);
 const r=await db.executeSql(`SELECT n.id,n.course_id,n.session_id,n.status,n.created_at,c.name,p.completed_modules,p.total_modules,p.percent,v.score,v.passed,
  (SELECT COUNT(*) FROM tenant_training_certificates t WHERE t.organization_id=n.organization_id AND t.enrollment_id=n.id),
  (SELECT COUNT(*) FROM tenant_training_attendance a JOIN tenant_training_sessions s ON s.organization_id=a.organization_id AND s.id=a.session_id WHERE a.organization_id=n.organization_id AND a.employee_id=n.employee_id AND s.course_id=n.course_id AND a.status='presente')
  FROM tenant_training_enrollments n
  JOIN tenant_training_courses c ON c.organization_id=n.organization_id AND c.id=n.course_id
  LEFT JOIN tenant_training_progress p ON p.organization_id=n.organization_id AND p.enrollment_id=n.id
  LEFT JOIN tenant_training_evaluations v ON v.organization_id=n.organization_id AND v.enrollment_id=n.id
  WHERE n.organization_id=? AND n.employee_id=? ORDER BY n.created_at DESC LIMIT 100`,[tenant.id,employeeId]);
 return {employee,enrollments:rows(r).map(x=>({id:x[0],courseId:x[1],sessionId:x[2],status:x[3],createdAt:x[4],courseName:x[5],
  progress:{completedModules:num(x[6]),totalModules:num(x[7]),percent:num(x[8])},
  evaluation:x[9]===null?null:{score:num(x[9]),passed:x[10]===1},certificates:num(x[11]),sessionsAttended:num(x[12])}))};
}
export async function courseHistory(token,slug,courseId,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T022');
 const course=await courseFor(db,tenant.id,courseId);
 const [sessions,enrollments,modules,certs]=await Promise.all([
  db.executeSql(`SELECT s.id,s.starts_at,s.ends_at,s.place_or_link,s.capacity,
   (SELECT COUNT(*) FROM tenant_training_attendance a WHERE a.organization_id=s.organization_id AND a.session_id=s.id),
   (SELECT COUNT(*) FROM tenant_training_attendance a WHERE a.organization_id=s.organization_id AND a.session_id=s.id AND a.status='presente')
   FROM tenant_training_sessions s WHERE s.organization_id=? AND s.course_id=? ORDER BY s.starts_at DESC LIMIT 100`,[tenant.id,courseId]),
  db.executeSql(`SELECT n.id,n.employee_id,n.status,n.created_at,e.name,p.completed_modules,p.total_modules,p.percent,v.score,v.passed,
   (SELECT COUNT(*) FROM tenant_training_certificates t WHERE t.organization_id=n.organization_id AND t.enrollment_id=n.id)
   FROM tenant_training_enrollments n
   JOIN tenant_training_employees e ON e.organization_id=n.organization_id AND e.id=n.employee_id
   LEFT JOIN tenant_training_progress p ON p.organization_id=n.organization_id AND p.enrollment_id=n.id
   LEFT JOIN tenant_training_evaluations v ON v.organization_id=n.organization_id AND v.enrollment_id=n.id
   WHERE n.organization_id=? AND n.course_id=? ORDER BY n.created_at DESC LIMIT 200`,[tenant.id,courseId]),
  modulesOfCourse(db,tenant.id,courseId),
  db.executeSql('SELECT COUNT(*) FROM tenant_training_certificates WHERE organization_id=? AND course_id=?',[tenant.id,courseId])
 ]);
 return {course,
  sessions:rows(sessions).map(x=>({id:x[0],startsAt:x[1],endsAt:x[2],placeOrLink:x[3],capacity:num(x[4]),attendance:num(x[5]),present:num(x[6])})),
  enrollments:rows(enrollments).map(x=>({id:x[0],employeeId:x[1],status:x[2],createdAt:x[3],employeeName:x[4],
   progress:{completedModules:num(x[5]),totalModules:num(x[6]),percent:num(x[7])},
   evaluation:x[8]===null?null:{score:num(x[8]),passed:x[9]===1},certificates:num(x[10])})),
  modules:modules.map(moduleView),
  certificatesIssued:num(rows(certs)[0]?.[0])};
}
export async function exportCsv(token,slug,kind,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T022');
 if(kind==='progress'){
  const r=await db.executeSql(`SELECT e.name,c.name,n.status,p.completed_modules,p.total_modules,p.percent,v.score,v.passed
   FROM tenant_training_enrollments n
   JOIN tenant_training_employees e ON e.organization_id=n.organization_id AND e.id=n.employee_id
   JOIN tenant_training_courses c ON c.organization_id=n.organization_id AND c.id=n.course_id
   LEFT JOIN tenant_training_progress p ON p.organization_id=n.organization_id AND p.enrollment_id=n.id
   LEFT JOIN tenant_training_evaluations v ON v.organization_id=n.organization_id AND v.enrollment_id=n.id
   WHERE n.organization_id=? ORDER BY c.name,e.name LIMIT 1000`,[tenant.id]);
  const columns=[{key:'employee',label:'Empleado'},{key:'course',label:'Curso'},{key:'status',label:'Estatus inscripción'},{key:'completed',label:'Módulos completados'},{key:'total',label:'Módulos totales'},{key:'percent',label:'Avance %'},{key:'score',label:'Calificación'},{key:'passed',label:'Aprobado'}];
  return {filename:'hubie-capacitacion-avance.csv',csv:buildCsv(columns,rows(r).map(x=>({employee:x[0],course:x[1],status:x[2],completed:num(x[3]),total:num(x[4]),percent:num(x[5]),score:x[6]===null?'':num(x[6]),passed:x[7]===null?'':x[7]===1?'Sí':'No'})))};
 }
 if(kind==='attendance'){
  const r=await db.executeSql(`SELECT s.starts_at,c.name,e.name,a.status
   FROM tenant_training_attendance a
   JOIN tenant_training_sessions s ON s.organization_id=a.organization_id AND s.id=a.session_id
   JOIN tenant_training_courses c ON c.organization_id=s.organization_id AND c.id=s.course_id
   JOIN tenant_training_employees e ON e.organization_id=a.organization_id AND e.id=a.employee_id
   WHERE a.organization_id=? ORDER BY s.starts_at DESC LIMIT 1000`,[tenant.id]);
  const columns=[{key:'session',label:'Sesión'},{key:'course',label:'Curso'},{key:'employee',label:'Empleado'},{key:'status',label:'Asistencia'}];
  return {filename:'hubie-capacitacion-asistencia.csv',csv:buildCsv(columns,rows(r).map(x=>({session:x[0],course:x[1],employee:x[2],status:x[3]})))};
 }
 throw Error('Not found');
}
