// Base falsa en memoria para los tests de T030 Punto de venta. Implementa
// solo las sentencias de platform/pos-store.mjs con la misma forma de
// resultado que database.mjs ({rows: [[{value}...]], affected_row_count}).
// Dos tenants ('demo' y 'demo-b') para verificar el scope por tenant.
// Catálogo, inventario y caja se siembran en fake.tables desde los tests.
const cells=values=>values.map(value=>({value:value??null}));
const ok=(rows=[],affected=0)=>({rows:rows.map(cells),affected_row_count:affected,rowsAffected:affected});

export function createPosFakeDb(seed={}){
 const orgA=seed.orgA||'11111111-1111-4111-8111-111111111111';
 const orgB=seed.orgB||'22222222-2222-4222-8222-222222222222';
 const ownerId=seed.ownerId||'33333333-3333-4333-8333-333333333333';
 let tick=0;
 const now=()=>new Date(Date.parse('2026-11-16T00:00:00.000Z')+(++tick)*1000).toISOString();
 const tables={catalogItems:[],inventoryItems:[],variants:[],sales:[],saleLines:[],
  payments:[],cashboxes:[],cashboxMovements:[],inventoryMovements:[],variantMovements:[]};
 const saleById=(org,id)=>tables.sales.find(x=>x.organization_id===org&&x.id===id);
 const saleView=x=>[x.id,x.folio,x.client_id,x.client_name,x.method,x.mode,x.subtotal_cents,x.vat_cents,
  x.total_cents,x.payment_id,x.cashbox_id,x.cashbox_movement_id,x.status,x.notes,x.created_at,x.updated_at];
 const lineView=l=>[l.id,l.sale_id,l.catalog_item_id,l.variant_id,l.sku,l.name,l.quantity,l.unit_price_cents,l.line_total_cents,l.stock_deducted,l.created_at];
 const byCreatedDesc=(a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id);

 async function executeSql(sql,args=[]){
  const s=sql.replace(/\s+/g,' ');
  // --- venta por id ---
  if(s.startsWith('SELECT id,folio,client_id,client_name,method,mode,subtotal_cents,vat_cents,total_cents,payment_id,cashbox_id,cashbox_movement_id,status,notes,created_at,updated_at FROM tenant_pos_sales WHERE')){
   const x=saleById(args[0],args[1]);return ok(x?[saleView(x)]:[]);
  }
  // --- líneas de venta ---
  if(s.startsWith('SELECT id,sale_id,catalog_item_id,variant_id,sku,name,quantity,unit_price_cents,line_total_cents,stock_deducted,created_at FROM tenant_pos_sale_lines WHERE')){
   const list=tables.saleLines.filter(l=>l.organization_id===args[0]&&l.sale_id===args[1])
    .sort((a,b)=>a.created_at.localeCompare(b.created_at));
   return ok(list.map(lineView));
  }
  // --- catálogo para vender ---
  if(s.startsWith('SELECT id,sku,name,description,price_cents,category,')){
   const list=[...tables.catalogItems.filter(i=>i.organization_id===args[0]&&!i.archived_at&&i.active===1)]
    .sort((a,b)=>a.name.localeCompare(b.name));
   return ok(list.map(i=>[i.id,i.sku,i.name,i.description,i.price_cents,i.category,null]));
  }
  if(s.startsWith('SELECT id,item_id,label,sku,quantity FROM tenant_inventory_variants WHERE organization_id=? AND archived_at IS NULL ORDER BY')){
   const list=[...tables.variants.filter(v=>v.organization_id===args[0]&&!v.archived_at)]
    .sort((a,b)=>a.item_id.localeCompare(b.item_id)||a.label.localeCompare(b.label));
   return ok(list.map(v=>[v.id,v.item_id,v.label,v.sku,v.quantity]));
  }
  if(s.startsWith('SELECT id,sku,quantity FROM tenant_inventory_items WHERE')){
   return ok(tables.inventoryItems.filter(i=>i.organization_id===args[0]&&!i.archived_at).map(i=>[i.id,i.sku,i.quantity]));
  }
  // --- listar ventas ---
  if(s.startsWith('SELECT s.id,s.folio,s.client_id,s.client_name,s.method,s.mode,s.subtotal_cents,s.vat_cents,s.total_cents,s.payment_id,s.cashbox_id,s.status,s.notes,s.created_at,')){
   const list=[...tables.sales.filter(x=>x.organization_id===args[0])].sort(byCreatedDesc);
   return ok(list.map(x=>[...saleView(x).slice(0,14),
    tables.saleLines.filter(l=>l.organization_id===x.organization_id&&l.sale_id===x.id).length]));
  }
  // --- artículo del catálogo por id ---
  if(s.startsWith('SELECT id,sku,name,price_cents FROM tenant_catalog_items WHERE')){
   const i=tables.catalogItems.find(x=>x.organization_id===args[0]&&x.id===args[1]&&x.active===1&&!x.archived_at);
   return ok(i?[[i.id,i.sku,i.name,i.price_cents]]:[]);
  }
  // --- variante por id / por sku ---
  if(s.startsWith('SELECT id,item_id,sku,quantity FROM tenant_inventory_variants WHERE organization_id=? AND id=?')){
   const v=tables.variants.find(x=>x.organization_id===args[0]&&x.id===args[1]&&!x.archived_at);
   return ok(v?[[v.id,v.item_id,v.sku,v.quantity]]:[]);
  }
  if(s.startsWith('SELECT id,item_id,sku,quantity FROM tenant_inventory_variants WHERE organization_id=? AND sku=?')){
   const v=tables.variants.find(x=>x.organization_id===args[0]&&x.sku===args[1]&&!x.archived_at);
   return ok(v?[[v.id,v.item_id,v.sku,v.quantity]]:[]);
  }
  if(s.startsWith('SELECT sku FROM tenant_inventory_items WHERE')){
   const i=tables.inventoryItems.find(x=>x.organization_id===args[0]&&x.id===args[1]&&!x.archived_at);
   return ok(i?[[i.sku]]:[]);
  }
  // --- folio ---
  if(s.startsWith('SELECT COALESCE(MAX(folio),0) FROM tenant_pos_sales WHERE')){
   const max=tables.sales.filter(x=>x.organization_id===args[0]).reduce((m,x)=>Math.max(m,x.folio),0);
   return ok([[max]]);
  }
  if(s.startsWith('INSERT INTO tenant_pos_sales(')){
   if(tables.sales.some(x=>x.organization_id===args[0]&&x.folio===args[2]))throw Error('UNIQUE constraint failed: tenant_pos_sales.folio');
   tables.sales.push({organization_id:args[0],id:args[1],folio:args[2],client_id:args[3],client_name:args[4],
    method:args[5],mode:args[6],subtotal_cents:args[7],vat_cents:args[8],total_cents:args[9],notes:args[10],
    created_by:args[11],payment_id:null,cashbox_id:null,cashbox_movement_id:null,status:'completada',
    created_at:now(),updated_at:now()});
   return ok([],1);
  }
  if(s.startsWith('INSERT INTO tenant_pos_sale_lines(')){
   tables.saleLines.push({organization_id:args[0],id:args[1],sale_id:args[2],catalog_item_id:args[3],
    variant_id:args[4],sku:args[5],name:args[6],quantity:args[7],unit_price_cents:args[8],
    line_total_cents:args[9],stock_deducted:args[10],created_at:now()});
   return ok([],1);
  }
  if(s.startsWith('INSERT INTO tenant_collections(')){
   tables.payments.push({organization_id:args[0],id:args[1],quote_id:args[2],client_id:args[3],client_name:args[4],
    amount_cents:args[5],paid_on:args[6],method:args[7],reference:args[8],notes:args[9],created_by:args[10],created_at:now()});
   return ok([],1);
  }
  if(s.startsWith('UPDATE tenant_pos_sales SET payment_id=')){
   const x=saleById(args[1],args[2]);
   if(x){x.payment_id=args[0];x.updated_at=now();}
   return ok([],x?1:0);
  }
  if(s.startsWith('UPDATE tenant_inventory_variants SET quantity=quantity-')){
   const v=tables.variants.find(x=>x.organization_id===args[1]&&x.id===args[2]&&!x.archived_at);
   const can=v&&v.quantity>=args[3];
   if(can)v.quantity-=args[0];
   return ok([],can?1:0);
  }
  if(s.startsWith('INSERT INTO tenant_inventory_variant_movements(')){
   tables.variantMovements.push({organization_id:args[0],id:args[1],variant_id:args[2],item_id:args[3],
    delta:args[4],note:args[5],created_by:args[6],created_at:now()});
   return ok([],1);
  }
  if(s.startsWith('UPDATE tenant_inventory_items SET quantity=quantity-')){
   const i=tables.inventoryItems.find(x=>x.organization_id===args[1]&&x.id===args[2]&&!x.archived_at);
   const can=i&&i.quantity>=args[3];
   if(can)i.quantity-=args[0];
   return ok([],can?1:0);
  }
  if(s.startsWith('INSERT INTO tenant_inventory_movements(')){
   tables.inventoryMovements.push({organization_id:args[0],id:args[1],item_id:args[2],delta:args[3],note:args[4],created_by:args[5],created_at:now()});
   return ok([],1);
  }
  if(s.startsWith('UPDATE tenant_pos_sale_lines SET stock_deducted=1')){
   const l=tables.saleLines.find(x=>x.organization_id===args[1]&&x.id===args[2]);
   if(l){l.stock_deducted=1;l.variant_id=args[0];}
   return ok([],l?1:0);
  }
  // --- caja abierta ---
  if(s.startsWith("SELECT id FROM tenant_cashboxes WHERE organization_id=? AND status='open' LIMIT 1")){
   const b=tables.cashboxes.find(x=>x.organization_id===args[0]&&x.status==='open');
   return ok(b?[[b.id]]:[]);
  }
  if(s.startsWith('INSERT INTO tenant_cashbox_movements(')){
   tables.cashboxMovements.push({organization_id:args[0],cashbox_id:args[1],id:args[2],direction:args[3],
    kind:args[4],amount_cents:args[5],source_type:args[6],source_id:args[7],notes:args[8],created_by:args[9],created_at:now()});
   return ok([],1);
  }
  if(s.startsWith('UPDATE tenant_pos_sales SET cashbox_id=')){
   const x=saleById(args[2],args[3]);
   if(x){x.cashbox_id=args[0];x.cashbox_movement_id=args[1];x.updated_at=now();}
   return ok([],x?1:0);
  }
  // --- tablero ---
  if(s.startsWith("SELECT (SELECT COUNT(*) FROM tenant_pos_sales WHERE organization_id=? AND substr(created_at,1,10)=date('now')")){
   const org=args[0],day=now().slice(0,10);
   const todaySales=tables.sales.filter(x=>x.organization_id===org&&x.created_at.slice(0,10)===day&&x.status==='completada');
   const all=tables.sales.filter(x=>x.organization_id===org&&x.status==='completada');
   return ok([[todaySales.length,todaySales.reduce((a,x)=>a+x.total_cents,0),all.length,all.reduce((a,x)=>a+x.total_cents,0)]]);
  }
  if(s.startsWith("SELECT method,COUNT(*),COALESCE(SUM(total_cents),0) FROM tenant_pos_sales WHERE")){
   const by={};
   for(const x of tables.sales.filter(x=>x.organization_id===args[0]&&x.status==='completada')){
    by[x.method]=by[x.method]||[x.method,0,0];by[x.method][1]++;by[x.method][2]+=x.total_cents;
   }
   return ok(Object.values(by));
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
export function posDeps(fake,session={userId:fake.ownerId,role:'owner'}){
 return {executeSql:fake.executeSql,executeBatch:fake.executeBatch,
  authorize:async(token,slug,toolId)=>{
   if(token==='bad-token')throw Error('Unauthorized');
   if(toolId!=='T030')throw Error('Tool disabled');
   const orgId=slug==='demo'?fake.orgA:slug==='demo-b'?fake.orgB:null;
   if(!orgId)throw Error('Not found');
   return {tenant:{id:orgId},session};
  }};
}
