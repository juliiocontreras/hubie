import test from 'node:test';
import assert from 'node:assert/strict';
import {createFakeDb, mockStripe} from './billing-fake-db.mjs';
import {quoteCheckout} from '../platform/billing-domain.mjs';
import {handleStripeEvent} from '../platform/billing-webhook.mjs';
import {createCheckoutOrder} from '../platform/billing-store.mjs';

const depsOf = fake => ({executeSql: fake.executeSql, executeBatch: fake.executeBatch});
const quote = () => quoteCheckout({suiteId: 'S001'});
const session = (id, metadata = {}) => ({id, customer: 'cus_1', subscription: 'sub_1', metadata});

test('checkout sin tenant: se crea el tenant con el cliente como owner y la orden queda convertida', async () => {
 const fake = createFakeDb();
 const {client} = mockStripe();
 await createCheckoutOrder({email: 'nuevo@demo.mx', quote: quote(), stripeSessionId: 'cs_10'}, depsOf(fake));
 const event = {id: 'evt_20', type: 'checkout.session.completed', data: {object: session('cs_10')}};
 const result = await handleStripeEvent(event, {stripe: client, deps: depsOf(fake)});
 assert.equal(result.handled, true);
 assert.equal(result.provisioned, true);
 assert.equal(result.isNewUser, true);
 assert.equal(result.setupTokenIssued, true);
 assert.ok(result.activationPath);
 assert.ok(result.organizationId);
 assert.equal(result.status, 'active');
 const org = fake.tables.organizations.find(o => o.id === result.organizationId);
 assert.ok(org);
 assert.equal(org.slug, 'nuevo');
 const member = fake.tables.memberships.find(m => m.organization_id === result.organizationId);
 assert.equal(member.role, 'owner');
 const user = fake.tables.users.find(u => u.id === member.user_id);
 assert.equal(user.email, 'nuevo@demo.mx');
 const order = fake.tables.billing_checkout_orders[0];
 assert.equal(order.status, 'converted');
 assert.equal(order.organization_id, result.organizationId);
 // Suscripción y anticipo del tenant nuevo, como en el flujo con tenant.
 assert.equal(fake.tables.tenant_subscriptions.length, 1);
 assert.equal(fake.tables.tenant_subscriptions[0].organization_id, result.organizationId);
 assert.equal(fake.tables.tenant_subscriptions[0].status, 'active');
 assert.equal(fake.tables.tenant_payments.filter(p => p.type === 'deposit' && p.status === 'paid').length, 1);
 // El token en claro no queda en ninguna tabla.
 assert.ok(!JSON.stringify(fake.tables).includes(result.activationPath.split('token=')[1]));
 // Reintento del mismo evento: duplicado, no se vuelve a procesar.
 const again = await handleStripeEvent(event, {stripe: client, deps: depsOf(fake)});
 assert.equal(again.duplicate, true);
 assert.equal(fake.tables.organizations.length, 1);
});

test('segundo pago del mismo cliente no duplica el tenant', async () => {
 const fake = createFakeDb();
 const {client} = mockStripe();
 await createCheckoutOrder({email: 'repite@demo.mx', quote: quote(), stripeSessionId: 'cs_11'}, depsOf(fake));
 const first = await handleStripeEvent(
  {id: 'evt_21', type: 'checkout.session.completed', data: {object: session('cs_11')}},
  {stripe: client, deps: depsOf(fake)});
 assert.equal(fake.tables.organizations.length, 1);
 // Otro evento (id distinto) para la misma sesión ya convertida.
 const retry = await handleStripeEvent(
  {id: 'evt_22', type: 'checkout.session.completed', data: {object: session('cs_11')}},
  {stripe: client, deps: depsOf(fake)});
 assert.equal(retry.organizationId, first.organizationId);
 assert.equal(fake.tables.organizations.length, 1);
 // Una orden nueva del mismo correo: se reutiliza su tenant.
 await createCheckoutOrder({email: 'repite@demo.mx', quote: quote(), stripeSessionId: 'cs_12'}, depsOf(fake));
 const second = await handleStripeEvent(
  {id: 'evt_23', type: 'checkout.session.completed', data: {object: session('cs_12')}},
  {stripe: client, deps: depsOf(fake)});
 assert.equal(second.organizationId, first.organizationId);
 assert.equal(second.isNewUser, false);
 assert.equal(second.setupTokenIssued, false);
 assert.equal(fake.tables.organizations.length, 1);
 assert.equal(fake.tables.users.length, 1);
});

test('checkout sin tenant con usuario ya registrado: se vincula como owner sin token', async () => {
 const fake = createFakeDb({users: [{id: 'u-viejo', email: 'viejo@demo.mx'}]});
 const {client} = mockStripe();
 await createCheckoutOrder({email: 'viejo@demo.mx', quote: quote(), stripeSessionId: 'cs_13'}, depsOf(fake));
 const result = await handleStripeEvent(
  {id: 'evt_24', type: 'checkout.session.completed', data: {object: session('cs_13')}},
  {stripe: client, deps: depsOf(fake)});
 assert.equal(result.provisioned, true);
 assert.equal(result.isNewUser, false);
 assert.equal(result.setupTokenIssued, false);
 assert.equal(result.ownerUserId, 'u-viejo');
 const member = fake.tables.memberships.find(m => m.organization_id === result.organizationId);
 assert.equal(member.user_id, 'u-viejo');
 assert.equal(member.role, 'owner');
});
