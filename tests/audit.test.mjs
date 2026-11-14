import test from 'node:test';
import assert from 'node:assert/strict';
import {createInvitationsFakeDb} from './invitations-fake-db.mjs';
import {listAuditEvents, normalizeAuditFilters, buildAuditQuery, KNOWN_AUDIT_ACTIONS, AUDIT_DEFAULT_LIMIT, AUDIT_MAX_LIMIT} from '../platform/audit.mjs';

const ORG_A = '11111111-1111-4111-8111-111111111111';
const ORG_B = '22222222-2222-4222-8222-222222222222';
const ACTOR = '33333333-3333-4333-8333-333333333333';
const OTHER = '44444444-4444-4444-8444-444444444444';
const seed = () => createInvitationsFakeDb({
 organizations: [{id: ORG_A, slug: 'empresa-a', name: 'Empresa A'}, {id: ORG_B, slug: 'empresa-b', name: 'Empresa B'}],
 users: [
  {id: ACTOR, email: 'admin@empresa-a.mx'},
  {id: OTHER, email: 'otro@empresa-b.mx'}
 ],
 audit: [
  {id: 'e1', organization_id: ORG_A, actor_user_id: ACTOR, action: 'tenant.created', target_type: 'organization', target_id: ORG_A, occurred_at: '2026-11-10T10:00:00.000Z'},
  {id: 'e2', organization_id: ORG_A, actor_user_id: ACTOR, action: 'tenant.member_added', target_type: 'membership', target_id: 'nueva@empresa-a.mx', occurred_at: '2026-11-11T10:00:00.000Z'},
  {id: 'e3', organization_id: ORG_A, actor_user_id: ACTOR, action: 'tenant.invitation_created', target_type: 'organization_invitation', target_id: 'inv-1', occurred_at: '2026-11-12T10:00:00.000Z'},
  {id: 'e4', organization_id: ORG_B, actor_user_id: OTHER, action: 'tenant.created', target_type: 'organization', target_id: ORG_B, occurred_at: '2026-11-11T12:00:00.000Z'},
  {id: 'e5', organization_id: null, actor_user_id: ACTOR, action: 'appearance.platform_updated', target_type: 'platform', target_id: 'madre', occurred_at: '2026-11-12T12:00:00.000Z'},
  {id: 'e6', organization_id: ORG_B, actor_user_id: null, action: 'survey.response_received', target_type: 'survey', target_id: 's1', occurred_at: '2026-11-12T13:00:00.000Z'}
 ]
});
const depsOf = fake => ({executeSql: fake.executeSql});

test('aislamiento por tenant: un tenant no ve eventos de otro', async () => {
 const fake = seed();
 const eventsA = await listAuditEvents({organizationId: ORG_A}, depsOf(fake));
 assert.deepEqual(eventsA.map(e => e.id), ['e3', 'e2', 'e1']);
 assert.ok(eventsA.every(e => e.organizationId === ORG_A));
 const eventsB = await listAuditEvents({organizationId: ORG_B}, depsOf(fake));
 assert.deepEqual(eventsB.map(e => e.id), ['e6', 'e4']);
 // Sin filtro de tenant (superadmin) se ven todos, incluidos los de plataforma sin tenant.
 const all = await listAuditEvents({}, depsOf(fake));
 assert.equal(all.length, 6);
 assert.equal(all[0].id, 'e6');
});

test('filtros: acción, actor por correo o id, y rango de fechas', async () => {
 const fake = seed();
 const byAction = await listAuditEvents({action: 'tenant.created'}, depsOf(fake));
 assert.deepEqual(byAction.map(e => e.id), ['e4', 'e1']);
 const byEmail = await listAuditEvents({actor: 'admin@empresa-a.mx'}, depsOf(fake));
 assert.deepEqual(byEmail.map(e => e.id), ['e5', 'e3', 'e2', 'e1']);
 const byId = await listAuditEvents({actor: OTHER}, depsOf(fake));
 assert.deepEqual(byId.map(e => e.id), ['e4']);
 const byRange = await listAuditEvents({from: '2026-11-11T00:00:00.000Z', to: '2026-11-11T23:59:59.999Z'}, depsOf(fake));
 assert.deepEqual(byRange.map(e => e.id), ['e4', 'e2']);
 const combined = await listAuditEvents({organizationId: ORG_A, action: 'tenant.invitation_created'}, depsOf(fake));
 assert.deepEqual(combined.map(e => e.id), ['e3']);
 // El correo del actor se resuelve por join; un evento sin actor no tiene correo.
 const anonymous = (await listAuditEvents({organizationId: ORG_B}, depsOf(fake))).find(e => e.id === 'e6');
 assert.equal(anonymous.actorUserId, null);
 assert.equal(anonymous.actorEmail, null);
 const named = (await listAuditEvents({organizationId: ORG_A}, depsOf(fake))).find(e => e.id === 'e1');
 assert.equal(named.actorEmail, 'admin@empresa-a.mx');
});

test('límite: por defecto 50, se recorta a 200 y los filtros inválidos se rechazan', async () => {
 const fake = seed();
 assert.equal(normalizeAuditFilters({}).limit, AUDIT_DEFAULT_LIMIT);
 assert.equal(normalizeAuditFilters({limit: '500'}).limit, AUDIT_MAX_LIMIT);
 assert.equal(normalizeAuditFilters({limit: 3}).limit, 3);
 assert.throws(() => normalizeAuditFilters({limit: 0}), /Invalid audit filters/);
 assert.throws(() => normalizeAuditFilters({limit: 'no-numérico'}), /Invalid audit filters/);
 assert.throws(() => normalizeAuditFilters({from: 'no-es-fecha'}), /Invalid audit filters/);
 assert.throws(() => normalizeAuditFilters({from: '2026-11-12', to: '2026-11-11'}), /Invalid audit filters/);
 const limited = await listAuditEvents({limit: 2}, depsOf(fake));
 assert.equal(limited.length, 2);
 assert.deepEqual(limited.map(e => e.id), ['e6', 'e5']);
});

test('la consulta ordena por fecha descendente y no filtra por tenant cuando es global', () => {
 const {sql, args} = buildAuditQuery(normalizeAuditFilters({}));
 assert.match(sql, /ORDER BY a\.occurred_at DESC/);
 assert.ok(!sql.includes('a.organization_id=?'));
 assert.deepEqual(args, [AUDIT_DEFAULT_LIMIT]);
 const scoped = buildAuditQuery(normalizeAuditFilters({organizationId: ORG_A, action: 'tenant.created', from: '2026-11-01', to: '2026-11-30', limit: 10}));
 assert.ok(scoped.sql.includes('a.organization_id=?'));
 assert.ok(scoped.sql.includes('a.action=?'));
 assert.ok(scoped.sql.includes('a.occurred_at>=?'));
 assert.ok(scoped.sql.includes('a.occurred_at<=?'));
 assert.equal(scoped.args[scoped.args.length - 1], 10);
});

test('la lista de acciones solo incluye acciones que hoy se escriben', () => {
 for (const action of [
  'tenant.created', 'tenant.tool_enabled', 'tenant.tool_disabled', 'tenant.updated',
  'tenant.member_added', 'tenant.member_activated', 'tenant.member_suspended',
  'tenant.invitation_created', 'tenant.invitation_accepted', 'tenant.invitation_revoked', 'tenant.invitation_resent',
  'appearance.platform_updated', 'appearance.tenant_updated',
  'tenant.record_created', 'tenant.record_updated', 'tenant.record_archived',
  'clients.created', 'clients.updated', 'clients.archived',
  'crm.deal_created', 'crm.deal_updated', 'crm.deal_archived',
  'agenda.appointment_created', 'agenda.appointment_updated', 'agenda.appointment_status',
  'inventory.item_created', 'inventory.item_updated', 'inventory.stock_moved',
  'cases.created', 'cases.updated', 'archived',
  'entities.linked', 'entities.unlinked',
  'media.attachment_uploaded', 'media.attachment_removed', 'cases.document_updated',
  'survey.response_received',
  'catalog.created', 'catalog.updated', 'catalog.archived',
  'quotes.created', 'quotes.updated', 'quotes.archived',
  'expenses.created', 'expenses.updated', 'expenses.archived',
  'payments.created', 'payments.updated', 'payments.archived',
  'invoices.created', 'invoices.archived'
 ]) assert.ok(KNOWN_AUDIT_ACTIONS.includes(action), 'falta acción real: ' + action);
 // invoice.payment_* son eventos de Stripe, no escrituras en audit_events.
 assert.ok(!KNOWN_AUDIT_ACTIONS.includes('invoice.payment_succeeded'));
 assert.ok(!KNOWN_AUDIT_ACTIONS.includes('invoice.payment_failed'));
 assert.equal(new Set(KNOWN_AUDIT_ACTIONS).size, KNOWN_AUDIT_ACTIONS.length);
});
