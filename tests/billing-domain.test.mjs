import test from 'node:test';
import assert from 'node:assert/strict';
import {quoteCheckout, splitBalance, statusAfterGrace, daysPastDue, formatMoneyCents, validateCheckoutEmail, MONTHLY_PLATFORM_FEE_CENTS, GRACE_DAYS_PAST_DUE, PRICES_INCLUDE_TAX} from '../platform/billing-domain.mjs';

test('cotización base S001: precios sin IVA, IVA 16% agregado; anticipo 50%, saldo 50%, mensualidad $949 + IVA', () => {
 const q = quoteCheckout({suiteId: 'S001'});
 // Base $9,900 + IVA 16% ($1,584) = $11,484 con IVA.
 assert.equal(q.setupSubtotalCents, 990000);
 assert.equal(q.setupVatCents, 158400);
 assert.equal(q.setupTotalCents, 1148400);
 assert.equal(q.depositCents, 574200);
 assert.equal(q.balanceCents, 574200);
 assert.equal(q.monthlyFeeSubtotalCents, 94900);
 assert.equal(q.monthlyFeeVatCents, 15184);
 assert.equal(q.monthlyFeeCents, 110084);
 assert.equal(MONTHLY_PLATFORM_FEE_CENTS, 94900);
 assert.equal(q.currency, 'MXN');
 assert.equal(q.pricesIncludeTax, false);
 assert.equal(PRICES_INCLUDE_TAX, false);
 assert.equal(q.vatRate, 0.16);
 assert.deepEqual(q.installmentsCents, [95700, 95700, 95700, 95700, 95700, 95700]);
 assert.equal(q.installmentsCents.reduce((a, b) => a + b, 0), q.balanceCents);
});

test('cotización con tools y extras suma solo precios del catálogo', () => {
 const q = quoteCheckout({suiteId: 'S001', toolIds: ['T001'], extras: [{id: 'E001', quantity: 2}], balanceInstallments: 3});
 // Base 9900 + 4900 + 2*990 = 16780 MXN; IVA 16% = 2684.80; total con IVA 19464.80
 assert.equal(q.setupSubtotalCents, 1678000);
 assert.equal(q.setupVatCents, 268480);
 assert.equal(q.setupTotalCents, 1946480);
 assert.equal(q.depositCents, 973240);
 assert.equal(q.balanceCents, 973240);
 assert.deepEqual(q.installmentsCents, [324413, 324413, 324414]);
 assert.equal(q.installmentsCents.reduce((a, b) => a + b, 0), q.balanceCents);
 assert.equal(q.extras[0].totalCents, 198000);
});

test('cotización rechaza montos que no vienen del catálogo', () => {
 for (const bad of [
  {}, {suiteId: 'S999'}, {suiteId: 'S001', toolIds: ['T999']},
  {suiteId: 'S001', toolIds: ['T001', 'T001']},
  {suiteId: 'S001', toolIds: ['T021']}, // precio null: por definir
  {suiteId: 'S001', extras: [{id: 'E006', quantity: 1}]}, // solo cotización
  {suiteId: 'S001', extras: [{id: 'E001', quantity: 0}]},
  {suiteId: 'S001', extras: [{id: 'E001', quantity: 1.5}]},
  {suiteId: 'S001', extras: [{id: 'E999', quantity: 1}]},
  {suiteId: 'S001', balanceInstallments: 0},
  {suiteId: 'S001', balanceInstallments: 7},
  {suiteId: 'S001', balanceInstallments: 2.5}
 ]) assert.throws(() => quoteCheckout(bad), /Invalid checkout/);
 // Un tool Core incluido no suma nada aunque se pase explícito.
 assert.equal(quoteCheckout({suiteId: 'S001', toolIds: ['C001']}).setupTotalCents, 1148400);
});

test('saldo en parcialidades: el resto va a la última y la suma cuadra', () => {
 assert.deepEqual(splitBalance(100000, 3), [33333, 33333, 33334]);
 assert.deepEqual(splitBalance(0, 6), [0, 0, 0, 0, 0, 0]);
 assert.deepEqual(splitBalance(5, 6), [0, 0, 0, 0, 0, 5]);
 assert.throws(() => splitBalance(100, 7), /Invalid checkout/);
 assert.throws(() => splitBalance(-1, 2), /Invalid checkout/);
});

test('gracia: past_due 3 días -> suspendido; antes, sigue past_due', () => {
 assert.equal(GRACE_DAYS_PAST_DUE, 3);
 const now = new Date('2026-11-13T12:00:00Z');
 const twoDays = new Date(now.getTime() - 2 * 86400000).toISOString();
 const threeDays = new Date(now.getTime() - 3 * 86400000).toISOString();
 const fourDays = new Date(now.getTime() - 4 * 86400000).toISOString();
 assert.equal(statusAfterGrace('past_due', twoDays, now), 'past_due');
 assert.equal(statusAfterGrace('past_due', threeDays, now), 'suspended');
 assert.equal(statusAfterGrace('past_due', fourDays, now), 'suspended');
 assert.equal(statusAfterGrace('active', fourDays, now), 'active');
 assert.equal(statusAfterGrace('past_due', null, now), 'past_due');
 assert.equal(daysPastDue(twoDays, now), 2);
 assert.equal(daysPastDue(null, now), 0);
 assert.throws(() => statusAfterGrace('inventado', null, now), /Invalid billing status/);
});

test('email y formato de moneda para la UI', () => {
 assert.equal(validateCheckoutEmail('  Cliente@Empresa.MX '), 'cliente@empresa.mx');
 assert.throws(() => validateCheckoutEmail('no-es-correo'), /Invalid checkout/);
 assert.throws(() => validateCheckoutEmail(''), /Invalid checkout/);
 assert.match(formatMoneyCents(94900), /949/);
 assert.match(formatMoneyCents(990000), /9,900/);
});
