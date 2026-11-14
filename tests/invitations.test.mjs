import test from 'node:test';
import assert from 'node:assert/strict';
import {createInvitationsFakeDb} from './invitations-fake-db.mjs';
import {
 hashInvitationToken, newInvitationToken, invitationExpiry, invitationUrl,
 INVITATION_TTL_DAYS, createInvitation, listInvitations, lookupInvitation,
 acceptInvitation, revokeInvitation, resendInvitation
} from '../platform/invitations.mjs';
import {emailConfigured, sendInvitationEmail} from '../platform/email.mjs';
import {createDemoStore} from '../assets/demo-backend.js';
import {catalog} from '../platform/catalog.mjs';

const ORG = '11111111-1111-4111-8111-111111111111';
const ADMIN = '22222222-2222-4222-8222-222222222222';
const USER = '33333333-3333-4333-8333-333333333333';
const noEmail = async () => ({sent: false, reason: 'email-not-configured'});
const seed = () => createInvitationsFakeDb({
 organizations: [{id: ORG, slug: 'demo-sa', name: 'Demo SA'}],
 users: [{id: ADMIN, email: 'admin@demo.mx'}]
});
const depsOf = fake => ({executeSql: fake.executeSql, executeBatch: fake.executeBatch, sendEmail: noEmail});
const future = days => new Date(Date.now() + days * 86400000).toISOString();
const past = days => new Date(Date.now() - days * 86400000).toISOString();

test('el hash del token no es reversible y distingue tokens', () => {
 const token = newInvitationToken();
 const hash = hashInvitationToken(token);
 assert.equal(hash.length, 64);
 assert.match(hash, /^[0-9a-f]{64}$/);
 assert.equal(hashInvitationToken(token), hash);
 assert.notEqual(hashInvitationToken(newInvitationToken()), hash);
 assert.ok(!hash.includes(token));
 assert.equal(INVITATION_TTL_DAYS, 7);
});

test('crear invitación: guarda solo el hash, expira en 7 días, degrada sin Resend', async () => {
 const fake = seed();
 const before = Date.now();
 const result = await createInvitation(
  {organizationId: ORG, email: ' Nueva@Demo.mx ', role: 'member', createdBy: ADMIN, origin: 'https://hubie.test'},
  depsOf(fake));
 assert.equal(result.invitation.email, 'nueva@demo.mx');
 assert.equal(result.invitation.role, 'member');
 assert.equal(result.invitation.status, 'pending');
 assert.equal(result.emailSent, false);
 assert.equal(result.emailReason, 'email-not-configured');
 assert.ok(result.inviteUrl.startsWith('https://hubie.test/invitacion?token='));
 assert.ok(result.inviteUrl.includes(result.token));
 const stored = fake.tables.invitations[0];
 assert.equal(stored.token_hash, hashInvitationToken(result.token));
 assert.ok(!JSON.stringify(stored).includes(result.token));
 const expiresMs = Date.parse(result.invitation.expiresAt) - before;
 assert.ok(expiresMs > 7 * 86400000 - 60000 && expiresMs <= 7 * 86400000 + 60000);
 assert.equal(invitationExpiry(new Date('2026-11-13T00:00:00.000Z')), '2026-11-20T00:00:00.000Z');
 assert.equal(invitationUrl('https://hubie.test/', 'tok'), 'https://hubie.test/invitacion?token=tok');
 assert.ok(fake.tables.audit.some(e => e.action === 'tenant.invitation_created'));
});

test('crear invitación valida correo, rol, empresa y duplicados pendientes', async () => {
 const fake = seed();
 const deps = depsOf(fake);
 await assert.rejects(() => createInvitation({organizationId: ORG, email: 'no-es-correo', role: 'member', createdBy: ADMIN}, deps), /Invalid invitation/);
 await assert.rejects(() => createInvitation({organizationId: ORG, email: 'a@b.mx', role: 'owner', createdBy: ADMIN}, deps), /Invalid invitation/);
 await assert.rejects(() => createInvitation({organizationId: 'no-existe', email: 'a@b.mx', role: 'member', createdBy: ADMIN}, deps), /Not found/);
 await createInvitation({organizationId: ORG, email: 'dup@demo.mx', role: 'viewer', createdBy: ADMIN}, deps);
 await assert.rejects(() => createInvitation({organizationId: ORG, email: 'dup@demo.mx', role: 'member', createdBy: ADMIN}, deps), /Duplicate invitation/);
});

test('aceptar crea la membresía con el rol invitado y marca un solo uso', async () => {
 const fake = seed();
 const deps = depsOf(fake);
 const {token} = await createInvitation({organizationId: ORG, email: 'nueva@demo.mx', role: 'admin', createdBy: ADMIN, origin: ''}, deps);
 const preview = await lookupInvitation(token, deps);
 assert.equal(preview.status, 'valid');
 assert.equal(preview.invitation.organizationName, 'Demo SA');
 assert.equal(preview.invitation.organizationSlug, 'demo-sa');
 assert.equal(preview.invitation.email, 'nueva@demo.mx');
 const accepted = await acceptInvitation({token, userId: USER}, deps);
 assert.equal(accepted.organizationId, ORG);
 assert.equal(accepted.role, 'admin');
 assert.equal(accepted.email, 'nueva@demo.mx');
 assert.equal(fake.tables.memberships.length, 1);
 assert.equal(fake.tables.memberships[0].role, 'admin');
 assert.equal(fake.tables.memberships[0].status, 'active');
 assert.ok(fake.tables.invitations[0].consumed_at);
 assert.ok(fake.tables.audit.some(e => e.action === 'tenant.invitation_accepted'));
 await assert.rejects(() => acceptInvitation({token, userId: USER}, deps), /Invitation already used/);
 assert.equal((await lookupInvitation(token, deps)).status, 'consumed');
});

test('aceptar rechaza token expirado, revocado e inexistente', async () => {
 const fake = seed();
 const deps = depsOf(fake);
 const expired = newInvitationToken();
 fake.tables.invitations.push({id: 'inv-exp', organization_id: ORG, email: 'vieja@demo.mx', role: 'member', token_hash: hashInvitationToken(expired), created_by: ADMIN, expires_at: past(1), consumed_at: null, created_at: past(8)});
 await assert.rejects(() => acceptInvitation({token: expired, userId: USER}, deps), /Invitation expired/);
 assert.equal((await lookupInvitation(expired, deps)).status, 'expired');
 const {token} = await createInvitation({organizationId: ORG, email: 'rev@demo.mx', role: 'member', createdBy: ADMIN}, deps);
 const [inv] = await listInvitations(ORG, deps);
 assert.equal(inv.status, 'pending');
 await revokeInvitation({organizationId: ORG, invitationId: inv.id, actorId: ADMIN}, deps);
 await assert.rejects(() => acceptInvitation({token, userId: USER}, deps), /Not found/);
 assert.equal((await lookupInvitation(token, deps)).status, 'not-found');
 await assert.rejects(() => acceptInvitation({token: 'token-que-no-existe-123456', userId: USER}, deps), /Not found/);
 await assert.rejects(() => revokeInvitation({organizationId: ORG, invitationId: 'no-existe', actorId: ADMIN}, deps), /Not found/);
});

test('revocar elimina la invitación y audita; reenviar regenera el token', async () => {
 const fake = seed();
 const deps = depsOf(fake);
 const created = await createInvitation({organizationId: ORG, email: 're@demo.mx', role: 'member', createdBy: ADMIN, origin: 'https://hubie.test'}, deps);
 const [inv] = await listInvitations(ORG, deps);
 assert.ok(!('token_hash' in inv));
 const resent = await resendInvitation({organizationId: ORG, invitationId: inv.id, actorId: ADMIN, origin: 'https://hubie.test'}, deps);
 assert.notEqual(resent.token, created.token);
 assert.equal(resent.emailSent, false);
 assert.equal(resent.invitation.status, 'pending');
 assert.equal((await lookupInvitation(created.token, deps)).status, 'not-found');
 assert.equal((await lookupInvitation(resent.token, deps)).status, 'valid');
 assert.ok(Date.parse(resent.invitation.expiresAt) >= Date.parse(created.invitation.expiresAt));
 assert.ok(fake.tables.audit.some(e => e.action === 'tenant.invitation_resent'));
 const accepted = await acceptInvitation({token: resent.token, userId: USER}, deps);
 assert.equal(accepted.role, 'member');
 await assert.rejects(() => resendInvitation({organizationId: ORG, invitationId: inv.id, actorId: ADMIN}, deps), /Invitation already used/);
});

test('aceptar no degrada a un propietario existente', async () => {
 const fake = seed();
 fake.tables.memberships.push({organization_id: ORG, user_id: USER, role: 'owner', status: 'suspended'});
 fake.tables.users.push({id: USER, email: 'dueno@demo.mx'});
 const deps = depsOf(fake);
 const {token} = await createInvitation({organizationId: ORG, email: 'dueno@demo.mx', role: 'member', createdBy: ADMIN}, deps);
 await acceptInvitation({token, userId: USER}, deps);
 assert.equal(fake.tables.memberships[0].role, 'owner');
 assert.equal(fake.tables.memberships[0].status, 'active');
});

test('correo: sin clave no se envía; con clave y Resend ok sí; con error no se finge', async () => {
 const saved = process.env.RESEND_API_KEY;
 delete process.env.RESEND_API_KEY;
 assert.equal(emailConfigured(), false);
 assert.deepEqual(await sendInvitationEmail({to: 'a@b.mx', inviteUrl: 'https://x/invitacion?token=t', tenantName: 'Demo', role: 'member'}), {sent: false, reason: 'email-not-configured'});
 process.env.RESEND_API_KEY = 're_test_key';
 assert.equal(emailConfigured(), true);
 let seen = null;
 const okFetch = async (url, options) => { seen = {url, options}; return {ok: true, status: 200}; };
 const sent = await sendInvitationEmail({to: 'a@b.mx', inviteUrl: 'https://x/invitacion?token=t', tenantName: 'Demo', role: 'member', fetchFn: okFetch});
 assert.equal(sent.sent, true);
 assert.equal(seen.url, 'https://api.resend.com/emails');
 assert.equal(seen.options.headers.authorization, 'Bearer re_test_key');
 assert.ok(seen.options.body.includes('a@b.mx'));
 const failed = await sendInvitationEmail({to: 'a@b.mx', inviteUrl: 'https://x/invitacion?token=t', tenantName: 'Demo', role: 'member', fetchFn: async () => ({ok: false, status: 401})});
 assert.deepEqual(failed, {sent: false, reason: 'email-send-failed', status: 401});
 if (saved === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = saved;
 assert.equal(future(7).slice(0, 10), new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10));
});

test('demo: invitar, aceptar por enlace público y auditar, sin cruzar empresas', async () => {
 const demo = createDemoStore(catalog);
 const {tenants} = await demo.request('/api/admin/tenants');
 const [a, b] = tenants;
 const created = await demo.request('/api/admin/tenants/' + a.id + '/invitations', {method: 'POST', body: JSON.stringify({email: 'nueva@demo.mx', role: 'member'})});
 assert.equal(created.emailSent, false);
 assert.equal(created.emailReason, 'email-not-configured');
 assert.ok(created.inviteUrl.includes(created.token));
 const preview = await demo.request('/api/public/invitations?token=' + created.token);
 assert.equal(preview.status, 'valid');
 assert.equal(preview.invitation.email, 'nueva@demo.mx');
 await assert.rejects(() => demo.request('/api/admin/tenants/' + a.id + '/invitations', {method: 'POST', body: JSON.stringify({email: 'nueva@demo.mx', role: 'member'})}), /Duplicate invitation/);
 const accepted = await demo.request('/api/public/invitations', {method: 'POST', body: JSON.stringify({token: created.token})});
 assert.equal(accepted.organizationId, a.id);
 assert.equal(accepted.role, 'member');
 const members = (await demo.request('/api/admin/tenants/' + a.id + '/members')).members;
 assert.ok(members.some(m => m.email === 'nueva@demo.mx' && m.role === 'member'));
 const membersB = (await demo.request('/api/admin/tenants/' + b.id + '/members')).members;
 assert.ok(!membersB.some(m => m.email === 'nueva@demo.mx'));
 await assert.rejects(() => demo.request('/api/public/invitations', {method: 'POST', body: JSON.stringify({token: created.token})}), /already used/);
 // La demo no tiene correo: la segunda invitación pendiente se revoca y deja de valer.
 const second = await demo.request('/api/admin/tenants/' + a.id + '/invitations', {method: 'POST', body: JSON.stringify({email: 'otra@demo.mx', role: 'viewer'})});
 const listed = (await demo.request('/api/admin/tenants/' + a.id + '/invitations')).invitations;
 assert.equal(listed.find(i => i.email === 'otra@demo.mx').status, 'pending');
 await demo.request('/api/admin/tenants/' + a.id + '/invitations/' + second.invitation.id, {method: 'DELETE'});
 await assert.rejects(() => demo.request('/api/public/invitations?token=' + second.token), /not found/i);
 const auditA = (await demo.request('/api/app/' + a.slug + '/audit')).events;
 assert.ok(auditA.some(e => e.action === 'tenant.invitation_accepted'));
 assert.ok(auditA.every(e => e.organizationId === a.id));
 const auditAll = (await demo.request('/api/admin/audit')).events;
 assert.ok(auditAll.some(e => e.organizationId === b.id));
 const auditFiltered = (await demo.request('/api/admin/audit?tenant=' + b.id)).events;
 assert.ok(auditFiltered.length > 0 && auditFiltered.every(e => e.organizationId === b.id));
});
