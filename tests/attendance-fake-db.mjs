// Base falsa en memoria para los tests de T027 Asistencia y vacaciones.
// Implementa solo las sentencias de platform/attendance-store.mjs.
// Dos tenants ('demo' y 'demo-b') para verificar el scope por tenant.
// Los empleados se siembran directamente en fake.tables.employees (son la
// tabla compartida de T022/T026).
const cells=values=>values.map(value=>({value:value??null}));
const ok=(rows=[],affected=0)=>({rows:rows.map(cells),affected_row_count:affected,rowsAffected:affected});

export function createAttendanceFakeDb(seed={}){
 const orgA=seed.orgA||'11111111-1111-4111-8111-111111111111';
 const orgB=seed.orgB||'22222222-2222-4222-8222-222222222222';
 const ownerId=seed.ownerId||'33333333-3333-4333-8333-333333333333';
 const memberId=seed.memberId||'55555555-5555-4555-8555-555555555555';
 const viewerId=seed.viewerId||'44444444-4444-4444-8444-444444444444';
 let tick=0;
 const now=()=>new Date(Date.parse('2026-11-16T00:00:00.000Z')+(++tick)*1000).toISOString();
 const tables={employees:[],workdays:[],requests:[]};
 const employeeById=(org,id)=>tables.employees.find(e=>e.organization_id===org&&e.id===id);
 const requestById=(org,id)=>tables.requests.find(x=>x.organization_id===org&&x.id===id);
 const byCreatedDesc=(a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id);

 async function executeSql(sql,args=[]){
  const s=sql.replace(/\s+/g,' ');
  if(s.startsWith('SELECT id,name,email,position,area,estado FROM tenant_training_employees WHERE')){
   const e=employeeById(args[0],args[1]);
   return ok(e?[[e.id,e.name,e.email,e.position,e.area,e.estado||'activo']]:[]);
  }
  // --- jornada ---
  if(s.startsWith('UPDATE tenant_hr_attendance SET entrada=')){
   const w=tables.workdays.find(x=>x.organization_id===args[3]&&x.employee_id===args[4]&&x.fecha===args[5]);
   if(w)Object.assign(w,{entrada:args[0],salida:args[1],notas:args[2],updated_at:now()});
   return ok([],w?1:0);
  }
  if(s.startsWith('INSERT INTO tenant_hr_attendance(organization_id,id,employee_id,fecha,entrada,salida,notas,created_by) SELECT')){
   if(tables.workdays.some(w=>w.organization_id===args[0]&&w.employee_id===args[2]&&w.fecha===args[3]))return ok([],0);
   tables.workdays.push({organization_id:args[0],id:args[1],employee_id:args[2],fecha:args[3],entrada:args[4],
    salida:args[5],notas:args[6],created_by:args[7],created_at:now(),updated_at:now()});
   return ok([],1);
  }
  if(s.startsWith('SELECT id FROM tenant_hr_attendance WHERE organization_id=? AND employee_id=? AND fecha=?')){
   const w=tables.workdays.find(x=>x.organization_id===args[0]&&x.employee_id===args[1]&&x.fecha===args[2]);
   return ok(w?[[w.id]]:[]);
  }
  if(s.startsWith('SELECT a.id,a.employee_id,a.fecha,a.entrada,a.salida,a.notas,a.created_at,e.name FROM tenant_hr_attendance a')){
   let list=tables.workdays.filter(w=>w.organization_id===args[0]),i=1;
   if(s.includes('a.employee_id=?')){const v=args[i++];list=list.filter(w=>w.employee_id===v);}
   if(s.includes('a.fecha>=')){const v=args[i++];list=list.filter(w=>w.fecha>=v);}
   if(s.includes('a.fecha<=')){const v=args[i++];list=list.filter(w=>w.fecha<=v);}
   list=[...list].sort((a,b)=>b.fecha.localeCompare(a.fecha));
   return ok(list.map(w=>[w.id,w.employee_id,w.fecha,w.entrada,w.salida,w.notas,w.created_at,
    employeeById(args[0],w.employee_id)?.name||null]));
  }
  // --- solicitudes ---
  if(s.startsWith('INSERT INTO tenant_hr_requests(')){
   tables.requests.push({organization_id:args[0],id:args[1],employee_id:args[2],tipo:args[3],fecha_inicio:args[4],
    fecha_fin:args[5],motivo:args[6],estado:'pendiente',resuelta_por:null,resuelta_at:null,created_by:args[7],created_at:now(),updated_at:now()});
   return ok([],1);
  }
  if(s.startsWith('SELECT id,employee_id,tipo,fecha_inicio,fecha_fin,motivo,estado,resuelta_por,resuelta_at,created_at,updated_at FROM tenant_hr_requests WHERE')){
   const x=requestById(args[0],args[1]);
   return ok(x?[[x.id,x.employee_id,x.tipo,x.fecha_inicio,x.fecha_fin,x.motivo,x.estado,x.resuelta_por,x.resuelta_at,x.created_at,x.updated_at]]:[]);
  }
  if(s.startsWith('SELECT r.id,r.employee_id,r.tipo,r.fecha_inicio,r.fecha_fin,r.motivo,r.estado,r.resuelta_por,r.resuelta_at,r.created_at,e.name FROM tenant_hr_requests r')){
   let list=tables.requests.filter(x=>x.organization_id===args[0]),i=1;
   if(s.includes('r.employee_id=?')){const v=args[i++];list=list.filter(x=>x.employee_id===v);}
   if(s.includes('r.estado=?')){const v=args[i++];list=list.filter(x=>x.estado===v);}
   if(s.includes('r.tipo=?')){const v=args[i++];list=list.filter(x=>x.tipo===v);}
   list=[...list].sort(byCreatedDesc);
   return ok(list.map(x=>[x.id,x.employee_id,x.tipo,x.fecha_inicio,x.fecha_fin,x.motivo,x.estado,x.resuelta_por,x.resuelta_at,x.created_at,
    employeeById(args[0],x.employee_id)?.name||null]));
  }
  if(s.startsWith("UPDATE tenant_hr_requests SET estado=?,resuelta_por=?,resuelta_at=CURRENT_TIMESTAMP")){
   const x=requestById(args[2],args[3]);
   const changedRow=x&&x.estado==='pendiente';
   if(changedRow){x.estado=args[0];x.resuelta_por=args[1];x.resuelta_at=now();x.updated_at=now();}
   return ok([],changedRow?1:0);
  }
  if(s.startsWith('SELECT r.employee_id,r.fecha_inicio,r.fecha_fin,e.name FROM tenant_hr_requests r')){
   let list=tables.requests.filter(x=>x.organization_id===args[0]&&x.tipo==='vacaciones'&&x.estado==='aprobada');
   if(args[1]!==undefined)list=list.filter(x=>x.employee_id===args[1]);
   list=[...list].sort((a,b)=>(employeeById(args[0],a.employee_id)?.name||'').localeCompare(employeeById(args[0],b.employee_id)?.name||''));
   return ok(list.map(x=>[x.employee_id,x.fecha_inicio,x.fecha_fin,employeeById(args[0],x.employee_id)?.name||null]));
  }
  // --- tablero ---
  if(s.startsWith("SELECT COUNT(*) FROM tenant_hr_requests WHERE organization_id=? AND estado='pendiente'"))
   return ok([[tables.requests.filter(x=>x.organization_id===args[0]&&x.estado==='pendiente').length]]);
  if(s.startsWith('SELECT COUNT(*) FROM tenant_hr_attendance WHERE organization_id=? AND substr(fecha,1,7)=?'))
   return ok([[tables.workdays.filter(w=>w.organization_id===args[0]&&w.fecha.slice(0,7)===args[1]).length]]);
  if(s.startsWith("SELECT COUNT(*) FROM tenant_training_employees WHERE organization_id=? AND estado='activo'"))
   return ok([[tables.employees.filter(e=>e.organization_id===args[0]&&(e.estado||'activo')==='activo').length]]);
  throw Error('Fake DB: sentencia no implementada: '+s.slice(0,140));
 }
 async function executeBatch(commands){
  const results=[];
  for(const command of commands)results.push(await executeSql(command.sql,command.args||[]));
  return results;
 }
 return {tables,orgA,orgB,ownerId,memberId,viewerId,executeSql,executeBatch};
}
export function attendanceDeps(fake,session={userId:fake.ownerId,role:'owner'}){
 return {executeSql:fake.executeSql,executeBatch:fake.executeBatch,
  authorize:async(token,slug,toolId)=>{
   if(token==='bad-token')throw Error('Unauthorized');
   if(toolId!=='T027')throw Error('Tool disabled');
   const orgId=slug==='demo'?fake.orgA:slug==='demo-b'?fake.orgB:null;
   if(!orgId)throw Error('Not found');
   return {tenant:{id:orgId},session};
  }};
}
