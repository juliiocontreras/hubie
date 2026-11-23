// Base falsa en memoria para los tests de T022 Capacitaciones. Implementa
// solo las sentencias de platform/training-store.mjs (y el dedupe de
// platform/notifications.mjs: createNotification) con la misma forma de
// resultado que database.mjs ({rows: [[{value}...]], affected_row_count}).
// Dos tenants ('demo' y 'demo-b') para verificar el scope por tenant.
const cells=values=>values.map(value=>({value:value??null}));
const ok=(rows=[],affected=0)=>({rows:rows.map(cells),affected_row_count:affected,rowsAffected:affected});

export function createTrainingFakeDb(seed={}){
 const orgA=seed.orgA||'11111111-1111-4111-8111-111111111111';
 const orgB=seed.orgB||'22222222-2222-4222-8222-222222222222';
 const ownerId=seed.ownerId||'33333333-3333-4333-8333-333333333333';
 // Usuarios del tenant para probar visibilidad por rol (S1): el dueño, un
 // viewer y un miembro cuyo correo coincide con un empleado.
 const viewerId=seed.viewerId||'44444444-4444-4444-8444-444444444444';
 const memberId=seed.memberId||'55555555-5555-4555-8555-555555555555';
 const users=[
  {id:ownerId,email:'owner@demo.test'},
  {id:viewerId,email:'viewer@demo.test'},
  {id:memberId,email:'member@demo.test'}
 ];
 let tick=0;
 const now=()=>new Date(Date.parse('2026-11-16T00:00:00.000Z')+(++tick)*1000).toISOString();
 const tables={
  courses:[],sessions:[],employees:[],enrollments:[],attendance:[],progress:[],
  evaluations:[],certificates:[],modules:[],completions:[],attempts:[],notifications:[]
 };
 const courseById=(org,id)=>tables.courses.find(c=>c.organization_id===org&&c.id===id);
 const sessionById=(org,id)=>tables.sessions.find(s=>s.organization_id===org&&s.id===id);
 const employeeById=(org,id)=>tables.employees.find(e=>e.organization_id===org&&e.id===id);
 const enrollmentById=(org,id)=>tables.enrollments.find(n=>n.organization_id===org&&n.id===id);
 const moduleById=(org,id)=>tables.modules.find(m=>m.organization_id===org&&m.id===id);
 const progressByEnrollment=(org,enrollmentId)=>tables.progress.find(p=>p.organization_id===org&&p.enrollment_id===enrollmentId);
 const evaluationByEnrollment=(org,enrollmentId)=>tables.evaluations.find(v=>v.organization_id===org&&v.enrollment_id===enrollmentId);
 const activeModules=(org,courseId)=>tables.modules.filter(m=>m.organization_id===org&&m.course_id===courseId&&m.status!=='archivado');
 const courseView=c=>[c.id,c.name,c.description,c.duration_hours,c.modality,c.instructor,c.materials,c.valid_until,c.status,c.min_score,c.category,c.created_at,c.updated_at];
 const sessionView=s=>[s.id,s.course_id,s.starts_at,s.ends_at,s.place_or_link,s.capacity,s.instructor,s.created_at,s.updated_at];
 const employeeView=e=>[e.id,e.name,e.email,e.position,e.area,e.created_at,e.updated_at];
 const enrollmentView=n=>[n.id,n.employee_id,n.course_id,n.session_id,n.status,n.created_at,n.updated_at];
 const moduleView=m=>[m.id,m.course_id,m.type,m.title,m.description,m.content,m.position,m.status,m.quiz_config_json,m.created_at,m.updated_at];
 const byCreatedDesc=(a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id);

 async function executeSql(sql,args=[]){
  const s=sql.replace(/\s+/g,' ');
  // --- notificaciones (dedupe de createNotification) ---
  if(s.startsWith('INSERT INTO tenant_notifications')){
   const [org,id,userId,type,title,body,link]=args;
   const dup=tables.notifications.some(n=>n.organization_id===org&&n.type===type&&n.link===link&&n.read_at===null&&
    ((userId===null||userId===undefined)&&n.user_id===null||n.user_id===userId));
   if(dup)return ok([],0);
   tables.notifications.push({organization_id:org,id,user_id:userId??null,type,title,body,link,read_at:null,created_at:now()});
   return ok([],1);
  }
  // --- lecturas por id ---
  if(s.startsWith('SELECT email FROM users WHERE id=?')){
   const u=users.find(x=>x.id===args[0]);return ok(u?[[u.email]]:[]);
  }
  if(s.startsWith('SELECT id FROM tenant_training_employees WHERE organization_id=? AND email=?')){
   const e=tables.employees.find(x=>x.organization_id===args[0]&&x.email===args[1]);return ok(e?[[e.id]]:[]);
  }
  if(s.startsWith('SELECT id,name,description,duration_hours,modality,instructor,materials,valid_until,status,min_score,category,created_at,updated_at FROM tenant_training_courses WHERE')){
   const c=courseById(args[0],args[1]);return ok(c?[courseView(c)]:[]);
  }
  if(s.startsWith('SELECT id,course_id,starts_at,ends_at,place_or_link,capacity,instructor,created_at,updated_at FROM tenant_training_sessions WHERE')){
   const x=sessionById(args[0],args[1]);return ok(x?[sessionView(x)]:[]);
  }
  if(s.startsWith('SELECT id,name,email,position,area,created_at,updated_at FROM tenant_training_employees WHERE')){
   const e=employeeById(args[0],args[1]);return ok(e?[employeeView(e)]:[]);
  }
  if(s.startsWith('SELECT id,employee_id,course_id,session_id,status,created_at,updated_at FROM tenant_training_enrollments WHERE')){
   const n=enrollmentById(args[0],args[1]);return ok(n?[enrollmentView(n)]:[]);
  }
  if(s.startsWith('SELECT id,course_id,type,title,description,content,position,status,quiz_config_json,created_at,updated_at FROM tenant_training_modules WHERE organization_id=? AND course_id=? AND id=?')){
   const m=moduleById(args[0],args[2]);return ok(m&&m.course_id===args[1]?[moduleView(m)]:[]);
  }
  if(s.startsWith('SELECT id,course_id,type,title,description,content,position,status,quiz_config_json,created_at,updated_at FROM tenant_training_modules WHERE organization_id=? AND course_id=?')){
   let list=tables.modules.filter(m=>m.organization_id===args[0]&&m.course_id===args[1]);
   if(s.includes("status!='archivado'"))list=list.filter(m=>m.status!=='archivado');
   list=[...list].sort((a,b)=>a.position-b.position||a.created_at.localeCompare(b.created_at));
   return ok(list.map(moduleView));
  }
  // --- avance derivado ---
  if(s.startsWith("SELECT COUNT(*) FROM tenant_training_modules WHERE organization_id=? AND course_id=? AND status!='archivado'"))
   return ok([[activeModules(args[0],args[1]).length]]);
  if(s.startsWith('SELECT COUNT(*) FROM tenant_training_module_completions c')){
   const done=tables.completions.filter(c=>c.organization_id===args[0]&&c.enrollment_id===args[1]&&
    tables.modules.some(m=>m.organization_id===c.organization_id&&m.id===c.module_id&&m.status!=='archivado'));
   return ok([[done.length]]);
  }
  if(s.startsWith('UPDATE tenant_training_progress SET completed_modules')){
   const p=progressByEnrollment(args[3],args[4]);
   if(p){p.completed_modules=args[0];p.total_modules=args[1];p.percent=args[2];p.updated_at=now();}
   return ok([],p?1:0);
  }
  if(s.startsWith('INSERT INTO tenant_training_progress(organization_id,id,enrollment_id,completed_modules,total_modules,percent) SELECT')){
   if(progressByEnrollment(args[0],args[2]))return ok([],0);
   tables.progress.push({organization_id:args[0],id:args[1],enrollment_id:args[2],completed_modules:args[3],total_modules:args[4],percent:args[5],updated_at:now()});
   return ok([],1);
  }
  if(s.startsWith('SELECT completed_modules,total_modules,percent,updated_at FROM tenant_training_progress WHERE')){
   const p=progressByEnrollment(args[0],args[1]);
   return ok(p?[[p.completed_modules,p.total_modules,p.percent,p.updated_at]]:[]);
  }
  if(s.startsWith('SELECT id,score,passed,evaluated_at FROM tenant_training_evaluations WHERE')){
   const v=evaluationByEnrollment(args[0],args[1]);
   return ok(v?[[v.id,v.score,v.passed,v.evaluated_at]]:[]);
  }
  if(s.startsWith('SELECT MAX(score) FROM tenant_training_quiz_attempts WHERE')){
   const scores=tables.attempts.filter(a=>a.organization_id===args[0]&&a.enrollment_id===args[1]&&a.module_id===args[2]).map(a=>a.score);
   return ok([[scores.length?Math.max(...scores):null]]);
  }
  if(s.startsWith('SELECT 1 FROM tenant_training_quiz_attempts WHERE')){
   const found=tables.attempts.some(a=>a.organization_id===args[0]&&a.enrollment_id===args[1]&&a.module_id===args[2]&&a.passed===1);
   return ok(found?[[1]]:[]);
  }
  if(s.startsWith('SELECT module_id FROM tenant_training_module_completions WHERE'))
   return ok(tables.completions.filter(c=>c.organization_id===args[0]&&c.enrollment_id===args[1]).map(c=>[c.module_id]));
  // --- recordatorios ---
  if(s.startsWith("SELECT id,name,valid_until,status FROM tenant_training_courses WHERE organization_id=? AND status='activo'"))
   return ok(tables.courses.filter(c=>c.organization_id===args[0]&&c.status==='activo'&&c.valid_until!==null&&c.valid_until<=args[1]).map(c=>[c.id,c.name,c.valid_until,c.status]));
  if(s.startsWith('SELECT s.id,s.starts_at,s.place_or_link,c.name FROM tenant_training_sessions s JOIN tenant_training_courses c'))
   return ok(tables.sessions.filter(x=>x.organization_id===args[0]&&x.starts_at>=args[1]&&x.starts_at<=args[2])
    .map(x=>[x.id,x.starts_at,x.place_or_link,courseById(args[0],x.course_id)?.name||null]));
  // --- cursos ---
  if(s.startsWith('SELECT c.id,c.name,c.description,c.duration_hours,c.modality,c.instructor,c.materials,c.valid_until,c.status,c.min_score,c.category,c.created_at,c.updated_at,')){
   let list=tables.courses.filter(c=>c.organization_id===args[0]);
   if(args[1]!==undefined)list=list.filter(c=>c.status===args[1]);
   list=[...list].sort(byCreatedDesc);
   return ok(list.map(c=>[...courseView(c),
    tables.sessions.filter(x=>x.organization_id===c.organization_id&&x.course_id===c.id).length,
    tables.enrollments.filter(n=>n.organization_id===c.organization_id&&n.course_id===c.id&&n.status!=='cancelado').length,
    tables.modules.filter(m=>m.organization_id===c.organization_id&&m.course_id===c.id&&m.status!=='archivado').length]));
  }
  if(s.startsWith('INSERT INTO tenant_training_courses(')){
   tables.courses.push({organization_id:args[0],id:args[1],name:args[2],description:args[3],duration_hours:args[4],
    modality:args[5],instructor:args[6],materials:args[7],valid_until:args[8],status:args[9],min_score:args[10],
    category:args[11],created_by:args[12],created_at:now(),updated_at:now()});
   return ok([],1);
  }
  if(s.startsWith('UPDATE tenant_training_courses SET name=')){
   const c=courseById(args[10],args[11]);
   if(c)Object.assign(c,{name:args[0],description:args[1],duration_hours:args[2],modality:args[3],instructor:args[4],
    materials:args[5],valid_until:args[6],status:args[7],min_score:args[8],category:args[9],updated_at:now()});
   return ok([],c?1:0);
  }
  if(s.startsWith("UPDATE tenant_training_courses SET status=")){
   const c=courseById(args[1],args[2]);
   if(c){c.status=args[0];c.updated_at=now();}
   return ok([],c?1:0);
  }
  // --- sesiones ---
  if(s.startsWith('SELECT s.id,s.course_id,s.starts_at,s.ends_at,s.place_or_link,s.capacity,s.instructor,s.created_at,c.name,')){
   let list=tables.sessions.filter(x=>x.organization_id===args[0]);
   if(args[1]!==undefined)list=list.filter(x=>x.course_id===args[1]);
   list=[...list].sort((a,b)=>b.starts_at.localeCompare(a.starts_at));
   return ok(list.map(x=>[...sessionView(x).slice(0,8),courseById(args[0],x.course_id)?.name||null,
    tables.attendance.filter(a=>a.organization_id===x.organization_id&&a.session_id===x.id).length]));
  }
  if(s.startsWith('INSERT INTO tenant_training_sessions(')){
   tables.sessions.push({organization_id:args[0],id:args[1],course_id:args[2],starts_at:args[3],ends_at:args[4],
    place_or_link:args[5],capacity:args[6],instructor:args[7],created_by:args[8],created_at:now(),updated_at:now()});
   return ok([],1);
  }
  if(s.startsWith('UPDATE tenant_training_sessions SET starts_at=')){
   const x=sessionById(args[5],args[6]);
   if(x)Object.assign(x,{starts_at:args[0],ends_at:args[1],place_or_link:args[2],capacity:args[3],instructor:args[4],updated_at:now()});
   return ok([],x?1:0);
  }
  // --- empleados ---
  if(s.startsWith('SELECT e.id,e.name,e.email,e.position,e.area,e.created_at,')){
   const list=[...tables.employees.filter(e=>e.organization_id===args[0])].sort((a,b)=>a.name.localeCompare(b.name));
   return ok(list.map(e=>[...employeeView(e).slice(0,6),
    tables.enrollments.filter(n=>n.organization_id===e.organization_id&&n.employee_id===e.id&&n.status!=='cancelado').length]));
  }
  if(s.startsWith('INSERT INTO tenant_training_employees(')){
   if(tables.employees.some(e=>e.organization_id===args[0]&&e.email===args[3]))throw Error('UNIQUE constraint failed: tenant_training_employees.email');
   tables.employees.push({organization_id:args[0],id:args[1],name:args[2],email:args[3],position:args[4],area:args[5],created_by:args[6],created_at:now(),updated_at:now()});
   return ok([],1);
  }
  if(s.startsWith('UPDATE tenant_training_employees SET name=')){
   const e=employeeById(args[4],args[5]);
   if(e){
    if(tables.employees.some(x=>x.organization_id===args[4]&&x.id!==args[5]&&x.email===args[1]))throw Error('UNIQUE constraint failed: tenant_training_employees.email');
    Object.assign(e,{name:args[0],email:args[1],position:args[2],area:args[3],updated_at:now()});
   }
   return ok([],e?1:0);
  }
  // --- inscripciones ---
  if(s.startsWith('SELECT n.id,n.employee_id,n.course_id,n.session_id,n.status,n.created_at,e.name,c.name,p.percent FROM tenant_training_enrollments n')){
   let list=tables.enrollments.filter(n=>n.organization_id===args[0]),i=1;
   if(s.includes('n.course_id=?')){const v=args[i++];list=list.filter(n=>n.course_id===v);}
   if(s.includes('n.employee_id=?')){const v=args[i++];list=list.filter(n=>n.employee_id===v);}
   if(s.includes('n.status=?')){const v=args[i++];list=list.filter(n=>n.status===v);}
   list=[...list].sort(byCreatedDesc);
   return ok(list.map(n=>[n.id,n.employee_id,n.course_id,n.session_id,n.status,n.created_at,
    employeeById(args[0],n.employee_id)?.name||null,courseById(args[0],n.course_id)?.name||null,
    progressByEnrollment(args[0],n.id)?.percent??null]));
  }
  if(s.startsWith("SELECT id FROM tenant_training_enrollments WHERE organization_id=? AND employee_id=? AND course_id=? AND status IN")){
   const found=tables.enrollments.find(n=>n.organization_id===args[0]&&n.employee_id===args[1]&&n.course_id===args[2]&&['inscrito','en curso','completado'].includes(n.status));
   return ok(found?[[found.id]]:[]);
  }
  if(s.startsWith('INSERT INTO tenant_training_enrollments(organization_id,id,employee_id,course_id,session_id,created_by) SELECT')){
   // Inserción condicional (S2): solo inserta si no hay inscripción activa.
   const dup=tables.enrollments.some(n=>n.organization_id===args[0]&&n.employee_id===args[2]&&n.course_id===args[3]&&['inscrito','en curso','completado'].includes(n.status));
   if(dup)return ok([],0);
   tables.enrollments.push({organization_id:args[0],id:args[1],employee_id:args[2],course_id:args[3],session_id:args[4],status:'inscrito',created_by:args[5],created_at:now(),updated_at:now()});
   return ok([],1);
  }
  if(s.startsWith('INSERT INTO tenant_training_progress(organization_id,id,enrollment_id,completed_modules,total_modules,percent) VALUES')){
   tables.progress.push({organization_id:args[0],id:args[1],enrollment_id:args[2],completed_modules:args[3],total_modules:args[4],percent:args[5],updated_at:now()});
   return ok([],1);
  }
  if(s.startsWith("UPDATE tenant_training_enrollments SET status='cancelado'")){
   const n=enrollmentById(args[0],args[1]);
   const changedRow=n&&n.status!=='cancelado';
   if(changedRow){n.status='cancelado';n.updated_at=now();}
   return ok([],changedRow?1:0);
  }
  if(s.startsWith('UPDATE tenant_training_enrollments SET status=?')){
   const n=enrollmentById(args[1],args[2]);
   if(n){n.status=args[0];n.updated_at=now();}
   return ok([],n?1:0);
  }
  if(s.startsWith("UPDATE tenant_training_enrollments SET status='en curso'")){
   const n=enrollmentById(args[0],args[1]);
   if(n){n.status='en curso';n.updated_at=now();}
   return ok([],n?1:0);
  }
  // --- asistencia ---
  if(s.startsWith("SELECT id FROM tenant_training_enrollments WHERE organization_id=? AND employee_id=? AND course_id=? AND status!='cancelado'")){
   const found=tables.enrollments.find(n=>n.organization_id===args[0]&&n.employee_id===args[1]&&n.course_id===args[2]&&n.status!=='cancelado');
   return ok(found?[[found.id]]:[]);
  }
  if(s.startsWith('UPDATE tenant_training_attendance SET status=')){
   const a=tables.attendance.find(x=>x.organization_id===args[1]&&x.session_id===args[2]&&x.employee_id===args[3]);
   if(a){a.status=args[0];a.updated_at=now();}
   return ok([],a?1:0);
  }
  if(s.startsWith('INSERT INTO tenant_training_attendance(organization_id,id,session_id,employee_id,status,created_by) SELECT')){
   if(tables.attendance.some(a=>a.organization_id===args[0]&&a.session_id===args[2]&&a.employee_id===args[3]))return ok([],0);
   tables.attendance.push({organization_id:args[0],id:args[1],session_id:args[2],employee_id:args[3],status:args[4],created_by:args[5],created_at:now(),updated_at:now()});
   return ok([],1);
  }
  if(s.startsWith('SELECT id FROM tenant_training_attendance WHERE organization_id=? AND session_id=? AND employee_id=?')){
   const a=tables.attendance.find(x=>x.organization_id===args[0]&&x.session_id===args[1]&&x.employee_id===args[2]);
   return ok(a?[[a.id]]:[]);
  }
  if(s.startsWith('SELECT a.id,a.session_id,a.employee_id,a.status,a.created_at,e.name,s.starts_at,c.name FROM tenant_training_attendance a')){
   let list=tables.attendance.filter(a=>a.organization_id===args[0]),i=1;
   if(s.includes('a.session_id=?')){const v=args[i++];list=list.filter(a=>a.session_id===v);}
   if(s.includes('a.employee_id=?')){const v=args[i++];list=list.filter(a=>a.employee_id===v);}
   list=[...list].sort(byCreatedDesc);
   return ok(list.map(a=>[a.id,a.session_id,a.employee_id,a.status,a.created_at,
    employeeById(args[0],a.employee_id)?.name||null,sessionById(args[0],a.session_id)?.starts_at||null,
    courseById(args[0],sessionById(args[0],a.session_id)?.course_id)?.name||null]));
  }
  // --- módulos y quizzes ---
  if(s.startsWith('INSERT INTO tenant_training_modules(')){
   tables.modules.push({organization_id:args[0],id:args[1],course_id:args[2],type:args[3],title:args[4],description:args[5],
    content:args[6],position:args[7],status:args[8],quiz_config_json:null,created_by:args[9],created_at:now(),updated_at:now()});
   return ok([],1);
  }
  if(s.startsWith('UPDATE tenant_training_modules SET type=')){
   const m=moduleById(args[6],args[8]);
   if(m&&m.course_id===args[7])Object.assign(m,{type:args[0],title:args[1],description:args[2],content:args[3],position:args[4],status:args[5],updated_at:now()});
   return ok([],m&&m.course_id===args[7]?1:0);
  }
  if(s.startsWith('SELECT COUNT(*) FROM tenant_training_quiz_attempts WHERE organization_id=? AND module_id=? AND enrollment_id=?'))
   return ok([[tables.attempts.filter(a=>a.organization_id===args[0]&&a.module_id===args[1]&&a.enrollment_id===args[2]).length]]);
  if(s.startsWith('SELECT COUNT(*) FROM tenant_training_quiz_attempts WHERE organization_id=? AND module_id=?'))
   return ok([[tables.attempts.filter(a=>a.organization_id===args[0]&&a.module_id===args[1]).length]]);
  if(s.startsWith('DELETE FROM tenant_training_modules WHERE')){
   const idx=tables.modules.findIndex(m=>m.organization_id===args[0]&&m.course_id===args[1]&&m.id===args[2]);
   if(idx>=0)tables.modules.splice(idx,1);
   return ok([],idx>=0?1:0);
  }
  if(s.startsWith("SELECT id FROM tenant_training_enrollments WHERE organization_id=? AND course_id=? AND status!='cancelado'"))
   return ok(tables.enrollments.filter(n=>n.organization_id===args[0]&&n.course_id===args[1]&&n.status!=='cancelado').map(n=>[n.id]));
  if(s.startsWith('UPDATE tenant_training_modules SET quiz_config_json=')){
   const m=moduleById(args[1],args[3]);
   if(m&&m.course_id===args[2]){m.quiz_config_json=args[0];m.updated_at=now();}
   return ok([],m&&m.course_id===args[2]?1:0);
  }
  if(s.startsWith('INSERT INTO tenant_training_quiz_attempts(organization_id,id,module_id,employee_id,enrollment_id,answers_json,score,passed,attempt_number) SELECT')){
   // Inserción condicional (S2): solo inserta si los intentos hechos son
   // menos que maxAttempts (null = sin límite). args: 0-7 valores, 8-10
   // conteo, 11 maxAttempts, 12-14 conteo, 15 maxAttempts.
   const count=tables.attempts.filter(a=>a.organization_id===args[0]&&a.module_id===args[2]&&a.enrollment_id===args[4]).length;
   const max=args[11];
   if(max!==null&&max!==undefined&&count>=max)return ok([],0);
   tables.attempts.push({organization_id:args[0],id:args[1],module_id:args[2],employee_id:args[3],enrollment_id:args[4],
    answers_json:args[5],score:args[6],passed:args[7],attempt_number:count+1,created_at:now()});
   return ok([],1);
  }
  if(s.startsWith('SELECT attempt_number FROM tenant_training_quiz_attempts WHERE organization_id=? AND id=?')){
   const a=tables.attempts.find(x=>x.organization_id===args[0]&&x.id===args[1]);
   return ok(a?[[a.attempt_number]]:[]);
  }
  if(s.startsWith('INSERT INTO tenant_training_module_completions(organization_id,id,enrollment_id,module_id) SELECT')){
   if(tables.completions.some(c=>c.organization_id===args[0]&&c.enrollment_id===args[2]&&c.module_id===args[3]))return ok([],0);
   tables.completions.push({organization_id:args[0],id:args[1],enrollment_id:args[2],module_id:args[3],completed_at:now(),created_at:now()});
   return ok([],1);
  }
  if(s.startsWith('SELECT a.id,a.module_id,a.employee_id,a.enrollment_id,a.answers_json,a.score,a.passed,a.attempt_number,a.created_at,m.title,e.name FROM tenant_training_quiz_attempts a')){
   let list=tables.attempts.filter(a=>a.organization_id===args[0]),i=1;
   if(s.includes('a.module_id=?')){const v=args[i++];list=list.filter(a=>a.module_id===v);}
   if(s.includes('a.employee_id=?')){const v=args[i++];list=list.filter(a=>a.employee_id===v);}
   if(s.includes('a.enrollment_id=?')){const v=args[i++];list=list.filter(a=>a.enrollment_id===v);}
   list=[...list].sort(byCreatedDesc);
   return ok(list.map(a=>[a.id,a.module_id,a.employee_id,a.enrollment_id,a.answers_json,a.score,a.passed,a.attempt_number,a.created_at,
    moduleById(args[0],a.module_id)?.title||null,employeeById(args[0],a.employee_id)?.name||null]));
  }
  // --- evaluaciones ---
  if(s.startsWith('UPDATE tenant_training_evaluations SET score=')){
   const v=evaluationByEnrollment(args[2],args[3]);
   if(v){v.score=args[0];v.passed=args[1];v.evaluated_at=now();v.updated_at=now();}
   return ok([],v?1:0);
  }
  if(s.startsWith('INSERT INTO tenant_training_evaluations(')){
   tables.evaluations.push({organization_id:args[0],id:args[1],enrollment_id:args[2],employee_id:args[3],course_id:args[4],
    score:args[5],passed:args[6],created_by:args[7],evaluated_at:now(),created_at:now(),updated_at:now()});
   return ok([],1);
  }
  if(s.startsWith('SELECT v.id,v.enrollment_id,v.employee_id,v.course_id,v.score,v.passed,v.evaluated_at,e.name,c.name FROM tenant_training_evaluations v')){
   let list=tables.evaluations.filter(v=>v.organization_id===args[0]),i=1;
   if(s.includes('v.course_id=?')){const v=args[i++];list=list.filter(x=>x.course_id===v);}
   if(s.includes('v.employee_id=?')){const v=args[i++];list=list.filter(x=>x.employee_id===v);}
   list=[...list].sort((a,b)=>b.evaluated_at.localeCompare(a.evaluated_at));
   return ok(list.map(v=>[v.id,v.enrollment_id,v.employee_id,v.course_id,v.score,v.passed,v.evaluated_at,
    employeeById(args[0],v.employee_id)?.name||null,courseById(args[0],v.course_id)?.name||null]));
  }
  // --- constancias ---
  if(s.startsWith('SELECT id,folio,issued_at FROM tenant_training_certificates WHERE')){
   const c=tables.certificates.find(x=>x.organization_id===args[0]&&x.enrollment_id===args[1]);
   return ok(c?[[c.id,c.folio,c.issued_at]]:[]);
  }
  if(s.startsWith('INSERT INTO tenant_training_certificates(')){
   if(tables.certificates.some(x=>x.organization_id===args[0]&&x.folio===args[5]))throw Error('UNIQUE constraint failed: tenant_training_certificates.folio');
   tables.certificates.push({organization_id:args[0],id:args[1],employee_id:args[2],course_id:args[3],enrollment_id:args[4],
    folio:args[5],created_by:args[6],issued_at:now(),created_at:now()});
   return ok([],1);
  }
  if(s.startsWith('SELECT issued_at FROM tenant_training_certificates WHERE')){
   const c=tables.certificates.find(x=>x.organization_id===args[0]&&x.id===args[1]);
   return ok(c?[[c.issued_at]]:[]);
  }
  if(s.startsWith('SELECT t.id,t.employee_id,t.course_id,t.enrollment_id,t.folio,t.issued_at,e.name,c.name FROM tenant_training_certificates t')){
   let list=tables.certificates.filter(x=>x.organization_id===args[0]),i=1;
   if(s.includes('t.course_id=?')){const v=args[i++];list=list.filter(x=>x.course_id===v);}
   if(s.includes('t.employee_id=?')){const v=args[i++];list=list.filter(x=>x.employee_id===v);}
   list=[...list].sort((a,b)=>b.issued_at.localeCompare(a.issued_at));
   return ok(list.map(x=>[x.id,x.employee_id,x.course_id,x.enrollment_id,x.folio,x.issued_at,
    employeeById(args[0],x.employee_id)?.name||null,courseById(args[0],x.course_id)?.name||null]));
  }
  // --- tablero ---
  if(s.startsWith("SELECT COUNT(DISTINCT employee_id) FROM tenant_training_enrollments WHERE"))
   return ok([[new Set(tables.enrollments.filter(n=>n.organization_id===args[0]&&['inscrito','en curso'].includes(n.status)).map(n=>n.employee_id)).size]]);
  if(s.startsWith('SELECT AVG(p.percent) FROM tenant_training_progress p')){
   const percents=tables.enrollments.filter(n=>n.organization_id===args[0]&&['inscrito','en curso','completado'].includes(n.status))
    .map(n=>progressByEnrollment(args[0],n.id)).filter(Boolean).map(p=>p.percent);
   return ok([[percents.length?percents.reduce((a,b)=>a+b,0)/percents.length:null]]);
  }
  if(s.startsWith("SELECT id,name,valid_until FROM tenant_training_courses WHERE organization_id=? AND status='activo'"))
   return ok([...tables.courses.filter(c=>c.organization_id===args[0]&&c.status==='activo'&&c.valid_until!==null&&c.valid_until<=args[1])]
    .sort((a,b)=>a.valid_until.localeCompare(b.valid_until)).slice(0,20).map(c=>[c.id,c.name,c.valid_until]));
  if(s.startsWith('SELECT n.id,n.employee_id,n.course_id,e.name,c.name FROM tenant_training_enrollments n')){
   const list=tables.enrollments.filter(n=>n.organization_id===args[0]&&n.status!=='cancelado'&&!evaluationByEnrollment(args[0],n.id)&&
    (n.status==='completado'||(progressByEnrollment(args[0],n.id)?.percent??0)===100)).sort(byCreatedDesc).slice(0,20);
   return ok(list.map(n=>[n.id,n.employee_id,n.course_id,employeeById(args[0],n.employee_id)?.name||null,courseById(args[0],n.course_id)?.name||null]));
  }
  if(s.includes("(SELECT COUNT(*) FROM tenant_training_courses WHERE organization_id=? AND status='activo')")){
   const org=args[0];
   return ok([[
    tables.courses.filter(c=>c.organization_id===org&&c.status==='activo').length,
    tables.employees.filter(e=>e.organization_id===org).length,
    tables.enrollments.filter(n=>n.organization_id===org&&n.status!=='cancelado').length,
    tables.certificates.filter(x=>x.organization_id===org).length,
    tables.sessions.filter(x=>x.organization_id===org&&Date.parse(x.starts_at)>=Date.now()).length
   ]]);
  }
  // --- historiales ---
  if(s.startsWith('SELECT n.id,n.course_id,n.session_id,n.status,n.created_at,c.name,p.completed_modules,p.total_modules,p.percent,v.score,v.passed,')){
   const list=[...tables.enrollments.filter(n=>n.organization_id===args[0]&&n.employee_id===args[1])].sort(byCreatedDesc);
   return ok(list.map(n=>{
    const p=progressByEnrollment(args[0],n.id),v=evaluationByEnrollment(args[0],n.id);
    return [n.id,n.course_id,n.session_id,n.status,n.created_at,courseById(args[0],n.course_id)?.name||null,
     p?.completed_modules??null,p?.total_modules??null,p?.percent??null,v?.score??null,v?.passed??null,
     tables.certificates.filter(x=>x.organization_id===args[0]&&x.enrollment_id===n.id).length,
     tables.attendance.filter(a=>a.organization_id===args[0]&&a.employee_id===n.employee_id&&a.status==='presente'&&
      sessionById(args[0],a.session_id)?.course_id===n.course_id).length];
   }));
  }
  if(s.startsWith('SELECT s.id,s.starts_at,s.ends_at,s.place_or_link,s.capacity,')){
   const list=[...tables.sessions.filter(x=>x.organization_id===args[0]&&x.course_id===args[1])].sort((a,b)=>b.starts_at.localeCompare(a.starts_at));
   return ok(list.map(x=>[x.id,x.starts_at,x.ends_at,x.place_or_link,x.capacity,
    tables.attendance.filter(a=>a.organization_id===x.organization_id&&a.session_id===x.id).length,
    tables.attendance.filter(a=>a.organization_id===x.organization_id&&a.session_id===x.id&&a.status==='presente').length]));
  }
  if(s.startsWith('SELECT n.id,n.employee_id,n.status,n.created_at,e.name,p.completed_modules,p.total_modules,p.percent,v.score,v.passed,')){
   const list=[...tables.enrollments.filter(n=>n.organization_id===args[0]&&n.course_id===args[1])].sort(byCreatedDesc);
   return ok(list.map(n=>{
    const p=progressByEnrollment(args[0],n.id),v=evaluationByEnrollment(args[0],n.id);
    return [n.id,n.employee_id,n.status,n.created_at,employeeById(args[0],n.employee_id)?.name||null,
     p?.completed_modules??null,p?.total_modules??null,p?.percent??null,v?.score??null,v?.passed??null,
     tables.certificates.filter(x=>x.organization_id===args[0]&&x.enrollment_id===n.id).length];
   }));
  }
  if(s.startsWith('SELECT COUNT(*) FROM tenant_training_certificates WHERE organization_id=? AND course_id=?'))
   return ok([[tables.certificates.filter(x=>x.organization_id===args[0]&&x.course_id===args[1]).length]]);
  // --- exportación CSV ---
  if(s.startsWith('SELECT e.name,c.name,n.status,p.completed_modules,p.total_modules,p.percent,v.score,v.passed FROM tenant_training_enrollments n')){
   const list=[...tables.enrollments.filter(n=>n.organization_id===args[0])]
    .sort((a,b)=>(courseById(args[0],a.course_id)?.name||'').localeCompare(courseById(args[0],b.course_id)?.name||'')||
     (employeeById(args[0],a.employee_id)?.name||'').localeCompare(employeeById(args[0],b.employee_id)?.name||''));
   return ok(list.map(n=>{
    const p=progressByEnrollment(args[0],n.id),v=evaluationByEnrollment(args[0],n.id);
    return [employeeById(args[0],n.employee_id)?.name||null,courseById(args[0],n.course_id)?.name||null,n.status,
     p?.completed_modules??null,p?.total_modules??null,p?.percent??null,v?.score??null,v?.passed??null];
   }));
  }
  if(s.startsWith('SELECT s.starts_at,c.name,e.name,a.status FROM tenant_training_attendance a')){
   const list=[...tables.attendance.filter(a=>a.organization_id===args[0])]
    .sort((a,b)=>(sessionById(args[0],b.session_id)?.starts_at||'').localeCompare(sessionById(args[0],a.session_id)?.starts_at||''));
   return ok(list.map(a=>[sessionById(args[0],a.session_id)?.starts_at||null,
    courseById(args[0],sessionById(args[0],a.session_id)?.course_id)?.name||null,
    employeeById(args[0],a.employee_id)?.name||null,a.status]));
  }
  throw Error('Fake DB: sentencia no implementada: '+s.slice(0,140));
 }
 async function executeBatch(commands){
  const results=[];
  for(const command of commands)results.push(await executeSql(command.sql,command.args||[]));
  return results;
 }
 return {tables,orgA,orgB,ownerId,viewerId,memberId,users,executeSql,executeBatch};
}
export function trainingDeps(fake,session={userId:fake.ownerId,role:'owner'}){
 return {executeSql:fake.executeSql,executeBatch:fake.executeBatch,
  authorize:async(token,slug,toolId)=>{
   if(token==='bad-token')throw Error('Unauthorized');
   if(toolId!=='T022')throw Error('Tool disabled');
   const orgId=slug==='demo'?fake.orgA:slug==='demo-b'?fake.orgB:null;
   if(!orgId)throw Error('Not found');
   return {tenant:{id:orgId},session};
  }};
}
