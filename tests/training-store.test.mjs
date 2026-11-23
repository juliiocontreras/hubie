import test from 'node:test';
import assert from 'node:assert/strict';
import {createTrainingFakeDb,trainingDeps} from './training-fake-db.mjs';
import {listCourses,createCourse,updateCourse,setCourseStatus,listSessions,createSession,updateSession,
 listEmployees,createEmployee,updateEmployee,listEnrollments,enroll,unenroll,setEnrollmentStatus,
 markAttendance,listAttendance,listModules,createModule,updateModule,deleteModule,setModuleQuiz,
 getModuleQuiz,submitAttempt,listAttempts,completeModule,setProgress,getProgress,evaluate,
 listEvaluations,issueCertificate,listCertificates,dashboard,employeeHistory,courseHistory,
 exportCsv,trainingReminders} from '../platform/training-store.mjs';

const token='fake-token',slug='demo',otherSlug='demo-b';
const setup=()=>{const fake=createTrainingFakeDb();return {fake,deps:trainingDeps(fake)};};
const courseInput=(over={})=>({name:'Seguridad en almacén',description:'Curso base',durationHours:8,
 modality:'presencial',instructor:'Ana Ruiz',validUntil:'2027-06-30',status:'activo',minScore:70,category:'Seguridad',...over});
const employeeInput=(over={})=>({name:'María López',email:'maria@empresa.mx',position:'Operaria',area:'Almacén',...over});
const sessionInput=(courseId,over={})=>({courseId,startsAt:'2027-01-15T09:00:00Z',endsAt:'2027-01-15T12:00:00Z',
 placeOrLink:'Aula 3',capacity:25,instructor:'Ana Ruiz',...over});
const quizConfig=(over={})=>({passingScore:80,maxAttempts:2,questions:[
 {id:'q1',text:'¿Qué es un EPP?',options:['Equipo de protección','Una máquina','Un turno'],correctIndex:0,points:2},
 {id:'q2',text:'¿Cada cuánto se revisa?',options:['Nunca','Cada mes'],correctIndex:1,points:1}],...over});
// Flujo completo: curso con 1 módulo learning + 1 certificación con quiz.
async function fullSetup(deps,{minScore=70}={}){
 const course=(await createCourse(token,slug,courseInput({minScore}),deps)).course;
 const employee=(await createEmployee(token,slug,employeeInput(),deps)).employee;
 const learning=(await createModule(token,slug,course.id,{type:'learning',title:'Introducción',position:1},deps)).module;
 const cert=(await createModule(token,slug,course.id,{type:'certification',title:'Examen final',position:2},deps)).module;
 await setModuleQuiz(token,slug,course.id,cert.id,quizConfig(),deps);
 const enrollment=(await enroll(token,slug,{employeeId:employee.id,courseId:course.id},deps)).enrollment;
 return {course,employee,learning,cert,enrollment};
}

test('cursos: crear con defaults, listar con contadores, actualizar y cambiar estatus',async()=>{
 const {fake,deps}=setup();
 const created=await createCourse(token,slug,{name:'Inducción'},deps);
 assert.equal(created.course.status,'borrador');
 assert.equal(created.course.minScore,70);
 assert.equal(created.course.modality,'en línea');
 const full=await createCourse(token,slug,courseInput(),deps);
 assert.equal((await listCourses(token,slug,{},deps)).courses.length,2);
 const listed=await listCourses(token,slug,{status:'activo'},deps);
 assert.equal(listed.courses.length,1);
 assert.equal(listed.courses[0].sessions,0);
 assert.equal(listed.courses[0].enrollments,0);
 assert.equal(listed.courses[0].modules,0);
 const updated=await updateCourse(token,slug,full.course.id,{name:'Seguridad actualizada',minScore:80},deps);
 assert.equal(updated.course.name,'Seguridad actualizada');
 assert.equal(updated.course.minScore,80);
 assert.equal(updated.course.modality,'presencial');
 const archived=await setCourseStatus(token,slug,full.course.id,{status:'archivado'},deps);
 assert.equal(archived.status,'archivado');
 assert.equal((await listCourses(token,slug,{status:'archivado'},deps)).courses.length,1);
 await assert.rejects(()=>createCourse(token,slug,{name:'Abc'},deps),/Invalid/);
 await assert.rejects(()=>setCourseStatus(token,slug,full.course.id,{status:'publicado'},deps),/Invalid course/);
 await assert.rejects(()=>updateCourse(token,slug,'00000000-0000-4000-8000-000000000000',{name:'Nada'},deps),/Not found/);
 await assert.rejects(()=>listCourses('bad-token',slug,{},deps),/Unauthorized/);
 await assert.rejects(()=>listCourses(token,'sin-tenant',{},deps),/Not found/);
 assert.equal(fake.tables.notifications.length,0,'sin aviso: vigencia 2027-06-30 fuera de 30 días');
});

test('sesiones: crear, listar por curso, actualizar y validar fechas',async()=>{
 const {deps}=setup();
 const course=(await createCourse(token,slug,courseInput(),deps)).course;
 const session=(await createSession(token,slug,sessionInput(course.id),deps)).session;
 assert.equal(session.capacity,25);
 assert.equal((await listSessions(token,slug,{courseId:course.id},deps)).sessions.length,1);
 assert.equal((await listSessions(token,slug,{courseId:course.id},deps)).sessions[0].courseName,'Seguridad en almacén');
 assert.equal((await listSessions(token,slug,{courseId:course.id},deps)).sessions[0].attendance,0);
 const updated=await updateSession(token,slug,session.id,{placeOrLink:'Aula 5'},deps);
 assert.equal(updated.session.placeOrLink,'Aula 5');
 await assert.rejects(()=>createSession(token,slug,sessionInput(course.id,{startsAt:'2027-01-15T12:00:00Z',endsAt:'2027-01-15T09:00:00Z'}),deps),/Invalid session/);
 await assert.rejects(()=>createSession(token,slug,sessionInput('00000000-0000-4000-8000-000000000000'),deps),/Not found/);
 await assert.rejects(()=>updateSession(token,slug,'00000000-0000-4000-8000-000000000000',{placeOrLink:'X'},deps),/Not found/);
});

test('empleados: correo normalizado, duplicado 409 por tenant y actualización',async()=>{
 const {fake,deps}=setup();
 const emp=(await createEmployee(token,slug,employeeInput({email:'  MARIA@Empresa.MX '}),deps)).employee;
 assert.equal(emp.email,'maria@empresa.mx');
 await assert.rejects(()=>createEmployee(token,slug,employeeInput(),deps),/Duplicate employee email/);
 // El mismo correo en otro tenant sí vale: el UNIQUE es por organización.
 const other=await createEmployee(token,otherSlug,employeeInput(),deps);
 assert.equal(other.employee.email,'maria@empresa.mx');
 assert.equal((await listEmployees(token,slug,deps)).employees.length,1);
 assert.equal((await listEmployees(token,otherSlug,deps)).employees.length,1);
 const second=(await createEmployee(token,slug,employeeInput({name:'Juan Pérez',email:'juan@empresa.mx'}),deps)).employee;
 await assert.rejects(()=>updateEmployee(token,slug,second.id,{email:'maria@empresa.mx'},deps),/Duplicate employee email/);
 const updated=await updateEmployee(token,slug,second.id,{position:'Supervisor'},deps);
 assert.equal(updated.employee.position,'Supervisor');
 assert.equal(updated.employee.email,'juan@empresa.mx');
 assert.equal(fake.tables.employees.length,3);
});

test('inscripciones: alta, duplicado activo, baja y re-inscripción',async()=>{
 const {deps}=setup();
 const course=(await createCourse(token,slug,courseInput(),deps)).course;
 const otherCourse=(await createCourse(token,slug,courseInput({name:'Ventas consultivas'}),deps)).course;
 const employee=(await createEmployee(token,slug,employeeInput(),deps)).employee;
 const session=(await createSession(token,slug,sessionInput(course.id),deps)).session;
 const otherSession=(await createSession(token,slug,sessionInput(otherCourse.id),deps)).session;
 const first=(await enroll(token,slug,{employeeId:employee.id,courseId:course.id,sessionId:session.id},deps)).enrollment;
 assert.equal(first.status,'inscrito');
 assert.equal((await listEnrollments(token,slug,{courseId:course.id},deps)).enrollments[0].progressPercent,0);
 await assert.rejects(()=>enroll(token,slug,{employeeId:employee.id,courseId:course.id},deps),/Duplicate enrollment/);
 await assert.rejects(()=>enroll(token,slug,{employeeId:employee.id,courseId:otherCourse.id,sessionId:session.id},deps),/Invalid enrollment/);
 await assert.rejects(()=>enroll(token,slug,{employeeId:'00000000-0000-4000-8000-000000000000',courseId:course.id},deps),/Not found/);
 const cancelled=await unenroll(token,slug,first.id,deps);
 assert.equal(cancelled.status,'cancelado');
 assert.equal((await listEnrollments(token,slug,{status:'cancelado'},deps)).enrollments.length,1);
 const again=(await enroll(token,slug,{employeeId:employee.id,courseId:course.id},deps)).enrollment;
 assert.notEqual(again.id,first.id);
 const moved=await setEnrollmentStatus(token,slug,again.id,{status:'en curso'},deps);
 assert.equal(moved.status,'en curso');
 await assert.rejects(()=>setEnrollmentStatus(token,slug,again.id,{status:'egresado'},deps),/Invalid enrollment/);
 await assert.rejects(()=>unenroll(token,slug,first.id,deps),/Not found/);
});

test('asistencia: upsert por sesión+empleado, exige inscripción y lista por sesión',async()=>{
 const {deps}=setup();
 const {course,employee,enrollment}=await fullSetup(deps);
 const session=(await createSession(token,slug,sessionInput(course.id),deps)).session;
 const first=await markAttendance(token,slug,{sessionId:session.id,employeeId:employee.id,status:'presente'},deps);
 assert.equal(first.attendance.status,'presente');
 const second=await markAttendance(token,slug,{sessionId:session.id,employeeId:employee.id,status:'ausente'},deps);
 assert.equal(second.attendance.status,'ausente');
 const listed=await listAttendance(token,slug,{sessionId:session.id},deps);
 assert.equal(listed.attendance.length,1,'el upsert no duplica la fila');
 assert.equal(listed.attendance[0].status,'ausente');
 assert.equal(listed.attendance[0].employeeName,'María López');
 assert.equal((await listSessions(token,slug,{courseId:course.id},deps)).sessions[0].attendance,1);
 const stranger=(await createEmployee(token,slug,employeeInput({name:'Sin inscribir',email:'sin@empresa.mx'}),deps)).employee;
 await assert.rejects(()=>markAttendance(token,slug,{sessionId:session.id,employeeId:stranger.id,status:'presente'},deps),/Invalid attendance/);
 assert.equal(enrollment.status,'inscrito');
});

test('módulos y quizzes: quiz solo en certificación, preguntas sin respuesta correcta expuesta, límite de intentos',async()=>{
 const {deps}=setup();
 const {course,employee,learning,cert,enrollment}=await fullSetup(deps);
 assert.equal((await listModules(token,slug,course.id,deps)).modules.length,2);
 assert.equal((await listModules(token,slug,course.id,deps)).modules[1].quiz.questionCount,2);
 await assert.rejects(()=>setModuleQuiz(token,slug,course.id,learning.id,quizConfig(),deps),/Invalid quiz/);
 await assert.rejects(()=>getModuleQuiz(token,slug,course.id,learning.id,deps),/Not found/);
 const quiz=await getModuleQuiz(token,slug,course.id,cert.id,deps);
 assert.equal(quiz.module.passingScore,80);
 assert.equal(quiz.module.maxAttempts,2);
 assert.equal(quiz.module.questions[0].correctIndex,undefined);
 // Intento reprobado: 1 de 2 preguntas bien = 67 < 80.
 const failed=await submitAttempt(token,slug,course.id,cert.id,{enrollmentId:enrollment.id,answers:{q1:0,q2:0}},deps);
 assert.equal(failed.attempt.score,67);
 assert.equal(failed.attempt.passed,false);
 assert.equal(failed.attempt.attemptNumber,1);
 assert.equal(failed.progress.percent,0,'módulo de certificación sin aprobar no avanza');
 assert.equal((await listAttempts(token,slug,{moduleId:cert.id},deps)).attempts.length,1);
 assert.equal((await listEnrollments(token,slug,{},deps)).enrollments[0].status,'en curso','el intento mueve la inscripción a en curso');
 // Intento aprobado: puntaje calculado en servidor, no se confía en el cliente.
 const passed=await submitAttempt(token,slug,course.id,cert.id,{enrollmentId:enrollment.id,answers:{q1:0,q2:1}},deps);
 assert.equal(passed.attempt.score,100);
 assert.equal(passed.attempt.passed,true);
 assert.equal(passed.progress.percent,50,'1 de 2 módulos completado');
 await assert.rejects(()=>submitAttempt(token,slug,course.id,cert.id,{enrollmentId:enrollment.id,answers:{q1:0,q2:1}},deps),/Invalid attempt/);
 await assert.rejects(()=>setModuleQuiz(token,slug,course.id,cert.id,quizConfig(),deps),/Invalid quiz/);
 await assert.rejects(()=>deleteModule(token,slug,course.id,cert.id,deps),/Invalid module/);
 const deleted=await deleteModule(token,slug,course.id,learning.id,deps);
 assert.equal(deleted.ok,true);
 assert.equal((await listModules(token,slug,course.id,deps)).modules.length,1);
});

test('quizzes S1: las respuestas solo las ven dueño/admin y el propio empleado',async()=>{
 const {fake}=setup();
 const depsOwner=trainingDeps(fake);
 const {course,cert}=await fullSetup(depsOwner);
 const other=(await createEmployee(token,slug,employeeInput({name:'Carlos Ruiz',email:'otro@empresa.mx'}),depsOwner)).employee;
 const memberEmp=(await createEmployee(token,slug,employeeInput({name:'Miembro Demo',email:'member@demo.test'}),depsOwner)).employee;
 const enrMember=(await enroll(token,slug,{employeeId:memberEmp.id,courseId:course.id},depsOwner)).enrollment;
 const enrOther=(await enroll(token,slug,{employeeId:other.id,courseId:course.id},depsOwner)).enrollment;
 await submitAttempt(token,slug,course.id,cert.id,{enrollmentId:enrMember.id,answers:{q1:0,q2:1}},depsOwner);
 await submitAttempt(token,slug,course.id,cert.id,{enrollmentId:enrOther.id,answers:{q1:0,q2:0}},depsOwner);
 // Dueño: ve todas las respuestas.
 const asOwner=(await listAttempts(token,slug,{moduleId:cert.id},depsOwner)).attempts;
 assert.equal(asOwner.length,2);
 assert.ok(asOwner.every(a=>a.answers&&typeof a.answers==='object'));
 // Viewer: ve puntaje y estado, pero las respuestas en null.
 const depsViewer=trainingDeps(fake,{userId:fake.viewerId,role:'viewer'});
 const asViewer=(await listAttempts(token,slug,{moduleId:cert.id},depsViewer)).attempts;
 assert.equal(asViewer.length,2);
 assert.ok(asViewer.every(a=>a.answers===null));
 assert.ok(asViewer.every(a=>typeof a.score==='number'));
 // El propio empleado (miembro): solo ve sus respuestas.
 const depsMember=trainingDeps(fake,{userId:fake.memberId,role:'member'});
 const asMember=(await listAttempts(token,slug,{moduleId:cert.id},depsMember)).attempts;
 assert.equal(asMember.find(a=>a.employeeId===memberEmp.id).answers?.q1,0);
 assert.equal(asMember.find(a=>a.employeeId===other.id).answers,null);
});

test('quizzes S2: el límite de intentos se hace cumplir en el INSERT y el número es secuencial',async()=>{
 const {deps}=setup();
 const {course,cert,enrollment}=await fullSetup(deps);
 const first=await submitAttempt(token,slug,course.id,cert.id,{enrollmentId:enrollment.id,answers:{q1:0,q2:0}},deps);
 assert.equal(first.attempt.attemptNumber,1);
 const second=await submitAttempt(token,slug,course.id,cert.id,{enrollmentId:enrollment.id,answers:{q1:0,q2:1}},deps);
 assert.equal(second.attempt.attemptNumber,2);
 await assert.rejects(()=>submitAttempt(token,slug,course.id,cert.id,{enrollmentId:enrollment.id,answers:{q1:0,q2:1}},deps),/Invalid attempt/);
 assert.equal((await listAttempts(token,slug,{moduleId:cert.id},deps)).attempts.length,2);
 // Sin límite (maxAttempts null): no se bloquea y el número sigue creciendo.
 const cert2=(await createModule(token,slug,course.id,{type:'certification',title:'Examen 2',position:3},deps)).module;
 await setModuleQuiz(token,slug,course.id,cert2.id,quizConfig({maxAttempts:null}),deps);
 for(let i=1;i<=3;i++){
  const a=await submitAttempt(token,slug,course.id,cert2.id,{enrollmentId:enrollment.id,answers:{q1:0,q2:1}},deps);
  assert.equal(a.attempt.attemptNumber,i);
 }
});

test('inscripciones S2: el duplicado no deja inscripción extra',async()=>{
 const {deps}=setup();
 const {course,employee}=await fullSetup(deps);
 await assert.rejects(()=>enroll(token,slug,{employeeId:employee.id,courseId:course.id},deps),/Duplicate enrollment/);
 assert.equal((await listEnrollments(token,slug,{},deps)).enrollments.length,1);
});

test('avance: derivado de módulos, completar learning, manual solo sin módulos',async()=>{
 const {deps}=setup();
 const {course,employee,learning,cert,enrollment}=await fullSetup(deps);
 const start=await getProgress(token,slug,enrollment.id,deps);
 assert.deepEqual({completed:start.completedModules,total:start.totalModules,percent:start.percent},{completed:0,total:2,percent:0});
 assert.equal(start.modules[0].completed,false);
 assert.equal(start.modules[1].bestScore,null);
 const done=await completeModule(token,slug,course.id,learning.id,{enrollmentId:enrollment.id},deps);
 assert.equal(done.progress.percent,50);
 assert.equal(done.completed,true);
 // Completar dos veces no duplica: el avance se mantiene.
 const again=await completeModule(token,slug,course.id,learning.id,{enrollmentId:enrollment.id},deps);
 assert.equal(again.progress.percent,50);
 await assert.rejects(()=>completeModule(token,slug,course.id,cert.id,{enrollmentId:enrollment.id},deps),/Invalid module/);
 await assert.rejects(()=>setProgress(token,slug,{enrollmentId:enrollment.id,completedModules:2,totalModules:2},deps),/Invalid progress/);
 // Sin módulos, el avance sí se edita a mano.
 const plain=(await createCourse(token,slug,courseInput({name:'Curso sin módulos'}),deps)).course;
 const plainEnr=(await enroll(token,slug,{employeeId:employee.id,courseId:plain.id},deps)).enrollment;
 const manual=await setProgress(token,slug,{enrollmentId:plainEnr.id,completedModules:1,totalModules:2},deps);
 assert.equal(manual.progress.percent,50);
 assert.equal((await getProgress(token,slug,plainEnr.id,deps)).percent,50);
});

test('evaluación: derivada del mejor intento por módulo de certificación, manual si no hay',async()=>{
 const {deps}=setup();
 const {course,employee,learning,cert,enrollment}=await fullSetup(deps);
 await assert.rejects(()=>evaluate(token,slug,{enrollmentId:enrollment.id},deps),/Invalid evaluation/);
 await submitAttempt(token,slug,course.id,cert.id,{enrollmentId:enrollment.id,answers:{q1:0,q2:0}},deps);
 await submitAttempt(token,slug,course.id,cert.id,{enrollmentId:enrollment.id,answers:{q1:0,q2:1}},deps);
 // El puntaje manual se ignora cuando hay módulos de certificación: manda el quiz.
 const derived=await evaluate(token,slug,{enrollmentId:enrollment.id,score:50},deps);
 assert.equal(derived.evaluation.score,100);
 assert.equal(derived.evaluation.passed,true);
 assert.equal(derived.evaluation.derived,true);
 assert.equal((await listEvaluations(token,slug,{courseId:course.id},deps)).evaluations[0].employeeName,'María López');
 // Sin módulos de certificación: calificación manual con la nota mínima del curso.
 const plain=(await createCourse(token,slug,courseInput({name:'Curso manual',minScore:80}),deps)).course;
 const plainEnr=(await enroll(token,slug,{employeeId:employee.id,courseId:plain.id},deps)).enrollment;
 await assert.rejects(()=>evaluate(token,slug,{enrollmentId:plainEnr.id},deps),/Invalid evaluation/);
 const manual=await evaluate(token,slug,{enrollmentId:plainEnr.id,score:75},deps);
 assert.equal(manual.evaluation.score,75);
 assert.equal(manual.evaluation.passed,false,'75 < nota mínima 80');
 assert.equal(manual.evaluation.derived,false);
 const second=await evaluate(token,slug,{enrollmentId:plainEnr.id,score:90},deps);
 assert.equal(second.evaluation.score,90);
 assert.equal((await listEvaluations(token,slug,{},deps)).evaluations.length,2,'reevaluar actualiza, no duplica');
});

test('constancias: bloqueos por quiz sin aprobar y por evaluación, folio único e idempotente',async()=>{
 const {deps}=setup();
 const {course,employee,learning,cert,enrollment}=await fullSetup(deps);
 await assert.rejects(()=>issueCertificate(token,slug,{enrollmentId:enrollment.id},deps),/Invalid certificate/);
 await submitAttempt(token,slug,course.id,cert.id,{enrollmentId:enrollment.id,answers:{q1:0,q2:1}},deps);
 await assert.rejects(()=>issueCertificate(token,slug,{enrollmentId:enrollment.id},deps),/Invalid certificate/);
 await completeModule(token,slug,course.id,learning.id,{enrollmentId:enrollment.id},deps);
 await evaluate(token,slug,{enrollmentId:enrollment.id},deps);
 const first=await issueCertificate(token,slug,{enrollmentId:enrollment.id},deps);
 assert.match(first.certificate.folio,/^CAP-\d{4}-[A-HJ-NP-Z2-9]{6}$/);
 assert.equal(first.certificate.employeeId,employee.id);
 assert.equal(first.certificate.courseId,course.id);
 const second=await issueCertificate(token,slug,{enrollmentId:enrollment.id},deps);
 assert.equal(second.certificate.folio,first.certificate.folio,'reemitir devuelve la misma constancia');
 assert.equal(second.certificate.id,first.certificate.id);
 assert.equal((await listCertificates(token,slug,{courseId:course.id},deps)).certificates.length,1);
 assert.equal((await listCertificates(token,slug,{employeeId:employee.id},deps)).certificates[0].employeeName,'María López');
});

test('tablero: KPIs reales, cursos por vencer, pendientes de evaluación y recordatorios',async()=>{
 const {fake,deps}=setup();
 const {course,employee,learning,cert,enrollment}=await fullSetup(deps);
 const session=(await createSession(token,slug,sessionInput(course.id),deps)).session;
 await completeModule(token,slug,course.id,learning.id,{enrollmentId:enrollment.id},deps);
 const dash=await dashboard(token,slug,deps);
 assert.equal(dash.kpis.employeesInTraining,1);
 assert.equal(dash.kpis.activeCourses,1);
 assert.equal(dash.kpis.totalEmployees,1);
 assert.equal(dash.kpis.activeEnrollments,1);
 assert.equal(dash.kpis.certificatesIssued,0);
 assert.equal(dash.kpis.upcomingSessions,1,'sesión 2027-01-15');
 assert.equal(dash.kpis.globalProgress,50);
 assert.equal(dash.coursesExpiring.length,0,'vigencia 2027-06-30 fuera de 30 días');
 assert.equal(dash.pendingEvaluations.length,0,'avance 50%, no completado');
 assert.equal(dash.reminders.created,0);
 // Curso por vencer + avance al 100% sin evaluación => pendiente y aviso.
 const expiring=(await createCourse(token,slug,courseInput({name:'Curso por vencer',validUntil:'2026-11-30'}),deps)).course;
 assert.equal(fake.tables.notifications.filter(n=>n.title.startsWith('Curso por vencer')).length,1,'el alta avisa en la app');
 await submitAttempt(token,slug,course.id,cert.id,{enrollmentId:enrollment.id,answers:{q1:0,q2:1}},deps);
 const dash2=await dashboard(token,slug,deps);
 assert.equal(dash2.kpis.globalProgress,100);
 assert.equal(dash2.coursesExpiring.length,1);
 assert.equal(dash2.coursesExpiring[0].id,expiring.id);
 assert.equal(dash2.pendingEvaluations.length,1);
 assert.equal(dash2.pendingEvaluations[0].enrollmentId,enrollment.id);
 // El recordatorio no se duplica mientras el aviso siga sin leer.
 const again=await trainingReminders(token,slug,new Date('2026-11-16T00:00:00Z'),deps);
 assert.equal(again.created,0);
 assert.equal(again.courses,1);
 assert.equal(again.sessions,0);
 // Tras leer el aviso, el recordatorio vuelve a crearse.
 fake.tables.notifications[0].read_at='2026-11-16T01:00:00.000Z';
 const refired=await trainingReminders(token,slug,new Date('2026-11-16T00:00:00Z'),deps);
 assert.equal(refired.created,1);
 assert.equal(session.id.length,36);
});

test('export CSV: avance y asistencia con encabezados reales; tipo desconocido 404',async()=>{
 const {deps}=setup();
 const {course,employee,learning,cert,enrollment}=await fullSetup(deps);
 const session=(await createSession(token,slug,sessionInput(course.id),deps)).session;
 await markAttendance(token,slug,{sessionId:session.id,employeeId:employee.id,status:'presente'},deps);
 await submitAttempt(token,slug,course.id,cert.id,{enrollmentId:enrollment.id,answers:{q1:0,q2:1}},deps);
 await evaluate(token,slug,{enrollmentId:enrollment.id},deps);
 const progress=await exportCsv(token,slug,'progress',deps);
 assert.equal(progress.filename,'hubie-capacitacion-avance.csv');
 assert.match(progress.csv,/Empleado,Curso,Estatus inscripción,Módulos completados,Módulos totales,Avance %,Calificación,Aprobado/);
 assert.match(progress.csv,/María López,Seguridad en almacén,en curso,1,2,50,100,Sí/);
 const attendance=await exportCsv(token,slug,'attendance',deps);
 assert.equal(attendance.filename,'hubie-capacitacion-asistencia.csv');
 assert.match(attendance.csv,/Sesión,Curso,Empleado,Asistencia/);
 assert.match(attendance.csv,/Seguridad en almacén,María López,presente/);
 await assert.rejects(()=>exportCsv(token,slug,'otro',deps),/Not found/);
});

test('scope por tenant: un tenant no ve cursos, empleados ni constancias de otro',async()=>{
 const {deps}=setup();
 const {course,employee,cert,enrollment}=await fullSetup(deps);
 assert.equal((await listCourses(token,otherSlug,{},deps)).courses.length,0);
 assert.equal((await listEmployees(token,otherSlug,deps)).employees.length,0);
 assert.equal((await listEnrollments(token,otherSlug,{},deps)).enrollments.length,0);
 assert.equal((await listCertificates(token,otherSlug,{},deps)).certificates.length,0);
 const dash=await dashboard(token,otherSlug,deps);
 assert.deepEqual(dash.kpis,{employeesInTraining:0,globalProgress:null,activeCourses:0,totalEmployees:0,activeEnrollments:0,certificatesIssued:0,upcomingSessions:0});
 await assert.rejects(()=>updateCourse(token,otherSlug,course.id,{name:'Robo'},deps),/Not found/);
 await assert.rejects(()=>getProgress(token,otherSlug,enrollment.id,deps),/Not found/);
 await assert.rejects(()=>submitAttempt(token,otherSlug,course.id,cert.id,{enrollmentId:enrollment.id,answers:{q1:0,q2:1}},deps),/Not found/);
});

test('historiales: empleado y curso con avance, evaluación, constancias y asistencia',async()=>{
 const {deps}=setup();
 const {course,employee,learning,cert,enrollment}=await fullSetup(deps);
 const session=(await createSession(token,slug,sessionInput(course.id),deps)).session;
 await markAttendance(token,slug,{sessionId:session.id,employeeId:employee.id,status:'presente'},deps);
 await completeModule(token,slug,course.id,learning.id,{enrollmentId:enrollment.id},deps);
 await submitAttempt(token,slug,course.id,cert.id,{enrollmentId:enrollment.id,answers:{q1:0,q2:1}},deps);
 await evaluate(token,slug,{enrollmentId:enrollment.id},deps);
 await issueCertificate(token,slug,{enrollmentId:enrollment.id},deps);
 const empHistory=await employeeHistory(token,slug,employee.id,deps);
 assert.equal(empHistory.employee.name,'María López');
 assert.equal(empHistory.enrollments.length,1);
 assert.equal(empHistory.enrollments[0].progress.percent,100);
 assert.equal(empHistory.enrollments[0].evaluation.score,100);
 assert.equal(empHistory.enrollments[0].certificates,1);
 assert.equal(empHistory.enrollments[0].sessionsAttended,1);
 const courseHistoryData=await courseHistory(token,slug,course.id,deps);
 assert.equal(courseHistoryData.sessions.length,1);
 assert.equal(courseHistoryData.sessions[0].attendance,1);
 assert.equal(courseHistoryData.sessions[0].present,1);
 assert.equal(courseHistoryData.enrollments[0].certificates,1);
 assert.equal(courseHistoryData.modules.length,2);
 assert.equal(courseHistoryData.certificatesIssued,1);
});
