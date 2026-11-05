import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {normalizeStockItem,normalizeStockUpdate,normalizeStockMovement} from './workflows.mjs';
const rows=r=>r?.rows?.map(row=>row.map(c=>c?.value??null))??[];
const affected=r=>Number(r?.affected_row_count??r?.rowsAffected??0);
const itemRow=a=>({id:a[0],sku:a[1],title:a[2],location:a[3],quantity:Number(a[4]),lowStock:Number(a[5]),isLow:Number(a[4])<=Number(a[5])});
const movementRow=a=>({id:a[0],itemId:a[1],delta:Number(a[2]),note:a[3],createdAt:a[4]});
const audit=(org,user,action,id,type='inventory_item')=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',args:[randomUUID(),org,user,action,type,id]});
export async function listInventory(token,slug){
 const {tenant}=await authorizeTool(token,slug,'C005');
 const items=await executeSql('SELECT id,sku,title,location,quantity,low_stock FROM tenant_inventory_items WHERE organization_id=? AND archived_at IS NULL ORDER BY sku LIMIT 250',[tenant.id]);
 const movements=await executeSql('SELECT id,item_id,delta,note,created_at FROM tenant_inventory_movements WHERE organization_id=? ORDER BY created_at DESC LIMIT 150',[tenant.id]);
 return {items:rows(items).map(itemRow),movements:rows(movements).map(movementRow)};
}
export async function createStockItem(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'C005',true);
 const data=normalizeStockItem(input),id=randomUUID();
 const r=await executeSql('INSERT INTO tenant_inventory_items(organization_id,id,sku,title,location,low_stock) VALUES(?,?,?,?,?,?) ON CONFLICT(organization_id,sku) DO NOTHING',[tenant.id,id,data.sku,data.title,data.location,data.lowStock]);
 if(!affected(r))throw Error('Duplicate SKU');
 const entry=audit(tenant.id,session.userId,'inventory.item_created',id);
 await executeSql(entry.sql,entry.args);
 return {item:{id,...data,quantity:0}};
}
export async function updateStockItem(token,slug,id,input){
 const {tenant,session}=await authorizeTool(token,slug,'C005',true);
 const data=normalizeStockUpdate(input);
 const r=await executeSql('UPDATE tenant_inventory_items SET title=?,location=?,low_stock=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',[data.title,data.location,data.lowStock,tenant.id,id]);
 if(!affected(r))throw Error('Not found');
 const entry=audit(tenant.id,session.userId,'inventory.item_updated',id);
 await executeSql(entry.sql,entry.args);
 return {ok:true};
}
export async function moveStock(token,slug,itemId,input){
 const {tenant,session}=await authorizeTool(token,slug,'C005',true);
 const data=normalizeStockMovement(input),id=randomUUID();
 const inserts=[
  {sql:`INSERT INTO tenant_inventory_movements(organization_id,id,item_id,delta,note,created_by)
   SELECT ?,?,?,?,?,? FROM tenant_inventory_items
   WHERE organization_id=? AND id=? AND archived_at IS NULL
   AND quantity+? BETWEEN 0 AND 1000000000`,
   args:[tenant.id,id,itemId,data.delta,data.note,session.userId,tenant.id,itemId,data.delta]},
  {sql:`UPDATE tenant_inventory_items SET quantity=quantity+?,updated_at=CURRENT_TIMESTAMP
   WHERE organization_id=? AND id=?
   AND EXISTS (SELECT 1 FROM tenant_inventory_movements WHERE organization_id=? AND id=?)`,
   args:[data.delta,tenant.id,itemId,tenant.id,id]},
  {sql:`INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id)
   SELECT ?,?,?,?, 'inventory_movement',? FROM tenant_inventory_movements
   WHERE organization_id=? AND id=?`,
   args:[randomUUID(),tenant.id,session.userId,'inventory.stock_moved',id,tenant.id,id]}
 ];
 const result=await executeBatch(inserts);
 if(!affected(result?.[0])){
  const found=await executeSql('SELECT quantity FROM tenant_inventory_items WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,itemId]);
  throw Error(rows(found).length?'Insufficient stock':'Not found');
 }
 return {movement:{id,itemId,...data}};
}
