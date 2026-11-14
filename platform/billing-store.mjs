import {randomUUID} from 'node:crypto';
import {executeSql, executeBatch} from '../database.mjs';
import {statusAfterGrace, daysPastDue, BILLING_STATUS_LABELS} from './billing-domain.mjs';
// Persistencia de cobro (migración 015). Scope por tenant en todo.
// Las funciones aceptan deps {executeSql, executeBatch} para poder probarlas
// con una base falsa; en producción usan Turso. La suspensión por impago vive
// en tenant_subscriptions.status y NO toca organizations.status: el resto de
// la app sigue leyendo su propio estado y el login del superadmin no se bloquea.
const rows = r => r?.rows?.map(row => row.map(x => x?.value ?? null)) ?? [];
const db = deps => ({sql: deps?.executeSql ?? executeSql, batch: deps?.executeBatch ?? executeBatch});
export async function organizationIdBySlug(slug, deps = {}) {
 const r = await db(deps).sql('SELECT id FROM organizations WHERE slug=?', [slug]);
 return rows(r)[0]?.[0] ?? null;
}
export async function getBillingStatus(organizationId, deps = {}) {
 const sub = rows(await db(deps).sql(
  'SELECT stripe_customer_id,stripe_subscription_id,status,monthly_fee_cents,current_period_end,past_due_since FROM tenant_subscriptions WHERE organization_id=? ORDER BY created_at DESC LIMIT 1',
  [organizationId]))[0];
 const pending = rows(await db(deps).sql(
  "SELECT type,amount_cents,status,installment_number,installments_total,due_at FROM tenant_payments WHERE organization_id=? AND status='pending'",
  [organizationId]));
 const status = sub?.[2] ?? 'none';
 const pastDueSince = sub?.[5] ?? null;
 const effectiveStatus = statusAfterGrace(status, pastDueSince);
 const balance = pending.filter(p => p[0] === 'balance');
 return {
  organizationId, status, effectiveStatus, statusLabel: BILLING_STATUS_LABELS[effectiveStatus],
  stripeCustomerId: sub?.[0] ?? null, stripeSubscriptionId: sub?.[1] ?? null,
  monthlyFeeCents: sub ? Number(sub[3]) : 94900,
  currentPeriodEnd: sub?.[4] ?? null, pastDueSince,
  daysPastDue: daysPastDue(pastDueSince),
  balancePendingCents: balance.reduce((sum, p) => sum + Number(p[1]), 0),
  balanceInstallmentsPending: balance.length,
  nextBalanceDueAt: balance.map(p => p[5]).filter(Boolean).sort()[0] ?? null,
  nextMonthlyChargeCents: effectiveStatus === 'active' || effectiveStatus === 'past_due' ? Number(sub?.[3] ?? 94900) : 0
 };
}
export async function isBillingSuspended(organizationId, deps = {}) {
 const {effectiveStatus} = await getBillingStatus(organizationId, deps);
 return effectiveStatus === 'suspended';
}
export async function listBillingForAdmin(deps = {}) {
 const tenants = rows(await db(deps).sql(
  'SELECT o.id,o.slug,o.name,s.suite_id FROM organizations o LEFT JOIN tenant_settings s ON s.organization_id=o.id ORDER BY o.created_at DESC LIMIT 200'));
 const subs = rows(await db(deps).sql(
  'SELECT organization_id,status,monthly_fee_cents,current_period_end,past_due_since FROM tenant_subscriptions'));
 const subByOrg = new Map(subs.map(s => [s[0], s]));
 const balances = rows(await db(deps).sql(
  "SELECT organization_id,SUM(amount_cents) AS total FROM tenant_payments WHERE type='balance' AND status='pending' GROUP BY organization_id"));
 const balanceByOrg = new Map(balances.map(b => [b[0], Number(b[1])]));
 const orders = rows(await db(deps).sql(
  "SELECT id,email,suite_id,total_cents,deposit_cents,balance_cents,status,created_at FROM billing_checkout_orders WHERE status='paid' AND organization_id IS NULL ORDER BY created_at DESC"));
 return {
  tenants: tenants.map(t => {
   const sub = subByOrg.get(t[0]);
   const status = sub?.[1] ?? 'none';
   const effectiveStatus = statusAfterGrace(status, sub?.[4] ?? null);
   return {
    id: t[0], slug: t[1], name: t[2], suiteId: t[3] ?? null,
    billingStatus: effectiveStatus, billingStatusLabel: BILLING_STATUS_LABELS[effectiveStatus],
    monthlyFeeCents: sub ? Number(sub[2]) : 94900, currentPeriodEnd: sub?.[3] ?? null,
    pastDueSince: sub?.[4] ?? null, daysPastDue: daysPastDue(sub?.[4] ?? null),
    balancePendingCents: balanceByOrg.get(t[0]) ?? 0
   };
  }),
  pendingOrders: orders.map(o => ({id: o[0], email: o[1], suiteId: o[2], totalCents: Number(o[3]), depositCents: Number(o[4]), balanceCents: Number(o[5]), status: o[6], createdAt: o[7]}))
 };
}
export async function createCheckoutOrder({id = randomUUID(), email, quote, stripeSessionId, stripeCustomerId = null, organizationId = null}, deps = {}) {
 await db(deps).sql(
  'INSERT INTO billing_checkout_orders(id,email,suite_id,quote_json,total_cents,deposit_cents,balance_cents,monthly_fee_cents,stripe_checkout_session_id,stripe_customer_id,organization_id,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
  [id, email, quote.suiteId, JSON.stringify(quote), quote.setupTotalCents, quote.depositCents, quote.balanceCents, quote.monthlyFeeCents, stripeSessionId, stripeCustomerId, organizationId, 'pending']);
 return {id, email, suiteId: quote.suiteId, status: 'pending'};
}
export async function findCheckoutOrderBySession(stripeSessionId, deps = {}) {
 const row = rows(await db(deps).sql(
  'SELECT id,email,suite_id,quote_json,total_cents,deposit_cents,balance_cents,monthly_fee_cents,stripe_checkout_session_id,organization_id,status FROM billing_checkout_orders WHERE stripe_checkout_session_id=?',
  [stripeSessionId]))[0];
 if (!row) return null;
 return {id: row[0], email: row[1], suiteId: row[2], quote: JSON.parse(row[3]), totalCents: Number(row[4]), depositCents: Number(row[5]), balanceCents: Number(row[6]), monthlyFeeCents: Number(row[7]), stripeSessionId: row[8], organizationId: row[9], status: row[10]};
}
export async function recordWebhookEvent(event, deps = {}) {
 const organizationId = event?.data?.object?.metadata?.organization_id || event?.data?.object?.customer_details?.organization_id || null;
 const r = await db(deps).sql(
  'INSERT INTO stripe_webhook_events(stripe_event_id,organization_id,type,payload_json) VALUES(?,?,?,?) ON CONFLICT(stripe_event_id) DO NOTHING',
  [event.id, organizationId || null, event.type, JSON.stringify(event)]);
 return Number(r?.affected_row_count ?? r?.rowsAffected ?? 0) > 0;
}
export async function markWebhookEventProcessed(stripeEventId, deps = {}) {
 await db(deps).sql('UPDATE stripe_webhook_events SET processed_at=CURRENT_TIMESTAMP WHERE stripe_event_id=?', [stripeEventId]);
}
export async function activateTenantFromCheckout({organizationId, order, session, subscription}, deps = {}) {
 const subscriptionId = typeof session?.subscription === 'string' ? session.subscription : session?.subscription?.id ?? subscription?.id ?? null;
 const customerId = typeof session?.customer === 'string' ? session.customer : session?.customer?.id ?? order?.stripeCustomerId ?? null;
 const periodEnd = subscription?.current_period_end ? new Date(Number(subscription.current_period_end) * 1000).toISOString() : null;
 const now = new Date();
 const statements = [
  {sql: 'INSERT INTO tenant_subscriptions(organization_id,id,stripe_customer_id,stripe_subscription_id,status,monthly_fee_cents,current_period_end) VALUES(?,?,?,?,?,?,?)',
   args: [organizationId, randomUUID(), customerId, subscriptionId, subscription?.status ?? 'active', order.monthlyFeeCents, periodEnd]},
  {sql: 'INSERT INTO tenant_payments(organization_id,id,type,amount_cents,currency,status,stripe_invoice_id,stripe_checkout_session_id,installments_total,installment_number,due_at,paid_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
   args: [organizationId, randomUUID(), 'deposit', order.depositCents, 'MXN', 'paid', null, session?.id ?? null, 1, 1, null, now.toISOString()]},
  ...order.quote.installmentsCents.map((amount, i) => ({
   sql: 'INSERT INTO tenant_payments(organization_id,id,type,amount_cents,currency,status,stripe_invoice_id,stripe_checkout_session_id,installments_total,installment_number,due_at,paid_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
   args: [organizationId, randomUUID(), 'balance', amount, 'MXN', 'pending', null, session?.id ?? null, order.quote.installmentsCents.length, i + 1, new Date(now.getTime() + (i + 1) * 30 * 86400000).toISOString(), null]
  })),
  {sql: "UPDATE billing_checkout_orders SET status='converted',organization_id=? WHERE id=?", args: [organizationId, order.id]}
 ];
 await db(deps).batch(statements);
 return {organizationId, subscriptionId, customerId, status: subscription?.status ?? 'active'};
}
export async function markCheckoutOrderPaid(orderId, stripeCustomerId, deps = {}) {
 await db(deps).sql("UPDATE billing_checkout_orders SET status='paid',stripe_customer_id=?,paid_at=CURRENT_TIMESTAMP WHERE id=?", [stripeCustomerId ?? null, orderId]);
}
export async function applySubscriptionUpdate({organizationId, stripeSubscriptionId, status, currentPeriodEnd}, deps = {}) {
 const periodEnd = currentPeriodEnd ? new Date(Number(currentPeriodEnd) * 1000).toISOString() : null;
 const pastDueSince = status === 'past_due' ? new Date().toISOString() : null;
 const r = await db(deps).sql(
  'UPDATE tenant_subscriptions SET status=?,current_period_end=?,past_due_since=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND stripe_subscription_id=?',
  [status, periodEnd, pastDueSince, organizationId, stripeSubscriptionId]);
 if (!Number(r?.affected_row_count ?? r?.rowsAffected ?? 0)) {
  await db(deps).sql(
   'INSERT INTO tenant_subscriptions(organization_id,id,stripe_customer_id,stripe_subscription_id,status,monthly_fee_cents,current_period_end) VALUES(?,?,?,?,?,?,?)',
   [organizationId, randomUUID(), null, stripeSubscriptionId, status, 94900, periodEnd]);
 }
 return {organizationId, stripeSubscriptionId, status};
}
export async function applyPastDue({organizationId, invoiceId, amountCents}, deps = {}) {
 const now = new Date().toISOString();
 await db(deps).sql(
  'UPDATE tenant_subscriptions SET status=?,past_due_since=COALESCE(past_due_since,?),updated_at=CURRENT_TIMESTAMP WHERE organization_id=?',
  ['past_due', now, organizationId]);
 const existing = rows(await db(deps).sql('SELECT id FROM tenant_payments WHERE stripe_invoice_id=?', [invoiceId]))[0];
 if (existing) {
  await db(deps).sql("UPDATE tenant_payments SET status='failed' WHERE stripe_invoice_id=?", [invoiceId]);
 } else {
  await db(deps).sql(
   'INSERT INTO tenant_payments(organization_id,id,type,amount_cents,currency,status,stripe_invoice_id,stripe_checkout_session_id,installments_total,installment_number,due_at,paid_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
   [organizationId, randomUUID(), 'monthly', amountCents, 'MXN', 'failed', invoiceId, null, 1, 1, now, null]);
 }
 return {organizationId, status: 'past_due'};
}
export async function applyInvoicePaid({organizationId, invoiceId, amountCents}, deps = {}) {
 const now = new Date().toISOString();
 const existing = rows(await db(deps).sql('SELECT id FROM tenant_payments WHERE stripe_invoice_id=?', [invoiceId]))[0];
 if (existing) {
  await db(deps).sql("UPDATE tenant_payments SET status='paid',paid_at=? WHERE stripe_invoice_id=?", [now, invoiceId]);
 } else {
  await db(deps).sql(
   'INSERT INTO tenant_payments(organization_id,id,type,amount_cents,currency,status,stripe_invoice_id,stripe_checkout_session_id,installments_total,installment_number,due_at,paid_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
   [organizationId, randomUUID(), 'monthly', amountCents, 'MXN', 'paid', invoiceId, null, 1, 1, null, now]);
 }
 await db(deps).sql(
  "UPDATE tenant_subscriptions SET status='active',past_due_since=NULL,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND status IN ('past_due','suspended')",
  [organizationId]);
 return {organizationId, status: 'active'};
}
export async function suspendIfGraceExpired(organizationId, now = new Date(), deps = {}) {
 const {status, pastDueSince, effectiveStatus} = await getBillingStatus(organizationId, deps);
 if (status !== 'past_due' || effectiveStatus !== 'suspended') return {organizationId, status, changed: false};
 await db(deps).sql(
  "UPDATE tenant_subscriptions SET status='suspended',updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND status='past_due'",
  [organizationId]);
 return {organizationId, status: 'suspended', changed: true, pastDueSince};
}
