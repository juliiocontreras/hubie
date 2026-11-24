import {randomUUID} from 'node:crypto';
import {executeSql as realExecuteSql,executeBatch as realExecuteBatch} from '../database.mjs';
import {authorizeTool as realAuthorize} from './records.mjs';
import {normalizeSale,saleTotals,formatPosFolio,POS_MODE_LABELS} from './pos-domain.mjs';
// T030 Punto de venta. Patrón de inyección de dependencias como
// training-store: `deps` permite probar el store con una base falsa sin
// tocar Turso; sin deps usa los clientes reales.
//
// Reglas de la venta (ver turso/migrations/035_pos.sql):
// - El precio de cada línea se toma del catálogo (C006) en servidor; el
//   cliente nunca fija precios. IVA 16% sobre precios base SIN IVA.
// - El cobro se registra en tenant_collections (la tabla de T014) con
//   referencia al folio; no se re-autoriza T014 para no exigir esa tool.
// - Existencias: si el producto tiene variante de inventario por SKU exacto
//   (C005, tenant_inventory_variants) con cantidad suficiente, se descuenta
//   y se registran los movimientos; si no hay variante o no alcanza, la
//   venta se hace igual y el aviso queda en `warnings` (nunca se bloquea).
// - Caja: si el método es efectivo y hay caja abierta (T016), el movimiento
//   va a tenant_cashbox_movements; si no hay caja abierta, solo se avisa.
//   Tarjeta y transferencia no generan movimiento de caja.
const depsOf=d=>({executeSql:d?.executeSql||realExecuteSql,executeBatch:d?.executeBatch||realExecuteBatch,authorize:d?.authorize||realAuthorize});
const rows=r=>r?.rows?.map(a=>a.map(c=>c?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const num=v=>Number(v||0);
function validId(id,label){if(typeof id!=='string'||!uuid.test(id))throw Error(label);}
const today=()=>new Date().toISOString().slice(0,10);
async function saleFor(db,org,id){
 validId(id,'Invalid sale');
 const row=rows(await db.executeSql('SELECT id,folio,client_id,client_name,method,mode,subtotal_cents,vat_cents,total_cents,payment_id,cashbox_id,cashbox_movement_id,status,notes,created_at,updated_at FROM tenant_pos_sales WHERE organization_id=? AND id=?',[org,id]))[0];
 if(!row)throw Error('Not found');
 return {id:row[0],folio:num(row[1]),folioText:formatPosFolio(num(row[1])),clientId:row[2],clientName:row[3],method:row[4],mode:row[5],
  subtotalCents:num(row[6]),vatCents:num(row[7]),totalCents:num(row[8]),paymentId:row[9],cashboxId:row[10],cashboxMovementId:row[11],
  status:row[12],notes:row[13],createdAt:row[14],updatedAt:row[15]};
}
async function linesOf(db,org,saleId){
 const r=await db.executeSql('SELECT id,sale_id,catalog_item_id,variant_id,sku,name,quantity,unit_price_cents,line_total_cents,stock_deducted,created_at FROM tenant_pos_sale_lines WHERE organization_id=? AND sale_id=? ORDER BY created_at ASC',[org,saleId]);
 return rows(r).map(x=>({id:x[0],saleId:x[1],catalogItemId:x[2],variantId:x[3],sku:x[4],name:x[5],quantity:num(x[6]),
  unitPriceCents:num(x[7]),lineTotalCents:num(x[8]),stockDeducted:x[9]===1,createdAt:x[10]}));
}
// Catálogo para vender: solo artículos activos, con sus variantes de
// inventario (por SKU del artículo) y la existencia del artículo.
export async function catalogForSale(token,slug,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T030');
 const [items,variants,stock]=await Promise.all([
  db.executeSql(`SELECT id,sku,name,description,price_cents,category,
  (SELECT m.id FROM pwa_media m WHERE m.organization_id=i.organization_id AND m.kind='attachment' AND m.tool_id='C006' AND m.record_id=i.id AND m.mime LIKE 'image/%' ORDER BY m.rowid DESC LIMIT 1)
  FROM tenant_catalog_items i WHERE i.organization_id=? AND i.archived_at IS NULL AND i.active=1 ORDER BY i.name LIMIT 250`,[tenant.id]),
  db.executeSql('SELECT id,item_id,label,sku,quantity FROM tenant_inventory_variants WHERE organization_id=? AND archived_at IS NULL ORDER BY item_id,label LIMIT 500',[tenant.id]),
  db.executeSql('SELECT id,sku,quantity FROM tenant_inventory_items WHERE organization_id=? AND archived_at IS NULL',[tenant.id])
 ]);
 const stockBySku=new Map(rows(stock).map(x=>[x[1],{itemId:x[0],quantity:num(x[2])}]));
 const variantsByItem=new Map();
 for(const v of rows(variants)){
  const itemId=v[1];
  if(!variantsByItem.has(itemId))variantsByItem.set(itemId,[]);
  variantsByItem.get(itemId).push({id:v[0],itemId:v[1],label:v[2],sku:v[3],quantity:num(v[4])});
 }
 const categories=new Set();
 const list=rows(items).map(x=>{
  const sku=x[1],entry=stockBySku.get(sku);
  const itemVariants=entry?variantsByItem.get(entry.itemId)||[]:[];
  categories.add(x[5]);
  return {id:x[0],sku,name:x[2],description:x[3],priceCents:num(x[4]),category:x[5],
   photoUrl:x[6]?'/api/app/'+encodeURIComponent(slug)+'/attachments/'+x[6]:null,
   stock:entry?num(entry.quantity):null,variants:itemVariants};
 });
 return {items:list,categories:[...categories].sort()};
}
export async function listSales(token,slug,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T030');
 const r=await db.executeSql(`SELECT s.id,s.folio,s.client_id,s.client_name,s.method,s.mode,s.subtotal_cents,s.vat_cents,s.total_cents,s.payment_id,s.cashbox_id,s.status,s.notes,s.created_at,
  (SELECT COUNT(*) FROM tenant_pos_sale_lines l WHERE l.organization_id=s.organization_id AND l.sale_id=s.id)
  FROM tenant_pos_sales s WHERE s.organization_id=? ORDER BY s.created_at DESC LIMIT 100`,[tenant.id]);
 return {sales:rows(r).map(x=>({id:x[0],folio:num(x[1]),folioText:formatPosFolio(num(x[1])),clientId:x[2],clientName:x[3],method:x[4],mode:x[5],
  subtotalCents:num(x[6]),vatCents:num(x[7]),totalCents:num(x[8]),paymentId:x[9],cashboxId:x[10],status:x[11],notes:x[12],createdAt:x[13],lines:num(x[14])}))};
}
export async function getSale(token,slug,id,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T030');
 const sale=await saleFor(db,tenant.id,id);
 return {sale:{...sale,lines:await linesOf(db,tenant.id,id)}};
}
export async function createSale(token,slug,input,deps){
 const db=depsOf(deps);
 const {tenant,session}=await db.authorize(token,slug,'T030',true);
 const data=normalizeSale(input);
 const org=tenant.id;
 // Precio siempre del catálogo; la variante elegida (si la hay) debe
 // pertenecer al artículo de inventario con el mismo SKU del catálogo.
 const priced=[];
 for(const line of data.lines){
  const item=rows(await db.executeSql('SELECT id,sku,name,price_cents FROM tenant_catalog_items WHERE organization_id=? AND id=? AND active=1 AND archived_at IS NULL',[org,line.catalogItemId]))[0];
  if(!item)throw Error('Not found');
  let variant=null;
  if(line.variantId){
   const v=rows(await db.executeSql('SELECT id,item_id,sku,quantity FROM tenant_inventory_variants WHERE organization_id=? AND id=? AND archived_at IS NULL',[org,line.variantId]))[0];
   if(!v)throw Error('Not found');
   const parent=rows(await db.executeSql('SELECT sku FROM tenant_inventory_items WHERE organization_id=? AND id=? AND archived_at IS NULL',[org,v[1]]))[0];
   if(!parent||parent[0]!==item[1])throw Error('Invalid sale');
   variant={id:v[0],itemId:v[1],sku:v[2],quantity:num(v[3])};
  }
  priced.push({catalogItemId:line.catalogItemId,variantId:variant?.id||null,variant,
   sku:item[1],name:item[2],quantity:line.quantity,unitPriceCents:num(item[3]),
   lineTotalCents:line.quantity*num(item[3])});
 }
 const totals=saleTotals(priced);
 const saleId=randomUUID();
 const warnings=[],stockDeducted=[];
 // Folio secuencial por tenant con reintento ante colisión (UNIQUE org+folio).
 let folio=null;
 for(let attempt=0;attempt<5&&folio===null;attempt++){
  const max=num(rows(await db.executeSql('SELECT COALESCE(MAX(folio),0) FROM tenant_pos_sales WHERE organization_id=?',[org]))[0]?.[0]);
  const candidate=max+1;
  try{
   const r=await db.executeSql('INSERT INTO tenant_pos_sales(organization_id,id,folio,client_id,client_name,method,mode,subtotal_cents,vat_cents,total_cents,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
    [org,saleId,candidate,data.clientId,data.clientName,data.method,data.mode,totals.subtotalCents,totals.vatCents,totals.totalCents,data.notes,session.userId]);
   if(changed(r))folio=candidate;
  }catch(e){
   if(!/UNIQUE constraint failed/i.test(e?.message||''))throw e;
  }
 }
 if(folio===null)throw Error('Invalid sale');
 const folioText=formatPosFolio(folio);
 const lineStatements=priced.map(l=>({sql:'INSERT INTO tenant_pos_sale_lines(organization_id,id,sale_id,catalog_item_id,variant_id,sku,name,quantity,unit_price_cents,line_total_cents,stock_deducted) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
  args:[org,randomUUID(),saleId,l.catalogItemId,l.variantId,l.sku,l.name,l.quantity,l.unitPriceCents,l.lineTotalCents,0]}));
 await db.executeBatch(lineStatements);
 const lines=await linesOf(db,org,saleId);
 const lineBySku=new Map(lines.map(l=>[l.catalogItemId+':'+(l.variantId||''),l]));
 // Cobro en tenant_collections (tabla de T014), referencia al folio.
 const paymentId=randomUUID();
 await db.executeSql('INSERT INTO tenant_collections(organization_id,id,quote_id,client_id,client_name,amount_cents,paid_on,method,reference,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
  [org,paymentId,null,data.clientId,data.clientName,totals.totalCents,today(),data.method,folioText,'Venta punto de venta '+folioText,session.userId]);
 await db.executeSql('UPDATE tenant_pos_sales SET payment_id=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',[paymentId,org,saleId]);
 // Descuento de existencias por línea (variante por SKU exacto o variante
 // elegida). Sin variante o sin cantidad suficiente: se vende igual.
 for(const l of priced){
  const lineRow=lineBySku.get(l.catalogItemId+':'+(l.variantId||''));
  let variant=l.variant;
  if(!variant){
   const v=rows(await db.executeSql('SELECT id,item_id,sku,quantity FROM tenant_inventory_variants WHERE organization_id=? AND sku=? AND archived_at IS NULL LIMIT 1',[org,l.sku]))[0];
   if(v)variant={id:v[0],itemId:v[1],sku:v[2],quantity:num(v[3])};
  }
  if(!variant){
   warnings.push('Sin inventario para '+l.sku+' ('+l.name+'): se vendió sin descontar existencias.');
   continue;
  }
  if(variant.quantity<l.quantity){
   warnings.push('Existencias insuficientes para '+variant.sku+' ('+l.name+'): hay '+variant.quantity+' y se vendieron '+l.quantity+'. Se vendió sin descontar.');
   continue;
  }
  const updated=await db.executeSql('UPDATE tenant_inventory_variants SET quantity=quantity-?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND quantity>=?',
   [l.quantity,org,variant.id,l.quantity]);
  if(!changed(updated)){
   warnings.push('Existencias insuficientes para '+variant.sku+' ('+l.name+'): se vendió sin descontar.');
   continue;
  }
  await db.executeBatch([
   {sql:'INSERT INTO tenant_inventory_variant_movements(organization_id,id,variant_id,item_id,delta,note,created_by) VALUES(?,?,?,?,?,?,?)',
    args:[org,randomUUID(),variant.id,variant.itemId,-l.quantity,'Venta '+folioText,session.userId]},
   {sql:'UPDATE tenant_inventory_items SET quantity=quantity-?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND quantity>=?',
    args:[l.quantity,org,variant.itemId,l.quantity]},
   {sql:'INSERT INTO tenant_inventory_movements(organization_id,id,item_id,delta,note,created_by) VALUES(?,?,?,?,?,?)',
    args:[org,randomUUID(),variant.itemId,-l.quantity,'Venta '+folioText,session.userId]}
  ]);
  if(lineRow)await db.executeSql('UPDATE tenant_pos_sale_lines SET stock_deducted=1,variant_id=? WHERE organization_id=? AND id=?',[variant.id,org,lineRow.id]);
  stockDeducted.push({sku:variant.sku,quantity:l.quantity,variantId:variant.id});
 }
 // Caja: solo el efectivo pasa por caja, y solo si hay caja abierta.
 let cashboxNote=null,cashboxMovementId=null,cashboxId=null;
 if(data.method==='efectivo'){
  const box=rows(await db.executeSql("SELECT id FROM tenant_cashboxes WHERE organization_id=? AND status='open' LIMIT 1",[org]))[0];
  if(box){
   cashboxId=box[0];cashboxMovementId=randomUUID();
   await db.executeSql('INSERT INTO tenant_cashbox_movements(organization_id,cashbox_id,id,direction,kind,amount_cents,source_type,source_id,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)',
    [org,cashboxId,cashboxMovementId,'in','venta',totals.totalCents,'collection',paymentId,'Venta '+folioText,session.userId]);
   await db.executeSql('UPDATE tenant_pos_sales SET cashbox_id=?,cashbox_movement_id=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',
    [cashboxId,cashboxMovementId,org,saleId]);
  }else{
   warnings.push('Sin caja abierta: la venta se registró sin movimiento de caja. Abre la caja (T016) para registrar el efectivo.');
  }
 }else{
  cashboxNote='Cobro con '+data.method+': no genera movimiento de caja (solo el efectivo pasa por caja).';
 }
 const sale=await saleFor(db,org,saleId);
 return {sale:{...sale,lines:await linesOf(db,org,saleId)},
  payment:{id:paymentId,amountCents:totals.totalCents,method:data.method,reference:folioText},
  warnings,stockDeducted,cashboxNote};
}
export async function dashboard(token,slug,deps){
 const db=depsOf(deps);
 const {tenant}=await db.authorize(token,slug,'T030');
 const org=tenant.id;
 const totals=await db.executeSql(`SELECT
  (SELECT COUNT(*) FROM tenant_pos_sales WHERE organization_id=? AND substr(created_at,1,10)=date('now') AND status='completada'),
  (SELECT COALESCE(SUM(total_cents),0) FROM tenant_pos_sales WHERE organization_id=? AND substr(created_at,1,10)=date('now') AND status='completada'),
  (SELECT COUNT(*) FROM tenant_pos_sales WHERE organization_id=? AND status='completada'),
  (SELECT COALESCE(SUM(total_cents),0) FROM tenant_pos_sales WHERE organization_id=? AND status='completada')`,
  [org,org,org,org]);
 const t=rows(totals)[0]||[];
 const byMethod=await db.executeSql("SELECT method,COUNT(*),COALESCE(SUM(total_cents),0) FROM tenant_pos_sales WHERE organization_id=? AND status='completada' GROUP BY method",[org]);
 const methods={};
 for(const m of rows(byMethod))methods[m[0]]={count:num(m[1]),totalCents:num(m[2])};
 const recent=(await listSales(token,slug,deps)).sales.slice(0,10);
 return {today:{count:num(t[0]),totalCents:num(t[1])},totals:{count:num(t[2]),totalCents:num(t[3])},byMethod:methods,recent};
}
export {POS_MODE_LABELS};
