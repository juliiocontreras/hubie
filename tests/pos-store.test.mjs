import test from 'node:test';
import assert from 'node:assert/strict';
import {createPosFakeDb,posDeps} from './pos-fake-db.mjs';
import {catalogForSale,listSales,getSale,createSale,dashboard} from '../platform/pos-store.mjs';

const token='<redacted>',slug='demo',otherSlug='demo-b';
const ITEM_A='11111111-1111-4111-8111-111111111111';
const ITEM_B='22222222-2222-4222-8222-222222222222';
const INV_A='33333333-3333-4333-8333-333333333333';
const VAR_A='44444444-4444-4444-8444-444444444444';
const setup=()=>{const fake=createPosFakeDb();return {fake,deps:posDeps(fake)};};
function seedCatalog(fake,org=fake.orgA){
 fake.tables.catalogItems.push(
  {organization_id:org,id:ITEM_A,sku:'CAFE-500',name:'Café molido 500 g',description:'Café de olla',price_cents:8500,category:'Café',active:1,archived_at:null},
  {organization_id:org,id:ITEM_B,sku:'PAN-DULCE',name:'Pan dulce',description:'Pieza',price_cents:1500,category:'Pan',active:1,archived_at:null});
 fake.tables.inventoryItems.push(
  {organization_id:org,id:INV_A,sku:'CAFE-500',quantity:10,archived_at:null});
 fake.tables.variants.push(
  {organization_id:org,id:VAR_A,item_id:INV_A,label:'Molido fino',sku:'CAFE-500-FINO',quantity:5,archived_at:null});
}
function seedCashbox(fake,org=fake.orgA){
 fake.tables.cashboxes.push({organization_id:org,id:'55555555-5555-4555-8555-555555555555',
  responsible:'Ana Ruiz',shift:'Matutino',opening_cents:50000,status:'open',opened_at:'2026-11-16T08:00:00.000Z'});
}
const saleInput=(over={})=>({lines:[{catalogItemId:ITEM_A,quantity:2}],method:'efectivo',mode:'para_llevar',clientName:'Ana Ruiz',...over});

test('catálogo para vender: artículos activos con variantes y existencia por SKU',async()=>{
 const {fake,deps}=setup();
 seedCatalog(fake);
 const {items,categories}=await catalogForSale(token,slug,deps);
 assert.equal(items.length,2);
 assert.deepEqual(categories,['Café','Pan']);
 const cafe=items.find(i=>i.sku==='CAFE-500');
 assert.equal(cafe.priceCents,8500);
 assert.equal(cafe.stock,10,'existencia del artículo de inventario con el mismo SKU');
 assert.equal(cafe.variants.length,1);
 assert.equal(cafe.variants[0].label,'Molido fino');
 assert.equal(items.find(i=>i.sku==='PAN-DULCE').stock,null,'sin artículo de inventario: sin existencia conocida');
 await assert.rejects(()=>catalogForSale('bad-token',slug,deps),/Unauthorized/);
});

test('venta: folio secuencial, IVA 16%, cobro en T014 y ticket con líneas',async()=>{
 const {fake,deps}=setup();
 seedCatalog(fake);
 seedCashbox(fake);
 const out=await createSale(token,slug,saleInput(),deps);
 assert.equal(out.sale.folio,1);
 assert.equal(out.sale.folioText,'POS-0001');
 assert.equal(out.sale.subtotalCents,17000,'2 x $85.00 base sin IVA');
 assert.equal(out.sale.vatCents,2720,'IVA 16%');
 assert.equal(out.sale.totalCents,19720);
 assert.equal(out.sale.status,'completada');
 assert.equal(out.sale.lines.length,1);
 assert.equal(out.sale.lines[0].unitPriceCents,8500,'el precio se toma del catálogo, no del cliente');
 assert.equal(out.sale.lines[0].lineTotalCents,17000);
 assert.equal(out.payment.amountCents,19720);
 assert.equal(out.payment.method,'efectivo');
 assert.equal(out.payment.reference,'POS-0001');
 assert.equal(fake.tables.payments.length,1);
 assert.equal(fake.tables.payments[0].paid_on,new Date().toISOString().slice(0,10));
 const second=await createSale(token,slug,saleInput({lines:[{catalogItemId:ITEM_B,quantity:1}],method:'tarjeta'}),deps);
 assert.equal(second.sale.folioText,'POS-0002');
 assert.equal(second.sale.totalCents,1740,'1500 + 240 de IVA');
 assert.equal((await listSales(token,slug,deps)).sales.length,2);
 const detail=await getSale(token,slug,out.sale.id,deps);
 assert.equal(detail.sale.lines[0].name,'Café molido 500 g');
});

test('venta: variante por SKU descuenta existencias y registra movimientos',async()=>{
 const {fake,deps}=setup();
 seedCatalog(fake);
 seedCashbox(fake);
 const out=await createSale(token,slug,saleInput({lines:[{catalogItemId:ITEM_A,variantId:VAR_A,quantity:2}]}),deps);
 assert.equal(out.warnings.length,0);
 assert.equal(out.stockDeducted.length,1);
 assert.equal(out.stockDeducted[0].sku,'CAFE-500-FINO');
 assert.equal(fake.tables.variants[0].quantity,3,'5 - 2');
 assert.equal(fake.tables.inventoryItems[0].quantity,8,'10 - 2 en el artículo padre');
 assert.equal(fake.tables.variantMovements.length,1);
 assert.equal(fake.tables.variantMovements[0].delta,-2);
 assert.equal(fake.tables.inventoryMovements.length,1);
 assert.equal(out.sale.lines[0].stockDeducted,true);
 assert.equal(out.sale.lines[0].variantId,VAR_A);
 // Sin variante elegida: la variante con el SKU exacto del catálogo no
 // existe (CAFE-500-FINO != CAFE-500), así que no descuenta y avisa.
 const out2=await createSale(token,slug,saleInput(),deps);
 assert.equal(out2.stockDeducted.length,0);
 assert.match(out2.warnings.join(' '),/Sin inventario para CAFE-500/);
 assert.equal(fake.tables.variants[0].quantity,3,'sin descuento en la segunda venta');
});

test('venta: existencias insuficientes venden igual, con aviso y sin descontar',async()=>{
 const {fake,deps}=setup();
 seedCatalog(fake);
 seedCashbox(fake);
 const out=await createSale(token,slug,saleInput({lines:[{catalogItemId:ITEM_A,variantId:VAR_A,quantity:9}]}),deps);
 assert.equal(out.sale.totalCents,9*8500+Math.round(9*8500*16/100));
 assert.equal(out.stockDeducted.length,0);
 assert.match(out.warnings.join(' '),/Existencias insuficientes para CAFE-500-FINO.*hay 5 y se vendieron 9/);
 assert.equal(fake.tables.variants[0].quantity,5,'no se tocó la existencia');
 assert.equal(out.sale.lines[0].stockDeducted,false);
});

test('venta: efectivo con caja abierta genera movimiento de caja; sin caja solo avisa',async()=>{
 const {fake,deps}=setup();
 seedCatalog(fake);
 const noBox=await createSale(token,slug,saleInput(),deps);
 assert.equal(fake.tables.cashboxMovements.length,0);
 assert.match(noBox.warnings.join(' '),/Sin caja abierta/);
 assert.equal(noBox.sale.cashboxId,null);
 seedCashbox(fake);
 const withBox=await createSale(token,slug,saleInput(),deps);
 assert.equal(fake.tables.cashboxMovements.length,1);
 const move=fake.tables.cashboxMovements[0];
 assert.equal(move.direction,'in');
 assert.equal(move.kind,'venta');
 assert.equal(move.amount_cents,19720);
 assert.equal(move.source_type,'collection');
 assert.equal(move.source_id,withBox.payment.id);
 assert.equal(withBox.sale.cashboxId,fake.tables.cashboxes[0].id);
 assert.ok(withBox.sale.cashboxMovementId);
 assert.equal(withBox.warnings.filter(w=>/caja/.test(w)).length,0);
});

test('venta: tarjeta y transferencia no generan movimiento de caja',async()=>{
 const {fake,deps}=setup();
 seedCatalog(fake);
 seedCashbox(fake);
 const out=await createSale(token,slug,saleInput({method:'tarjeta'}),deps);
 assert.equal(fake.tables.cashboxMovements.length,0);
 assert.match(out.cashboxNote,/no genera movimiento de caja/);
 assert.equal(out.sale.cashboxId,null);
 const out2=await createSale(token,slug,saleInput({method:'transferencia'}),deps);
 assert.equal(fake.tables.cashboxMovements.length,0);
});

test('venta: errores — artículo inexistente, variante de otro producto, cantidad inválida',async()=>{
 const {fake,deps}=setup();
 seedCatalog(fake);
 await assert.rejects(()=>createSale(token,slug,saleInput({lines:[{catalogItemId:'00000000-0000-4000-8000-000000000000',quantity:1}]}),deps),/Not found/);
 await assert.rejects(()=>createSale(token,slug,saleInput({lines:[{catalogItemId:ITEM_B,variantId:VAR_A,quantity:1}]}),deps),/Invalid sale/);
 await assert.rejects(()=>createSale(token,slug,saleInput({lines:[{catalogItemId:ITEM_A,quantity:0}]}),deps),/Invalid sale/);
 await assert.rejects(()=>createSale(token,slug,saleInput({method:'cheque'}),deps),/Invalid sale/);
 await assert.rejects(()=>createSale(token,slug,saleInput({lines:[]}),deps),/Invalid sale/);
 assert.equal((await listSales(token,slug,deps)).sales.length,0,'ninguna venta fallida quedó registrada');
});

test('aislamiento entre tenants: ventas, folios y existencias no se cruzan',async()=>{
 const {fake,deps}=setup();
 seedCatalog(fake,fake.orgA);
 seedCatalog(fake,fake.orgB);
 seedCashbox(fake,fake.orgA);
 await createSale(token,slug,saleInput(),deps);
 await createSale(token,otherSlug,saleInput(),deps);
 assert.equal((await listSales(token,slug,deps)).sales[0].folioText,'POS-0001');
 assert.equal((await listSales(token,otherSlug,deps)).sales[0].folioText,'POS-0001','el folio es secuencial por tenant');
 assert.equal(fake.tables.variants.filter(v=>v.organization_id===fake.orgA)[0].quantity,5);
 assert.equal(fake.tables.variants.filter(v=>v.organization_id===fake.orgB)[0].quantity,5);
 // Sin variante elegida y sin variante con el SKU exacto del catálogo, no
 // se descuenta nada en ningún tenant; lo que se verifica es que las
 // ventas y los folios no se cruzan entre tenants.
 const otherSaleId=(await listSales(token,otherSlug,deps)).sales[0].id;
 await assert.rejects(()=>getSale(token,slug,otherSaleId,deps),/Not found/);
 await assert.rejects(()=>listSales('bad-token',slug,deps),/Unauthorized/);
});

test('tablero: ventas y total de hoy, por método y recientes',async()=>{
 const {fake,deps}=setup();
 seedCatalog(fake);
 await createSale(token,slug,saleInput(),deps);
 await createSale(token,slug,saleInput({lines:[{catalogItemId:ITEM_B,quantity:1}],method:'tarjeta'}),deps);
 const d=await dashboard(token,slug,deps);
 assert.equal(d.today.count,2);
 assert.equal(d.today.totalCents,19720+1740);
 assert.equal(d.byMethod.efectivo.count,1);
 assert.equal(d.byMethod.tarjeta.totalCents,1740);
 assert.equal(d.recent.length,2);
});
