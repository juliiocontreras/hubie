// Base falsa en memoria para los tests de T028 Mesa de ayuda. Implementa
// solo las sentencias de platform/helpdesk-store.mjs (y el dedupe de
// platform/notifications.mjs: createNotification) con la misma forma de
// resultado que database.mjs ({rows: [[{value}...]], affected_row_count}).
// Dos tenants ('demo' y 'demo-b') para verificar el scope por tenant.
const cells=values=>values.map(value=>({value:value??null}));
const ok=(rows=[],affected=0)=>({rows:rows.map(cells),affected_row_count:affected,rowsAffected:affected});

export function createHelpdeskFakeDb(seed={}){
 const orgA=seed.orgA||'11111111-1111-4111-8111-111111111111';
 const orgB=seed.orgB||'22222222-2222-4222-8222-222222222222';
 const ownerId=seed.ownerId||'33333333-3333-4333-8333-333333333333';
 const memberId=seed.memberId||'55555555-5555-4555-8555-555555555555';
 const clientId=seed.clientId||'66666666-6666-4666-8666-666666666666';
 const users=[
  {id:ownerId,email:'owner@demo.test'},
  {id:memberId,email:'member@demo.test'}
 ];
 const clients=[
  {organization_id:orgA,id:clientId,name:'Cliente Ejemplo SA',archived_at:null},
  {organization_id:orgB,id:clientId,name:'Cliente Ejemplo SA',archived_at:null}
 ];
 const memberships=[
  {organization_id:orgA,user_id:ownerId,email:'owner@demo.test',role:'owner',status:'active'},
  {organization_id:orgA,user_id:memberId,email:'member@demo.test',role:'member',status:'active'},
  {organization_id:orgB,user_id:ownerId,email:'owner@demo.test',role:'owner',status:'active'}
 ];
 let tick=0;
 const now=()=>new Date(Date.parse('2026-11-16T00:00:00.000Z')+(++tick)*1000).toISOString();
 const tables={tickets:[],replies:[],notifications:[]};
 const ticketById=(org,id)=>tables.tickets.find(t=>t.organization_id===org&&t.id===id);
 const ticketView=t=>[t.id,t.subject,t.description,t.client_id,t.status,t.priority,t.assignee_user_id,t.created_at,t.updated_at];
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
  // --- miembros del equipo ---
  if(s.startsWith('SELECT m.user_id,u.email,m.role FROM memberships m JOIN users u ON u.id=m.user_id')){
   return ok(memberships.filter(m=>m.organization_id===args[0]&&m.status==='active')
    .sort((a,b)=>a.email.localeCompare(b.email)).map(m=>[m.user_id,m.email,m.role]));
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
  // --- tickets ---
  if(s.startsWith('SELECT t.id,t.subject,t.description,t.client_id,t.status,t.priority,t.assignee_user_id,t.created_at,t.updated_at,')){
   let list=tables.tickets.filter(t=>t.organization_id===args[0]),i=1;
   if(s.includes('t.status=?')){const v=args[i++];list=list.filter(t=>t.status===v);}
   if(s.includes('t.priority=?')){const v=args[i++];list=list.filter(t=>t.priority===v);}
   if(s.includes('t.assignee_user_id=?')){const v=args[i++];list=list.filter(t=>t.assignee_user_id===v);}
   list=[...list].sort(byCreatedDesc);
   return ok(list.map(t=>[...ticketView(t),tables.replies.filter(r=>r.organization_id===t.organization_id&&r.ticket_id===t.id).length]));
  }
  if(s.startsWith('SELECT id,subject,description,client_id,status,priority,assignee_user_id,created_at,updated_at FROM tenant_helpdesk_tickets WHERE')){
   const t=ticketById(args[0],args[1]);return ok(t?[ticketView(t)]:[]);
  }
  if(s.startsWith('INSERT INTO tenant_helpdesk_tickets(')){
   tables.tickets.push({organization_id:args[0],id:args[1],subject:args[2],description:args[3],client_id:args[4],
    status:args[5],priority:args[6],assignee_user_id:args[7],created_by:args[8],created_at:now(),updated_at:now()});
   return ok([],1);
  }
  if(s.startsWith('UPDATE tenant_helpdesk_tickets SET subject=')){
   const t=ticketById(args[6],args[7]);
   if(t)Object.assign(t,{subject:args[0],description:args[1],client_id:args[2],status:args[3],priority:args[4],assignee_user_id:args[5],updated_at:now()});
   return ok([],t?1:0);
  }
  if(s.startsWith('UPDATE tenant_helpdesk_tickets SET status=')){
   const t=ticketById(args[1],args[2]);
   if(t){t.status=args[0];t.updated_at=now();}
   return ok([],t?1:0);
  }
  if(s.startsWith('UPDATE tenant_helpdesk_tickets SET assignee_user_id=')){
   const t=ticketById(args[1],args[2]);
   if(t){t.assignee_user_id=args[0];t.updated_at=now();}
   return ok([],t?1:0);
  }
  if(s.startsWith('SELECT COUNT(*) FROM tenant_helpdesk_replies WHERE organization_id=? AND ticket_id=?')){
   return ok([[tables.replies.filter(r=>r.organization_id===args[0]&&r.ticket_id===args[1]).length]]);
  }
  // --- respuestas en hilo ---
  if(s.startsWith('SELECT r.id,r.ticket_id,r.author_user_id,r.body,r.created_at,u.email FROM tenant_helpdesk_replies r LEFT JOIN users u ON u.id=r.author_user_id WHERE r.organization_id=? AND r.ticket_id=?')){
   const list=[...tables.replies.filter(r=>r.organization_id===args[0]&&r.ticket_id===args[1])].sort((a,b)=>a.created_at.localeCompare(b.created_at));
   return ok(list.map(r=>[r.id,r.ticket_id,r.author_user_id,r.body,r.created_at,users.find(u=>u.id===r.author_user_id)?.email||null]));
  }
  if(s.startsWith('INSERT INTO tenant_helpdesk_replies(')){
   tables.replies.push({organization_id:args[0],id:args[1],ticket_id:args[2],author_user_id:args[3],body:args[4],created_by:args[5],created_at:now()});
   return ok([],1);
  }
  if(s.startsWith('SELECT r.id,r.ticket_id,r.author_user_id,r.body,r.created_at,u.email FROM tenant_helpdesk_replies r LEFT JOIN users u ON u.id=r.author_user_id WHERE r.organization_id=? AND r.id=?')){
   const r=tables.replies.find(x=>x.organization_id===args[0]&&x.id===args[1]);
   return ok(r?[[r.id,r.ticket_id,r.author_user_id,r.body,r.created_at,users.find(u=>u.id===r.author_user_id)?.email||null]]:[]);
  }
  // --- tablero ---
  if(s.startsWith("SELECT (SELECT COUNT(*) FROM tenant_helpdesk_tickets WHERE organization_id=? AND status='abierto')")){
   const all=tables.tickets.filter(t=>t.organization_id===args[0]);
   const byStatus=st=>all.filter(t=>t.status===st).length;
   return ok([[byStatus('abierto'),byStatus('en curso'),byStatus('en espera'),byStatus('resuelto'),byStatus('cerrado'),
    all.filter(t=>t.priority==='urgente'&&!['resuelto','cerrado'].includes(t.status)).length,
    all.filter(t=>!t.assignee_user_id&&!['resuelto','cerrado'].includes(t.status)).length]]);
  }
  throw Error('Fake DB: sentencia no implementada: '+s.slice(0,140));
 }
 async function executeBatch(commands){
  const results=[];
  for(const command of commands)results.push(await executeSql(command.sql,command.args||[]));
  return results;
 }
 return {tables,orgA,orgB,ownerId,memberId,clientId,users,clients,memberships,executeSql,executeBatch};
}
export function helpdeskDeps(fake,session={userId:fake.ownerId,role:'owner'}){
 return {executeSql:fake.executeSql,executeBatch:fake.executeBatch,
  authorize:async(token,slug,toolId)=>{
   if(token==='bad-token')throw Error('Unauthorized');
   if(toolId!=='T028')throw Error('Tool disabled');
   const orgId=slug==='demo'?fake.orgA:slug==='demo-b'?fake.orgB:null;
   if(!orgId)throw Error('Not found');
   return {tenant:{id:orgId},session};
  }};
}
