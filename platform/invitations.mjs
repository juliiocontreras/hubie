// Invitaciones de miembros por correo (P0, MULTITENANT-AUDIT §P0).
// La tabla organization_invitations ya existe (001_core.sql): solo se guarda
// el HASH sha256 del token, nunca el token. Expiración 7 días, un solo uso.
// Sin RESEND_API_KEY el flujo no se rompe: la invitación se guarda igual y
// la UI muestra el enlace con botón Copiar ("enlace listo para compartir
// (correo no configurado)"); nunca se afirma que el correo salió si no salió.
// Las funciones aceptan deps {executeSql, executeBatch, sendEmail} para
// poder probarlas con una BD falsa (patrón platform/billing-store.mjs).
import {randomBytes, createHash, randomUUID} from 'node:crypto';
import {executeSql, executeBatch} from '../database.mjs';
import {sendInvitationEmail} from './email.mjs';

export const INVITATION_TTL_DAYS = 7;
export const INVITATION_ROLES = ['admin', 'member', 'viewer'];
export const INVITATION_ACTIONS = {
 created: 'tenant.invitation_created',
 accepted: 'tenant.invitation_accepted',
 revoked: 'tenant.invitation_revoked',
 resent: 'tenant.invitation_resent'
};
const db = deps => ({
 sql: deps?.executeSql ?? executeSql,
 batch: deps?.executeBatch ?? executeBatch,
 sendEmail: deps?.sendEmail ?? sendInvitationEmail
});
const rowsOf = r => r?.rows?.map(row => row.map(c => c?.value ?? null)) ?? [];
const affected = r => Number(r?.rowsAffected ?? r?.affected_row_count ?? 0);

export function hashInvitationToken(token) { return createHash('sha256').update(String(token)).digest('hex'); }
export function newInvitationToken() { return randomBytes(32).toString('base64url'); }
export function invitationExpiry(from = new Date()) {
 return new Date(new Date(from).getTime() + INVITATION_TTL_DAYS * 86400000).toISOString();
}
export function invitationUrl(origin, token) {
 return String(origin || '').replace(/\/$/, '') + '/invitacion?token=' + encodeURIComponent(token);
}
export function validInvitationEmail(email) {
 return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim().toLowerCase());
}
function publicInvitation(row) {
 const [id, organizationId, email, role, expiresAt, consumedAt, createdAt] = row;
 const now = new Date().toISOString();
 return {
  id, organizationId, email, role, expiresAt, consumedAt, createdAt,
  status: consumedAt ? 'consumed' : expiresAt <= now ? 'expired' : 'pending'
 };
}
async function tenantName({sql}, organizationId) {
 const row = rowsOf(await sql('SELECT o.name FROM organizations o WHERE o.id=?', [organizationId]))[0];
 if (!row) throw Error('Not found');
 return row[0];
}

export async function createInvitation({organizationId, email, role = 'member', createdBy, origin = ''}, deps) {
 const clean = String(email || '').trim().toLowerCase();
 if (!validInvitationEmail(clean) || !INVITATION_ROLES.includes(role) || !createdBy) throw Error('Invalid invitation');
 const d = db(deps);
 const name = await tenantName(d, organizationId);
 const pending = rowsOf(await d.sql(
  "SELECT id FROM organization_invitations WHERE organization_id=? AND email=? AND consumed_at IS NULL AND expires_at>?",
  [organizationId, clean, new Date().toISOString()]))[0];
 if (pending) throw Error('Duplicate invitation');
 const token = newInvitationToken();
 const id = randomUUID();
 const expiresAt = invitationExpiry();
 await d.batch([
  {sql: 'INSERT INTO organization_invitations(id,organization_id,email,role,token_hash,created_by,expires_at) VALUES(?,?,?,?,?,?,?)',
   args: [id, organizationId, clean, role, hashInvitationToken(token), createdBy, expiresAt]},
  {sql: 'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',
   args: [randomUUID(), organizationId, createdBy, INVITATION_ACTIONS.created, 'organization_invitation', id]}
 ]);
 const inviteUrl = invitationUrl(origin, token);
 const sent = await d.sendEmail({to: clean, inviteUrl, tenantName: name, role});
 return {invitation: {id, organizationId, email: clean, role, expiresAt, status: 'pending'}, token, inviteUrl, emailSent: sent.sent, emailReason: sent.sent ? null : (sent.reason || 'email-send-failed')};
}

export async function listInvitations(organizationId, deps) {
 const d = db(deps);
 const r = await d.sql(
  'SELECT id,organization_id,email,role,expires_at,consumed_at,created_at FROM organization_invitations WHERE organization_id=? ORDER BY created_at DESC LIMIT 200',
  [organizationId]);
 return rowsOf(r).map(publicInvitation);
}

export async function lookupInvitation(token, deps) {
 const d = db(deps);
 if (typeof token !== 'string' || token.length < 20) return {status: 'not-found', invitation: null};
 const row = rowsOf(await d.sql(
  'SELECT i.id,i.organization_id,i.email,i.role,i.expires_at,i.consumed_at,i.created_at,o.name,o.slug FROM organization_invitations i JOIN organizations o ON o.id=i.organization_id WHERE i.token_hash=?',
  [hashInvitationToken(token)]))[0];
 if (!row) return {status: 'not-found', invitation: null};
 const invitation = {...publicInvitation(row.slice(0, 7)), organizationName: row[7], organizationSlug: row[8]};
 return {status: invitation.status === 'pending' ? 'valid' : invitation.status, invitation};
}

export async function acceptInvitation({token, userId}, deps) {
 const d = db(deps);
 if (!userId) throw Error('Unauthorized');
 const found = await lookupInvitation(token, deps);
 if (found.status === 'not-found') throw Error('Not found');
 if (found.status === 'expired') throw Error('Invitation expired');
 if (found.status === 'consumed') throw Error('Invitation already used');
 const inv = found.invitation;
 const now = new Date().toISOString();
 const result = await d.batch([
  {sql: 'UPDATE organization_invitations SET consumed_at=? WHERE id=? AND consumed_at IS NULL AND expires_at>?',
   args: [now, inv.id, now]},
  {sql: 'INSERT OR IGNORE INTO users(id,email) VALUES(?,?)', args: [userId, inv.email]},
  {sql: "INSERT INTO memberships(organization_id,user_id,role,status) VALUES(?,?,?,'active') ON CONFLICT(organization_id,user_id) DO UPDATE SET role=CASE WHEN memberships.role='owner' THEN 'owner' ELSE excluded.role END,status='active'",
   args: [inv.organizationId, userId, inv.role]},
  {sql: 'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',
   args: [randomUUID(), inv.organizationId, userId, INVITATION_ACTIONS.accepted, 'organization_invitation', inv.id]}
 ]);
 if (!affected(result?.[0])) throw Error('Invitation already used');
 return {organizationId: inv.organizationId, organizationSlug: inv.organizationSlug, organizationName: inv.organizationName, email: inv.email, role: inv.role};
}

export async function revokeInvitation({organizationId, invitationId, actorId}, deps) {
 const d = db(deps);
 const result = await d.batch([
  {sql: 'DELETE FROM organization_invitations WHERE id=? AND organization_id=?', args: [invitationId, organizationId]},
  {sql: 'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',
   args: [randomUUID(), organizationId, actorId, INVITATION_ACTIONS.revoked, 'organization_invitation', invitationId]}
 ]);
 if (!affected(result?.[0])) throw Error('Not found');
 return {revoked: true};
}

export async function resendInvitation({organizationId, invitationId, actorId, origin = ''}, deps) {
 const d = db(deps);
 const row = rowsOf(await d.sql(
  'SELECT id,organization_id,email,role,expires_at,consumed_at,created_at FROM organization_invitations WHERE id=? AND organization_id=?',
  [invitationId, organizationId]))[0];
 if (!row) throw Error('Not found');
 const inv = publicInvitation(row);
 if (inv.status === 'consumed') throw Error('Invitation already used');
 if (inv.status === 'expired') throw Error('Invitation expired');
 const token = newInvitationToken();
 const expiresAt = invitationExpiry();
 const result = await d.batch([
  {sql: 'UPDATE organization_invitations SET token_hash=?,expires_at=? WHERE id=? AND consumed_at IS NULL',
   args: [hashInvitationToken(token), expiresAt, invitationId]},
  {sql: 'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)',
   args: [randomUUID(), organizationId, actorId, INVITATION_ACTIONS.resent, 'organization_invitation', invitationId]}
 ]);
 if (!affected(result?.[0])) throw Error('Invitation already used');
 const name = await tenantName(d, organizationId);
 const inviteUrl = invitationUrl(origin, token);
 const sent = await d.sendEmail({to: inv.email, inviteUrl, tenantName: name, role: inv.role});
 return {invitation: {...inv, expiresAt, status: 'pending'}, token, inviteUrl, emailSent: sent.sent, emailReason: sent.sent ? null : (sent.reason || 'email-send-failed')};
}
