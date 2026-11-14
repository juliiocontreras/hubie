import {randomUUID} from 'node:crypto';
import {executeSql,executeBatch} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {normalizeCatalogItem} from './commerce-domain.mjs';

const rows=r=>r?.rows?.map(row=>row.map(cell=>cell?.value??null))??[];
const changed=r=>Number(r?.rowsAffected??r?.affected_row_count??0)>0;
const audit=(org,user,action,id)=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',args:[randomUUID(),org,user,action,'catalog_item',id]});
const select=`SELECT i.id,i.sku,i.name,i.description,i.price_cents,i.category,i.active,i.created_at,i.updated_at,
 (SELECT m.id FROM pwa_media m WHERE m.organization_id=i.organization_id AND m.kind='attachment' AND m.tool_id='C006' AND m.record_id=i.id AND m.mime LIKE 'image/%' ORDER BY m.rowid DESC LIMIT 1)
 FROM tenant_catalog_items i`;
const toItem=(r,slug)=>({id:r[0],sku:r[1],name:r[2],description:r[3],priceCents:Number(r[4]),category:r[5],
 active:r[6]===1||r[6]==='1',createdAt:r[7],updatedAt:r[8],
 photoUrl:r[9]?'/api/app/'+encodeURIComponent(slug)+'/attachments/'+r[9]:null});

export async function listCatalog(token,slug){
 const {tenant}=await authorizeTool(token,slug,'C006');
 const result=await executeSql(select+' WHERE i.organization_id=? AND i.archived_at IS NULL ORDER BY i.name LIMIT 250',[tenant.id]);
 const categories=rows(await executeSql("SELECT DISTINCT category FROM tenant_catalog_items WHERE organization_id=? AND archived_at IS NULL ORDER BY category",[tenant.id])).map(c=>c[0]);
 return {items:rows(result).map(r=>toItem(r,slug)),categories};
}
export async function createCatalogItem(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'C006',true);
 const item=normalizeCatalogItem(input),id=randomUUID();
 const results=await executeBatch([
  {sql:'INSERT INTO tenant_catalog_items(organization_id,id,sku,name,description,price_cents,category,active,created_by) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT DO NOTHING',
   args:[tenant.id,id,item.sku,item.name,item.description,item.priceCents,item.category,item.active?1:0,session.userId]},
  audit(tenant.id,session.userId,'catalog.created',id)
 ]);
 if(!changed(results?.[0]))throw Error('Duplicate SKU');
 return {item:{id,...item}};
}
export async function updateCatalogItem(token,slug,id,input){
 const {tenant,session}=await authorizeTool(token,slug,'C006',true);
 const item=normalizeCatalogItem(input);
 const update=await executeSql(`UPDATE tenant_catalog_items SET sku=?,name=?,description=?,price_cents=?,category=?,active=?,updated_at=CURRENT_TIMESTAMP
  WHERE organization_id=? AND id=? AND archived_at IS NULL
  AND (?='' OR NOT EXISTS(
   SELECT 1 FROM tenant_catalog_items another WHERE another.organization_id=? AND another.id!=? AND another.sku=? AND another.archived_at IS NULL
  ))`,
 [item.sku,item.name,item.description,item.priceCents,item.category,item.active?1:0,tenant.id,id,item.sku,tenant.id,id,item.sku]);
 if(!changed(update)){
  const found=rows(await executeSql('SELECT id FROM tenant_catalog_items WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,id]));
  throw Error(found.length?'Duplicate SKU':'Not found');
 }
 const a=audit(tenant.id,session.userId,'catalog.updated',id);
 await executeSql(a.sql,a.args);
 return {ok:true};
}
export async function archiveCatalogItem(token,slug,id){
 const {tenant,session}=await authorizeTool(token,slug,'C006',true);
 const result=await executeSql('UPDATE tenant_catalog_items SET archived_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND archived_at IS NULL',[tenant.id,id]);
 if(!changed(result))throw Error('Not found');
 const a=audit(tenant.id,session.userId,'catalog.archived',id);
 await executeSql(a.sql,a.args);
 return {archived:true};
}
