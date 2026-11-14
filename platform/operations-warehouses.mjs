import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {normalizeWarehouse,normalizeTransfer} from './tools-p1b-domain.mjs';

const rows=r=>r?.rows?.map(row=>row.map(cell=>cell?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const affected=r=>Number(r?.affected_row_count??r?.rowsAffected??0);
const audit=(org,user,action,id,type='warehouse')=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',args:[randomUUID(),org,user,action,type,id]});

export async function listWarehouses(token,slug){
 const {tenant}=await authorizeTool(token,slug,'T010');
 const [warehouses,stock,transfers,items]=await Promise.all([
  executeSql('SELECT id,name,location,responsible,created_at,updated_at FROM tenant_warehouses WHERE organization_id=? AND archived_at IS NULL ORDER BY name LIMIT 100',[tenant.id]),
  executeSql(`SELECT s.warehouse_id,s.item_id,s.quantity,i.sku,i.title FROM tenant_warehouse_stock s
   JOIN tenant_inventory_items i ON i.organization_id=s.organization_id AND i.id=s.item_id
   WHERE s.organization_id=? AND s.quantity>0 ORDER BY s.warehouse_id,i.sku LIMIT 500`,[tenant.id]),
  executeSql(`SELECT t.id,t.from_warehouse_id,t.to_warehouse_id,t.item_id,t.quantity,t.note,t.created_at,
   wf.name,wt.name,i.sku FROM tenant_warehouse_transfers t
   JOIN tenant_warehouses wf ON wf.organization_id=t.organization_id AND wf.id=t.from_warehouse_id
   JOIN tenant_warehouses wt ON wt.organization_id=t.organization_id AND wt.id=t.to_warehouse_id
   JOIN tenant_inventory_items i ON i.organization_id=t.organization_id AND i.id=t.item_id
   WHERE t.organization_id=? ORDER BY t.created_at DESC LIMIT 150`,[tenant.id]),
  executeSql('SELECT id,sku,title,quantity FROM tenant_inventory_items WHERE organization_id=? AND archived_at IS NULL ORDER BY sku LIMIT 250',[tenant.id])
 ]);
 const stockByWarehouse={};
 for(const s of rows(stock)){
  (stockByWarehouse[s[0]]??=[]).push({itemId:s[1],quantity:Number(s[2]),sku:s[3],title:s[4]});
 }
 return {warehouses:rows(warehouses).map(w=>({id:w[0],name:w[1],location:w[2],responsible:w[3],createdAt:w[4],updatedAt:w[5],stock:stockByWarehouse[w[0]]||[]})),
  transfers:rows(transfers).map(t=>({id:t[0],fromWarehouseId:t[1],toWarehouseId:t[2],itemId:t[3],quantity:Number(t[4]),note:t[5],createdAt:t[6],fromName:t[7],toName:t[8],sku:t[9]})),
  items:rows(items).map(i=>({id:i[0],sku:i[1],title:i[2],quantity:Number(i[3])}))};
}
export async function createWarehouse(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'T010',true);
 const w=normalizeWarehouse(input),id=randomUUID();
 await executeBatch([
  {sql:'INSERT INTO tenant_warehouses(organization_id,id,name,location,responsible,created_by) VALUES(?,?,?,?,?,?)',
   args:[tenant.id,id,w.name,w.location,w.responsible,session.userId]},
  audit(tenant.id,session.userId,'warehouses.created',id)
 ]);
 return {warehouse:{id,...w,stock:[]}};
}
export async function updateWarehouse(token,slug,id,input){
 const {tenant,session}=await authorizeTool(token,slug,'T010',true);
 const w=normalizeWarehouse(input);
 const result=await executeSql('UPDATE tenant_warehouses SET name=?,location=?,responsible=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',
  [w.name,w.location,w.responsible,tenant.id,id]);
 if(!changed(result))throw Error('Not found');
 const a=audit(tenant.id,session.userId,'warehouses.updated',id);
 await executeSql(a.sql,a.args);
 return {ok:true};
}
export async function archiveWarehouse(token,slug,id){
 const {tenant,session}=await authorizeTool(token,slug,'T010',true);
 const stock=rows(await executeSql('SELECT COALESCE(SUM(quantity),0) FROM tenant_warehouse_stock WHERE organization_id=? AND warehouse_id=?',[tenant.id,id]))[0]?.[0]||0;
 if(Number(stock)>0)throw Error('Warehouse has stock');
 const result=await executeSql('UPDATE tenant_warehouses SET archived_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,id]);
 if(!changed(result))throw Error('Not found');
 const a=audit(tenant.id,session.userId,'warehouses.archived',id);
 await executeSql(a.sql,a.args);
 return {archived:true};
}
// Transferencia entre almacenes: valida stock suficiente en origen con un
// UPDATE condicional (no resta si no alcanza) y registra el historial.
export async function transferStock(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'T010',true);
 const t=normalizeTransfer(input),id=randomUUID();
 for(const whId of [t.fromWarehouseId,t.toWarehouseId]){
  const found=rows(await executeSql('SELECT id FROM tenant_warehouses WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,whId]));
  if(!found.length)throw Error('Warehouse not found');
 }
 const item=rows(await executeSql('SELECT id FROM tenant_inventory_items WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,t.itemId]));
 if(!item.length)throw Error('Inventory item not found');
 const commands=[
  {sql:'UPDATE tenant_warehouse_stock SET quantity=quantity-?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND warehouse_id=? AND item_id=? AND quantity>=?',
   args:[t.quantity,tenant.id,t.fromWarehouseId,t.itemId,t.quantity]},
  {sql:'INSERT INTO tenant_warehouse_stock(organization_id,warehouse_id,item_id,quantity) VALUES(?,?,?,?) ON CONFLICT(organization_id,warehouse_id,item_id) DO UPDATE SET quantity=quantity+excluded.quantity,updated_at=CURRENT_TIMESTAMP',
   args:[tenant.id,t.toWarehouseId,t.itemId,t.quantity]},
  {sql:'INSERT INTO tenant_warehouse_transfers(organization_id,id,from_warehouse_id,to_warehouse_id,item_id,quantity,note,created_by) VALUES(?,?,?,?,?,?,?,?)',
   args:[tenant.id,id,t.fromWarehouseId,t.toWarehouseId,t.itemId,t.quantity,t.note,session.userId]},
  {sql:`INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id)
   SELECT ?,?,?,?, 'warehouse_transfer',? FROM tenant_warehouse_transfers WHERE organization_id=? AND id=?`,
   args:[randomUUID(),tenant.id,session.userId,'warehouses.transferred',id,tenant.id,id]}
 ];
 const result=await executeBatch(commands);
 if(!affected(result?.[0])){
  const origin=rows(await executeSql('SELECT quantity FROM tenant_warehouse_stock WHERE organization_id=? AND warehouse_id=? AND item_id=?',[tenant.id,t.fromWarehouseId,t.itemId]))[0];
  throw Error(origin?'Insufficient stock':'Insufficient stock');
 }
 return {transfer:{id,...t}};
}
