import test from 'node:test';
import assert from 'node:assert/strict';
import {createFakeDb} from './billing-fake-db.mjs';
import {quoteCheckout} from '../platform/billing-domain.mjs';
import {organizationIdBySlug, getBillingStatus, isBillingSuspended, listBillingForAdmin, createCheckoutOrder, findCheckoutOrderBySession, recordWebhookEvent, markWebhookEventProcessed, activateTenantFromCheckout, applyPastDue, applyInvoicePaid, suspendIfGraceExpired} from '../platform/billing-store.mjs';

const orgId = '11111111-1111-4111-8111-111111111111';
const seed = () => createFakeDb({
 organizations: [{id: orgId, slug: 'demo-sa', name: 'Demo SA'}],
 tenant_settings: [{organization_id: orgId, suite_id: 'S001'}]
});
const depsOf = fake => ({executeSql: fake.executeSql, executeBatch: fake.executeBatch});

test('sin suscripción: estado none, mensualidad $949, sin saldo', async () => {
 const fake = seed();
 const status = await getBillingStatus(orgId, depsOf(fake));
 assert.equal(status.status, 'none');
 assert.equal(status.effectiveStatus, 'none');
 assert.equal(status.monthlyFeeCents, 94900);
 assert.equal(status.balancePendingCents, 0);
 assert.equal(await isBillingSuspended(orgId, depsOf(fake)), false);
});

test('activar tenant desde checkout: suscripción + anticipo pagado + 6 parcialidades', async () => {
 const fake = seed();
 const quote = quoteCheckout({suiteId: 'S001', toolIds: ['T001']});
 const order = await createCheckoutOrder({email: 'cliente@demo.mx', quote, stripeSessionId: 'cs_test_1'}, depsOf(fake));
 const found = await findCheckoutOrderBySession('cs_test_1', depsOf(fake));
 assert.equal(found.id, order.id);
 assert.equal(found.status, 'pending');
 const activated = await activateTenantFromCheckout({
  organizationId: orgId, order: found,
  session: {id: 'cs_test_1', customer: 'cus_test_1', subscription: 'sub_test_1'},
  subscription: {id: 'sub_test_1', status: 'active', current_period_end: Math.floor(Date.now() / 1000) + 2592000}
 }, depsOf(fake));
 assert.equal(activated.status, 'active');
 assert.equal(fake.tables.tenant_subscriptions.length, 1);
 assert.equal(fake.tables.tenant_subscriptions[0].stripe_subscription_id, 'sub_test_1');
 const payments = fake.tables.tenant_payments;
 assert.equal(payments.filter(p => p.type === 'deposit' && p.status === 'paid').length, 1);
 assert.equal(payments.find(p => p.type === 'deposit').amount_cents, quote.depositCents);
 const balance = payments.filter(p => p.type === 'balance');
 assert.equal(balance.length, 6);
 assert.equal(balance.reduce((a, p) => a + p.amount_cents, 0), quote.balanceCents);
 assert.equal(fake.tables.billing_checkout_orders[0].status, 'converted');
 const status = await getBillingStatus(orgId, depsOf(fake));
 assert.equal(status.effectiveStatus, 'active');
 assert.equal(status.balancePendingCents, quote.balanceCents);
 assert.equal(status.balanceInstallmentsPending, 6);
});

test('idempotencia del webhook: el mismo evento solo se registra una vez', async () => {
 const fake = seed();
 const event = {id: 'evt_1', type: 'invoice.payment_failed', data: {object: {}}};
 assert.equal(await recordWebhookEvent(event, depsOf(fake)), true);
 assert.equal(await recordWebhookEvent(event, depsOf(fake)), false);
 assert.equal(fake.tables.stripe_webhook_events.length, 1);
 await markWebhookEventProcessed('evt_1', depsOf(fake));
 assert.equal(fake.tables.stripe_webhook_events[0].processed_at, 'now');
});

test('past_due reciente no suspende; con 4 días de gracia vencida sí', async () => {
 const fake = seed();
 const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString();
 fake.tables.tenant_subscriptions.push({organization_id: orgId, id: 'sub-1', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1', status: 'active', monthly_fee_cents: 94900, current_period_end: null, past_due_since: null});
 await applyPastDue({organizationId: orgId, invoiceId: 'in_1', amountCents: 94900}, depsOf(fake));
 let status = await getBillingStatus(orgId, depsOf(fake));
 assert.equal(status.effectiveStatus, 'past_due');
 assert.equal(status.daysPastDue, 0);
 assert.equal((await suspendIfGraceExpired(orgId, new Date(), depsOf(fake))).changed, false);
 // Simula que el vencimiento fue hace 4 días.
 fake.tables.tenant_subscriptions[0].past_due_since = new Date(Date.now() - 4 * 86400000).toISOString();
 status = await getBillingStatus(orgId, depsOf(fake));
 assert.equal(status.effectiveStatus, 'suspended');
 const suspended = await suspendIfGraceExpired(orgId, new Date(), depsOf(fake));
 assert.equal(suspended.changed, true);
 assert.equal(suspended.status, 'suspended');
 assert.equal(fake.tables.tenant_subscriptions[0].status, 'suspended');
 assert.equal(await isBillingSuspended(orgId, depsOf(fake)), true);
 // Un pago exitoso reactiva.
 await applyInvoicePaid({organizationId: orgId, invoiceId: 'in_2', amountCents: 94900}, depsOf(fake));
 assert.equal(fake.tables.tenant_subscriptions[0].status, 'active');
 assert.equal((await getBillingStatus(orgId, depsOf(fake))).effectiveStatus, 'active');
});

test('Madre lista empresas con estado de cobro y órdenes pagadas sin tenant', async () => {
 const fake = seed();
 fake.tables.tenant_subscriptions.push({organization_id: orgId, id: 'sub-1', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1', status: 'active', monthly_fee_cents: 94900, current_period_end: null, past_due_since: null});
 fake.tables.tenant_payments.push({organization_id: orgId, id: 'pay-1', type: 'balance', amount_cents: 100000, status: 'pending', installment_number: 1, installments_total: 6, due_at: null});
 fake.tables.billing_checkout_orders.push({id: 'ord-1', email: 'nuevo@demo.mx', suite_id: 'S002', quote_json: '{}', total_cents: 2990000, deposit_cents: 1495000, balance_cents: 1495000, monthly_fee_cents: 94900, stripe_checkout_session_id: 'cs_9', stripe_customer_id: 'cus_9', organization_id: null, status: 'paid', created_at: 'now', paid_at: 'now'});
 const list = await listBillingForAdmin(depsOf(fake));
 assert.equal(list.tenants.length, 1);
 assert.equal(list.tenants[0].billingStatus, 'active');
 assert.equal(list.tenants[0].balancePendingCents, 100000);
 assert.equal(list.pendingOrders.length, 1);
 assert.equal(list.pendingOrders[0].email, 'nuevo@demo.mx');
 assert.equal(await organizationIdBySlug('demo-sa', depsOf(fake)), orgId);
 assert.equal(await organizationIdBySlug('no-existe', depsOf(fake)), null);
});
