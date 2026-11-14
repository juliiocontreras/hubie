// Base falsa en memoria para los tests P1-A. Implementa solo las sentencias
// platform/notifications.mjs (createNotification, migración 020),
// operations-forms.mjs, dashboard.mjs, team-members.mjs y el motor canónico
// con la misma forma de resultado que database.mjs
// ({rows: [[{value}...]], affected_row_count}).
const cells=values=>values.map(value=>({value:value??null}));
const ok=(rows=[],affected=0)=>({rows:rows.map(cells),affected_row_count:affected,rowsAffected:affected});
const today=()=>new Date().toISOString().slice(0,10);

export function createP1aFakeDb(seed={}){
 const orgId=seed.orgId||'11111111-1111-4111-8111-111111111111';
 const ownerId=seed.ownerId||'33333333-3333-4333-8333-333333333333';
 const tables={
  users:[{id:ownerId,email:'duena@ejemplo.mx'},{id:'44444444-4444-4444-8444-444444444444',email:'miembro@ejemplo.mx'}],
  memberships:[
   {organization_id:orgId,user_id:ownerId,role:'owner',status:'active'},
   {organization_id:orgId,user_id:'44444444-4444-4444-8444-444444444444',role:'member',status:'active'}],
  tenant_notifications:seed.notificationsTable?[]:null,
  notifications:[],
  checklist_templates:seed.checklist_templates??[],
  checklist_template_items:seed.checklist_template_items??[],
  checklists:seed.checklists??[],
  checklist_items:seed.checklist_items??[],
  tasks:seed.tasks??[],
  forms:seed.forms??[],
  form_submissions:seed.form_submissions??[],
  dashboard_goals:seed.dashboard_goals??[],
  clients:seed.clients??[],
  quotes:seed.quotes??[],
  payments:seed.payments??[],
  expenses:seed.expenses??[],
  events:seed.events??[],
  items:seed.items??[],
  variants:seed.variants??[],
  media:seed.media??[],
  audit_events:[]
 };
 const memberEmail=id=>tables.users.find(u=>u.id===id)?.email||null;
 const itemView=i=>[i.id,i.checklist_id,i.title,i.assignee_user_id||null,memberEmail(i.assignee_user_id),
  i.due_on||null,i.checked_at||null,i.checked_by||null,i.evidence_media_id||null,
  tables.media.find(m=>m.id===i.evidence_media_id)?.name||null,i.position];
 const taskView=t=>[t.id,t.title,t.notes,t.assignee_user_id||null,memberEmail(t.assignee_user_id),
  t.due_on||null,t.status,t.priority,t.source_tool_id||null,t.source_record_id||null,
  t.notified_at||null,t.created_at||'2026-11-13T00:00:00.000Z',t.updated_at||'2026-11-13T00:00:00.000Z'];

 async function executeSql(sql,args=[]){
  const s=sql.replace(/\s+/g,' ');
  // --- meta / miembros / notificaciones ---
  if(s.includes("FROM sqlite_master WHERE type='table' AND name='tenant_notifications'"))
   return ok(tables.tenant_notifications?[[ 'tenant_notifications' ]]:[]);
  if(s.includes('FROM memberships m JOIN users u'))
   return ok(tables.memberships.filter(m=>m.organization_id===args[0]&&m.status==='active')
    .map(m=>[m.user_id,memberEmail(m.user_id),m.role]));
  if(s.startsWith('INSERT INTO tenant_notifications')){
   // Motor canónico (platform/notifications.mjs): si la tabla no existe en
   // esta base falsa, el INSERT real fallaría con 'no such table'; aquí se
   // simula ese fallo para que el aviso quede como pendiente.
   if(!tables.tenant_notifications)throw Error('no such table: tenant_notifications');
   tables.notifications.push({organization_id:args[0],id:args[1],user_id:args[2],type:args[3],title:args[4],body:args[5],link:args[6]});
   return ok([],1);
  }
  if(s.startsWith('INSERT INTO audit_events')){tables.audit_events.push({id:args[0]});return ok([],1);}
  // --- plantillas de checklist ---
  if(s.startsWith('SELECT id,title,description,created_at,updated_at FROM tenant_checklist_templates'))
   return ok(tables.checklist_templates.filter(t=>t.organization_id===args[0]&&!t.archived_at)
    .map(t=>[t.id,t.title,t.description,t.created_at,t.updated_at]));
  if(s.startsWith('SELECT template_id,title,position FROM tenant_checklist_template_items'))
   return ok(tables.checklist_template_items.filter(t=>t.organization_id===args[0])
    .map(t=>[t.template_id,t.title,t.position]));
  if(s.startsWith('SELECT id,title FROM tenant_checklist_templates'))
   return ok(tables.checklist_templates.filter(t=>t.organization_id===args[0]&&!t.archived_at)
    .map(t=>[t.id,t.title]));
  if(s.startsWith('SELECT title,position FROM tenant_checklist_template_items'))
   return ok(tables.checklist_template_items.filter(t=>t.organization_id===args[0]&&t.template_id===args[1])
    .map(t=>[t.title,t.position]));
  if(s.startsWith('INSERT INTO tenant_checklist_templates')){
   tables.checklist_templates.push({organization_id:args[0],id:args[1],title:args[2],description:args[3],created_at:'2026-11-13T00:00:00.000Z',updated_at:'2026-11-13T00:00:00.000Z'});
   return ok([],1);
  }
  if(s.startsWith('INSERT INTO tenant_checklist_template_items')){
   tables.checklist_template_items.push({organization_id:args[0],id:args[1],template_id:args[2],title:args[3],position:args[4]});
   return ok([],1);
  }
  // --- checklists ---
  if(s.startsWith('SELECT id,template_id,title,source_tool_id,source_record_id,status,created_at,updated_at FROM tenant_checklists'))
   return ok(tables.checklists.filter(t=>t.organization_id===args[0]&&!t.archived_at)
    .map(t=>[t.id,t.template_id,t.title,t.source_tool_id,t.source_record_id,t.status,t.created_at,t.updated_at]));
  if(s.includes('FROM tenant_checklist_items i')&&s.includes('WHERE i.organization_id=?'))
   return ok(tables.checklist_items.filter(t=>t.organization_id===args[0]&&t.checklist_id===args[1])
    .sort((a,b)=>a.position-b.position).map(itemView));
  if(s.startsWith('INSERT INTO tenant_checklists')){
   tables.checklists.push({organization_id:args[0],id:args[1],template_id:args[2],title:args[3],
    source_tool_id:args[4],source_record_id:args[5],status:'open',created_at:'2026-11-13T00:00:00.000Z',updated_at:'2026-11-13T00:00:00.000Z'});
   return ok([],1);
  }
  if(s.startsWith('INSERT INTO tenant_checklist_items')){
   const withEvidence=args.length===8;
   tables.checklist_items.push({organization_id:args[0],id:args[1],checklist_id:args[2],title:args[3],
    assignee_user_id:withEvidence?args[4]:args[4],due_on:withEvidence?args[5]:args[5],
    evidence_media_id:withEvidence?args[6]:null,position:withEvidence?args[7]:args[6],
    checked_at:null,checked_by:null});
   return ok([],1);
  }
  if(s.startsWith('SELECT id FROM tenant_checklists WHERE'))
   return ok(tables.checklists.filter(t=>t.organization_id===args[0]&&t.id===args[1]&&!t.archived_at).map(t=>[t.id]));
  if(s.startsWith('SELECT COALESCE(MAX(position)'))
   return ok([[Math.max(-1,...tables.checklist_items.filter(t=>t.organization_id===args[0]&&t.checklist_id===args[1]).map(t=>t.position))+1]]);
  if(s.startsWith('UPDATE tenant_checklists SET updated_at=CURRENT_TIMESTAMP')){
   const t=tables.checklists.find(x=>x.organization_id===args[0]&&x.id===args[1]);
   if(t)t.updated_at='2026-11-13T00:00:00.000Z';return ok([],t?1:0);
  }
  if(s.startsWith('UPDATE tenant_checklist_items SET checked_at')){
   const t=tables.checklist_items.find(x=>x.organization_id===args[3]&&x.checklist_id===args[4]&&x.id===args[5]);
   if(t){t.checked_at=args[0];t.checked_by=args[1];if(args[2])t.evidence_media_id=args[2];}
   return ok([],t?1:0);
  }
  if(s.startsWith('SELECT id FROM tenant_checklist_items WHERE'))
   return ok(tables.checklist_items.filter(t=>t.organization_id===args[0]&&t.checklist_id===args[1]&&t.id===args[2]).map(t=>[t.id]));
  if(s.startsWith('UPDATE tenant_checklists SET status')){
   const t=tables.checklists.find(x=>x.organization_id===args[1]&&x.id===args[2]);
   if(t)t.status=args[0];return ok([],t?1:0);
  }
  if(s.startsWith('UPDATE tenant_checklists SET archived_at')){
   const t=tables.checklists.find(x=>x.organization_id===args[0]&&x.id===args[1]&&!x.archived_at);
   if(t)t.archived_at='2026-11-13T00:00:00.000Z';return ok([],t?1:0);
  }
  if(s.startsWith("SELECT id FROM pwa_media WHERE"))
   return ok(tables.media.filter(m=>m.organization_id===args[0]&&m.id===args[1]&&m.kind==='attachment').map(m=>[m.id]));
  // --- tareas ---
  if(s.startsWith("SELECT id,title,assignee_user_id,due_on FROM tenant_tasks")){
   const due=tables.tasks.filter(t=>t.organization_id===args[0]&&!t.archived_at&&t.status!=='done'&&t.due_on&&t.due_on<args[1]&&!t.notified_at);
   return ok(due.map(t=>[t.id,t.title,t.assignee_user_id,t.due_on]));
  }
  if(s.includes('FROM tenant_tasks t LEFT JOIN users')){
   let list=tables.tasks.filter(t=>t.organization_id===args[0]&&!t.archived_at);
   let i=1;
   if(s.includes('t.assignee_user_id=?')){const v=args[i++];list=list.filter(t=>t.assignee_user_id===v);}
   if(s.includes('t.status=?')){const v=args[i++];list=list.filter(t=>t.status===v);}
   if(s.includes('t.due_on>=?')){const v=args[i++];list=list.filter(t=>t.due_on&&t.due_on>=v);}
   if(s.includes('t.due_on<=?')){const v=args[i++];list=list.filter(t=>t.due_on&&t.due_on<=v);}
   if(s.includes("t.due_on<date('now')"))list=list.filter(t=>t.status!=='done'&&t.due_on&&t.due_on<today());
   list=[...list].sort((a,b)=>(a.due_on===null)-(b.due_on===null)||(a.due_on||'').localeCompare(b.due_on||''));
   return ok(list.map(taskView));
  }
  if(s.startsWith('UPDATE tenant_tasks SET notified_at')){
   const t=tables.tasks.find(x=>x.organization_id===args[0]&&x.id===args[1]);
   if(t)t.notified_at='2026-11-13T00:00:00.000Z';return ok([],t?1:0);
  }
  if(s.startsWith('INSERT INTO tenant_tasks')){
   tables.tasks.push({organization_id:args[0],id:args[1],title:args[2],notes:args[3],assignee_user_id:args[4],
    due_on:args[5],status:args[6],priority:args[7],source_tool_id:args[8],source_record_id:args[9],
    notified_at:null,created_at:'2026-11-13T00:00:00.000Z',updated_at:'2026-11-13T00:00:00.000Z'});
   return ok([],1);
  }
  if(s.startsWith('UPDATE tenant_tasks SET status')){
   const t=tables.tasks.find(x=>x.organization_id===args[1]&&x.id===args[2]&&!x.archived_at);
   if(t)t.status=args[0];return ok([],t?1:0);
  }
  if(s.startsWith('UPDATE tenant_tasks SET title')){
   const t=tables.tasks.find(x=>x.organization_id===args[8]&&x.id===args[9]&&!x.archived_at);
   if(t)Object.assign(t,{title:args[0],notes:args[1],assignee_user_id:args[2],due_on:args[3],status:args[4],priority:args[5],source_tool_id:args[6],source_record_id:args[7]});
   return ok([],t?1:0);
  }
  if(s.startsWith('UPDATE tenant_tasks SET archived_at')){
   const t=tables.tasks.find(x=>x.organization_id===args[0]&&x.id===args[1]&&!x.archived_at);
   if(t)t.archived_at='2026-11-13T00:00:00.000Z';return ok([],t?1:0);
  }
  // --- formularios (el SELECT por id va antes que el listado: comparten prefijo) ---
  if(s.startsWith('SELECT id,title,description,fields_json,created_at,updated_at FROM tenant_forms WHERE organization_id=? AND id=?'))
   return ok(tables.forms.filter(t=>t.organization_id===args[0]&&t.id===args[1]&&!t.archived_at)
    .map(t=>[t.id,t.title,t.description,JSON.stringify(t.fields),t.created_at,t.updated_at]));
  if(s.startsWith('SELECT id,title,description,fields_json,created_at,updated_at FROM tenant_forms'))
   return ok(tables.forms.filter(t=>t.organization_id===args[0]&&!t.archived_at)
    .map(t=>[t.id,t.title,t.description,JSON.stringify(t.fields),t.created_at,t.updated_at]));
  if(s.startsWith('SELECT form_id,COUNT(*) FROM tenant_form_submissions')){
   const counts=new Map();
   for(const sub of tables.form_submissions.filter(x=>x.organization_id===args[0]))
    counts.set(sub.form_id,(counts.get(sub.form_id)||0)+1);
   return ok([...counts.entries()]);
  }
  if(s.startsWith('INSERT INTO tenant_forms')){
   tables.forms.push({organization_id:args[0],id:args[1],title:args[2],description:args[3],
    fields:JSON.parse(args[4]),created_at:'2026-11-13T00:00:00.000Z',updated_at:'2026-11-13T00:00:00.000Z'});
   return ok([],1);
  }
  if(s.startsWith('UPDATE tenant_forms SET title')){
   const t=tables.forms.find(x=>x.organization_id===args[3]&&x.id===args[4]&&!x.archived_at);
   if(t)Object.assign(t,{title:args[0],description:args[1],fields:JSON.parse(args[2])});
   return ok([],t?1:0);
  }
  if(s.startsWith('UPDATE tenant_forms SET archived_at')){
   const t=tables.forms.find(x=>x.organization_id===args[0]&&x.id===args[1]&&!x.archived_at);
   if(t)t.archived_at='2026-11-13T00:00:00.000Z';return ok([],t?1:0);
  }
  if(s.startsWith('INSERT INTO tenant_form_submissions')){
   tables.form_submissions.push({organization_id:args[0],id:args[1],form_id:args[2],answers:JSON.parse(args[3]),
    submitted_by:args[4],created_at:'2026-11-13T00:00:00.000Z'});
   return ok([],1);
  }
  if(s.includes('FROM tenant_form_submissions s LEFT JOIN users'))
   return ok(tables.form_submissions.filter(x=>x.organization_id===args[0]&&x.form_id===args[1])
    .map(x=>[x.id,JSON.stringify(x.answers),x.submitted_by,x.created_at,memberEmail(x.submitted_by)]));
  // --- dashboard ---
  if(s.startsWith("SELECT COUNT(*) FROM tenant_client_profiles"))
   return ok([[tables.clients.filter(c=>c.organization_id===args[0]&&!c.archived_at&&c.status==='active').length]]);
  if(s.startsWith("SELECT COUNT(*),COALESCE(SUM(total_cents),0) FROM tenant_quotes")){
   const list=tables.quotes.filter(q=>q.organization_id===args[0]&&!q.archived_at&&['draft','sent'].includes(q.status)
    &&(q.created_at||'').slice(0,10)>=args[1]&&(q.created_at||'').slice(0,10)<=args[2]);
   return ok([[list.length,list.reduce((a,q)=>a+q.total_cents,0)]]);
  }
  if(s.startsWith('SELECT COUNT(*),COALESCE(SUM(amount_cents),0) FROM tenant_collections')){
   const list=tables.payments.filter(p=>p.organization_id===args[0]&&!p.archived_at&&p.paid_on>=args[1]&&p.paid_on<=args[2]);
   return ok([[list.length,list.reduce((a,p)=>a+p.amount_cents,0)]]);
  }
  if(s.startsWith('SELECT COUNT(*),COALESCE(SUM(amount_cents),0) FROM tenant_expenses')){
   const list=tables.expenses.filter(p=>p.organization_id===args[0]&&!p.archived_at&&p.occurred_on>=args[1]&&p.occurred_on<=args[2]);
   return ok([[list.length,list.reduce((a,p)=>a+p.amount_cents,0)]]);
  }
  if(s.startsWith("SELECT COUNT(*) FROM tenant_schedule_events")){
   return ok([[tables.events.filter(e=>e.organization_id===args[0]&&['scheduled','confirmed'].includes(e.status)
    &&(e.starts_at||'').slice(0,10)===args[1]).length]]);
  }
  if(s.startsWith('SELECT COUNT(*) FROM tenant_inventory_items'))
   return ok([[tables.items.filter(i=>i.organization_id===args[0]&&!i.archived_at&&i.quantity<=i.low_stock).length]]);
  if(s.startsWith('SELECT COUNT(*) FROM tenant_inventory_variants'))
   return ok([[tables.variants.filter(i=>i.organization_id===args[0]&&!i.archived_at&&i.quantity<=i.low_stock).length]]);
  if(s.startsWith('SELECT target_cents FROM tenant_dashboard_goals')){
   const g=tables.dashboard_goals.find(x=>x.organization_id===args[0]&&x.month===args[1]);
   return ok(g?[[g.target_cents]]:[]);
  }
  if(s.startsWith('SELECT substr(created_at,1,10) FROM tenant_quotes'))
   return ok(tables.quotes.filter(q=>q.organization_id===args[0]&&!q.archived_at&&(q.created_at||'').slice(0,10)>=args[1])
    .map(q=>[(q.created_at||'').slice(0,10)]));
  if(s.startsWith('SELECT paid_on,amount_cents FROM tenant_collections'))
   return ok(tables.payments.filter(p=>p.organization_id===args[0]&&!p.archived_at&&p.paid_on>=args[1])
    .map(p=>[p.paid_on,p.amount_cents]));
  if(s.startsWith('INSERT INTO tenant_dashboard_goals')){
   const existing=tables.dashboard_goals.find(x=>x.organization_id===args[0]&&x.month===args[2]);
   if(existing)existing.target_cents=args[3];
   else tables.dashboard_goals.push({organization_id:args[0],id:args[1],month:args[2],target_cents:args[3]});
   return ok([],1);
  }
  if(s.startsWith('SELECT month,target_cents,updated_at FROM tenant_dashboard_goals'))
   return ok(tables.dashboard_goals.filter(x=>x.organization_id===args[0])
    .map(x=>[x.month,x.target_cents,'2026-11-13T00:00:00.000Z']));
  throw Error('Fake DB: sentencia no implementada: '+s.slice(0,120));
 }
 async function executeBatch(commands){
  const results=[];
  for(const command of commands)results.push(await executeSql(command.sql,command.args||[]));
  return results;
 }
 return {tables,orgId,ownerId,executeSql,executeBatch};
}
export function p1aDeps(fake){
 return {executeSql:fake.executeSql,executeBatch:fake.executeBatch,
  authorize:async()=>({tenant:{id:fake.orgId},session:{userId:fake.ownerId}}),
  getTenantTools:async()=>['C001','C002','C004','C005','C007','C008','T003','T004','T007','T013','T014','T020']};
}
