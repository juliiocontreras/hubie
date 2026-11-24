// Base falsa en memoria para los tests de T031 Nómina. Implementa solo
// las sentencias de platform/payroll-store.mjs. Dos tenants ('demo' y
// 'demo-b') para verificar el scope por tenant. Los empleados se siembran
// directamente en fake.tables.employees (tabla compartida de T022/T026;
// el salario se toma de salario_mensual_cents).
const cells=values=>values.map(value=>({value:value??null}));
const ok=(rows=[],affected=0)=>({rows:rows.map(cells),affected_row_count:affected,rowsAffected:affected});

export function createPayrollFakeDb(seed={}){
 const orgA=seed.orgA||'11111111-1111-4111-8111-111111111111';
 const orgB=seed.orgB||'22222222-2222-4222-8222-222222222222';
 const ownerId=seed.ownerId||'33333333-3333-4333-8333-333333333333';
 const memberId=seed.memberId||'55555555-5555-4555-8555-555555555555';
 let tick=0;
 const now=()=>new Date(Date.parse('2026-11-16T00:00:00.000Z')+(++tick)*1000).toISOString();
 const tables={employees:[],periods:[],concepts:[],receipts:[],items:[]};
 const periodById=(org,id)=>tables.periods.find(p=>p.organization_id===org&&p.id===id);
 const conceptById=(org,id)=>tables.concepts.find(c=>c.organization_id===org&&c.id===id);
 const receiptById=(org,id)=>tables.receipts.find(x=>x.organization_id===org&&x.id===id);

 async function executeSql(sql,args=[]){
  const s=sql.replace(/\s+/g,' ');
  // --- periodos ---
  if(s.startsWith('SELECT id,tipo,fecha_inicio,fecha_fin,estado,created_at,updated_at FROM tenant_payroll_periods WHERE')){
   const p=periodById(args[0],args[1]);
   return ok(p?[[p.id,p.tipo,p.fecha_inicio,p.fecha_fin,p.estado,p.created_at,p.updated_at]]:[]);
  }
  if(s.startsWith('SELECT p.id,p.tipo,p.fecha_inicio,p.fecha_fin,p.estado,p.created_at,')){
   const list=[...tables.periods.filter(p=>p.organization_id===args[0])].sort((a,b)=>b.fecha_inicio.localeCompare(a.fecha_inicio));
   return ok(list.map(p=>[p.id,p.tipo,p.fecha_inicio,p.fecha_fin,p.estado,p.created_at,
    tables.receipts.filter(x=>x.organization_id===p.organization_id&&x.period_id===p.id).length,
    tables.receipts.filter(x=>x.organization_id===p.organization_id&&x.period_id===p.id).reduce((a,x)=>a+x.neto_cents,0)]));
  }
  if(s.startsWith('INSERT INTO tenant_payroll_periods(')){
   if(tables.periods.some(p=>p.organization_id===args[0]&&p.tipo===args[2]&&p.fecha_inicio===args[3]))throw Error('UNIQUE constraint failed: tenant_payroll_periods');
   tables.periods.push({organization_id:args[0],id:args[1],tipo:args[2],fecha_inicio:args[3],fecha_fin:args[4],
    estado:'borrador',created_by:args[5],created_at:now(),updated_at:now()});
   return ok([],1);
  }
  if(s.startsWith("UPDATE tenant_payroll_periods SET estado='calculado'")){
   const p=periodById(args[0],args[1]);
   if(p){p.estado='calculado';p.updated_at=now();}
   return ok([],p?1:0);
  }
  if(s.startsWith("UPDATE tenant_payroll_periods SET estado='pagado'")){
   const p=periodById(args[0],args[1]);
   if(p){p.estado='pagado';p.updated_at=now();}
   return ok([],p?1:0);
  }
  // --- conceptos ---
  if(s.startsWith('SELECT id,nombre,tipo,modo,monto_cents,porcentaje,activo,created_at,updated_at FROM tenant_payroll_concepts WHERE organization_id=? AND id=?')){
   const c=conceptById(args[0],args[1]);
   return ok(c?[[c.id,c.nombre,c.tipo,c.modo,c.monto_cents,c.porcentaje,c.activo,c.created_at,c.updated_at]]:[]);
  }
  if(s.startsWith('SELECT id,nombre,tipo,modo,monto_cents,porcentaje,activo,created_at,updated_at FROM tenant_payroll_concepts WHERE organization_id=?')){
   let list=tables.concepts.filter(c=>c.organization_id===args[0]);
   if(s.includes('AND activo=?'))list=list.filter(c=>c.activo===args[1]);
   list=[...list].sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
   return ok(list.map(c=>[c.id,c.nombre,c.tipo,c.modo,c.monto_cents,c.porcentaje,c.activo,c.created_at,c.updated_at]));
  }
  if(s.startsWith('INSERT INTO tenant_payroll_concepts(')){
   tables.concepts.push({organization_id:args[0],id:args[1],nombre:args[2],tipo:args[3],modo:args[4],
    monto_cents:args[5],porcentaje:args[6],activo:args[7],created_by:args[8],created_at:now(),updated_at:now()});
   return ok([],1);
  }
  if(s.startsWith('UPDATE tenant_payroll_concepts SET nombre=')){
   const c=conceptById(args[6],args[7]);
   if(c)Object.assign(c,{nombre:args[0],tipo:args[1],modo:args[2],monto_cents:args[3],porcentaje:args[4],activo:args[5],updated_at:now()});
   return ok([],c?1:0);
  }
  if(s.startsWith('SELECT COUNT(*) FROM tenant_payroll_receipt_items WHERE organization_id=? AND concept_id=?'))
   return ok([[tables.items.filter(i=>i.organization_id===args[0]&&i.concept_id===args[1]).length]]);
  if(s.startsWith('DELETE FROM tenant_payroll_concepts WHERE')){
   const idx=tables.concepts.findIndex(c=>c.organization_id===args[0]&&c.id===args[1]);
   if(idx>=0)tables.concepts.splice(idx,1);
   return ok([],idx>=0?1:0);
  }
  // --- cálculo ---
  if(s.startsWith("SELECT id,name,salario_mensual_cents FROM tenant_training_employees WHERE organization_id=? AND estado='activo'")){
   const list=[...tables.employees.filter(e=>e.organization_id===args[0]&&(e.estado||'activo')==='activo')].sort((a,b)=>a.name.localeCompare(b.name,'es'));
   return ok(list.map(e=>[e.id,e.name,e.salario_mensual_cents??null]));
  }
  if(s.startsWith('DELETE FROM tenant_payroll_receipt_items WHERE organization_id=? AND receipt_id IN')){
   const doomed=new Set(tables.receipts.filter(x=>x.organization_id===args[1]&&x.period_id===args[2]).map(x=>x.id));
   const before=tables.items.length;
   tables.items=tables.items.filter(i=>!(i.organization_id===args[0]&&doomed.has(i.receipt_id)));
   return ok([],before-tables.items.length);
  }
  if(s.startsWith('DELETE FROM tenant_payroll_receipts WHERE organization_id=? AND period_id=?')){
   const before=tables.receipts.length;
   tables.receipts=tables.receipts.filter(x=>!(x.organization_id===args[0]&&x.period_id===args[1]));
   return ok([],before-tables.receipts.length);
  }
  if(s.startsWith('INSERT INTO tenant_payroll_receipts(')){
   tables.receipts.push({organization_id:args[0],id:args[1],period_id:args[2],employee_id:args[3],
    salario_base_cents:args[4],percepciones_cents:args[5],deducciones_cents:args[6],neto_cents:args[7],
    estado:'calculado',created_by:args[8],created_at:now(),updated_at:now()});
   return ok([],1);
  }
  if(s.startsWith('INSERT INTO tenant_payroll_receipt_items(')){
   tables.items.push({organization_id:args[0],id:args[1],receipt_id:args[2],concept_id:args[3],
    nombre:args[4],tipo:args[5],monto_cents:args[6],created_at:now()});
   return ok([],1);
  }
  if(s.startsWith("UPDATE tenant_payroll_receipts SET estado='pagado'")){
   const list=tables.receipts.filter(x=>x.organization_id===args[0]&&x.period_id===args[1]);
   for(const x of list){x.estado='pagado';x.updated_at=now();}
   return ok([],list.length);
  }
  if(s.startsWith('SELECT COUNT(*) FROM tenant_payroll_receipts WHERE organization_id=? AND period_id=?'))
   return ok([[tables.receipts.filter(x=>x.organization_id===args[0]&&x.period_id===args[1]).length]]);
  // --- recibos ---
  if(s.startsWith('SELECT r.id,r.period_id,r.employee_id,r.salario_base_cents,r.percepciones_cents,r.deducciones_cents,r.neto_cents,r.estado,r.created_at,e.name,p.tipo,p.fecha_inicio,p.fecha_fin FROM tenant_payroll_receipts r')){
   let list=tables.receipts.filter(x=>x.organization_id===args[0]),i=1;
   const byPeriod=s.includes('r.period_id=?'),byEmployee=s.includes('r.employee_id=?'),byId=s.includes('AND r.id=?');
   if(byId){
    const x=receiptById(args[0],args[1]);
    return ok(x?[[x.id,x.period_id,x.employee_id,x.salario_base_cents,x.percepciones_cents,x.deducciones_cents,x.neto_cents,x.estado,x.created_at,
     tables.employees.find(e=>e.organization_id===args[0]&&e.id===x.employee_id)?.name||null,
     periodById(args[0],x.period_id)?.tipo||null,periodById(args[0],x.period_id)?.fecha_inicio||null,periodById(args[0],x.period_id)?.fecha_fin||null]]:[]);
   }
   if(byPeriod){const v=args[i++];list=list.filter(x=>x.period_id===v);}
   if(byEmployee){const v=args[i++];list=list.filter(x=>x.employee_id===v);}
   list=[...list].sort((a,b)=>b.created_at.localeCompare(a.created_at));
   return ok(list.map(x=>[x.id,x.period_id,x.employee_id,x.salario_base_cents,x.percepciones_cents,x.deducciones_cents,x.neto_cents,x.estado,x.created_at,
    tables.employees.find(e=>e.organization_id===args[0]&&e.id===x.employee_id)?.name||null,
    periodById(args[0],x.period_id)?.tipo||null,periodById(args[0],x.period_id)?.fecha_inicio||null,periodById(args[0],x.period_id)?.fecha_fin||null]));
  }
  if(s.startsWith('SELECT id,nombre,tipo,monto_cents FROM tenant_payroll_receipt_items WHERE organization_id=? AND receipt_id=?')){
   const list=tables.items.filter(i=>i.organization_id===args[0]&&i.receipt_id===args[1]);
   return ok(list.map(i=>[i.id,i.nombre,i.tipo,i.monto_cents]));
  }
  // --- tablero ---
  if(s.startsWith('SELECT COUNT(*) FROM tenant_payroll_periods WHERE organization_id=?'))
   return ok([[tables.periods.filter(p=>p.organization_id===args[0]).length]]);
  if(s.startsWith('SELECT COUNT(*) FROM tenant_payroll_concepts WHERE organization_id=? AND activo=1'))
   return ok([[tables.concepts.filter(c=>c.organization_id===args[0]&&c.activo===1).length]]);
  if(s.startsWith("SELECT COUNT(*) FROM tenant_training_employees WHERE organization_id=? AND estado='activo' AND salario_mensual_cents IS NOT NULL"))
   return ok([[tables.employees.filter(e=>e.organization_id===args[0]&&(e.estado||'activo')==='activo'&&e.salario_mensual_cents!==null&&e.salario_mensual_cents!==undefined&&e.salario_mensual_cents>0).length]]);
  if(s.startsWith('SELECT id,tipo,fecha_inicio,fecha_fin,estado FROM tenant_payroll_periods WHERE organization_id=? ORDER BY fecha_inicio DESC LIMIT 1')){
   const list=[...tables.periods.filter(p=>p.organization_id===args[0])].sort((a,b)=>b.fecha_inicio.localeCompare(a.fecha_inicio));
   const p=list[0];
   return ok(p?[[p.id,p.tipo,p.fecha_inicio,p.fecha_fin,p.estado]]:[]);
  }
  if(s.startsWith('SELECT COALESCE(SUM(neto_cents),0) FROM tenant_payroll_receipts WHERE organization_id=? AND period_id=?'))
   return ok([[tables.receipts.filter(x=>x.organization_id===args[0]&&x.period_id===args[1]).reduce((a,x)=>a+x.neto_cents,0)]]);
  throw Error('Fake DB: sentencia no implementada: '+s.slice(0,140));
 }
 async function executeBatch(commands){
  const results=[];
  for(const command of commands)results.push(await executeSql(command.sql,command.args||[]));
  return results;
 }
 return {tables,orgA,orgB,ownerId,memberId,executeSql,executeBatch};
}
export function payrollDeps(fake,session={userId:fake.ownerId,role:'owner'}){
 return {executeSql:fake.executeSql,executeBatch:fake.executeBatch,
  authorize:async(token,slug,toolId)=>{
   if(token==='bad-token')throw Error('Unauthorized');
   if(toolId!=='T031')throw Error('Tool disabled');
   const orgId=slug==='demo'?fake.orgA:slug==='demo-b'?fake.orgB:null;
   if(!orgId)throw Error('Not found');
   return {tenant:{id:orgId},session};
  }};
}
