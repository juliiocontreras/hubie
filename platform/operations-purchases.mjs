import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {normalizePurchaseOrder,normalizeReceipt,nextPurchaseOrderStatus,purchaseOrderStatuses,purchaseOrderStatusLabels} from './tools-p1b-domain.mjs';

const rows=r=>r?.rows?.map(row=>row.map(cell=>cell?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const affected=r=>Number(r?.affected_row_count??r?.rowsAffected??0);
const audit=(org,user,action,id,type='purchase_order')=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',args:[randomUUID(),org,user,action,type,id]});
const select=`SELECT p.id,p.supplier_id,s.name,p.status,p.notes,p.expected_on,p.total_cents,p.received_at,p.created_at,p.updated_at,
 (SELECT COALESCE(SUM(l.received_quantity),0) FROM tenant_purchase_order_lines l WHERE l.organization_id=p.organization_id AND l.purchase_order_id=p.id),
 (SELECT COALESCE(SUM(l.quantity),0) FROM tenant_purchase_order_lines l WHERE l.organization_id=p.organization_id AND l.purchase_order_id=p.id)
 FROM tenant_purchase_orders p LEFT JOIN tenant_suppliers s ON s.organization_id=p.organization_id AND s.id=p.supplier_id`;
const toOrder=r=>({id:r[0],supplierId:r[1],supplierName:r[2]||null,status:r[3],notes:r[4],expectedOn:r[5]||null,
 totalCents:Number(r[6]),receivedAt:r[7]||null,createdAt:r[8],updatedAt:r[9],
 receivedQuantity:Number(r[10]||0),orderedQuantity:Number(r[11]||0)});
const toLine=r=>({id:r[0],itemId:r[1]||null,itemSku:r[2]||null,itemTitle:r[3]||null,description:r[4],
 quantity:Number(r[5]),receivedQuantity:Number(r[6]),unitPriceCents:Number(r[7]),lineTotalCents:Number(r[8]),position:Number(r[9])});

async function loadLines(org,id){
 const result=await executeSql(`SELECT l.id,l.item_id,i.sku,i.title,l.description,l.quantity,l.received_quantity,l.unit_price_cents,l.line_total_cents,l.position
  FROM tenant_purchase_order_lines l LEFT JOIN tenant_inventory_items i ON i.organization_id=l.organization_id AND i.id=l.item_id
  WHERE l.organization_id=? AND l.purchase_order_id=? ORDER BY l.position`,[org,id]);
 return rows(result).map(toLine);
}
async function ensureSupplier(org,id){
 const found=rows(await executeSql('SELECT id FROM tenant_suppliers WHERE organization_id=? AND id=? AND archived_at IS NULL',[org,id]));
 if(!found.length)throw Error('Supplier not found');
}
async function ensureItems(org,lines){
 for(const l of lines){
  if(!l.itemId)continue;
  const found=rows(await executeSql('SELECT id FROM tenant_inventory_items WHERE organization_id=? AND id=? AND archived_at IS NULL',[org,l.itemId]));
  if(!found.length)throw Error('Inventory item not found');
 }
}

export async function listPurchaseOrders(token,slug){
 const {tenant}=await authorizeTool(token,slug,'T008');
 const [orders,suppliers,items]=await Promise.all([
  executeSql(select+' WHERE p.organization_id=? AND p.archived_at IS NULL ORDER BY p.created_at DESC LIMIT 200',[tenant.id]),
  executeSql('SELECT id,name FROM tenant_suppliers WHERE organization_id=? AND archived_at IS NULL ORDER BY name LIMIT 250',[tenant.id]),
  executeSql('SELECT id,sku,title FROM tenant_inventory_items WHERE organization_id=? AND archived_at IS NULL ORDER BY sku LIMIT 250',[tenant.id])
 ]);
 return {orders:rows(orders).map(toOrder),
  suppliers:rows(suppliers).map(s=>({id:s[0],name:s[1]})),
  items:rows(items).map(i=>({id:i[0],sku:i[1],title:i[2]})),
  statuses:purchaseOrderStatuses,statusLabels:purchaseOrderStatusLabels};
}
export async function getPurchaseOrder(token,slug,id){
 const {tenant}=await authorizeTool(token,slug,'T008');
 const found=rows(await executeSql(select+' WHERE p.organization_id=? AND p.id=? AND p.archived_at IS NULL',[tenant.id,id]))[0];
 if(!found)throw Error('Not found');
 const order=toOrder(found);
 return {order:{...order,lines:await loadLines(tenant.id,id)}};
}
export async function createPurchaseOrder(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'T008',true);
 const po=normalizePurchaseOrder(input),id=randomUUID();
 await ensureSupplier(tenant.id,po.supplierId);
 await ensureItems(tenant.id,po.lines);
 await executeBatch([
  {sql:'INSERT INTO tenant_purchase_orders(organization_id,id,supplier_id,status,notes,expected_on,total_cents,created_by) VALUES(?,?,?,?,?,?,?,?)',
   args:[tenant.id,id,po.supplierId,'draft',po.notes,po.expectedOn,po.totalCents,session.userId]},
  ...po.lines.map(l=>({sql:'INSERT INTO tenant_purchase_order_lines(organization_id,purchase_order_id,id,item_id,description,quantity,unit_price_cents,line_total_cents,position) VALUES(?,?,?,?,?,?,?,?,?)',
   args:[tenant.id,id,randomUUID(),l.itemId,l.description,l.quantity,l.unitPriceCents,l.lineTotalCents,l.position]})),
  audit(tenant.id,session.userId,'purchases.created',id)
 ]);
 return {order:{id,...po,status:'draft',receivedQuantity:0,orderedQuantity:po.lines.reduce((s,l)=>s+l.quantity,0)}};
}
export async function setPurchaseOrderStatus(token,slug,id,next){
 const {tenant,session}=await authorizeTool(token,slug,'T008',true);
 const current=rows(await executeSql('SELECT status FROM tenant_purchase_orders WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,id]))[0];
 if(!current)throw Error('Not found');
 nextPurchaseOrderStatus(current[0],next);
 const result=await executeSql('UPDATE tenant_purchase_orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',[next,tenant.id,id]);
 if(!changed(result))throw Error('Not found');
 const a=audit(tenant.id,session.userId,'purchases.'+next,id);
 await executeSql(a.sql,a.args);
 return {ok:true,status:next};
}
export async function archivePurchaseOrder(token,slug,id){
 const {tenant,session}=await authorizeTool(token,slug,'T008',true);
 const current=rows(await executeSql('SELECT status FROM tenant_purchase_orders WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,id]))[0];
 if(!current)throw Error('Not found');
 if(!['draft','cancelled'].includes(current[0]))throw Error('Invalid purchase order status');
 const result=await executeSql('UPDATE tenant_purchase_orders SET archived_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,id]);
 if(!changed(result))throw Error('Not found');
 const a=audit(tenant.id,session.userId,'purchases.archived',id);
 await executeSql(a.sql,a.args);
 return {archived:true};
}
// Recepción ligada al stock: cada partida recibida suma al inventario global
// (tenant_inventory_items) y, si se indica almacén, a sus existencias.
// Recepción parcial permitida: la orden queda partially_received hasta
// completar todas las partidas.
export async function receivePurchaseOrder(token,slug,id,input){
 const {tenant,session}=await authorizeTool(token,slug,'T008',true);
 const receipts=Array.isArray(input?.receipts)?input.receipts.map(r=>normalizeReceipt(r)):[];
 if(!receipts.length)throw Error('Invalid receipt');
 const order=rows(await executeSql('SELECT status FROM tenant_purchase_orders WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,id]))[0];
 if(!order)throw Error('Not found');
 if(!['sent','partially_received'].includes(order[0]))throw Error('Invalid purchase order status');
 const warehouseId=input?.warehouseId??null;
 const warehouseIds=new Set([warehouseId,...receipts.map(r=>r.warehouseId)].filter(Boolean));
 for(const whId of warehouseIds){
  const wh=rows(await executeSql('SELECT id FROM tenant_warehouses WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,whId]));
  if(!wh.length)throw Error('Warehouse not found');
 }
 const lines=await loadLines(tenant.id,id);
 const byId=new Map(lines.map(l=>[l.id,l]));
 const commands=[];
 for(const receipt of receipts){
  const line=byId.get(receipt.lineId);
  if(!line)throw Error('Invalid receipt');
  if(line.receivedQuantity+receipt.quantity>line.quantity)throw Error('Invalid receipt');
  // La partida solo avanza si cabe en lo pedido: UPDATE condicional.
  commands.push({sql:'UPDATE tenant_purchase_order_lines SET received_quantity=received_quantity+? WHERE organization_id=? AND id=? AND received_quantity+?<=quantity',
   args:[receipt.quantity,tenant.id,line.id,receipt.quantity]});
  if(line.itemId){
   commands.push({sql:'UPDATE tenant_inventory_items SET quantity=quantity+?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',
    args:[receipt.quantity,tenant.id,line.itemId]});
   commands.push({sql:'INSERT INTO tenant_inventory_movements(organization_id,id,item_id,delta,note,created_by) VALUES(?,?,?,?,?,?)',
    args:[tenant.id,randomUUID(),line.itemId,receipt.quantity,'Recepción compra '+id.slice(0,8),session.userId]});
   if(warehouseId){
    commands.push({sql:'INSERT INTO tenant_warehouse_stock(organization_id,warehouse_id,item_id,quantity) VALUES(?,?,?,?) ON CONFLICT(organization_id,warehouse_id,item_id) DO UPDATE SET quantity=quantity+excluded.quantity,updated_at=CURRENT_TIMESTAMP',
     args:[tenant.id,receipt.warehouseId??warehouseId,line.itemId,receipt.quantity]});
   }
  }
 }
 const result=await executeBatch(commands);
 const firstLineResult=result?.[0];
 if(!affected(firstLineResult))throw Error('Invalid receipt');
 const after=await loadLines(tenant.id,id);
 const fullyReceived=after.every(l=>l.receivedQuantity>=l.quantity);
 const next=fullyReceived?'received':'partially_received';
 await executeBatch([
  {sql:'UPDATE tenant_purchase_orders SET status=?,received_at=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?',
   args:[next,fullyReceived?new Date().toISOString():null,tenant.id,id]},
  audit(tenant.id,session.userId,'purchases.received',id)
 ]);
 return {ok:true,status:next,lines:after};
}
