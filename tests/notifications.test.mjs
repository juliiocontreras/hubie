import test from 'node:test';
import assert from 'node:assert/strict';
import {
 createNotification, listNotifications, unreadCount, markNotificationRead,
 markAllNotificationsRead, listAdminNotifications, generateNotificationsForTenant,
 generateNotificationsForAllTenants, sendNotificationEmail, emailNotificationStatus
} from '../platform/notifications.mjs';

// Fake mínimo para platform/notifications.mjs: implementa solo las
// sentencias que usa, con la misma forma de resultado que database.mjs.
const cells = values => values.map(value => ({value: value ?? null}));
const ok = (rows = [], affected = 0) => ({rows: rows.map(cells), affected_row_count: affected, rowsAffected: affected});
const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const USER_1 = '11111111-1111-4111-8111-111111111111';
const USER_2 = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-11-13T19:00:00.000Z');
function createFakeDb(seed = {}) {
 let seq = 0;
 const notifications = [...(seed.notifications ?? [])];
 const quotes = [...(seed.quotes ?? [])];
 const events = [...(seed.events ?? [])];
 const payments = [...(seed.payments ?? [])];
 const subs = [...(seed.subscriptions ?? [])];
 const orgs = seed.organizations ?? [{id: ORG_A, slug: 'empresa-a'}, {id: ORG_B, slug: 'empresa-b'}];
 const visible = (n, userId) => n.user_id === null || n.user_id === userId;
 const sorted = list => [...list].sort((a, b) => b.created_at.localeCompare(a.created_at) || b.seq - a.seq);
 const toRow = n => [n.id, n.user_id, n.type, n.title, n.body, n.link, n.read_at, n.created_at];
 async function executeSql(sql, args = []) {
  if (sql.includes('INSERT INTO tenant_notifications')) {
   const [org, id, userId, type, title, body, link] = args;
   const dup = notifications.some(n => n.organization_id === org && n.type === type && n.link === link && !n.read_at &&
    ((userId === null && n.user_id === null) || n.user_id === userId));
   if (dup) return ok([], 0);
   notifications.push({organization_id: org, id, user_id: userId, type, title, body, link, read_at: null, created_at: new Date().toISOString(), seq: ++seq});
   return ok([], 1);
  }
  if (sql.startsWith('SELECT id,user_id,type,title,body,link,read_at,created_at FROM tenant_notifications')) {
   const [org, userId, limit] = args;
   return ok(sorted(notifications.filter(n => n.organization_id === org && visible(n, userId))).slice(0, limit).map(toRow));
  }
  if (sql.startsWith('SELECT COUNT(*) FROM tenant_notifications WHERE organization_id=?')) {
   const [org, userId] = args;
   return ok([[notifications.filter(n => n.organization_id === org && visible(n, userId) && !n.read_at).length]]);
  }
  if (sql.startsWith('SELECT COUNT(*) FROM tenant_notifications WHERE read_at IS NULL')) {
   return ok([[notifications.filter(n => !n.read_at).length]]);
  }
  if (sql.includes('FROM tenant_notifications n JOIN organizations o')) {
   const [limit] = args;
   return ok(sorted(notifications).slice(0, limit).map(n => {
    const o = orgs.find(x => x.id === n.organization_id) || {};
    return [n.id, n.organization_id, o.name || n.organization_id, o.slug || '', n.user_id, n.type, n.title, n.body, n.link, n.read_at, n.created_at];
   }));
  }
  if (sql.startsWith('UPDATE tenant_notifications SET read_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=?')) {
   const [org, id, userId] = args;
   const n = notifications.find(x => x.organization_id === org && x.id === id && !x.read_at && visible(x, userId));
   if (n) { n.read_at = new Date().toISOString(); return ok([], 1); }
   return ok([], 0);
  }
  if (sql.startsWith('UPDATE tenant_notifications SET read_at=CURRENT_TIMESTAMP WHERE organization_id=? AND read_at IS NULL')) {
   const [org, userId] = args;
   let changedCount = 0;
   for (const n of notifications.filter(x => x.organization_id === org && !x.read_at && visible(x, userId))) { n.read_at = new Date().toISOString(); changedCount++; }
   return ok([], changedCount);
  }
  if (sql.includes('FROM tenant_quotes WHERE organization_id=?')) {
   const [org, in3] = args;
   return ok(quotes.filter(q => q.organization_id === org && q.status === 'sent' && q.valid_until && q.valid_until <= in3 && !q.archived_at)
    .map(q => [q.id, q.title, q.client_name, q.valid_until]));
  }
  if (sql.includes('FROM tenant_schedule_events WHERE organization_id=?')) {
   const [org, from, to] = args;
   return ok(events.filter(e => e.organization_id === org && e.status === 'scheduled' && e.starts_at >= from && e.starts_at <= to)
    .map(e => [e.id, e.title, e.customer, e.starts_at]));
  }
  if (sql.includes('FROM tenant_payments WHERE organization_id=?')) {
   const [org, nowIso] = args;
   return ok(payments.filter(p => p.organization_id === org && p.status === 'pending' && p.due_at && p.due_at < nowIso)
    .map(p => [p.id, p.type, p.amount_cents, p.due_at, p.installment_number]));
  }
  if (sql.includes('FROM tenant_subscriptions WHERE organization_id=?')) {
   const [org] = args;
   return ok(subs.filter(s => s.organization_id === org && s.status === 'past_due').map(s => [s.status, s.past_due_since]));
  }
  if (sql.startsWith('SELECT id,slug FROM organizations')) {
   return ok(orgs.map(o => [o.id, o.slug]));
  }
  throw Error('FakeDb: sentencia no soportada: ' + sql.slice(0, 80));
 }
 return {executeSql, tables: {notifications, quotes, events, payments, subscriptions: subs, organizations: orgs}};
}
const depsOf = fake => ({executeSql: fake.executeSql});

test('crear + dedupe: mismo tipo+enlace no leído no se duplica; tras leer sí se crea', async () => {
 const fake = createFakeDb();
 const deps = depsOf(fake);
 const input = {type: 'info', title: 'Aviso', body: 'Hola', link: '/app/?tenant=x&tool=C001&record=1'};
 const first = await createNotification(ORG_A, input, deps);
 assert.equal(first.created, true);
 assert.equal((await createNotification(ORG_A, input, deps)).created, false);
 assert.equal(fake.tables.notifications.length, 1);
 await markNotificationRead(ORG_A, USER_1, first.id, deps);
 assert.equal((await createNotification(ORG_A, input, deps)).created, true);
 assert.equal(fake.tables.notifications.length, 2);
});

test('validación: tipo desconocido, título vacío o cuerpo largo se rechazan', async () => {
 const fake = createFakeDb();
 await assert.rejects(() => createNotification(ORG_A, {type: 'sms', title: 'x'}, depsOf(fake)), /Invalid notification/);
 await assert.rejects(() => createNotification(ORG_A, {type: 'info', title: ''}, depsOf(fake)), /Invalid notification/);
 await assert.rejects(() => createNotification(ORG_A, {type: 'info', title: 'x', body: 'y'.repeat(1001)}, depsOf(fake)), /Invalid notification/);
});

test('listado y contador: aislamiento por tenant y por usuario', async () => {
 const fake = createFakeDb({notifications: [
  {organization_id: ORG_A, id: 'n1', user_id: null, type: 'info', title: 'Para todos', body: '', link: null, read_at: null, created_at: '2026-11-13T10:00:00.000Z', seq: 1},
  {organization_id: ORG_A, id: 'n2', user_id: USER_1, type: 'info', title: 'Solo user1', body: '', link: null, read_at: null, created_at: '2026-11-13T11:00:00.000Z', seq: 2},
  {organization_id: ORG_A, id: 'n3', user_id: USER_2, type: 'info', title: 'Solo user2', body: '', link: null, read_at: null, created_at: '2026-11-13T12:00:00.000Z', seq: 3},
  {organization_id: ORG_B, id: 'n4', user_id: null, type: 'info', title: 'Otra empresa', body: '', link: null, read_at: null, created_at: '2026-11-13T13:00:00.000Z', seq: 4}
 ]});
 const list = await listNotifications(ORG_A, USER_1, depsOf(fake));
 assert.deepEqual(list.notifications.map(n => n.id), ['n2', 'n1']);
 assert.equal(list.unread, 2);
 assert.equal(await unreadCount(ORG_B, USER_1, depsOf(fake)), 1);
});

test('marcar leída: solo la propia del tenant; todas leídas no toca las de otro usuario', async () => {
 const fake = createFakeDb({notifications: [
  {organization_id: ORG_A, id: 'n1', user_id: null, type: 'info', title: 'Para todos', body: '', link: null, read_at: null, created_at: '2026-11-13T10:00:00.000Z', seq: 1},
  {organization_id: ORG_A, id: 'n2', user_id: USER_2, type: 'info', title: 'Solo user2', body: '', link: null, read_at: null, created_at: '2026-11-13T11:00:00.000Z', seq: 2}
 ]});
 const deps = depsOf(fake);
 assert.equal((await markNotificationRead(ORG_A, USER_1, 'n2', deps)).read, false);
 assert.equal((await markNotificationRead(ORG_A, USER_1, 'n1', deps)).read, true);
 assert.equal((await markNotificationRead(ORG_A, USER_1, 'n1', deps)).read, false);
 const all = await markAllNotificationsRead(ORG_A, USER_1, deps);
 assert.equal(all.read, 0);
 assert.equal(await unreadCount(ORG_A, USER_2, depsOf(fake)), 1);
});

test('bandeja de Madre: ve todas las empresas con nombre y contador global', async () => {
 const fake = createFakeDb({notifications: [
  {organization_id: ORG_A, id: 'n1', user_id: null, type: 'info', title: 'A', body: '', link: null, read_at: null, created_at: '2026-11-13T10:00:00.000Z', seq: 1},
  {organization_id: ORG_B, id: 'n2', user_id: null, type: 'info', title: 'B', body: '', link: null, read_at: '2026-11-13T11:00:00.000Z', created_at: '2026-11-13T11:00:00.000Z', seq: 2}
 ]});
 const admin = await listAdminNotifications(depsOf(fake));
 assert.equal(admin.notifications.length, 2);
 assert.equal(admin.notifications[0].tenantSlug, 'empresa-b');
 assert.equal(admin.unread, 1);
});

test('generador cotizaciones: sent a ≤3 días sí; a 30 días o en borrador no; idempotente', async () => {
 const fake = createFakeDb({quotes: [
  {organization_id: ORG_A, id: 'q1', title: 'Cocina', client_name: 'Ana', status: 'sent', valid_until: '2026-11-15'},
  {organization_id: ORG_A, id: 'q2', title: 'Baño', client_name: 'Luis', status: 'sent', valid_until: '2026-12-13'},
  {organization_id: ORG_A, id: 'q3', title: 'Sala', client_name: 'Marta', status: 'draft', valid_until: '2026-11-14'},
  {organization_id: ORG_A, id: 'q4', title: 'Vencida', client_name: 'Pedro', status: 'sent', valid_until: '2026-11-12'}
 ]});
 const deps = depsOf(fake);
 const first = await generateNotificationsForTenant(ORG_A, deps, NOW, 'empresa-a');
 assert.equal(first.created, 2);
 assert.deepEqual(first.byType, {quote_expiring: 2, appointment_soon: 0, payment_overdue: 0, subscription_past_due: 0});
 assert.ok(fake.tables.notifications.some(n => n.title.startsWith('Cotización vencida: Vencida')));
 const second = await generateNotificationsForTenant(ORG_A, deps, NOW, 'empresa-a');
 assert.equal(second.created, 0);
});

test('generador agenda: solo citas scheduled en las próximas 24 h', async () => {
 const fake = createFakeDb({events: [
  {organization_id: ORG_A, id: 'e1', title: 'Hoy', customer: 'Ana', status: 'scheduled', starts_at: '2026-11-14T07:00:00.000Z'},
  {organization_id: ORG_A, id: 'e2', title: 'Pasado mañana', customer: 'Luis', status: 'scheduled', starts_at: '2026-11-15T19:00:00.000Z'},
  {organization_id: ORG_A, id: 'e3', title: 'Ayer', customer: 'Marta', status: 'scheduled', starts_at: '2026-11-12T19:00:00.000Z'},
  {organization_id: ORG_A, id: 'e4', title: 'Cancelada', customer: 'Pedro', status: 'cancelled', starts_at: '2026-11-14T07:00:00.000Z'}
 ]});
 const result = await generateNotificationsForTenant(ORG_A, depsOf(fake), NOW, 'empresa-a');
 assert.equal(result.byType.appointment_soon, 1);
 assert.equal(result.created, 1);
});

test('generador cobros y suscripción: vencido pendiente sí; al corriente no', async () => {
 const fake = createFakeDb({
  payments: [
   {organization_id: ORG_A, id: 'p1', type: 'balance', amount_cents: 500000, status: 'pending', due_at: '2026-11-12T00:00:00.000Z', installment_number: 2},
   {organization_id: ORG_A, id: 'p2', type: 'balance', amount_cents: 500000, status: 'pending', due_at: '2026-11-20T00:00:00.000Z', installment_number: 3},
   {organization_id: ORG_A, id: 'p3', type: 'monthly', amount_cents: 94900, status: 'paid', due_at: '2026-11-01T00:00:00.000Z', installment_number: 1}
  ],
  subscriptions: [{organization_id: ORG_A, status: 'past_due', past_due_since: '2026-11-11T00:00:00.000Z'}]
 });
 const result = await generateNotificationsForTenant(ORG_A, depsOf(fake), NOW, 'empresa-a');
 assert.equal(result.byType.payment_overdue, 1);
 assert.equal(result.byType.subscription_past_due, 1);
 const active = createFakeDb({subscriptions: [{organization_id: ORG_A, status: 'active', past_due_since: null}]});
 assert.equal((await generateNotificationsForTenant(ORG_A, depsOf(active), NOW, 'empresa-a')).created, 0);
});

test('generar para todas las empresas: recorre tenants y no aborta', async () => {
 const fake = createFakeDb({quotes: [
  {organization_id: ORG_A, id: 'q1', title: 'Cocina', client_name: 'Ana', status: 'sent', valid_until: '2026-11-14'},
  {organization_id: ORG_B, id: 'q2', title: 'Baño', client_name: 'Luis', status: 'sent', valid_until: '2026-11-14'}
 ]});
 const result = await generateNotificationsForAllTenants(depsOf(fake), NOW);
 assert.equal(result.tenants, 2);
 assert.equal(result.created, 2);
});

test('gancho de correo: sin Resend no finge envío', async () => {
 if (process.env.RESEND_API_KEY && process.env.RESEND_FROM) return;
 assert.equal(emailNotificationStatus().configured, false);
 const result = await sendNotificationEmail({to: 'a@ejemplo.mx', subject: 'Aviso', text: 'Hola'});
 assert.deepEqual(result, {sent: false, reason: 'resend-not-configured'});
});
