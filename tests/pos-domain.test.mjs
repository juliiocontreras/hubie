import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSale,normalizeSaleLine,saleTotals,formatPosFolio,POS_MODE_LABELS} from '../platform/pos-domain.mjs';

const itemId='11111111-1111-4111-8111-111111111111';
const line=(over={})=>({catalogItemId:itemId,quantity:2,...over});

test('venta: totales con IVA 16% sobre precios base SIN IVA',async()=>{
 const totals=saleTotals([{lineTotalCents:10000},{lineTotalCents:5000}]);
 assert.equal(totals.subtotalCents,15000);
 assert.equal(totals.vatCents,2400);
 assert.equal(totals.totalCents,17400);
 // Redondeo: 333 * 16% = 53.28 -> 53.
 assert.equal(saleTotals([{lineTotalCents:333}]).vatCents,53);
 assert.throws(()=>saleTotals([]),/Invalid sale/);
});

test('venta: folio POS-0001, métodos y modos válidos',async()=>{
 assert.equal(formatPosFolio(1),'POS-0001');
 assert.equal(formatPosFolio(42),'POS-0042');
 assert.equal(POS_MODE_LABELS.para_llevar,'Para llevar');
 assert.equal(POS_MODE_LABELS.en_local,'En local');
 assert.equal(POS_MODE_LABELS.a_domicilio,'A domicilio');
 const sale=normalizeSale({lines:[line()],method:'tarjeta',mode:'en_local',clientName:'Ana'});
 assert.equal(sale.method,'tarjeta');
 assert.equal(sale.mode,'en_local');
 assert.equal(normalizeSale({lines:[line()]}).method,'efectivo');
 assert.equal(normalizeSale({lines:[line()]}).mode,'para_llevar');
 assert.throws(()=>normalizeSale({lines:[line({quantity:0})]}),/Invalid sale/);
 assert.throws(()=>normalizeSale({lines:[line()],method:'cheque'}),/Invalid sale/);
 assert.throws(()=>normalizeSale({lines:[line()],mode:'mesa'}),/Invalid sale/);
 assert.throws(()=>normalizeSale({lines:[]}),/Invalid sale/);
 assert.throws(()=>normalizeSaleLine({catalogItemId:'no-uuid',quantity:1}),/Invalid sale/);
 assert.throws(()=>formatPosFolio(0),/Invalid sale/);
});
