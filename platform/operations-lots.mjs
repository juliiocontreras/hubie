// T011 Lotes y caducidades. Trazabilidad por lote: lote ligado a un ítem de
// inventario (C005), cantidad y caducidad, con estado de caducidad calculado
// (caducado / próximo a caducar / vigente). Las alertas se exponen con
// listExpiringLots; NO se crean filas en tenant_notifications porque esa
// tabla la posee el frente search y aún no existe en esta copia: el
// integrador la conecta cuando exista (ver INTEGRATION.md).
import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {normalizeLot,normalizeLotAdjustment,lotExpiryStatus} from './tools-p2-domain.mjs';

const rows=r=>r?.rows?.map(row=>row.map(c=>c?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const audit=(org,user,action,id)=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',args:[randomUUID(),org,user,action,'inventory_lot',id]});
const DEFAULT_THRESHOLD_DAYS=30;

const toLot=(r,thresholdDays)=>{const status=lotExpiryStatus(r[4],{thresholdDays});return {id:r[0],itemId:r[1],itemTitle:r[2],lotCode:r[3],quantity:Number(r[5]),expiresAt:r[4],receivedOn:r[6],createdAt:r[7],...status};};

export async function listLots(token,slug,{thresholdDays=DEFAULT_THRESHOLD_DAYS}={}){
 const {tenant}=await authorizeTool(token,slug,'T011');
 const [lots,items]=await Promise.all([
  executeSql('SELECT l.id,l.item_id,i.title,l.lot_code,l.expires_at,l.quantity,l.received_on,l.created_at FROM inventory_lots l JOIN tenant_inventory_items i ON i.organization_id=l.organization_id AND i.id=l.item_id WHERE l.organization_id=? AND l.archived_at IS NULL ORDER BY l.expires_at ASC,l.created_at DESC LIMIT 250',[tenant.id]),
  executeSql('SELECT id,sku,title,quantity FROM tenant_inventory_items WHERE organization_id=? AND archived_at IS NULL ORDER BY sku LIMIT 250',[tenant.id])
 ]);
 return {lots:rows(lots).map(r=>toLot(r,thresholdDays)),
  items:rows(items).map(i=>({id:i[0],sku:i[1],title:i[2],quantity:Number(i[3])})),
  thresholdDays};
}
export async function createLot(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'T011',true);
 const data=normalizeLot(input);
 const item=rows(await executeSql('SELECT id FROM tenant_inventory_items WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,data.itemId]));
 if(!item.length)throw Error('Not found');
 const clash=rows(await executeSql('SELECT id FROM inventory_lots WHERE organization_id=? AND item_id=? AND lot_code=? AND archived_at IS NULL LIMIT 1',[tenant.id,data.itemId,data.lotCode]));
 if(clash.length)throw Error('Duplicate lot');
 const id=randomUUID();
 await executeBatch([
  {sql:'INSERT INTO inventory_lots(organization_id,id,item_id,lot_code,quantity,expires_at,received_on,created_by) VALUES(?,?,?,?,?,?,?,?)',
   args:[tenant.id,id,data.itemId,data.lotCode,data.quantity,data.expiresAt,data.receivedOn,session.userId]},
  audit(tenant.id,session.userId,'lots.created',id)
 ]);
 return {lot:{id,...data}};
}
export async function adjustLot(token,slug,id,input){
 const {tenant,session}=await authorizeTool(token,slug,'T011',true);
 const current=rows(await executeSql('SELECT quantity FROM inventory_lots WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,id]))[0];
 if(!current)throw Error('Not found');
 const data=normalizeLotAdjustment(input,{currentQuantity:Number(current[0])});
 const result=await executeBatch([
  {sql:'UPDATE inventory_lots SET quantity=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',args:[data.newQuantity,tenant.id,id]},
  audit(tenant.id,session.userId,'lots.adjusted',id)
 ]);
 if(!changed(result?.[0]))throw Error('Not found');
 return {quantity:data.newQuantity};
}
export async function archiveLot(token,slug,id){
 const {tenant,session}=await authorizeTool(token,slug,'T011',true);
 const result=await executeBatch([
  {sql:'UPDATE inventory_lots SET archived_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',args:[tenant.id,id]},
  audit(tenant.id,session.userId,'lots.archived',id)
 ]);
 if(!changed(result?.[0]))throw Error('Not found');
 return {archived:true};
}
// Alertas de caducidad próxima: caducados + los que vencen dentro del umbral.
// El llamador (integrador / frente search) decide si además escribe en
// tenant_notifications; aquí solo se devuelve la lista, sin fingir el envío.
export async function listExpiringLots(token,slug,{thresholdDays=DEFAULT_THRESHOLD_DAYS}={}){
 const {tenant}=await authorizeTool(token,slug,'T011');
 const result=await executeSql('SELECT l.id,l.item_id,i.title,l.lot_code,l.expires_at,l.quantity,l.received_on,l.created_at FROM inventory_lots l JOIN tenant_inventory_items i ON i.organization_id=l.organization_id AND i.id=l.item_id WHERE l.organization_id=? AND l.archived_at IS NULL AND l.expires_at IS NOT NULL ORDER BY l.expires_at ASC LIMIT 250',[tenant.id]);
 const lots=rows(result).map(r=>toLot(r,thresholdDays)).filter(l=>l.status!=='ok');
 return {expiring:lots,thresholdDays,notificationsPending:true,notificationsNote:'tenant_notifications aún no existe en esta copia (frente search); las alertas se listan aquí sin escribir notificaciones.'};
}
