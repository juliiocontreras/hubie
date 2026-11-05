import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDeal,normalizeEvent,normalizeStockItem,normalizeStockMovement,normalizeStockUpdate} from '../platform/workflows.mjs';

test('CRM accepts pipeline stages and rejects invalid amounts and unknown stages',()=>{
 const deal=normalizeDeal({title:'  Venta ABC ',customer:'Cliente MX',amountCents:125050,stage:'proposal',notes:'Listo'});
 assert.deepEqual([deal.title,deal.amountCents,deal.stage],['Venta ABC',125050,'proposal']);
 assert.throws(()=>normalizeDeal({title:'ABC',amountCents:-1}),/Invalid deal/);
 assert.throws(()=>normalizeDeal({title:'ABC',stage:'secret'}),/Invalid deal/);
 assert.throws(()=>normalizeDeal({title:'ABC',amountCents:1.5}),/Invalid deal/);
});
test('agenda checks UTC dates, intervals and normalized resource',()=>{
 const event=normalizeEvent({title:'Visita',startsAt:'2026-11-12T15:00:00.000Z',endsAt:'2026-11-12T15:30:00.000Z',resource:'Sala 1'});
 assert.equal(event.resource,'sala 1');
 assert.throws(()=>normalizeEvent({title:'Visita',startsAt:'2026-11-12T15:00:00.000Z',endsAt:'2026-11-12T14:00:00.000Z'}),/Invalid appointment/);
 assert.throws(()=>normalizeEvent({title:'Visita',startsAt:'2026-11-12T15:00:00',endsAt:'2026-11-12T17:00:00'}),/Invalid appointment/);
 assert.throws(()=>normalizeEvent({title:'Visita',startsAt:'2026-11-12T15:00:00.000Z',endsAt:'2026-12-20T15:30:00.000Z'}),/Invalid appointment/);
 assert.throws(()=>normalizeEvent({title:'Visita',startsAt:'2026-11-31T15:00:00.000Z',endsAt:'2026-12-01T15:30:00.000Z'}),/Invalid appointment/);
});
test('inventory requires stock movements rather than editing quantity directly',()=>{
 const item=normalizeStockItem({sku:' a-120 ',title:'Producto A',lowStock:3,location:'Bodega'});
 assert.equal(item.sku,'A-120');
 assert.equal(item.lowStock,3);
 assert.throws(()=>normalizeStockItem({sku:'!',title:'Producto'}),/Invalid inventory item/);
 assert.deepEqual(normalizeStockMovement({delta:-2,note:'Consumo'}),{delta:-2,note:'Consumo'});
 assert.throws(()=>normalizeStockMovement({delta:0}),/Invalid stock movement/);
 assert.throws(()=>normalizeStockMovement({delta:1.2}),/Invalid stock movement/);
 const updated=normalizeStockUpdate({title:'Nuevo',lowStock:4,location:'Rack A'});
 assert.equal(updated.lowStock,4);
 assert.throws(()=>normalizeStockUpdate({title:'Nuevo',quantity:100}),/Invalid inventory item/);
});
