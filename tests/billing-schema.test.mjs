import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {catalog} from '../platform/catalog.mjs';

test('migración 015 crea las cuatro tablas de cobro con scope por tenant', async () => {
 const sql = await readFile('turso/migrations/015_billing.sql', 'utf8');
 for (const table of ['tenant_subscriptions', 'tenant_payments', 'stripe_webhook_events', 'billing_checkout_orders']) {
  assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`), table);
  assert.match(sql, new RegExp(`${table}\\(\\s*organization_id|stripe_webhook_events\\(\\s*stripe_event_id`), table);
 }
 assert.match(sql, /stripe_event_id TEXT PRIMARY KEY/);
 assert.match(sql, /status TEXT NOT NULL DEFAULT 'none' CHECK\(status IN \('none','trialing','active','past_due','suspended','cancelled'\)\)/);
 assert.match(sql, /type TEXT NOT NULL CHECK\(type IN \('deposit','balance','monthly'\)\)/);
 assert.match(sql, /monthly_fee_cents INTEGER NOT NULL DEFAULT 94900/);
 assert.match(sql, /installments_total INTEGER NOT NULL DEFAULT 1 CHECK\(installments_total BETWEEN 1 AND 6\)/);
 assert.match(sql, /past_due_since TEXT/);
});

test('catálogo: mensualidad de plataforma $949 MXN parejo para las 10 suites', () => {
 assert.equal(catalog.rules.monthlyPlatformFee, 949);
 assert.equal(catalog.rules.depositRate, 0.5);
 assert.equal(catalog.rules.maxBalanceInstallments, 6);
 assert.equal(catalog.suites.length, 10);
});

test('server aplica la migración 015 y /healthz espera las 4 tablas nuevas', async () => {
 const server = await readFile('server.mjs', 'utf8');
 assert.match(server, /'015_billing\.sql'/);
 for (const table of ['tenant_subscriptions', 'tenant_payments', 'stripe_webhook_events', 'billing_checkout_orders']) {
  assert.ok(server.includes(`'${table}'`), table);
 }
 assert.match(server, /===84/); // 24 base + 4 billing (015) + 6 commerce (016) + 3 onboarding (018) + 1 notifications (020)
});

test('.env.example documenta Stripe en modo prueba sin valores reales', async () => {
 const env = await readFile('.env.example', 'utf8');
 assert.match(env, /MODO PRUEBA/);
 assert.match(env, /STRIPE_SECRET_KEY=\n/);
 assert.match(env, /STRIPE_WEBHOOK_SECRET=\n/);
 assert.match(env, /whsec_/);
 assert.match(env, /sk_test_/);
 assert.doesNotMatch(env, /sk_test_[A-Za-z0-9]{8,}/);
 assert.doesNotMatch(env, /whsec_[A-Za-z0-9]{8,}/);
});
