import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {normalizeStockItem,normalizeStockUpdate,normalizeStockMovement} from './workflows.mjs';
import {normalizeVariant,normalizeVariantUpdate,isVariantLow,isVariantExpired,isVariantExpiringSoon} from './tools-p1a-domain.mjs';
const rows=r=>r?.rows?.map(row=>row.map(c=>c?.value??null))??[];
const affected=r=>Number(r?.affected_row_count??r?.rowsAffected??0);
const itemRow=a=>({id:a[0],sku:a[1],title:a[2],location:a[3],quantity:Number(a[4]),lowStock:Number(a[5]),isLow:Number(a[4])<=Number(a[5])});
const variantRow=a=>({id:a[0],itemId:a[1],label:a[2],sku:a[3]||null,quantity:Number(a[4]),lowStock:Number(a[5]),
 warehouse:a[6],lot:a[7]||'',expiresOn:a[8]||null,supplier:a[9]||'',
 isLow:Number(a[4])<=Number(a[5]),expired:isVariantExpired({expiresOn:a[8]}),expiringSoon:isVariantExpiringSoon({expiresOn:a[8]})});
 const movementRow=a=>({id:a[0],itemId:a[1],variantId:a[2]||null,delta:Number(a[3]),note:a[4],createdAt:a[5]});
const itemMovementRow=a=>({id:a[0],itemId:a[1],variantId:null,delta:Number(a[2]),note:a[3],createdAt:a[4]});
const variantSelect='SELECT id,item_id,label,sku,quantity,low_stock,warehouse,lot,expires_on,supplier FROM tenant_inventory_variants';
const audit=(org,user,action,id,type='inventory_item')=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',args:[randomUUID(),org,user,action,type,id]});
export async function listInventory(token,slug){
 const {tenant}=await authorizeTool(token,slug,'C005');
 const [items,variants,movements,variantMovements]=await Promise.all([
  executeSql('SELECT id,sku,title,location,quantity,low_stock FROM tenant_inventory_items WHERE organization_id=? AND archived_at IS NULL ORDER BY sku LIMIT 250',[tenant.id]),
  executeSql(variantSelect+' WHERE organization_id=? AND archived_at IS NULL ORDER BY item_id, label LIMIT 500',[tenant.id]),
  executeSql('SELECT id,item_id,delta,note,created_at FROM tenant_inventory_movements WHERE organization_id=? ORDER BY created_at DESC LIMIT 150',[tenant.id]),
  executeSql('SELECT id,item_id,variant_id,delta,note,created_at FROM tenant_inventory_variant_movements WHERE organization_id=? ORDER BY created_at DESC LIMIT 150',[tenant.id])
 ]);
 const byItem=new Map();
 for(const v of rows(variants)){
  const variant=variantRow(v);
  if(!byItem.has(variant.itemId))byItem.set(variant.itemId,[]);
  byItem.get(variant.itemId).push(variant);
 }
 return {items:rows(items).map(i=>{const item=itemRow(i);const vs=byItem.get(item.id)||[];
   return {...item,variants:vs,lowVariants:vs.filter(x=>x.isLow).length,expiringVariants:vs.filter(x=>x.expiringSoon||x.expired).length};}),
  movements:[...rows(movements).map(itemMovementRow),...rows(variantMovements).map(movementRow)]
   .sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,150),
  purchaseNote:'La orden de compra real es T008 (Compras, frente p1b): aquí se registra el proveedor por variante.'};
}
export async function createStockItem(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'C005',true);
 const data=normalizeStockItem(input),id=randomUUID();
 const variants=Array.isArray(input?.variants)?input.variants.map(v=>normalizeVariant(v)):[];
 const r=await executeSql('INSERT INTO tenant_inventory_items(organization_id,id,sku,title,location,low_stock) VALUES(?,?,?,?,?,?) ON CONFLICT(organization_id,sku) DO NOTHING',[tenant.id,id,data.sku,data.title,data.location,data.lowStock]);
 if(!affected(r))throw Error('Duplicate SKU');
 const commands=variants.map(v=>({sql:'INSERT INTO tenant_inventory_variants(organization_id,id,item_id,label,sku,quantity,low_stock,warehouse,lot,expires_on,supplier,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
  args:[tenant.id,randomUUID(),id,v.label,v.sku,0,v.lowStock,v.warehouse,v.lot,v.expiresOn,v.supplier,session.userId]}));
 commands.push(audit(tenant.id,session.userId,'inventory.item_created',id));
 try{await executeBatch(commands);}
 catch(error){
  await executeSql('DELETE FROM tenant_inventory_items WHERE organization_id=? AND id=?',[tenant.id,id]);
  if(/UNIQUE/i.test(error?.message||''))throw Error('Duplicate variant SKU');
  throw error;
 }
 return {item:{id,...data,quantity:0,variants:variants.map(v=>({...v,quantity:0}))}};
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
 const variantId=input?.variantId||null;
 if(variantId){
  const variant=rows(await executeSql('SELECT id,quantity FROM tenant_inventory_variants WHERE organization_id=? AND id=? AND item_id=? AND archived_at IS NULL',[tenant.id,variantId,itemId]));
  if(!variant.length)throw Error('Not found');
  if(Number(variant[0][1])+data.delta<0)throw Error('Insufficient stock');
 }
 const inserts=[
  {sql:`INSERT INTO tenant_inventory_movements(organization_id,id,item_id,delta,note,created_by)
   SELECT ?,?,?,?,?,? FROM tenant_inventory_items
   WHERE organization_id=? AND id=? AND archived_at IS NULL
   AND quantity+? BETWEEN 0 AND 1000000000`,
   args:[tenant.id,id,itemId,data.delta,data.note,session.userId,tenant.id,itemId,data.delta]},
  ...(variantId?[{sql:`INSERT INTO tenant_inventory_variant_movements(organization_id,id,variant_id,item_id,delta,note,created_by)
   SELECT ?,?,?,?,?,?,? FROM tenant_inventory_variants
   WHERE organization_id=? AND id=? AND archived_at IS NULL
   AND quantity+? BETWEEN 0 AND 1000000000`,
   args:[tenant.id,randomUUID(),variantId,itemId,data.delta,data.note,session.userId,tenant.id,variantId,data.delta]},
   {sql:`UPDATE tenant_inventory_variants SET quantity=quantity+?,updated_at=CURRENT_TIMESTAMP
   WHERE organization_id=? AND id=? AND quantity+? BETWEEN 0 AND 1000000000`,
   args:[data.delta,tenant.id,variantId,data.delta]}]:[]),
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
 if(variantId&&!affected(result?.[1])){
  throw Error('Insufficient stock');
 }
 return {movement:{id,itemId,variantId,...data}};
}
export async function createVariant(token,slug,itemId,input,deps){
 const execute=deps?.executeSql||executeSql;
 const {tenant,session}=await authorizeTool(token,slug,'C005',true);
 const data=normalizeVariant(input),id=randomUUID();
 const found=rows(await execute('SELECT id FROM tenant_inventory_items WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,itemId]));
 if(!found.length)throw Error('Not found');
 try{
  await execute('INSERT INTO tenant_inventory_variants(organization_id,id,item_id,label,sku,quantity,low_stock,warehouse,lot,expires_on,supplier,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
   [tenant.id,id,itemId,data.label,data.sku,0,data.lowStock,data.warehouse,data.lot,data.expiresOn,data.supplier,session.userId]);
 }catch(error){
  if(/UNIQUE/i.test(error?.message||''))throw Error('Duplicate variant SKU');
  throw error;
 }
 const entry=audit(tenant.id,session.userId,'inventory.variant_created',id,'inventory_variant');
 await execute(entry.sql,entry.args);
 return {variant:{id,itemId,...data,quantity:0}};
}
export async function updateVariant(token,slug,itemId,variantId,input){
 const {tenant,session}=await authorizeTool(token,slug,'C005',true);
 const data=normalizeVariantUpdate(input);
 const r=await executeSql('UPDATE tenant_inventory_variants SET label=?,warehouse=?,lot=?,expires_on=?,supplier=?,low_stock=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND item_id=? AND id=? AND archived_at IS NULL',
  [data.label,data.warehouse,data.lot,data.expiresOn,data.supplier,data.lowStock,tenant.id,itemId,variantId]);
 if(!affected(r))throw Error('Not found');
 const entry=audit(tenant.id,session.userId,'inventory.variant_updated',variantId,'inventory_variant');
 await executeSql(entry.sql,entry.args);
 return {ok:true};
}
export async function archiveVariant(token,slug,itemId,variantId){
 const {tenant,session}=await authorizeTool(token,slug,'C005',true);
 const r=await executeSql('UPDATE tenant_inventory_variants SET archived_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND item_id=? AND id=? AND archived_at IS NULL',[tenant.id,itemId,variantId]);
 if(!affected(r))throw Error('Not found');
 const entry=audit(tenant.id,session.userId,'inventory.variant_archived',variantId,'inventory_variant');
 await executeSql(entry.sql,entry.args);
 return {archived:true};
}
