// T012 Escáner QR/Barras. Resuelve un código al SKU del catálogo (y al stock
// C005 como segunda fuente). El escaneo por cámara vive en scanner-p2.js
// (getUserMedia + BarcodeDetector con detección de soporte y fallback manual);
// aquí solo se resuelve el código contra datos reales y se audita.
// Sin tabla propia: el código no se guarda, solo se audita la resolución.
import {randomUUID} from 'node:crypto';
import {executeSql} from '../database.mjs';
import {authorizeTool} from './records.mjs';
import {normalizeScanCode,resolveScanCode,scannerSupport} from './tools-p2-domain.mjs';

const rows=r=>r?.rows?.map(row=>row.map(c=>c?.value??null))??[];
const audit=(org,user,action,id)=>({sql:'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',args:[randomUUID(),org,user,action,'catalog_item',id]});

export function scannerCapabilities(){
 // El servidor no puede saber las capacidades del navegador; la detección
 // real ocurre en el cliente (scanner-p2.js) y se expone aquí para la UI.
 return {needsBarcodeDetector:true,needsCamera:true,
  note:'El escaneo por cámara requiere BarcodeDetector y cámara; sin ellos la UI ofrece entrada manual.'};
}
export async function resolveCode(token,slug,input){
 const {tenant,session}=await authorizeTool(token,slug,'T012');
 const code=normalizeScanCode(input?.code);
 const [catalog,stock]=await Promise.all([
  executeSql('SELECT id,sku,name,price_cents,category,active FROM tenant_catalog_items WHERE organization_id=? AND archived_at IS NULL',[tenant.id]),
  executeSql('SELECT id,sku,title,quantity FROM tenant_inventory_items WHERE organization_id=? AND archived_at IS NULL',[tenant.id])
 ]);
 const items=[
  ...rows(catalog).map(c=>({id:c[0],sku:c[1],name:c[2],priceCents:Number(c[3]),category:c[4],active:c[5]===1,source:'catalog'})),
  ...rows(stock).map(s=>({id:s[0],sku:s[1],name:s[2],quantity:Number(s[3]),source:'inventory'}))
 ];
 const resolved=resolveScanCode(code,items);
 if(resolved.found){
  const a=audit(tenant.id,session.userId,'scanner.resolved',resolved.item.id);
  await executeSql(a.sql,a.args);
  return {found:true,code,matchedBy:resolved.matchedBy,item:resolved.item};
 }
 return {found:false,code,matchedBy:null,item:null};
}
export {scannerSupport};
