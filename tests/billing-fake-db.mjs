// Base de datos falsa en memoria para los tests de cobro. Implementa solo las
// sentencias que usa platform/billing-store.mjs, con la misma forma de
// resultado que database.mjs ({rows: [[{value}...]], affected_row_count}).
const cells = values => values.map(value => ({value: value ?? null}));
const ok = (rows = [], affected = 0) => ({rows: rows.map(cells), affected_row_count: affected, rowsAffected: affected});
export function createFakeDb(seed = {}) {
 const tables = {
  organizations: seed.organizations ?? [],
  tenant_settings: seed.tenant_settings ?? [],
  tenant_subscriptions: seed.tenant_subscriptions ?? [],
  tenant_payments: seed.tenant_payments ?? [],
  stripe_webhook_events: [],
  billing_checkout_orders: seed.orders ?? []
 };
 const subRow = s => [s.stripe_customer_id ?? null, s.stripe_subscription_id ?? null, s.status, s.monthly_fee_cents, s.current_period_end ?? null, s.past_due_since ?? null];
 async function executeSql(sql, args = []) {
  if (sql.startsWith('SELECT id FROM organizations WHERE slug=?')) {
   const org = tables.organizations.find(o => o.slug === args[0]);
   return ok(org ? [[org.id]] : []);
  }
  if (sql.includes('FROM tenant_subscriptions WHERE organization_id=? ORDER BY created_at DESC LIMIT 1')) {
   const subs = tables.tenant_subscriptions.filter(s => s.organization_id === args[0]);
   return ok(subs.length ? [subRow(subs[subs.length - 1])] : []);
  }
  if (sql.includes("FROM tenant_payments WHERE organization_id=? AND status='pending'")) {
   return ok(tables.tenant_payments.filter(p => p.organization_id === args[0] && p.status === 'pending')
    .map(p => [p.type, p.amount_cents, p.status, p.installment_number, p.installments_total, p.due_at ?? null]));
  }
  if (sql.startsWith('SELECT o.id,o.slug,o.name,s.suite_id FROM organizations')) {
   return ok(tables.organizations.map(o => [o.id, o.slug, o.name, tables.tenant_settings.find(s => s.organization_id === o.id)?.suite_id ?? null]));
  }
  if (sql.startsWith('SELECT organization_id,status,monthly_fee_cents,current_period_end,past_due_since FROM tenant_subscriptions')) {
   return ok(tables.tenant_subscriptions.map(s => [s.organization_id, s.status, s.monthly_fee_cents, s.current_period_end ?? null, s.past_due_since ?? null]));
  }
  if (sql.includes('SUM(amount_cents)')) {
   const sums = new Map();
   for (const p of tables.tenant_payments.filter(p => p.type === 'balance' && p.status === 'pending')) {
    sums.set(p.organization_id, (sums.get(p.organization_id) ?? 0) + p.amount_cents);
   }
   return ok([...sums.entries()].map(([organization_id, total]) => [organization_id, total]));
  }
  if (sql.includes("FROM billing_checkout_orders WHERE status='paid'")) {
   return ok(tables.billing_checkout_orders.filter(o => o.status === 'paid' && !o.organization_id)
    .map(o => [o.id, o.email, o.suite_id, o.total_cents, o.deposit_cents, o.balance_cents, o.status, o.created_at]));
  }
  if (sql.startsWith('SELECT id,email,suite_id,quote_json')) {
   const o = tables.billing_checkout_orders.find(x => x.stripe_checkout_session_id === args[0]);
   return ok(o ? [[o.id, o.email, o.suite_id, o.quote_json, o.total_cents, o.deposit_cents, o.balance_cents, o.monthly_fee_cents, o.stripe_checkout_session_id, o.organization_id ?? null, o.status]] : []);
  }
  if (sql.startsWith('INSERT INTO stripe_webhook_events')) {
   if (tables.stripe_webhook_events.some(e => e.stripe_event_id === args[0])) return ok([], 0);
   tables.stripe_webhook_events.push({stripe_event_id: args[0], organization_id: args[1], type: args[2], payload_json: args[3], processed_at: null});
   return ok([], 1);
  }
  if (sql.startsWith('UPDATE stripe_webhook_events SET processed_at')) {
   const e = tables.stripe_webhook_events.find(x => x.stripe_event_id === args[0]);
   if (e) e.processed_at = 'now';
   return ok([], e ? 1 : 0);
  }
  if (sql.startsWith('INSERT INTO billing_checkout_orders')) {
   tables.billing_checkout_orders.push({id: args[0], email: args[1], suite_id: args[2], quote_json: args[3], total_cents: args[4], deposit_cents: args[5], balance_cents: args[6], monthly_fee_cents: args[7], stripe_checkout_session_id: args[8], stripe_customer_id: args[9], organization_id: args[10], status: args[11], created_at: 'now', paid_at: null});
   return ok([], 1);
  }
  if (sql.startsWith("UPDATE billing_checkout_orders SET status='paid'")) {
   const o = tables.billing_checkout_orders.find(x => x.id === args[1]);
   if (o) {o.status = 'paid'; o.stripe_customer_id = args[0]; o.paid_at = 'now';}
   return ok([], o ? 1 : 0);
  }
  if (sql.startsWith("UPDATE billing_checkout_orders SET status='converted'")) {
   const o = tables.billing_checkout_orders.find(x => x.id === args[1]);
   if (o) {o.status = 'converted'; o.organization_id = args[0];}
   return ok([], o ? 1 : 0);
  }
  if (sql.startsWith('INSERT INTO tenant_subscriptions')) {
   tables.tenant_subscriptions.push({organization_id: args[0], id: args[1], stripe_customer_id: args[2], stripe_subscription_id: args[3], status: args[4], monthly_fee_cents: args[5], current_period_end: args[6], past_due_since: null, created_at: 'now'});
   return ok([], 1);
  }
  if (sql.startsWith('INSERT INTO tenant_payments')) {
   tables.tenant_payments.push({organization_id: args[0], id: args[1], type: args[2], amount_cents: args[3], currency: args[4], status: args[5], stripe_invoice_id: args[6], stripe_checkout_session_id: args[7], installments_total: args[8], installment_number: args[9], due_at: args[10], paid_at: args[11]});
   return ok([], 1);
  }
  if (sql.startsWith('UPDATE tenant_subscriptions SET status=?,current_period_end=?')) {
   const s = tables.tenant_subscriptions.find(x => x.organization_id === args[3] && x.stripe_subscription_id === args[4]);
   if (s) {s.status = args[0]; s.current_period_end = args[1]; s.past_due_since = args[2];}
   return ok([], s ? 1 : 0);
  }
  if (sql.includes("SET status=?,past_due_since=COALESCE")) {
   const s = tables.tenant_subscriptions.find(x => x.organization_id === args[2]);
   if (s) {s.status = 'past_due'; s.past_due_since = s.past_due_since ?? args[1];}
   return ok([], s ? 1 : 0);
  }
  if (sql.includes("SET status='active',past_due_since=NULL")) {
   const s = tables.tenant_subscriptions.find(x => x.organization_id === args[0] && ['past_due', 'suspended'].includes(x.status));
   if (s) {s.status = 'active'; s.past_due_since = null;}
   return ok([], s ? 1 : 0);
  }
  if (sql.includes("SET status='suspended'")) {
   const s = tables.tenant_subscriptions.find(x => x.organization_id === args[0] && x.status === 'past_due');
   if (s) s.status = 'suspended';
   return ok([], s ? 1 : 0);
  }
  if (sql.startsWith('SELECT id FROM tenant_payments WHERE stripe_invoice_id=?')) {
   const p = tables.tenant_payments.find(x => x.stripe_invoice_id === args[0]);
   return ok(p ? [[p.id]] : []);
  }
  if (sql.startsWith("UPDATE tenant_payments SET status='failed'")) {
   const p = tables.tenant_payments.find(x => x.stripe_invoice_id === args[0]);
   if (p) p.status = 'failed';
   return ok([], p ? 1 : 0);
  }
  if (sql.startsWith("UPDATE tenant_payments SET status='paid',paid_at=?")) {
   const p = tables.tenant_payments.find(x => x.stripe_invoice_id === args[1]);
   if (p) {p.status = 'paid'; p.paid_at = args[0];}
   return ok([], p ? 1 : 0);
  }
  throw Error('FakeDb: sentencia no soportada: ' + sql.slice(0, 80));
 }
 async function executeBatch(statements) {
  const results = [];
  for (const s of statements) results.push(await executeSql(s.sql, s.args));
  return results;
 }
 return {executeSql, executeBatch, tables};
}
export function mockStripe() {
 const calls = [];
 return {calls, client: {
  webhooks: {constructEvent: (raw, signature) => {
   if (signature !== 'sig-ok') throw Error('bad signature');
   return JSON.parse(Buffer.isBuffer(raw) ? raw.toString('utf8') : raw);
  }},
  checkout: {sessions: {create: async params => {calls.push(['checkout.sessions.create', params]); return {id: 'cs_test_1', url: 'https://checkout.stripe.test/pay/cs_test_1'};}}},
  subscriptions: {retrieve: async id => ({id, status: 'active', current_period_end: Math.floor(Date.now() / 1000) + 2592000})},
  invoiceItems: {create: async params => {calls.push(['invoiceItems.create', params]); return {id: 'ii_test_1'};}},
  invoices: {
   create: async params => {calls.push(['invoices.create', params]); return {id: 'in_test_1'};},
   finalizeInvoice: async id => {calls.push(['invoices.finalizeInvoice', id]); return {id};}
  }
 }};
}
