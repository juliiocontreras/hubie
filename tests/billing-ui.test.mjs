import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('cotizador: botón de pago con Stripe, correo y mensualidad visible', async () => {
 const html = await readFile('precios.html', 'utf8');
 for (const id of ['checkout-pay', 'checkout-email', 'checkout-status', 'monthly-fee']) {
  assert.ok(html.includes(`id="${id}"`), id);
 }
 assert.match(html, /Pagar anticipo con Stripe/);
 const quote = await readFile('assets/quote.js', 'utf8');
 assert.match(quote, /fetch\('\/api\/checkout'/);
 assert.match(quote, /Stripe no configurado/);
 assert.match(quote, /monthly-fee/);
 assert.match(quote, /get\('checkout'\)/);
 assert.match(quote, /Pago recibido/);
});

test('Madre: vista de cobros con empresas y órdenes sin tenant', async () => {
 const html = await readFile('madre/app.html', 'utf8');
 assert.ok(html.includes('data-view="billing"'));
 assert.ok(html.includes('id="view-billing"'));
 assert.ok(html.includes('id="billing-companies"'));
 assert.ok(html.includes('id="billing-orders"'));
 assert.match(html, /Mensualidad de plataforma \$949/);
 const consoleJs = await readFile('assets/admin-console.js', 'utf8');
 assert.match(consoleJs, /renderBilling/);
 assert.match(consoleJs, /\/api\/admin\/billing/);
 assert.match(consoleJs, /billingStatus/);
 const demo = await readFile('assets/demo-backend.js', 'utf8');
 assert.match(demo, /\/api\/admin\/billing/);
 assert.match(demo, /\/api\/billing\/status/);
});

test('cliente: sección Mi suscripción con estado y próximos cargos', async () => {
 const html = await readFile('app/index.html', 'utf8');
 assert.ok(html.includes('id="billing-nav"'));
 assert.ok(html.includes('id="billing"'));
 assert.ok(html.includes('id="billing-status-pill"'));
 assert.ok(html.includes('id="billing-details"'));
 assert.match(html, /Mi suscripción/);
 const consoleJs = await readFile('assets/app-console.js', 'utf8');
 assert.match(consoleJs, /showBilling/);
 assert.match(consoleJs, /\/api\/billing\/status\?slug=/);
 assert.match(consoleJs, /Mensualidad de plataforma/);
});

test('documentación de cobro: modelo, gracia y pendientes', async () => {
 const doc = await readFile('docs/STRIPE-BILLING.md', 'utf8');
 assert.match(doc, /\$949 MXN\/mes/);
 assert.match(doc, /anticipo 50%/i);
 assert.match(doc, /hasta 6 pagos/i);
 assert.match(doc, /3 días → `suspended`/);
 assert.match(doc, /IVA incluido/);
 assert.match(doc, /checkout\.session\.completed/);
 assert.match(doc, /idempotencia/i);
 assert.match(doc, /Pendiente/);
});

test('módulos de cobro sin emojis como iconografía', async () => {
 const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
 for (const file of ['platform/billing-domain.mjs', 'platform/billing-store.mjs', 'platform/billing-webhook.mjs']) {
  const src = await readFile(file, 'utf8');
  assert.doesNotMatch(src, emoji, file);
 }
});
