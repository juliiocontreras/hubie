import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';

const PORT = 18199;
async function startServer() {
 const child = spawn(process.execPath, ['server.mjs'], {
  cwd: process.cwd(), env: {...process.env, PORT: String(PORT), TURSO_DATABASE_URL: '', TURSO_AUTH_TOKEN: '', STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', HUBIE_AUTH_ENABLED: 'true'},
  stdio: 'ignore'
 });
 const base = `http://127.0.0.1:${PORT}`;
 for (let i = 0; i < 40; i++) {
  try {
   const r = await fetch(base + '/healthz');
   if (r.status === 503) return {child, base};
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 250));
 }
 child.kill();
 throw Error('server did not start');
}

test('server expone las rutas de cobro y el webhook', async () => {
 const server = await readFile('server.mjs', 'utf8');
 for (const route of ['/api/checkout', '/api/stripe/webhook', '/api/billing/status', '/api/admin/billing']) {
  assert.ok(server.includes(`pathname==='${route}'`), route);
 }
 assert.match(server, /Stripe no configurado/);
 assert.match(server, /stripe-signature/);
});

test('sin claves de Stripe: checkout y webhook responden 503 y la app sigue viva', async t => {
 const {child, base} = await startServer();
 t.after(() => child.kill());
 const checkout = await fetch(base + '/api/checkout', {
  method: 'POST', headers: {'content-type': 'application/json', origin: base},
  body: JSON.stringify({suiteId: 'S001', email: 'cliente@demo.mx'})
 });
 assert.equal(checkout.status, 503);
 assert.match(await checkout.text(), /Stripe no configurado/);
 const webhook = await fetch(base + '/api/stripe/webhook', {
  method: 'POST', headers: {'content-type': 'application/json', 'stripe-signature': 't=1,v1=x'},
  body: JSON.stringify({id: 'evt_1', type: 'invoice.payment_succeeded'})
 });
 assert.equal(webhook.status, 503);
 assert.match(await webhook.text(), /Stripe no configurado/);
 // La app sigue sirviendo contenido público aunque el cobro esté apagado.
 const home = await fetch(base + '/index.html');
 assert.equal(home.status, 200);
 assert.match(await home.text(), /Hubie/);
});

test('sin base de datos: estado de cobro responde 503 sin exponer detalles', async t => {
 const {child, base} = await startServer();
 t.after(() => child.kill());
 const status = await fetch(base + '/api/billing/status?slug=demo-sa');
 assert.equal(status.status, 503);
 const admin = await fetch(base + '/api/admin/billing');
 assert.equal(admin.status, 503);
});
