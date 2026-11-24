// Base falsa en memoria para los tests de T025 Proyectos. Implementa
// solo las sentencias de platform/projects-store.mjs (y las de
// platform/operations-tasks.mjs que reutiliza createProjectTask /
// updateProjectTaskStatus, más el listado de miembros de
// platform/team-members.mjs) con la misma forma de resultado que
// database.mjs ({rows: [[{value}...]], affected_row_count}).
// Dos tenants ('demo' y 'demo-b') para verificar el scope por tenant.
const cells=values=>values.map(value=>({value:value??null}));
const ok=(rows=[],affected=0)=>({rows:rows.map(cells),affected_row_count:affected,rowsAffected:affected});

export function createProjectsFakeDb(seed={}){
 const orgA=seed.orgA||'11111111-1111-4111-8111-111111111111';
 const orgB=seed.orgB||'22222222-2222-4222-8222-222222222222';
 const ownerId=seed.ownerId||'33333333-3333-4333-8333-333333333333';
 const memberId=seed.memberId||'55555555-5555-4555-8555-555555555555';
 const clientId=seed.clientId||'66666666-6666-4666-8666-666666666666';
 const boardId=seed.boardId||'77777777-7777-4777-8777-777777777777';
 const users=[
  {id:ownerId,email:'owner@demo.test'},
  {id:memberId,email:'member@demo.test'}
 ];
 const clients=[
  {organization_id:orgA,id:clientId,name:'Cliente Ejemplo SA',archived_at:null},
  {organization_id:orgB,id:clientId,name:'Cliente Ejemplo SA',archived_at:null}
 ];
 const boards=[
  {organization_id:orgA,id:boardId,name:'Tablero del proyecto',archived_at:null}
 ];
 const memberships=[
  {organization_id:orgA,user_id:ownerId,email:'owner@demo.test',role:'owner',status:'active'},
  {organization_id:orgA,user_id:memberId,email:'member@demo.test',role:'member',status:'active'},
  {organization_id:orgB,user_id:ownerId,email:'owner@demo.test',role:'owner',status:'active'}
 ];
 let tick=0;
 const now=()=>new Date(Date.parse('2026-11-16T00:00:00.000Z')+(++tick)*1000).toISOString();
 const tables={projects:[],milestones:[],tasks:[],audit:[]};
 const projectById=(org,id)=>tables.projects.find(p=>p.organization_id===org&&p.id===id);
 const milestoneById=(org,projectId,id)=>tables.milestones.find(m=>m.organization_id===org&&m.project_id===projectId&&m.id===id);
 const projectView=p=>[p.id,p.name,p.description,p.client_id,p.starts_on,p.ends_on,p.status,p.owner_user_id,p.kanban_board_id,p.created_at,p.updated_at];
 const milestoneView=m=>[m.id,m.project_id,m.title,m.due_on,m.status,m.created_at,m.updated_at];
 const milestonesOf=(org,projectId)=>tables.milestones.filter(m=>m.organization_id===org&&m.project_id===projectId);
 const tasksOf=(org,projectId)=>tables.tasks.filter(t=>t.organization_id===org&&t.source_tool_id==='T025'&&t.source_record_id===projectId&&!t.archived_at);
 const byCreatedDesc=(a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id);

 async function executeSql(sql,args=[]){
  const s=sql.replace(/\s+/g,' ');
  // --- miembros del equipo y auditoría (T004 reutilizada) ---
  if(s.startsWith('SELECT m.user_id,u.email,m.role FROM memberships m JOIN users u ON u.id=m.user_id')){
   return ok(memberships.filter(m=>m.organization_id===args[0]&&m.status==='active')
    .sort((a,b)=>a.email.localeCompare(b.email)).map(m=>[m.user_id,m.email,m.role]));
  }
  if(s.startsWith('INSERT INTO audit_events(')){
   tables.audit.push({id:args[0],organization_id:args[1],actor_user_id:args[2],action:args[3],target_type:args[4],target_id:args[5]});
   return ok([],1);
  }
  // --- clientes y usuarios (enriquecimiento) ---
  if(s.startsWith('SELECT id FROM tenant_client_profiles WHERE organization_id=? AND id=? AND archived_at IS NULL')){
   const c=clients.find(x=>x.organization_id===args[0]&&x.id===args[1]&&!x.archived_at);
   return ok(c?[[c.id]]:[]);
  }
  if(s.startsWith('SELECT id,name FROM tenant_client_profiles WHERE organization_id=? AND id IN (')){
   const ids=args.slice(1);
   return ok(clients.filter(c=>c.organization_id===args[0]&&ids.includes(c.id)).map(c=>[c.id,c.name]));
  }
  if(s.startsWith('SELECT id,email FROM users WHERE id IN (')){
   return ok(users.filter(u=>args.includes(u.id)).map(u=>[u.id,u.email]));
  }
  if(s.startsWith('SELECT id,name FROM kanban_boards WHERE organization_id=? AND id IN (')){
   const ids=args.slice(1);
   return ok(boards.filter(b=>b.organization_id===args[0]&&ids.includes(b.id)).map(b=>[b.id,b.name]));
  }
  if(s.startsWith('SELECT id FROM kanban_boards WHERE organization_id=? AND id=? AND archived_at IS NULL')){
   const b=boards.find(x=>x.organization_id===args[0]&&x.id===args[1]&&!x.archived_at);
   return ok(b?[[b.id]]:[]);
  }
  if(s.startsWith('SELECT id,name FROM kanban_boards WHERE organization_id=? AND id=? AND archived_at IS NULL')){
   const b=boards.find(x=>x.organization_id===args[0]&&x.id===args[1]&&!x.archived_at);
   return ok(b?[[b.id,b.name]]:[]);
  }
  // --- proyectos ---
  if(s.startsWith('SELECT p.id,p.name,p.description,p.client_id,p.starts_on,p.ends_on,p.status,p.owner_user_id,p.kanban_board_id,p.created_at,p.updated_at,')){
   let list=tables.projects.filter(p=>p.organization_id===args[0]);
   if(args[1]!==undefined)list=list.filter(p=>p.status===args[1]);
   list=[...list].sort(byCreatedDesc);
   return ok(list.map(p=>[...projectView(p),
    milestonesOf(args[0],p.id).filter(m=>m.status==='completado').length,
    milestonesOf(args[0],p.id).filter(m=>m.status!=='cancelado').length,
    tasksOf(args[0],p.id).filter(t=>t.status==='done').length,
    tasksOf(args[0],p.id).length]));
  }
  if(s.startsWith('SELECT id,name,description,client_id,starts_on,ends_on,status,owner_user_id,kanban_board_id,created_at,updated_at FROM tenant_projects WHERE')){
   const p=projectById(args[0],args[1]);return ok(p?[projectView(p)]:[]);
  }
  if(s.startsWith('INSERT INTO tenant_projects(')){
   tables.projects.push({organization_id:args[0],id:args[1],name:args[2],description:args[3],client_id:args[4],
    starts_on:args[5],ends_on:args[6],status:args[7],owner_user_id:args[8],kanban_board_id:args[9],
    created_by:args[10],created_at:now(),updated_at:now()});
   return ok([],1);
  }
  if(s.startsWith('UPDATE tenant_projects SET name=')){
   const p=projectById(args[8],args[9]);
   if(p)Object.assign(p,{name:args[0],description:args[1],client_id:args[2],starts_on:args[3],ends_on:args[4],
    status:args[5],owner_user_id:args[6],kanban_board_id:args[7],updated_at:now()});
   return ok([],p?1:0);
  }
  if(s.startsWith('UPDATE tenant_projects SET status=')){
   const p=projectById(args[1],args[2]);
   if(p){p.status=args[0];p.updated_at=now();}
   return ok([],p?1:0);
  }
  if(s.startsWith('UPDATE tenant_projects SET kanban_board_id=')){
   const p=projectById(args[1],args[2]);
   if(p){p.kanban_board_id=args[0];p.updated_at=now();}
   return ok([],p?1:0);
  }
  // --- hitos ---
  if(s.startsWith('SELECT id,project_id,title,due_on,status,created_at,updated_at FROM tenant_project_milestones WHERE organization_id=? AND project_id=? AND id=?')){
   const m=milestoneById(args[0],args[1],args[2]);return ok(m?[milestoneView(m)]:[]);
  }
  if(s.startsWith('SELECT id,project_id,title,due_on,status,created_at,updated_at FROM tenant_project_milestones WHERE organization_id=? AND project_id=?')){
   const list=[...milestonesOf(args[0],args[1])].sort((a,b)=>(a.due_on===null)-(b.due_on===null)||(a.due_on||'').localeCompare(b.due_on||'')||a.created_at.localeCompare(b.created_at));
   return ok(list.map(milestoneView));
  }
  if(s.startsWith('INSERT INTO tenant_project_milestones(')){
   tables.milestones.push({organization_id:args[0],id:args[1],project_id:args[2],title:args[3],due_on:args[4],
    status:args[5],created_by:args[6],created_at:now(),updated_at:now()});
   return ok([],1);
  }
  if(s.startsWith('UPDATE tenant_project_milestones SET title=')){
   const m=milestoneById(args[3],args[4],args[5]);
   if(m)Object.assign(m,{title:args[0],due_on:args[1],status:args[2],updated_at:now()});
   return ok([],m?1:0);
  }
  if(s.startsWith('UPDATE tenant_project_milestones SET status=')){
   const m=milestoneById(args[1],args[2],args[3]);
   if(m){m.status=args[0];m.updated_at=now();}
   return ok([],m?1:0);
  }
  // --- tareas del proyecto (tenant_tasks, T004 reutilizada) ---
  if(s.startsWith('SELECT t.id,t.title,t.notes,t.assignee_user_id,u.email,t.due_on,t.status,t.priority,t.created_at,t.updated_at FROM tenant_tasks t')){
   const list=[...tasksOf(args[0],args[1])].sort((a,b)=>(a.due_on===null)-(b.due_on===null)||(a.due_on||'').localeCompare(b.due_on||'')||b.created_at.localeCompare(a.created_at));
   return ok(list.map(t=>[t.id,t.title,t.notes,t.assignee_user_id,users.find(u=>u.id===t.assignee_user_id)?.email||null,
    t.due_on,t.status,t.priority,t.created_at,t.updated_at]));
  }
  if(s.startsWith("SELECT id FROM tenant_tasks WHERE organization_id=? AND id=? AND source_tool_id='T025' AND source_record_id=? AND archived_at IS NULL")){
   const t=tables.tasks.find(x=>x.organization_id===args[0]&&x.id===args[1]&&x.source_tool_id==='T025'&&x.source_record_id===args[2]&&!x.archived_at);
   return ok(t?[[t.id]]:[]);
  }
  if(s.startsWith('INSERT INTO tenant_tasks(organization_id,id,title,notes,assignee_user_id,due_on,status,priority,source_tool_id,source_record_id,created_by)')){
   tables.tasks.push({organization_id:args[0],id:args[1],title:args[2],notes:args[3],assignee_user_id:args[4],
    due_on:args[5],status:args[6],priority:args[7],source_tool_id:args[8],source_record_id:args[9],
    created_by:args[10],notified_at:null,archived_at:null,created_at:now(),updated_at:now()});
   return ok([],1);
  }
  if(s.startsWith('UPDATE tenant_tasks SET status=')){
   const t=tables.tasks.find(x=>x.organization_id===args[1]&&x.id===args[2]&&!x.archived_at);
   if(t){t.status=args[0];t.updated_at=now();}
   return ok([],t?1:0);
  }
  // --- tablero (KPIs) ---
  if(s.startsWith("SELECT (SELECT COUNT(*) FROM tenant_tasks WHERE organization_id=? AND source_tool_id='T025'")){
   const all=tables.tasks.filter(t=>t.organization_id===args[0]&&t.source_tool_id==='T025'&&!t.archived_at);
   return ok([[all.filter(t=>t.status==='done').length,all.filter(t=>t.status==='pending').length,
    all.filter(t=>t.status==='in_progress').length,all.length]]);
  }
  if(s.startsWith("SELECT COUNT(*) FROM tenant_tasks WHERE organization_id=? AND source_tool_id='T025' AND assignee_user_id=?")){
   const n=tables.tasks.filter(t=>t.organization_id===args[0]&&t.source_tool_id==='T025'&&t.assignee_user_id===args[1]&&t.status!=='done'&&!t.archived_at).length;
   return ok([[n]]);
  }
  throw Error('Fake DB: sentencia no implementada: '+s.slice(0,140));
 }
 async function executeBatch(commands){
  const results=[];
  for(const command of commands)results.push(await executeSql(command.sql,command.args||[]));
  return results;
 }
 return {tables,orgA,orgB,ownerId,memberId,clientId,boardId,users,clients,boards,memberships,executeSql,executeBatch};
}
export function projectsDeps(fake,session={userId:fake.ownerId,role:'owner'}){
 return {executeSql:fake.executeSql,executeBatch:fake.executeBatch,
  authorize:async(token,slug,toolId)=>{
   if(token==='bad-token')throw Error('Unauthorized');
   if(toolId!=='T025'&&toolId!=='T004')throw Error('Tool disabled');
   const orgId=slug==='demo'?fake.orgA:slug==='demo-b'?fake.orgB:null;
   if(!orgId)throw Error('Not found');
   return {tenant:{id:orgId},session};
  }};
}
