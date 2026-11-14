import {randomUUID} from 'node:crypto';
import {executeSql} from '../database.mjs';
// Motor de notificaciones y recordatorios (P0) + C010 real.
// Tabla tenant_notifications (migración 020): organization_id, user_id
// (NULL = todo el tenant), type, title, body, link, read_at, created_at.
// Sin push PWA (no hay VAPID): en-app + gancho de correo opcional abajo.
// El dedupe (no repetir una no leída del mismo tipo+enlace) se hace en
// código con WHERE NOT EXISTS, porque Turso rechaza el índice único parcial.
const db = deps => ({sql: deps?.executeSql ?? executeSql});
const rows = r => r?.rows?.map(row => row.map(x => x?.value ?? null)) ?? [];
const changed = r => Number(r?.rowsAffected ?? r?.affected_row_count ?? 0) > 0;
export const NOTIFICATION_TYPES = ['quote_expiring', 'appointment_soon', 'payment_overdue', 'subscription_past_due', 'info'];
export const NOTIFICATION_TYPE_LABELS = {
 quote_expiring: 'Cotización por vencer', appointment_soon: 'Cita próxima',
 payment_overdue: 'Cobro vencido', subscription_past_due: 'Suscripción en mora', info: 'Aviso'
};
const QUOTE_WINDOW_DAYS = 3;
const APPOINTMENT_WINDOW_HOURS = 24;

function validateNotification(input) {
 if (!input || typeof input !== 'object') throw Error('Invalid notification');
 if (!NOTIFICATION_TYPES.includes(input.type)) throw Error('Invalid notification');
 const title = String(input.title ?? '').trim();
 const body = String(input.body ?? '').trim();
 if (title.length < 1 || title.length > 180 || body.length > 1000) throw Error('Invalid notification');
 const link = input.link == null ? null : String(input.link);
 if (link !== null && (link.length < 1 || link.length > 500)) throw Error('Invalid notification');
 return {userId: input.userId ?? null, type: input.type, title, body, link};
}

// Crea una notificación salvo que ya exista una no leída del mismo tipo y
// enlace para el mismo destinatario (tenant o usuario). Otros frentes
// (T004, T011) crean las suyas con esta misma función: NO crear la tabla
// en otro módulo, la tabla y las columnas son estas.
export async function createNotification(organizationId, input, deps = {}) {
 const data = validateNotification(input);
 const id = randomUUID();
 const result = await db(deps).sql(
  `INSERT INTO tenant_notifications(organization_id,id,user_id,type,title,body,link)
   SELECT ?,?,?,?,?,?,? WHERE NOT EXISTS (
    SELECT 1 FROM tenant_notifications n WHERE n.organization_id=? AND n.type=? AND n.link=? AND n.read_at IS NULL
    AND ((? IS NULL AND n.user_id IS NULL) OR n.user_id=?))`,
  [organizationId, id, data.userId, data.type, data.title, data.body, data.link,
   organizationId, data.type, data.link, data.userId, data.userId]);
 return {created: changed(result), id: changed(result) ? id : null};
}
const toNotification = r => ({id: r[0], userId: r[1], type: r[2], typeLabel: NOTIFICATION_TYPE_LABELS[r[2]] || r[2], title: r[3], body: r[4], link: r[5], readAt: r[6] || null, createdAt: r[7]});
const SCOPE = `(user_id IS NULL OR user_id=?)`;

export async function listNotifications(organizationId, userId, deps = {}, {limit = 50} = {}) {
 const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
 const found = await db(deps).sql(
  `SELECT id,user_id,type,title,body,link,read_at,created_at FROM tenant_notifications WHERE organization_id=? AND ${SCOPE} ORDER BY created_at DESC,id DESC LIMIT ?`,
  [organizationId, userId, safeLimit]);
 const unread = await db(deps).sql(
  `SELECT COUNT(*) FROM tenant_notifications WHERE organization_id=? AND ${SCOPE} AND read_at IS NULL`,
  [organizationId, userId]);
 return {notifications: rows(found).map(toNotification), unread: Number(rows(unread)[0]?.[0] ?? 0)};
}
export async function unreadCount(organizationId, userId, deps = {}) {
 return (await listNotifications(organizationId, userId, deps, {limit: 1})).unread;
}
export async function markNotificationRead(organizationId, userId, notificationId, deps = {}) {
 const result = await db(deps).sql(
  `UPDATE tenant_notifications SET read_at=CURRENT_TIMESTAMP WHERE organization_id=? AND id=? AND read_at IS NULL AND ${SCOPE}`,
  [organizationId, notificationId, userId]);
 return {read: changed(result)};
}
export async function markAllNotificationsRead(organizationId, userId, deps = {}) {
 const result = await db(deps).sql(
  `UPDATE tenant_notifications SET read_at=CURRENT_TIMESTAMP WHERE organization_id=? AND read_at IS NULL AND ${SCOPE}`,
  [organizationId, userId]);
 return {read: Number(result?.rowsAffected ?? result?.affected_row_count ?? 0)};
}
// Bandeja de Madre: todas las no leídas de todos los tenants, con empresa.
export async function listAdminNotifications(deps = {}, {limit = 100} = {}) {
 const safeLimit = Math.max(1, Math.min(200, Number(limit) || 100));
 const found = await db(deps).sql(
  `SELECT n.id,n.organization_id,o.name,o.slug,n.user_id,n.type,n.title,n.body,n.link,n.read_at,n.created_at
   FROM tenant_notifications n JOIN organizations o ON o.id=n.organization_id
   ORDER BY n.created_at DESC,n.id DESC LIMIT ?`, [safeLimit]);
 const unread = await db(deps).sql(`SELECT COUNT(*) FROM tenant_notifications WHERE read_at IS NULL`);
 return {
  notifications: rows(found).map(r => ({...toNotification([r[0], r[4], r[5], r[6], r[7], r[8], r[9], r[10]]), organizationId: r[1], tenantName: r[2], tenantSlug: r[3]})),
  unread: Number(rows(unread)[0]?.[0] ?? 0)
 };
}

function isoDate(d) { return new Date(d).toISOString().slice(0, 10); }
function toDate(value) { return value instanceof Date ? value : new Date(value ?? Date.now()); }
function appLink(slug, tool, recordId) { return '/app/?tenant=' + slug + '&tool=' + tool + '&record=' + recordId; }

// Generadores: cotizaciones sent por vencer, citas en 24 h, cobros vencidos
// y suscripción past_due. Idempotentes por el dedupe de createNotification:
// llamarlos al cargar el panel y desde Madre/cron no duplica avisos.
export async function generateNotificationsForTenant(organizationId, deps = {}, now = new Date(), slug = null) {
 const at = toDate(now);
 const today = isoDate(at);
 const in3Days = isoDate(new Date(at.getTime() + QUOTE_WINDOW_DAYS * 86400000));
 const in24h = new Date(at.getTime() + APPOINTMENT_WINDOW_HOURS * 3600000).toISOString();
 const created = {quote_expiring: 0, appointment_soon: 0, payment_overdue: 0, subscription_past_due: 0};
 const billingLink = slug ? '/app/?tenant=' + slug + '&view=billing' : null;
 const quotes = rows(await db(deps).sql(
  `SELECT id,title,client_name,valid_until FROM tenant_quotes WHERE organization_id=? AND status='sent' AND valid_until IS NOT NULL AND valid_until<=? AND archived_at IS NULL`,
  [organizationId, in3Days]));
 for (const q of quotes) {
  const expired = q[3] < today;
  const made = await createNotification(organizationId, {
   type: 'quote_expiring',
   title: (expired ? 'Cotización vencida: ' : 'Cotización por vencer: ') + q[1],
   body: (q[2] ? 'Cliente: ' + q[2] + '. ' : '') + 'Vigencia: ' + q[3] + '.',
   link: slug ? appLink(slug, 'T013', q[0]) : null
  }, deps);
  if (made.created) created.quote_expiring++;
 }
 const events = rows(await db(deps).sql(
  `SELECT id,title,customer,starts_at FROM tenant_schedule_events WHERE organization_id=? AND status='scheduled' AND starts_at>=? AND starts_at<=?`,
  [organizationId, at.toISOString(), in24h]));
 for (const e of events) {
  const made = await createNotification(organizationId, {
   type: 'appointment_soon',
   title: 'Cita en las próximas 24 h: ' + e[1],
   body: (e[2] ? 'Cliente: ' + e[2] + '. ' : '') + 'Inicia: ' + new Date(e[3]).toLocaleString('es-MX', {dateStyle: 'medium', timeStyle: 'short'}) + '.',
   link: slug ? appLink(slug, 'C004', e[0]) : null
  }, deps);
  if (made.created) created.appointment_soon++;
 }
 // tenant_payments con due_at pasado y status pending (balance y mensualidad).
 // tenant_collections no tiene due_at: sus cobros manuales ya están pagados.
 const payments = rows(await db(deps).sql(
  `SELECT id,type,amount_cents,due_at,installment_number FROM tenant_payments WHERE organization_id=? AND status='pending' AND due_at IS NOT NULL AND due_at<?`,
  [organizationId, at.toISOString()]));
 for (const p of payments) {
  const made = await createNotification(organizationId, {
   type: 'payment_overdue',
   title: 'Cobro vencido: $' + (Number(p[2]) / 100).toLocaleString('es-MX') + ' MXN',
   body: 'Tipo: ' + p[1] + (p[4] ? ', parcialidad ' + p[4] : '') + '. Vencimiento: ' + p[3] + '.',
   link: billingLink
  }, deps);
  if (made.created) created.payment_overdue++;
 }
 const subs = rows(await db(deps).sql(
  `SELECT status,past_due_since FROM tenant_subscriptions WHERE organization_id=? AND status='past_due'`,
  [organizationId]));
 for (const s of subs) {
  const made = await createNotification(organizationId, {
   type: 'subscription_past_due',
   title: 'Suscripción con pago vencido',
   body: 'La mensualidad de la plataforma está vencida' + (s[1] ? ' desde ' + isoDate(s[1]) : '') + '. Tienes 3 días de gracia antes de la suspensión.',
   link: billingLink
  }, deps);
  if (made.created) created.subscription_past_due++;
 }
 const total = Object.values(created).reduce((a, b) => a + b, 0);
 return {organizationId, created: total, byType: created};
}
export async function generateNotificationsForAllTenants(deps = {}, now = new Date()) {
 const tenants = rows(await db(deps).sql(`SELECT id,slug FROM organizations WHERE status='active' ORDER BY name`));
 const results = [];
 let created = 0;
 for (const t of tenants) {
  try {
   const r = await generateNotificationsForTenant(t[0], deps, now, t[1]);
   created += r.created;
   results.push(r);
  } catch (error) {
   results.push({organizationId: t[0], created: 0, error: error?.message || 'Error'});
  }
 }
 return {tenants: tenants.length, created, results};
}

// Gancho de correo: solo en-app si Resend no está configurado. NUNCA finge
// un envío: sin RESEND_API_KEY y RESEND_FROM devuelve sent:false con el
// motivo. Cuando ambas existen, envía por la API de Resend; el remitente
// debe ser un dominio verificado en Resend.
export function emailNotificationStatus() {
 return {configured: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM)};
}
export async function sendNotificationEmail({to, subject, text}, fetchImpl = fetch) {
 if (!emailNotificationStatus().configured) return {sent: false, reason: 'resend-not-configured'};
 if (typeof to !== 'string' || !/^\S+@\S+\.\S+$/.test(to) || !subject || !text) throw Error('Invalid notification email');
 const response = await fetchImpl('https://api.resend.com/emails', {
  method: 'POST',
  headers: {'authorization': 'Bearer ' + process.env.RESEND_API_KEY, 'content-type': 'application/json'},
  body: JSON.stringify({from: process.env.RESEND_FROM, to: [to], subject, text})
 });
 if (!response.ok) return {sent: false, reason: 'resend-error', status: response.status};
 return {sent: true};
}
