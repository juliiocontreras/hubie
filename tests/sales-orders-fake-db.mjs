// Base falsa en memoria para los tests de T024 Pedidos de venta. Implementa
// solo las sentencias de platform/sales-orders-store.mjs con la misma forma
// de resultado que database.mjs ({rows: [[{value}...]], affected_row_count}).
// Dos tenants ('demo' y 'demo-b') para verificar el scope por tenant.
// Las cotizaciones se siembran a mano: {organization_id,id,client_id,
// client_name,title,vat_rate,subtotal_cents,vat_cents,total_cents,status,
// updated_at,archived_at,lines:[{description,quantity,unit_price_cents}]}.
const cells=values=>values.map(value=>({value:value??null}));
const ok=(rows=[],affected=0)=>({rows:rows.map(cells),affected_row_count:affected,rowsAffected:affected});

export function createSalesOrdersFakeDb(seed={}){
 const orgA=seed.orgA||'11111111-1111-4111-8111-111111111111';
 const orgB=seed.orgB||'22222222-2222-4222-8222-222222222222';
 const ownerId=seed.ownerId||'33333333-3333-4333-8333-333333333333';
 let tick=0;
 const now=()=>new Date(Date.parse('2026-11-16T00:00:00.000Z')+(++tick)*1000).toISOString();
 const tables={
  orders:[],orderLines:[],quotes:[],collections:[],invoices:[],receivables:[]
 };
 const orderById=(org,id)=>tables.orders.find(o=>o.organization_id===org&&o.id===id);
 const quoteById=(org,id)=>tables.quotes.find(q=>q.organization_id===org&&q.id===id);
 const paidForQuote=(org,quoteId)=>tables.collections.filter(p=>p.organization_id===org&&p.quote_id===quoteId&&!p.archived_at).reduce((a,p)=>a+p.amount_cents,0);
 const orderView=o=>[o.id,o.folio,o.quote_id,o.client_id,o.client_name,o.title,o.subtotal_cents,o.vat_cents,o.total_cents,o.vat_rate,o.status,o.delivery_date,o.carrier,o.tracking_code,o.notes,o.invoice_id,o.receivable_id,o.created_at,o.updated_at];

 async function executeSql(sql,args=[]){
  const s=sql.replace(/\s+/g,' ');
  // --- pedido por id / líneas / cobros ---
  if(s.startsWith('SELECT id,folio,quote_id,client_id,client_name,title,subtotal_cents,vat_cents,total_cents,vat_rate,status,delivery_date,carrier,tracking_code,notes,invoice_id,receivable_id,created_at,updated_at FROM tenant_sales_orders WHERE')){
   const o=orderById(args[0],args[1]);return ok(o?[orderView(o)]:[]);
  }
  if(s.startsWith('SELECT id,description,quantity,unit_price_cents,line_total_cents,position FROM tenant_sales_order_lines WHERE')){
   const list=tables.orderLines.filter(l=>l.organization_id===args[0]&&l.order_id===args[1]).sort((a,b)=>a.position-b.position);
   return ok(list.map(l=>[l.id,l.description,l.quantity,l.unit_price_cents,l.line_total_cents,l.position]));
  }
  if(s.startsWith('SELECT COALESCE(SUM(amount_cents),0) FROM tenant_collections WHERE organization_id=? AND quote_id=?'))
   return ok([[paidForQuote(args[0],args[1])]]);
  if(s.startsWith('SELECT id,folio,quote_id,client_name,rfc,items_json,subtotal_cents,vat_cents,total_cents,vat_rate,status,notes,created_at FROM tenant_invoices WHERE')){
   const inv=tables.invoices.find(x=>x.organization_id===args[0]&&x.id===args[1]&&!x.archived_at);
   return ok(inv?[[inv.id,inv.folio,inv.quote_id,inv.client_name,inv.rfc,inv.items_json,inv.subtotal_cents,inv.vat_cents,inv.total_cents,inv.vat_rate,inv.status,inv.notes,inv.created_at]]:[]);
  }
  if(s.startsWith('SELECT id,quote_id,client_id,client_name,total_cents,due_on,notes,created_at FROM tenant_receivables WHERE')){
   const r=tables.receivables.find(x=>x.organization_id===args[0]&&x.id===args[1]&&!x.archived_at);
   return ok(r?[[r.id,r.quote_id,r.client_id,r.client_name,r.total_cents,r.due_on,r.notes,r.created_at]]:[]);
  }
  // --- listar pedidos + cotizaciones disponibles ---
  if(s.startsWith('SELECT o.id,o.folio,o.quote_id,o.client_id,o.client_name,o.title,o.subtotal_cents,o.vat_cents,o.total_cents,o.vat_rate,o.status,o.delivery_date,o.carrier,o.tracking_code,o.notes,o.invoice_id,o.receivable_id,o.created_at,o.updated_at,')){
   let list=tables.orders.filter(o=>o.organization_id===args[0]);
   if(s.includes('o.status=?'))list=list.filter(o=>o.status===args[1]);
   list=[...list].sort((a,b)=>b.folio-a.folio);
   return ok(list.map(o=>[...orderView(o),paidForQuote(args[0],o.quote_id)]));
  }
  if(s.startsWith('SELECT q.id,q.title,q.client_name,q.total_cents FROM tenant_quotes q')){
   const list=tables.quotes.filter(q=>q.organization_id===args[0]&&!q.archived_at&&q.status==='accepted'&&
    !tables.orders.some(o=>o.organization_id===args[0]&&o.quote_id===q.id&&o.status!=='cancelado'))
    .sort((a,b)=>b.updated_at.localeCompare(a.updated_at));
   return ok(list.map(q=>[q.id,q.title,q.client_name,q.total_cents]));
  }
  // --- cotización origen ---
  if(s.startsWith('SELECT client_id,client_name,title,vat_rate,subtotal_cents,vat_cents,total_cents,status FROM tenant_quotes WHERE')){
   const q=quoteById(args[0],args[1]);
   return ok(q&&!q.archived_at?[[q.client_id,q.client_name,q.title,q.vat_rate,q.subtotal_cents,q.vat_cents,q.total_cents,q.status]]:[]);
  }
  if(s.startsWith('SELECT client_id,client_name,total_cents,status FROM tenant_quotes WHERE')){
   const q=quoteById(args[0],args[1]);
   return ok(q&&!q.archived_at?[[q.client_id,q.client_name,q.total_cents,q.status]]:[]);
  }
  if(s.startsWith('SELECT description,quantity,unit_price_cents FROM tenant_quote_lines WHERE')){
   const q=quoteById(args[0],args[1]);
   return ok(q?(q.lines||[]).map(l=>[l.description,l.quantity,l.unit_price_cents]):[]);
  }
  if(s.startsWith("SELECT id FROM tenant_sales_orders WHERE organization_id=? AND quote_id=? AND status!='cancelado'")){
   const found=tables.orders.find(o=>o.organization_id===args[0]&&o.quote_id===args[1]&&o.status!=='cancelado');
   return ok(found?[[found.id]]:[]);
  }
  if(s.startsWith('SELECT COALESCE(MAX(folio),0) FROM tenant_sales_orders WHERE'))
   return ok([[Math.max(0,...tables.orders.filter(o=>o.organization_id===args[0]).map(o=>o.folio))]]);
  if(s.startsWith('SELECT COALESCE(MAX(folio),0) FROM tenant_invoices WHERE'))
   return ok([[Math.max(0,...tables.invoices.filter(x=>x.organization_id===args[0]).map(x=>x.folio))]]);
  // --- escrituras de pedido ---
  if(s.startsWith('INSERT INTO tenant_sales_orders(')){
   tables.orders.push({organization_id:args[0],id:args[1],folio:args[2],quote_id:args[3],client_id:args[4],client_name:args[5],
    title:args[6],subtotal_cents:args[7],vat_cents:args[8],total_cents:args[9],vat_rate:args[10],status:args[11],
    delivery_date:null,carrier:'',tracking_code:'',notes:'',invoice_id:null,receivable_id:null,
    created_by:args[12],created_at:now(),updated_at:now()});
   return ok([],1);
  }
  if(s.startsWith('INSERT INTO tenant_sales_order_lines(')){
   tables.orderLines.push({organization_id:args[0],order_id:args[1],id:args[2],description:args[3],quantity:args[4],
    unit_price_cents:args[5],line_total_cents:args[6],position:args[7]});
   return ok([],1);
  }
  if(s.startsWith('UPDATE tenant_sales_orders SET notes=')){
   const o=orderById(args[1],args[2]);
   if(o){o.notes=args[0];o.updated_at=now();}
   return ok([],o?1:0);
  }
  if(s.startsWith('UPDATE tenant_sales_orders SET status=')){
   const o=orderById(args[1],args[2]);
   if(o){o.status=args[0];o.updated_at=now();}
   return ok([],o?1:0);
  }
  if(s.startsWith('UPDATE tenant_sales_orders SET delivery_date=')){
   const o=orderById(args[3],args[4]);
   if(o){o.delivery_date=args[0];o.carrier=args[1];o.tracking_code=args[2];o.updated_at=now();}
   return ok([],o?1:0);
  }
  if(s.startsWith('UPDATE tenant_sales_orders SET invoice_id=')){
   const o=orderById(args[1],args[2]);
   if(o){o.invoice_id=args[0];o.updated_at=now();}
   return ok([],o?1:0);
  }
  if(s.startsWith('UPDATE tenant_sales_orders SET receivable_id=')){
   const o=orderById(args[1],args[2]);
   if(o){o.receivable_id=args[0];o.updated_at=now();}
   return ok([],o?1:0);
  }
  // --- conversiones ---
  if(s.startsWith('INSERT INTO tenant_collections(')){
   tables.collections.push({organization_id:args[0],id:args[1],quote_id:args[2],client_id:args[3],client_name:args[4],
    amount_cents:args[5],paid_on:args[6],method:args[7],reference:args[8],notes:args[9],created_by:args[10],archived_at:null,created_at:now(),updated_at:now()});
   return ok([],1);
  }
  if(s.startsWith('INSERT INTO tenant_invoices(')){
   tables.invoices.push({organization_id:args[0],id:args[1],folio:args[2],quote_id:args[3],client_name:args[4],rfc:args[5],
    items_json:args[6],subtotal_cents:args[7],vat_cents:args[8],total_cents:args[9],vat_rate:args[10],status:args[11],
    notes:args[12],created_by:args[13],archived_at:null,created_at:now(),updated_at:now()});
   return ok([],1);
  }
  if(s.startsWith('SELECT id FROM tenant_receivables WHERE organization_id=? AND quote_id=? AND archived_at IS NULL')){
   const found=tables.receivables.find(r=>r.organization_id===args[0]&&r.quote_id===args[1]&&!r.archived_at);
   return ok(found?[[found.id]]:[]);
  }
  if(s.startsWith('INSERT INTO tenant_receivables(')){
   tables.receivables.push({organization_id:args[0],id:args[1],quote_id:args[2],client_id:args[3],client_name:args[4],
    total_cents:args[5],due_on:args[6],notes:args[7],created_by:args[8],archived_at:null,created_at:now(),updated_at:now()});
   return ok([],1);
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
export function salesOrdersDeps(fake,session={userId:fake.ownerId,role:'owner'}){
 return {executeSql:fake.executeSql,executeBatch:fake.executeBatch,
  authorize:async(token,slug,toolId)=>{
   if(token==='bad-token')throw Error('Unauthorized');
   if(toolId!=='T024')throw Error('Tool disabled');
   const orgId=slug==='demo'?fake.orgA:slug==='demo-b'?fake.orgB:null;
   if(!orgId)throw Error('Not found');
   return {tenant:{id:orgId},session};
  }};
}
