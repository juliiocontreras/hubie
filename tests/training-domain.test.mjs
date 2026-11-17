import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCourse,normalizeSession,normalizeEmployee,normalizeEnrollment,normalizeAttendance,
 normalizeProgress,normalizeEvaluation,normalizeModule,normalizeQuizConfig,normalizeQuizAnswers,
 scoreQuiz,publicQuizQuestions,progressPercent,isApproved,certificateFolio,generateCertificateFolio,
 DEFAULT_MIN_SCORE} from '../platform/training-domain.mjs';

const uuid='11111111-1111-4111-8111-111111111111';
const uuid2='22222222-2222-4222-8222-222222222222';
const course=()=>({name:'Seguridad en almacén',description:'Curso base',durationHours:8,modality:'presencial',
 instructor:'Ana Ruiz',materials:'Manual',validUntil:'2027-06-30',status:'activo',minScore:80,category:'Seguridad'});

test('curso: normaliza con defaults y categoría libre, rechaza inválidos',()=>{
 const clean=normalizeCourse({name:'  Inducción  '});
 assert.equal(clean.name,'Inducción');
 assert.equal(clean.modality,'en línea');
 assert.equal(clean.status,'borrador');
 assert.equal(clean.minScore,DEFAULT_MIN_SCORE);
 assert.equal(clean.minScore,70);
 assert.equal(clean.durationHours,0);
 assert.equal(clean.validUntil,null);
 assert.equal(clean.category,'');
 const full=normalizeCourse(course());
 assert.equal(full.minScore,80);
 assert.equal(full.category,'Seguridad');
 assert.equal(full.validUntil,'2027-06-30');
 assert.throws(()=>normalizeCourse({name:'Abc'}),/Invalid value/);
 assert.throws(()=>normalizeCourse({name:'Curso válido',modality:'virtual'}),/Invalid course/);
 assert.throws(()=>normalizeCourse({name:'Curso válido',status:'publicado'}),/Invalid course/);
 assert.throws(()=>normalizeCourse({name:'Curso válido',minScore:101}),/Invalid value/);
 assert.throws(()=>normalizeCourse({name:'Curso válido',minScore:-1}),/Invalid value/);
 assert.throws(()=>normalizeCourse({name:'Curso válido',durationHours:-1}),/Invalid course/);
 assert.throws(()=>normalizeCourse({name:'Curso válido',durationHours:10001}),/Invalid course/);
 assert.throws(()=>normalizeCourse({name:'Curso válido',validUntil:'30/06/2027'}),/Invalid value/);
 assert.throws(()=>normalizeCourse({name:'Curso válido',category:'x'.repeat(81)}),/Invalid value/);
 assert.throws(()=>normalizeCourse({name:'Curso válido',extra:1}),/Invalid course/);
 // La categoría es texto libre: no hay enum cerrado que rechace valores nuevos.
 assert.equal(normalizeCourse({name:'Curso válido',category:'NOM-035'}).category,'NOM-035');
});

test('sesión: exige curso, rango de fechas válido y capacidad',()=>{
 const clean=normalizeSession({courseId:uuid,startsAt:'2026-11-20T09:00:00Z',endsAt:'2026-11-20T12:00:00Z',capacity:25});
 assert.equal(clean.courseId,uuid);
 assert.equal(clean.placeOrLink,'');
 assert.equal(clean.instructor,'');
 assert.throws(()=>normalizeSession({courseId:'no-uuid',startsAt:'2026-11-20T09:00:00Z',endsAt:'2026-11-20T12:00:00Z',capacity:25}),/Invalid session/);
 assert.throws(()=>normalizeSession({courseId:uuid,startsAt:'2026-11-20T12:00:00Z',endsAt:'2026-11-20T12:00:00Z',capacity:25}),/Invalid session/);
 assert.throws(()=>normalizeSession({courseId:uuid,startsAt:'2026-11-20T13:00:00Z',endsAt:'2026-11-20T12:00:00Z',capacity:25}),/Invalid session/);
 assert.throws(()=>normalizeSession({courseId:uuid,startsAt:'no-fecha',endsAt:'2026-11-20T12:00:00Z',capacity:25}),/Invalid value/);
 assert.throws(()=>normalizeSession({courseId:uuid,startsAt:'2026-11-20T09:00:00Z',endsAt:'2026-11-20T12:00:00Z',capacity:0}),/Invalid session/);
 assert.throws(()=>normalizeSession({courseId:uuid,startsAt:'2026-11-20T09:00:00Z',endsAt:'2026-11-20T12:00:00Z',capacity:10001}),/Invalid session/);
});

test('empleado: normaliza correo a minúsculas y rechaza correo inválido',()=>{
 const clean=normalizeEmployee({name:'María López',email:'  MARIA@Empresa.MX ',position:'Operaria',area:'Almacén'});
 assert.equal(clean.email,'maria@empresa.mx');
 assert.equal(clean.name,'María López');
 assert.throws(()=>normalizeEmployee({name:'A',email:'a@b.mx'}),/Invalid value/);
 assert.throws(()=>normalizeEmployee({name:'Ana',email:'sin-arroba'}),/Invalid employee/);
 assert.throws(()=>normalizeEmployee({name:'Ana',email:'a@b'}),/Invalid employee/);
 assert.throws(()=>normalizeEmployee({name:'Ana'}),/Invalid employee/);
 assert.throws(()=>normalizeEmployee({name:'Ana',email:'a@b.mx',area:'x'.repeat(121)}),/Invalid value/);
});

test('inscripción y asistencia: ids UUID y estados cerrados',()=>{
 const clean=normalizeEnrollment({employeeId:uuid,courseId:uuid2,sessionId:uuid});
 assert.equal(clean.sessionId,uuid);
 assert.equal(normalizeEnrollment({employeeId:uuid,courseId:uuid2}).sessionId,null);
 assert.throws(()=>normalizeEnrollment({employeeId:uuid,courseId:'x'}),/Invalid enrollment/);
 assert.throws(()=>normalizeEnrollment({employeeId:uuid,courseId:uuid2,sessionId:uuid,status:'x'}),/Invalid enrollment/);
 const att=normalizeAttendance({sessionId:uuid,employeeId:uuid2,status:'justificado'});
 assert.equal(att.status,'justificado');
 assert.throws(()=>normalizeAttendance({sessionId:uuid,employeeId:uuid2,status:'tarde'}),/Invalid attendance/);
});

test('avance: porcentaje derivado y límites',()=>{
 assert.equal(progressPercent(0,0),0);
 assert.equal(progressPercent(1,2),50);
 assert.equal(progressPercent(2,3),67);
 assert.equal(progressPercent(3,3),100);
 assert.equal(progressPercent(5,3),100);
 assert.equal(progressPercent(-1,3),0);
 const clean=normalizeProgress({enrollmentId:uuid,completedModules:2,totalModules:4});
 assert.deepEqual(clean,{enrollmentId:uuid,completedModules:2,totalModules:4,percent:50});
 assert.throws(()=>normalizeProgress({enrollmentId:uuid,completedModules:5,totalModules:4}),/Invalid progress/);
 assert.throws(()=>normalizeProgress({enrollmentId:uuid,completedModules:-1,totalModules:4}),/Invalid progress/);
});

test('evaluación: puntaje manual opcional; null significa derivar de quizzes',()=>{
 assert.deepEqual(normalizeEvaluation({enrollmentId:uuid,score:85}),{enrollmentId:uuid,score:85});
 assert.deepEqual(normalizeEvaluation({enrollmentId:uuid}),{enrollmentId:uuid,score:null});
 assert.throws(()=>normalizeEvaluation({enrollmentId:uuid,score:101}),/Invalid evaluation/);
 assert.throws(()=>normalizeEvaluation({enrollmentId:uuid,score:8.5}),/Invalid evaluation/);
});

test('isApproved: aprueba con la nota mínima del curso',()=>{
 assert.equal(isApproved(70,70),true);
 assert.equal(isApproved(69,70),false);
 assert.equal(isApproved(100,80),true);
 assert.equal(isApproved(null,70),false);
 assert.equal(isApproved(undefined,70),false);
});

test('módulo: tipo learning por defecto, título y posición validados',()=>{
 const clean=normalizeModule({title:'Introducción'});
 assert.equal(clean.type,'learning');
 assert.equal(clean.status,'borrador');
 assert.equal(clean.position,0);
 assert.equal(normalizeModule({type:'certification',title:'Examen final',position:3}).type,'certification');
 assert.throws(()=>normalizeModule({title:'X'}),/Invalid value/);
 assert.throws(()=>normalizeModule({type:'video',title:'Intro'}),/Invalid module/);
 assert.throws(()=>normalizeModule({title:'Intro',position:-1}),/Invalid module/);
 assert.throws(()=>normalizeModule({title:'Intro',status:'publicado'}),/Invalid module/);
});

const quiz=()=>({passingScore:80,maxAttempts:2,questions:[
 {id:'q1',text:'¿Qué es un EPP?',options:['Equipo de protección','Una máquina','Un turno'],correctIndex:0,points:2},
 {id:'q2',text:'¿Cada cuánto se revisa?',options:['Nunca','Cada mes'],correctIndex:1,points:1}]});

test('quiz: normaliza preguntas, ids únicos y puntos por defecto',()=>{
 const clean=normalizeQuizConfig(quiz());
 assert.equal(clean.questions.length,2);
 assert.equal(clean.questions[0].points,2);
 assert.equal(clean.passingScore,80);
 assert.equal(clean.maxAttempts,2);
 const defaults=normalizeQuizConfig({questions:[{text:'¿P?',options:['Sí','No'],correctIndex:0}]});
 assert.equal(defaults.questions[0].id,'q1');
 assert.equal(defaults.questions[0].points,1);
 assert.equal(defaults.passingScore,null);
 assert.equal(defaults.maxAttempts,null);
 assert.throws(()=>normalizeQuizConfig({questions:[]}),/Invalid quiz/);
 assert.throws(()=>normalizeQuizConfig({questions:[{text:'¿P?',options:['Solo una'],correctIndex:0}]}),/Invalid quiz/);
 assert.throws(()=>normalizeQuizConfig({questions:[{text:'¿P?',options:['Sí','No'],correctIndex:2}]}),/Invalid quiz/);
 assert.throws(()=>normalizeQuizConfig({passingScore:101,questions:[{text:'¿P?',options:['Sí','No'],correctIndex:0}]}),/Invalid quiz/);
 assert.throws(()=>normalizeQuizConfig({maxAttempts:0,questions:[{text:'¿P?',options:['Sí','No'],correctIndex:0}]}),/Invalid quiz/);
 assert.throws(()=>normalizeQuizConfig({maxAttempts:21,questions:[{text:'¿P?',options:['Sí','No'],correctIndex:0}]}),/Invalid quiz/);
 assert.throws(()=>normalizeQuizConfig({questions:[
  {id:'q1',text:'¿P1?',options:['Sí','No'],correctIndex:0},
  {id:'q1',text:'¿P2?',options:['Sí','No'],correctIndex:0}]}),/Invalid quiz/);
 assert.throws(()=>normalizeQuizConfig({questions:[{id:'Q1',text:'¿P?',options:['Sí','No'],correctIndex:0}]}),/Invalid quiz/);
});

test('respuestas: solo ids del quiz, índices dentro de rango, sin responder vale error',()=>{
 const q=normalizeQuizConfig(quiz());
 assert.deepEqual(normalizeQuizAnswers(q,{q1:0}),{q1:0});
 assert.deepEqual(normalizeQuizAnswers(q,{}),{});
 assert.deepEqual(normalizeQuizAnswers(q,{q1:0,q2:1}),{q1:0,q2:1});
 assert.throws(()=>normalizeQuizAnswers(q,{q3:0}),/Invalid attempt/);
 assert.throws(()=>normalizeQuizAnswers(q,{q1:3}),/Invalid attempt/);
 assert.throws(()=>normalizeQuizAnswers(q,{q1:-1}),/Invalid attempt/);
 assert.throws(()=>normalizeQuizAnswers(q,{q1:0.5}),/Invalid attempt/);
});

test('scoreQuiz: puntaje por puntos, aprobado/reprobado y nota mínima del curso',()=>{
 const q=normalizeQuizConfig(quiz());
 const all=scoreQuiz(q,{q1:0,q2:1});
 assert.deepEqual(all,{score:100,passed:true,earnedPoints:3,totalPoints:3,correctCount:2,totalQuestions:2,answeredCount:2});
 const partial=scoreQuiz(q,{q1:0,q2:0});
 assert.equal(partial.score,67);
 assert.equal(partial.passed,false);
 assert.equal(partial.correctCount,1);
 const none=scoreQuiz(q,{});
 assert.equal(none.score,0);
 assert.equal(none.passed,false);
 // Sin passingScore en el quiz, usa la nota mínima del curso.
 const noPass=normalizeQuizConfig({questions:[{text:'¿P?',options:['Sí','No'],correctIndex:0}]});
 assert.equal(scoreQuiz(noPass,{q1:0},70).passed,true);
 assert.equal(scoreQuiz(noPass,{},70).passed,false);
 // publicQuizQuestions nunca expone el índice correcto.
 const pub=publicQuizQuestions(q);
 assert.equal(pub[0].correctIndex,undefined);
 assert.deepEqual(pub[0].options,['Equipo de protección','Una máquina','Un turno']);
 assert.equal(pub[0].points,2);
});

test('folio: formato CAP-AAAA-XXXXXX sin caracteres confusos 0/O/1/I',()=>{
 assert.equal(certificateFolio(2026,'ABCDEF'),'CAP-2026-ABCDEF');
 assert.match(generateCertificateFolio(new Date('2026-11-16T00:00:00Z')),/^CAP-2026-[A-HJ-NP-Z2-9]{6}$/);
 for(let i=0;i<50;i++){
  const folio=generateCertificateFolio();
  assert.match(folio,/^CAP-\d{4}-[A-HJ-NP-Z2-9]{6}$/,folio);
  assert.ok(!/[01IO]/.test(folio.split('-')[2]),folio);
 }
 assert.throws(()=>certificateFolio(2026,'ABCDE0'),/Invalid certificate/);
 assert.throws(()=>certificateFolio(2026,'ABCDEO'),/Invalid certificate/);
 assert.throws(()=>certificateFolio(2026,'ABCDE1'),/Invalid certificate/);
 assert.throws(()=>certificateFolio(2026,'ABCDEI'),/Invalid certificate/);
 assert.throws(()=>certificateFolio(2026,'ABCDE'),/Invalid certificate/);
 assert.throws(()=>certificateFolio(2026,'ABCDEFG'),/Invalid certificate/);
 assert.throws(()=>certificateFolio(1999,'ABCDEF'),/Invalid certificate/);
 assert.throws(()=>certificateFolio(2101,'ABCDEF'),/Invalid certificate/);
});
