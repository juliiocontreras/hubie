// Base falsa en memoria para los tests de T026 Empleados. Implementa solo
// las sentencias de platform/employees-store.mjs (más la forma de INSERT y
// de listado de platform/training-store.mjs, para probar que un empleado
// creado en T022 aparece en T026: es la misma tabla). Dos tenants ('demo'
// y 'demo-b') para verificar el scope por tenant.
const cells=values=>values.map(value=>({value:value??null}));
const ok=(rows=[],affected=0)=>({rows:rows.map(cells),affected_row_count:affected,rowsAffected:affected});

export function createEmployeesFakeDb(seed={}){
 const orgA=seed.orgA||'11111111-1111-4111-8111-111111111111';
 const orgB=seed.orgB||'22222222-2222-4222-8222-222222222222';
 const ownerId=seed.ownerId||'33333333-3333-4333-8333-333333333333';
 const memberId=seed.memberId||'55555555-5555-4555-8555-555555555555';
 let tick=0;
 const now=()=>new Date(Date.parse('2026-11-16T00:00:00.000Z')+(++tick)*1000).toISOString();
 const tables={employees:[],documents:[],workdays:[],requests:[],enrollments:[],progress:[]};
 const employeeById=(org,id)=>tables.employees.find(e=>e.organization_id===org&&e.id===id);
 const employeeView=e=>[e.id,e.name,e.email,e.position,e.area,e.fecha_ingreso??null,e.tipo_contrato??null,
  e.salario_mensual_cents??null,e.estado||'activo',e.created_at,e.updated_at];
 const byName=(a,b)=>a.name.localeCompare(b.name,'es');

 async function executeSql(sql,args=[]){
  const s=sql.replace(/\s+/g,' ');
  // --- lectura por id ---
  if(s.startsWith('SELECT id,name,email,position,area,fecha_ingreso,tipo_contrato,salario_mensual_cents,estado,created_at,updated_at FROM tenant_training_employees WHERE')){
   const e=employeeById(args[0],args[1]);return ok(e?[employeeView(e)]:[]);
  }
  // --- listado T026 (con contadores de documentos e inscripciones) ---
  if(s.startsWith('SELECT e.id,e.name,e.email,e.position,e.area,e.fecha_ingreso,')){
   let list=tables.employees.filter(e=>e.organization_id===args[0]),i=1;
   if(s.includes('e.estado=?')){const v=args[i++];list=list.filter(e=>(e.estado||'activo')===v);}
   if(s.includes('LIKE ?')){
    const needle=String(args[i]||'').replace(/%/g,'').toLowerCase();
    list=list.filter(e=>[e.name,e.email,e.position,e.area].join(' ').toLowerCase().includes(needle));
   }
   list=[...list].sort(byName);
   return ok(list.map(e=>[...employeeView(e),
    tables.documents.filter(d=>d.organization_id===e.organization_id&&d.employee_id===e.id).length,
    tables.enrollments.filter(n=>n.organization_id===e.organization_id&&n.employee_id===e.id&&n.status!=='cancelado').length]));
  }
  // --- listado T022 (interop: mismo SELECT base, sin columnas nuevas) ---
  if(s.startsWith('SELECT e.id,e.name,e.email,e.position,e.area,e.created_at,')){
   const list=[...tables.employees.filter(e=>e.organization_id===args[0])].sort(byName);
   return ok(list.map(e=>[e.id,e.name,e.email,e.position,e.area,e.created_at,
    tables.enrollments.filter(n=>n.organization_id===e.organization_id&&n.employee_id===e.id&&n.status!=='cancelado').length]));
  }
  // --- alta T026 (con columnas nuevas) ---
  if(s.startsWith('INSERT INTO tenant_training_employees(organization_id,id,name,email,position,area,fecha_ingreso,tipo_contrato,salario_mensual_cents,estado,created_by)')){
   if(tables.employees.some(e=>e.organization_id===args[0]&&e.email===args[3]))throw Error('UNIQUE constraint failed: tenant_training_employees.email');
   tables.employees.push({organization_id:args[0],id:args[1],name:args[2],email:args[3],position:args[4],area:args[5],
    fecha_ingreso:args[6],tipo_contrato:args[7],salario_mensual_cents:args[8],estado:args[9],created_by:args[10],created_at:now(),updated_at:now()});
   return ok([],1);
  }
  // --- alta T022 (interop: sin columnas nuevas, van con defaults) ---
  if(s.startsWith('INSERT INTO tenant_training_employees(organization_id,id,name,email,position,area,created_by)')){
   if(tables.employees.some(e=>e.organization_id===args[0]&&e.email===args[3]))throw Error('UNIQUE constraint failed: tenant_training_employees.email');
   tables.employees.push({organization_id:args[0],id:args[1],name:args[2],email:args[3],position:args[4],area:args[5],
    fecha_ingreso:null,tipo_contrato:null,salario_mensual_cents:null,estado:'activo',created_by:args[6],created_at:now(),updated_at:now()});
   return ok([],1);
  }
  // --- actualización completa ---
  if(s.startsWith('UPDATE tenant_training_employees SET name=')){
   const e=employeeById(args[8],args[9]);
   if(e){
    if(tables.employees.some(x=>x.organization_id===args[8]&&x.id!==args[9]&&x.email===args[1]))throw Error('UNIQUE constraint failed: tenant_training_employees.email');
    Object.assign(e,{name:args[0],email:args[1],position:args[2],area:args[3],fecha_ingreso:args[4],tipo_contrato:args[5],salario_mensual_cents:args[6],estado:args[7],updated_at:now()});
   }
   return ok([],e?1:0);
  }
  if(s.startsWith('UPDATE tenant_training_employees SET estado=')){
   const e=employeeById(args[1],args[2]);
   if(e){e.estado=args[0];e.updated_at=now();}
   return ok([],e?1:0);
  }
  // --- documentos ---
  if(s.startsWith('SELECT id,employee_id,tipo,nombre,fecha,notas,created_at,updated_at FROM tenant_hr_documents WHERE')){
   const d=tables.documents.find(x=>x.organization_id===args[0]&&x.id===args[1]);
   return ok(d?[[d.id,d.employee_id,d.tipo,d.nombre,d.fecha,d.notas,d.created_at,d.updated_at]]:[]);
  }
  if(s.startsWith('SELECT d.id,d.employee_id,d.tipo,d.nombre,d.fecha,d.notas,d.created_at,e.name FROM tenant_hr_documents d')){
   let list=tables.documents.filter(d=>d.organization_id===args[0]);
   if(s.includes('d.employee_id=?'))list=list.filter(d=>d.employee_id===args[1]);
   list=[...list].sort((a,b)=>b.created_at.localeCompare(a.created_at));
   return ok(list.map(d=>[d.id,d.employee_id,d.tipo,d.nombre,d.fecha,d.notas,d.created_at,
    employeeById(args[0],d.employee_id)?.name||null]));
  }
  if(s.startsWith('INSERT INTO tenant_hr_documents(')){
   tables.documents.push({organization_id:args[0],id:args[1],employee_id:args[2],tipo:args[3],nombre:args[4],
    fecha:args[5],notas:args[6],created_by:args[7],created_at:now(),updated_at:now()});
   return ok([],1);
  }
  if(s.startsWith('DELETE FROM tenant_hr_documents WHERE')){
   const idx=tables.documents.findIndex(d=>d.organization_id===args[0]&&d.id===args[1]);
   if(idx>=0)tables.documents.splice(idx,1);
   return ok([],idx>=0?1:0);
  }
  // --- tablero ---
  if(s.startsWith("SELECT COUNT(*) FROM tenant_training_employees WHERE organization_id=? AND estado='activo'"))
   return ok([[tables.employees.filter(e=>e.organization_id===args[0]&&(e.estado||'activo')==='activo').length]]);
  if(s.startsWith("SELECT COUNT(*) FROM tenant_training_employees WHERE organization_id=? AND estado='inactivo'"))
   return ok([[tables.employees.filter(e=>e.organization_id===args[0]&&(e.estado||'activo')==='inactivo').length]]);
  if(s.startsWith('SELECT COUNT(*) FROM tenant_training_employees WHERE organization_id=? AND salario_mensual_cents IS NOT NULL'))
   return ok([[tables.employees.filter(e=>e.organization_id===args[0]&&e.salario_mensual_cents!==null&&e.salario_mensual_cents!==undefined&&e.salario_mensual_cents>0).length]]);
  if(s.startsWith('SELECT COUNT(*) FROM tenant_training_employees WHERE organization_id=?'))
   return ok([[tables.employees.filter(e=>e.organization_id===args[0]).length]]);
  if(s.startsWith('SELECT COUNT(*) FROM tenant_hr_documents WHERE organization_id=?'))
   return ok([[tables.documents.filter(d=>d.organization_id===args[0]).length]]);
  if(s.startsWith('SELECT COUNT(*) FROM tenant_hr_attendance WHERE organization_id=? AND fecha=?'))
   return ok([[tables.workdays.filter(w=>w.organization_id===args[0]&&w.fecha===args[1]).length]]);
  if(s.startsWith("SELECT COUNT(*) FROM tenant_hr_requests WHERE organization_id=? AND estado='pendiente'"))
   return ok([[tables.requests.filter(x=>x.organization_id===args[0]&&x.estado==='pendiente').length]]);
  if(s.startsWith('SELECT substr(fecha_ingreso,1,7),COUNT(*) FROM tenant_training_employees WHERE')){
   const counts=new Map();
   for(const e of tables.employees){
    if(e.organization_id!==args[0]||!e.fecha_ingreso||e.fecha_ingreso<args[1])continue;
    const m=e.fecha_ingreso.slice(0,7);
    counts.set(m,(counts.get(m)||0)+1);
   }
   return ok([...counts.entries()].sort((a,b)=>a[0].localeCompare(b[0])));
  }
  if(s.startsWith("SELECT id,name,position,area,estado FROM tenant_training_employees WHERE organization_id=? AND estado='activo'")){
   const list=[...tables.employees.filter(e=>e.organization_id===args[0]&&(e.estado||'activo')==='activo')].sort(byName).slice(0,12);
   return ok(list.map(e=>[e.id,e.name,e.position,e.area,e.estado||'activo']));
  }
  if(s.startsWith('SELECT AVG(p.percent) FROM tenant_training_progress p')){
   const percents=tables.enrollments.filter(n=>n.organization_id===args[0]&&n.employee_id===args[1]&&['inscrito','en curso','completado'].includes(n.status))
    .map(n=>tables.progress.find(p=>p.organization_id===args[0]&&p.enrollment_id===n.id)).filter(Boolean).map(p=>p.percent);
   return ok([[percents.length?percents.reduce((a,b)=>a+b,0)/percents.length:null]]);
  }
  if(s.startsWith('SELECT COUNT(*) FROM tenant_hr_attendance WHERE organization_id=? AND employee_id=? AND substr(fecha,1,7)=?'))
   return ok([[tables.workdays.filter(w=>w.organization_id===args[0]&&w.employee_id===args[1]&&w.fecha.slice(0,7)===args[2]).length]]);
  throw Error('Fake DB: sentencia no implementada: '+s.slice(0,140));
 }
 async function executeBatch(commands){
  const results=[];
  for(const command of commands)results.push(await executeSql(command.sql,command.args||[]));
  return results;
 }
 return {tables,orgA,orgB,ownerId,memberId,executeSql,executeBatch};
}
export function employeesDeps(fake,session={userId:fake.ownerId,role:'owner'},tool='T026'){
 return {executeSql:fake.executeSql,executeBatch:fake.executeBatch,
  authorize:async(token,slug,toolId)=>{
   if(token==='bad-token')throw Error('Unauthorized');
   if(toolId!==tool)throw Error('Tool disabled');
   const orgId=slug==='demo'?fake.orgA:slug==='demo-b'?fake.orgB:null;
   if(!orgId)throw Error('Not found');
   return {tenant:{id:orgId},session};
  }};
}
