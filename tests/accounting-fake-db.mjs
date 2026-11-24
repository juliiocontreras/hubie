// Base falsa en memoria para los tests de T023 Contabilidad. Implementa
// solo las sentencias de platform/accounting-store.mjs con la misma forma
// de resultado que database.mjs ({rows: [[{value}...]], affected_row_count}).
// Dos tenants ('demo' y 'demo-b') para verificar el scope por tenant.
// Las tablas tenant_receivables, tenant_collections y tenant_sales_orders
// solo existen aquí para el tablero (alertas de CxC y top clientes): los
// tests las siembran a mano con la misma forma que las migraciones 016/023/029.
const cells=values=>values.map(value=>({value:value??null}));
const ok=(rows=[],affected=0)=>({rows:rows.map(cells),affected_row_count:affected,rowsAffected:affected});

export function createAccountingFakeDb(seed={}){
 const orgA=seed.orgA||'11111111-1111-4111-8111-111111111111';
 const orgB=seed.orgB||'22222222-2222-4222-8222-222222222222';
 const ownerId=seed.ownerId||'33333333-3333-4333-8333-333333333333';
 let tick=0;
 const now=()=>new Date(Date.parse('2026-11-16T00:00:00.000Z')+(++tick)*1000).toISOString();
 const tables={
  accounts:[],entries:[],lines:[],collections:[],receivables:[],orders:[]
 };
 const accountById=(org,id)=>tables.accounts.find(a=>a.organization_id===org&&a.id===id);
 const entryById=(org,id)=>tables.entries.find(e=>e.organization_id===org&&e.id===id);
 const accountView=a=>[a.id,a.code,a.name,a.type,a.nature,a.parent_id,a.active,a.created_at,a.updated_at];
 const entryView=e=>[e.id,e.folio,e.entry_date,e.concept,e.source_type,e.source_id,e.status,e.created_at,e.updated_at];

 async function executeSql(sql,args=[]){
  const s=sql.replace(/\s+/g,' ');
  // --- cuentas ---
  if(s.startsWith('SELECT id,code,name,type,nature,parent_id,active,created_at,updated_at FROM tenant_accounting_accounts WHERE organization_id=? AND id=?')){
   const a=accountById(args[0],args[1]);return ok(a?[accountView(a)]:[]);
  }
  if(s.startsWith('SELECT id,code,name,type,nature,parent_id,active,created_at,updated_at FROM tenant_accounting_accounts WHERE')){
   let list=tables.accounts.filter(a=>a.organization_id===args[0]),i=1;
   if(s.includes('type=?')){const v=args[i++];list=list.filter(a=>a.type===v);}
   if(s.includes('active=1'))list=list.filter(a=>a.active===1);
   list=[...list].sort((a,b)=>a.code.localeCompare(b.code));
   return ok(list.map(accountView));
  }
  if(s.startsWith('INSERT INTO tenant_accounting_accounts(organization_id,id,code,name,type,nature,parent_id,active,created_by)')){
   if(tables.accounts.some(a=>a.organization_id===args[0]&&a.code===args[2]))throw Error('UNIQUE constraint failed: tenant_accounting_accounts.code');
   tables.accounts.push({organization_id:args[0],id:args[1],code:args[2],name:args[3],type:args[4],nature:args[5],
    parent_id:args[6],active:args[7],created_by:args[8],created_at:now(),updated_at:now()});
   return ok([],1);
  }
  if(s.startsWith('INSERT INTO tenant_accounting_accounts(organization_id,id,code,name,type,nature,created_by) SELECT')){
   if(tables.accounts.some(a=>a.organization_id===args[0]&&a.code===args[2]))return ok([],0);
   tables.accounts.push({organization_id:args[0],id:args[1],code:args[2],name:args[3],type:args[4],nature:args[5],
    parent_id:null,active:1,created_by:args[6],created_at:now(),updated_at:now()});
   return ok([],1);
  }
  if(s.startsWith('SELECT COUNT(*) FROM tenant_accounting_entry_lines WHERE organization_id=? AND account_id=?'))
   return ok([[tables.lines.filter(l=>l.organization_id===args[0]&&l.account_id===args[1]).length]]);
  if(s.startsWith('UPDATE tenant_accounting_accounts SET name=')){
   const a=accountById(args[5],args[6]);
   if(a)Object.assign(a,{name:args[0],type:args[1],nature:args[2],parent_id:args[3],active:args[4],updated_at:now()});
   return ok([],a?1:0);
  }
  if(s.startsWith('UPDATE tenant_accounting_accounts SET active=')){
   const a=accountById(args[1],args[2]);
   if(a){a.active=args[0];a.updated_at=now();}
   return ok([],a?1:0);
  }
  // --- movimientos (reportes: solo pólizas registradas en el rango) ---
  if(s.startsWith('SELECT l.account_id,COALESCE(SUM(l.debit_cents),0),COALESCE(SUM(l.credit_cents),0) FROM tenant_accounting_entry_lines l')){
   const map=new Map();
   for(const l of tables.lines.filter(l=>l.organization_id===args[0])){
    const e=entryById(args[0],l.entry_id);
    if(!e||e.status!=='registrada'||e.entry_date<args[1]||e.entry_date>args[2])continue;
    const m=map.get(l.account_id)||{debit:0,credit:0};
    m.debit+=l.debit_cents;m.credit+=l.credit_cents;map.set(l.account_id,m);
   }
   return ok([...map.entries()].map(([id,m])=>[id,m.debit,m.credit]));
  }
  if(s.startsWith('SELECT e.entry_date,COALESCE(SUM(l.credit_cents-l.debit_cents),0) FROM tenant_accounting_entry_lines l')){
   const map=new Map();
   for(const l of tables.lines.filter(l=>l.organization_id===args[0])){
    const e=entryById(args[0],l.entry_id),a=accountById(args[0],l.account_id);
    if(!e||e.status!=='registrada'||a?.type!=='ingreso'||e.entry_date<args[1]||e.entry_date>args[2])continue;
    map.set(e.entry_date,(map.get(e.entry_date)||0)+(l.credit_cents-l.debit_cents));
   }
   return ok([...map.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([day,cents])=>[day,cents]));
  }
  // --- líneas de una póliza ---
  if(s.startsWith('SELECT l.id,l.account_id,l.debit_cents,l.credit_cents,l.memo,a.code,a.name FROM tenant_accounting_entry_lines l')){
   const list=tables.lines.filter(l=>l.organization_id===args[0]&&l.entry_id===args[1])
    .sort((a,b)=>a.created_at.localeCompare(b.created_at));
   return ok(list.map(l=>[l.id,l.account_id,l.debit_cents,l.credit_cents,l.memo,
    accountById(args[0],l.account_id)?.code||null,accountById(args[0],l.account_id)?.name||null]));
  }
  // --- pólizas ---
  if(s.startsWith('SELECT id,folio,entry_date,concept,source_type,source_id,status,created_at,updated_at FROM tenant_accounting_entries WHERE')){
   const e=entryById(args[0],args[1]);return ok(e?[entryView(e)]:[]);
  }
  if(s.startsWith('SELECT e.id,e.folio,e.entry_date,e.concept,e.source_type,e.source_id,e.status,e.created_at,')){
   let list=tables.entries.filter(e=>e.organization_id===args[0]),i=1;
   if(s.includes('e.status=?')){const v=args[i++];list=list.filter(e=>e.status===v);}
   if(s.includes('e.entry_date>=')){const v=args[i++];list=list.filter(e=>e.entry_date>=v);}
   if(s.includes('e.entry_date<=')){const v=args[i++];list=list.filter(e=>e.entry_date<=v);}
   list=[...list].sort((a,b)=>b.entry_date.localeCompare(a.entry_date)||b.folio-a.folio);
   return ok(list.map(e=>[...entryView(e).slice(0,8),
    tables.lines.filter(l=>l.organization_id===e.organization_id&&l.entry_id===e.id).length,
    tables.lines.filter(l=>l.organization_id===e.organization_id&&l.entry_id===e.id).reduce((a,l)=>a+l.debit_cents,0),
    tables.lines.filter(l=>l.organization_id===e.organization_id&&l.entry_id===e.id).reduce((a,l)=>a+l.credit_cents,0)]));
  }
  if(s.startsWith('SELECT COALESCE(MAX(folio),0) FROM tenant_accounting_entries WHERE'))
   return ok([[Math.max(0,...tables.entries.filter(e=>e.organization_id===args[0]).map(e=>e.folio))]]);
  if(s.startsWith('INSERT INTO tenant_accounting_entries(')){
   tables.entries.push({organization_id:args[0],id:args[1],folio:args[2],entry_date:args[3],concept:args[4],
    source_type:args[5],source_id:args[6],status:args[7],created_by:args[8],created_at:now(),updated_at:now()});
   return ok([],1);
  }
  if(s.startsWith('INSERT INTO tenant_accounting_entry_lines(')){
   tables.lines.push({organization_id:args[0],id:args[1],entry_id:args[2],account_id:args[3],
    debit_cents:args[4],credit_cents:args[5],memo:args[6],created_at:now()});
   return ok([],1);
  }
  if(s.startsWith('UPDATE tenant_accounting_entries SET status=')){
   const e=entryById(args[1],args[2]);
   if(e){e.status=args[0];e.updated_at=now();}
   return ok([],e?1:0);
  }
  // --- tablero ---
  if(s.startsWith('SELECT COUNT(*) FROM tenant_accounting_accounts WHERE organization_id=? AND active=1'))
   return ok([[tables.accounts.filter(a=>a.organization_id===args[0]&&a.active===1).length]]);
  if(s.startsWith('SELECT COUNT(*) FROM tenant_accounting_entries WHERE organization_id=? AND status=')){
   const status=s.includes("'registrada'")?'registrada':'borrador';
   return ok([[tables.entries.filter(e=>e.organization_id===args[0]&&e.status===status).length]]);
  }
  if(s.startsWith('SELECT COUNT(*) FROM tenant_accounting_entries WHERE organization_id=?'))
   return ok([[tables.entries.filter(e=>e.organization_id===args[0]).length]]);
  if(s.startsWith('SELECT r.id,r.client_name,r.total_cents,r.due_on,')){
   return ok(tables.receivables.filter(r=>r.organization_id===args[0]&&!r.archived_at).map(r=>[r.id,r.client_name,r.total_cents,r.due_on,
    tables.collections.filter(p=>p.organization_id===args[0]&&p.quote_id===r.quote_id&&!p.archived_at).reduce((a,p)=>a+p.amount_cents,0)]));
  }
  if(s.startsWith('SELECT client_name,SUM(total_cents),COUNT(*) FROM tenant_sales_orders')){
   const map=new Map();
   for(const o of tables.orders.filter(o=>o.organization_id===args[0]&&o.status!=='cancelado')){
    const m=map.get(o.client_name)||{total:0,count:0};m.total+=o.total_cents;m.count++;map.set(o.client_name,m);
   }
   return ok([...map.entries()].map(([name,m])=>[name,m.total,m.count]).sort((a,b)=>b[1]-a[1]).slice(0,5));
  }
  throw Error('Fake DB: sentencia no implementada: '+s.slice(0,140));
 }
 async function executeBatch(commands){
  const results=[];
  for(const command of commands)results.push(await executeSql(command.sql,command.args||[]));
  return results;
 }
 return {tables,orgA,orgB,ownerId,executeSql,executeBatch};
}
export function accountingDeps(fake,session={userId:fake.ownerId,role:'owner'}){
 return {executeSql:fake.executeSql,executeBatch:fake.executeBatch,
  authorize:async(token,slug,toolId)=>{
   if(token==='bad-token')throw Error('Unauthorized');
   if(toolId!=='T023')throw Error('Tool disabled');
   const orgId=slug==='demo'?fake.orgA:slug==='demo-b'?fake.orgB:null;
   if(!orgId)throw Error('Not found');
   return {tenant:{id:orgId},session};
  }};
}
