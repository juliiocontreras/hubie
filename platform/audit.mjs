// Lectura de audit_events (P0, MULTITENANT-AUDIT §12.2): la tabla se escribía
// pero no había endpoint ni UI. Esta lista es EXACTA: solo acciones que hoy
// se escriben en el código (grep audit_events); no se inventa ninguna.
// Filtros: tenant, actor (correo o id), acción, desde/hasta, límite.
// El superadmin ve todo (con filtro opcional por tenant); un miembro solo ve
// los eventos de su propio tenant (el organization_id se fija desde su
// membresía verificada, nunca desde un parámetro del cliente).
import {executeSql} from '../database.mjs';

// Acciones que hoy se escriben en audit_events (verificadas por grep).
export const KNOWN_AUDIT_ACTIONS = [
 'agenda.appointment_created', 'agenda.appointment_status', 'agenda.appointment_updated',
 'appearance.platform_updated', 'appearance.tenant_updated',
 'archived', 'cases.created', 'cases.document_updated', 'cases.updated',
 'catalog.archived', 'catalog.created', 'catalog.updated',
 'clients.archived', 'clients.created', 'clients.updated',
 'crm.deal_archived', 'crm.deal_created', 'crm.deal_updated',
 'entities.linked', 'entities.unlinked',
 'expenses.archived', 'expenses.created', 'expenses.updated',
 'inventory.item_created', 'inventory.item_updated', 'inventory.stock_moved',
 'invoices.archived', 'invoices.created',
 'media.attachment_removed', 'media.attachment_uploaded',
 'payments.archived', 'payments.created', 'payments.updated',
 'quotes.archived', 'quotes.created', 'quotes.updated',
 'survey.response_received',
 'tenant.created', 'tenant.invitation_accepted', 'tenant.invitation_created',
 'tenant.invitation_resent', 'tenant.invitation_revoked',
 'tenant.member_activated', 'tenant.member_added', 'tenant.member_suspended',
 'tenant.record_archived', 'tenant.record_created', 'tenant.record_updated',
 'tenant.tool_disabled', 'tenant.tool_enabled', 'tenant.updated'
];
export const AUDIT_DEFAULT_LIMIT = 50;
export const AUDIT_MAX_LIMIT = 200;
// Normaliza y valida filtros; lanza 'Invalid audit filters' ante valores malos.
export function normalizeAuditFilters(input = {}) {
 const limitRaw = input.limit === undefined || input.limit === '' ? AUDIT_DEFAULT_LIMIT : Number(input.limit);
 if (!Number.isFinite(limitRaw) || limitRaw < 1) throw Error('Invalid audit filters');
 const limit = Math.min(AUDIT_MAX_LIMIT, Math.floor(limitRaw));
 const parseDate = value => {
  if (value === undefined || value === '' || value === null) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw Error('Invalid audit filters');
  return date.toISOString();
 };
 const from = parseDate(input.from);
 const to = parseDate(input.to);
 if (from && to && from > to) throw Error('Invalid audit filters');
 const action = typeof input.action === 'string' && input.action.trim() ? input.action.trim() : null;
 const actor = typeof input.actor === 'string' && input.actor.trim() ? input.actor.trim() : null;
 const organizationId = typeof input.organizationId === 'string' && input.organizationId.trim() ? input.organizationId.trim() : null;
 return {limit, from, to, action, actor, organizationId};
}
export function buildAuditQuery(filters) {
 const where = [];
 const args = [];
 if (filters.organizationId) { where.push('a.organization_id=?'); args.push(filters.organizationId); }
 if (filters.action) { where.push('a.action=?'); args.push(filters.action); }
 if (filters.actor) { where.push('(a.actor_user_id=? OR u.email=?)'); args.push(filters.actor, filters.actor); }
 if (filters.from) { where.push('a.occurred_at>=?'); args.push(filters.from); }
 if (filters.to) { where.push('a.occurred_at<=?'); args.push(filters.to); }
 const sql = 'SELECT a.id,a.organization_id,a.actor_user_id,u.email,a.action,a.target_type,a.target_id,a.occurred_at'
  + ' FROM audit_events a LEFT JOIN users u ON u.id=a.actor_user_id'
  + (where.length ? ' WHERE ' + where.join(' AND ') : '')
  + ' ORDER BY a.occurred_at DESC,a.id DESC LIMIT ?';
 args.push(filters.limit);
 return {sql, args};
}
const rowsOf = r => r?.rows?.map(row => row.map(c => c?.value ?? null)) ?? [];
// Lee eventos con filtros ya normalizados. organizationId=null => todos los
// tenants (solo superadmin); con organizationId => solo ese tenant.
export async function listAuditEvents(filters, deps) {
 const normalized = normalizeAuditFilters(filters);
 const {sql, args} = buildAuditQuery(normalized);
 const sqlFn = deps?.executeSql ?? executeSql;
 const r = await sqlFn(sql, args);
 return rowsOf(r).map(x => ({
  id: x[0], organizationId: x[1], actorUserId: x[2], actorEmail: x[3],
  action: x[4], targetType: x[5], targetId: x[6], occurredAt: x[7]
 }));
}
