import test from 'node:test';
import assert from 'node:assert/strict';
import {createFakeDb} from './billing-fake-db.mjs';
import {sweepPastDueSuspensions} from '../platform/billing-store.mjs';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const ORG_C = '33333333-3333-4333-8333-333333333333';
const daysAgo = n => new Date(Date.now() - n * 86400000).toISOString();
const seed = () => createFakeDb({
 organizations: [
  {id: ORG_A, slug: 'a', name: 'A'},
  {id: ORG_B, slug: 'b', name: 'B'},
  {id: ORG_C, slug: 'c', name: 'C'}
 ],
 tenant_settings: [
  {organization_id: ORG_A, suite_id: 'S001'},
  {organization_id: ORG_B, suite_id: 'S001'},
  {organization_id: ORG_C, suite_id: 'S001'}
 ]
});
const depsOf = fake => ({executeSql: fake.executeSql, executeBatch: fake.executeBatch});
const sub = (org, status, pastDueSince) => ({
 organization_id: org, id: 'sub-' + org.slice(0, 4), stripe_customer_id: 'cus_1',
 stripe_subscription_id: 'sub_' + org.slice(0, 4), status, monthly_fee_cents: 94900,
 current_period_end: null, past_due_since: pastDueSince
});

test('barrido: suspende past_due con >3 días y audita; respeta gracia y activos', async () => {
 const fake = seed();
 fake.tables.tenant_subscriptions.push(
  sub(ORG_A, 'past_due', daysAgo(4)),
  sub(ORG_B, 'past_due', daysAgo(1)),
  sub(ORG_C, 'active', null)
 );
 const result = await sweepPastDueSuspensions(new Date(), depsOf(fake));
 assert.equal(result.checked, 2);
 assert.deepEqual(result.suspended, [ORG_A]);
 assert.equal(result.suspendedCount, 1);
 assert.equal(fake.tables.tenant_subscriptions.find(s => s.organization_id === ORG_A).status, 'suspended');
 assert.equal(fake.tables.tenant_subscriptions.find(s => s.organization_id === ORG_B).status, 'past_due');
 assert.equal(fake.tables.tenant_subscriptions.find(s => s.organization_id === ORG_C).status, 'active');
 const audit = fake.tables.audit_events.filter(e => e.action === 'billing.suspended_grace');
 assert.equal(audit.length, 1);
 assert.equal(audit[0].organization_id, ORG_A);
 assert.equal(audit[0].target_type, 'subscription');
 assert.equal(audit[0].target_id, ORG_A);
});

test('barrido: idempotente, segunda pasada no suspende nada', async () => {
 const fake = seed();
 fake.tables.tenant_subscriptions.push(sub(ORG_A, 'past_due', daysAgo(5)));
 const first = await sweepPastDueSuspensions(new Date(), depsOf(fake));
 assert.equal(first.suspendedCount, 1);
 const second = await sweepPastDueSuspensions(new Date(), depsOf(fake));
 assert.equal(second.checked, 0);
 assert.equal(second.suspendedCount, 0);
 assert.equal(fake.tables.audit_events.length, 1);
});

test('barrido: sin past_due no hace nada', async () => {
 const fake = seed();
 fake.tables.tenant_subscriptions.push(sub(ORG_A, 'active', null));
 const result = await sweepPastDueSuspensions(new Date(), depsOf(fake));
 assert.deepEqual(result, {checked: 0, suspended: [], suspendedCount: 0});
 assert.equal(fake.tables.audit_events.length, 0);
});
