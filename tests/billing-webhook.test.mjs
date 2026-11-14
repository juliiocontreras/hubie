import test from 'node:test';
import assert from 'node:assert/strict';
import {createFakeDb, mockStripe} from './billing-fake-db.mjs';
import {quoteCheckout} from '../platform/billing-domain.mjs';
import {verifyWebhookEvent, buildCheckoutSessionParams, handleStripeEvent, scheduleBalanceInvoices, stripeConfigured} from '../platform/billing-webhook.mjs';
import {createCheckoutOrder} from '../platform/billing-store.mjs';

const orgId = '11111111-1111-4111-8111-111111111111';
const seed = () => createFakeDb({
 organizations: [{id: orgId, slug: 'demo-sa', name: 'Demo SA'}],
 tenant_settings: [{organization_id: orgId, suite_id: 'S001'}]
});
const depsOf = fake => ({executeSql: fake.executeSql, executeBatch: fake.executeBatch});
const quote = () => quoteCheckout({suiteId: 'S001'});

test('firma de webhook inválida se rechaza; válida construye el evento', () => {
 const {client} = mockStripe();
 const raw = Buffer.from(JSON.stringify({id: 'evt_1', type: 'invoice.payment_succeeded', data: {object: {}}}));
 assert.throws(() => verifyWebhookEvent({rawBody: raw, signature: 'sig-mala', stripe: client, secret: 'whsec_test'}), /Invalid webhook signature/);
 assert.throws(() => verifyWebhookEvent({rawBody: raw, signature: 'sig-ok', stripe: client, secret: ''}), /Invalid webhook signature/);
 const event = verifyWebhookEvent({rawBody: raw, signature: 'sig-ok', stripe: client, secret: 'whsec_test'});
 assert.equal(event.id, 'evt_1');
});

test('sesión de checkout: modo subscription, anticipo one-time + mensualidad $949', () => {
 const params = buildCheckoutSessionParams({quote: quote(), email: 'cliente@demo.mx', organizationId: orgId, orderId: 'ord-1', origin: 'https://hubie.test'});
 assert.equal(params.mode, 'subscription');
 assert.equal(params.customer_email, 'cliente@demo.mx');
 assert.equal(params.line_items.length, 2);
 assert.equal(params.line_items[0].price_data.unit_amount, 495000);
 assert.equal(params.line_items[0].price_data.currency, 'mxn');
 assert.equal(params.line_items[1].price_data.unit_amount, 94900);
 assert.equal(params.line_items[1].price_data.recurring.interval, 'month');
 assert.equal(params.metadata.organization_id, orgId);
 assert.equal(params.metadata.deposit_cents, '495000');
 assert.match(params.success_url, /checkout=ok/);
 assert.throws(() => buildCheckoutSessionParams({quote: quote(), email: '', orderId: 'x', origin: 'https://x'}), /Invalid checkout/);
});

test('checkout completado sin tenant: alta autoservicio crea el tenant con el cliente como owner', async () => {
 const fake = seed();
 const {client} = mockStripe();
 await createCheckoutOrder({email: 'nuevo@demo.mx', quote: quote(), stripeSessionId: 'cs_1'}, depsOf(fake));
 const event = {id: 'evt_10', type: 'checkout.session.completed', data: {object: {id: 'cs_1', customer: 'cus_1', subscription: 'sub_1', metadata: {}}}};
 const result = await handleStripeEvent(event, {stripe: client, deps: depsOf(fake)});
 assert.equal(result.handled, true);
 assert.equal(result.provisioned, true);
 assert.equal(result.isNewUser, true);
 assert.equal(result.setupTokenIssued, true);
 assert.ok(result.organizationId);
 assert.equal(fake.tables.billing_checkout_orders[0].status, 'converted');
 assert.equal(fake.tables.billing_checkout_orders[0].organization_id, result.organizationId);
 const member = fake.tables.memberships.find(m => m.organization_id === result.organizationId);
 assert.equal(member.role, 'owner');
 assert.equal(fake.tables.users.find(u => u.id === member.user_id).email, 'nuevo@demo.mx');
 assert.equal(fake.tables.stripe_webhook_events[0].processed_at, 'now');
 // Reintento del mismo evento: duplicado, no se vuelve a procesar.
 const again = await handleStripeEvent(event, {stripe: client, deps: depsOf(fake)});
 assert.equal(again.duplicate, true);
 assert.equal(fake.tables.organizations.length, 2); // demo-sa del seed + el nuevo
 assert.equal(fake.tables.billing_checkout_orders[0].status, 'converted');
});

test('checkout completado con tenant: activa suscripción y programa el saldo en facturas', async () => {
 const fake = seed();
 const {client, calls} = mockStripe();
 await createCheckoutOrder({email: 'cliente@demo.mx', quote: quote(), stripeSessionId: 'cs_2', organizationId: orgId}, depsOf(fake));
 const event = {id: 'evt_11', type: 'checkout.session.completed', data: {object: {id: 'cs_2', customer: 'cus_1', subscription: 'sub_1', metadata: {organization_id: orgId}}}};
 const result = await handleStripeEvent(event, {stripe: client, deps: depsOf(fake)});
 assert.equal(result.handled, true);
 assert.equal(result.status, 'active');
 assert.equal(fake.tables.tenant_subscriptions[0].status, 'active');
 assert.equal(fake.tables.tenant_payments.filter(p => p.type === 'balance').length, 6);
 assert.equal(calls.filter(c => c[0] === 'invoiceItems.create').length, 6);
 assert.equal(calls.filter(c => c[0] === 'invoices.create').length, 6);
 assert.equal(calls.filter(c => c[0] === 'invoices.finalizeInvoice').length, 6);
 assert.equal(fake.tables.billing_checkout_orders[0].status, 'converted');
});

test('factura fallida -> past_due; segunda fallida tras la gracia -> suspendido; pago -> activo', async () => {
 const fake = seed();
 const {client} = mockStripe();
 fake.tables.tenant_subscriptions.push({organization_id: orgId, id: 'sub-1', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1', status: 'active', monthly_fee_cents: 94900, current_period_end: null, past_due_since: null});
 const failed = {id: 'evt_20', type: 'invoice.payment_failed', data: {object: {id: 'in_1', amount_due: 94900, metadata: {organization_id: orgId}}}};
 const r1 = await handleStripeEvent(failed, {stripe: client, deps: depsOf(fake)});
 assert.equal(r1.handled, true);
 assert.equal(fake.tables.tenant_subscriptions[0].status, 'past_due');
 assert.equal(fake.tables.tenant_payments.find(p => p.stripe_invoice_id === 'in_1').status, 'failed');
 // La gracia vence: el mismo tenant con past_due_since de hace 4 días se suspende al fallar otra factura.
 fake.tables.tenant_subscriptions[0].past_due_since = new Date(Date.now() - 4 * 86400000).toISOString();
 const failed2 = {id: 'evt_21', type: 'invoice.payment_failed', data: {object: {id: 'in_2', amount_due: 94900, metadata: {organization_id: orgId}}}};
 await handleStripeEvent(failed2, {stripe: client, deps: depsOf(fake)});
 assert.equal(fake.tables.tenant_subscriptions[0].status, 'suspended');
 const paid = {id: 'evt_22', type: 'invoice.payment_succeeded', data: {object: {id: 'in_3', amount_paid: 94900, metadata: {organization_id: orgId}}}};
 await handleStripeEvent(paid, {stripe: client, deps: depsOf(fake)});
 assert.equal(fake.tables.tenant_subscriptions[0].status, 'active');
});

test('suscripción actualizada/cancelada y tipos no manejados', async () => {
 const fake = seed();
 const {client} = mockStripe();
 fake.tables.tenant_subscriptions.push({organization_id: orgId, id: 'sub-1', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_1', status: 'active', monthly_fee_cents: 94900, current_period_end: null, past_due_since: null});
 const updated = {id: 'evt_30', type: 'customer.subscription.updated', data: {object: {id: 'sub_1', status: 'past_due', current_period_end: 1790000000, metadata: {organization_id: orgId}}}};
 await handleStripeEvent(updated, {stripe: client, deps: depsOf(fake)});
 assert.equal(fake.tables.tenant_subscriptions[0].status, 'past_due');
 assert.ok(fake.tables.tenant_subscriptions[0].past_due_since);
 const deleted = {id: 'evt_31', type: 'customer.subscription.deleted', data: {object: {id: 'sub_1', status: 'canceled', current_period_end: 1790000000, metadata: {organization_id: orgId}}}};
 await handleStripeEvent(deleted, {stripe: client, deps: depsOf(fake)});
 assert.equal(fake.tables.tenant_subscriptions[0].status, 'cancelled');
 const other = {id: 'evt_32', type: 'customer.created', data: {object: {id: 'cus_1'}}};
 const r = await handleStripeEvent(other, {stripe: client, deps: depsOf(fake)});
 assert.equal(r.handled, true);
 assert.equal(r.ignored, true);
 await assert.rejects(() => handleStripeEvent({type: 'x'}, {stripe: client, deps: depsOf(fake)}), /Invalid webhook event/);
});

test('saldo en facturas: una factura por parcialidad con su monto', async () => {
 const {client, calls} = mockStripe();
 const created = await scheduleBalanceInvoices(client, {customerId: 'cus_1', installmentsCents: [10000, 10000, 10001], organizationId: orgId, orderId: 'ord-1'});
 assert.equal(created.length, 3);
 assert.equal(created[2].amountCents, 10001);
 assert.equal(calls.filter(c => c[0] === 'invoices.create').length, 3);
 assert.deepEqual(await scheduleBalanceInvoices(client, {customerId: null, installmentsCents: [100]}), []);
});

test('sin clave, Stripe no se inicializa', () => {
 const saved = process.env.STRIPE_SECRET_KEY;
 delete process.env.STRIPE_SECRET_KEY;
 assert.equal(stripeConfigured(), false);
 if (saved !== undefined) process.env.STRIPE_SECRET_KEY = saved;
});
