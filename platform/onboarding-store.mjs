import {randomUUID, randomBytes, createHash, timingSafeEqual} from 'node:crypto';
import {executeSql, executeBatch} from '../database.mjs';
import {getSuite, normalizeTenantInput, resolveEnabledTools, defaultToolIds} from './catalog.mjs';
// Onboarding (migración 018): alta autoservicio desde el pago de Stripe,
// guía de primer uso y datos de ejemplo.
// Las funciones aceptan deps {executeSql, executeBatch} para poder probarlas
// con una base falsa; en producción usan Turso. Igual que billing-store.mjs.
// Hubie NO tiene sistema de contraseñas (login por Google OIDC; la tabla
// users solo tiene id/email): el enlace de activación verifica el correo y
// abre sesión; el cliente entra después con su cuenta de Google del mismo
// correo. El token solo se guarda como hash sha256, expira a las 24 h y es
// de un solo uso. NUNCA se genera ni se guarda una contraseña en claro.
const rows = r => r?.rows?.map(row => row.map(x => x?.value ?? null)) ?? [];
const db = deps => ({sql: deps?.executeSql ?? executeSql, batch: deps?.executeBatch ?? executeBatch});
const digest = token => createHash('sha256').update(token).digest('hex');
const SETUP_TOKEN_TTL_MS = 24 * 3600 * 1000;
export const SETUP_TOKEN_TTL_HOURS = 24;

export const ONBOARDING_STEPS = [
 {key: 'profile', title: 'Completa tu perfil', description: 'Agrega el nombre, el logo y los colores de tu empresa para que tus clientes te reconozcan.', toolId: null},
 {key: 'first-client', title: 'Agrega tu primer cliente', description: 'Registra a tu primer cliente con su nombre, su correo y su teléfono.', toolId: 'C001'},
 {key: 'catalog', title: 'Crea tu catálogo', description: 'Agrega tu primer producto o servicio con su precio.', toolId: 'C006'},
 {key: 'quote', title: 'Crea tu primera cotización', description: 'Arma una cotización con partidas y compártela con tu cliente.', toolId: 'T013'},
 {key: 'team', title: 'Invita a tu equipo', description: 'Agrega a las personas que trabajarán contigo en Hubie. Las invitaciones las gestiona Hubie Madre.', toolId: null},
 {key: 'billing', title: 'Configura tu cobro', description: 'Revisa tu suscripción y tu anticipo para mantener tu Suite al corriente.', toolId: null}
];
const STEP_KEYS = new Set(ONBOARDING_STEPS.map(s => s.key));

const GENERIC_LOCALS = new Set(['info', 'contacto', 'contact', 'ventas', 'sales', 'admin', 'hola', 'hello', 'soporte', 'support', 'gerencia', 'atencion', 'atencionaclientes', 'facturacion', 'billing', 'hola']);
const slugify = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const humanize = value => String(value || '').split(/[-_.]+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'Mi empresa';
// Nombre y slug del tenant derivados solo del correo del pago (el checkout
// público no trae el nombre de la empresa). Si el local es genérico
// (ventas@, info@…), se usa el dominio.
export function deriveTenantIdentity(email) {
 const clean = String(email || '').trim().toLowerCase();
 const [local = '', domain = ''] = clean.split('@');
 const base = GENERIC_LOCALS.has(local) ? domain.split('.')[0] : local;
 let slugBase = slugify(base);
 if (slugBase.length < 3) slugBase = (slugBase ? slugBase + '-hubie' : 'empresa-hubie');
 const name = humanize(base).slice(0, 160);
 return {name: name.length >= 2 ? name : 'Mi empresa', slugBase};
}
export async function ensureUniqueSlug(base, deps = {}) {
 for (let i = 0; i < 20; i++) {
  const slug = i === 0 ? base : `${base}-${i + 1}`;
  const found = rows(await db(deps).sql('SELECT id FROM organizations WHERE slug=?', [slug]))[0];
  if (!found) return slug;
 }
 return `${base}-${randomUUID().slice(0, 8)}`;
}
export async function findUserByEmail(email, deps = {}) {
 const row = rows(await db(deps).sql('SELECT id,email FROM users WHERE email=?', [email]))[0];
 return row ? {id: row[0], email: row[1]} : null;
}
export async function findTenantOwnedBy(userId, deps = {}) {
 const row = rows(await db(deps).sql("SELECT organization_id FROM memberships WHERE user_id=? AND role='owner' AND status='active' LIMIT 1", [userId]))[0];
 return row?.[0] ?? null;
}
export async function getTenantOwner(organizationId, deps = {}) {
 const row = rows(await db(deps).sql("SELECT u.id,u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? AND m.role='owner' AND m.status='active' LIMIT 1", [organizationId]))[0];
 return row ? {userId: row[0], email: row[1]} : null;
}
export async function findOrCreateUser(email, deps = {}) {
 const clean = String(email || '').trim().toLowerCase();
 if (!clean || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean) || clean.length > 254) throw Error('Invalid email');
 const existing = await findUserByEmail(clean, deps);
 if (existing) return {userId: existing.id, isNew: false};
 const userId = randomUUID();
 await db(deps).sql('INSERT INTO users(id,email) VALUES(?,?)', [userId, clean]);
 return {userId, isNew: true};
}
// Emite un enlace de activación de un solo uso (24 h). Solo se guarda el
// hash; el token en claro se devuelve UNA vez al llamador y no se persiste.
// Revoca los tokens previos sin consumir de ese usuario en ese tenant.
export async function issueSetupToken({organizationId, userId, email}, deps = {}, {now = new Date()} = {}) {
 if (!organizationId || !userId || !email) throw Error('Invalid setup token');
 const token = randomBytes(32).toString('base64url');
 const expiresAt = new Date(now.getTime() + SETUP_TOKEN_TTL_MS).toISOString();
 await db(deps).sql('UPDATE tenant_setup_tokens SET consumed_at=? WHERE organization_id=? AND user_id=? AND consumed_at IS NULL', [now.toISOString(), organizationId, userId]);
 await db(deps).sql('INSERT INTO tenant_setup_tokens(id,organization_id,user_id,email,token_hash,purpose,expires_at) VALUES(?,?,?,?,?,?,?)',
  [randomUUID(), organizationId, userId, String(email).toLowerCase(), digest(token), 'activate', expiresAt]);
 return {token, expiresAt, activationPath: `/api/onboarding/activate?token=${token}`};
}
// Canjea el token: lo marca consumido (un solo uso) y devuelve a quién
// pertenece. Expirado, consumido o desconocido → Error('Invalid setup token').
export async function redeemSetupToken(token, deps = {}, {now = new Date()} = {}) {
 if (typeof token !== 'string' || token.length < 20) throw Error('Invalid setup token');
 const row = rows(await db(deps).sql('SELECT id,organization_id,user_id,email,token_hash,expires_at,consumed_at FROM tenant_setup_tokens WHERE token_hash=?', [digest(token)]))[0];
 if (!row) throw Error('Invalid setup token');
 if (row[6] || Date.parse(row[5]) <= now.getTime()) throw Error('Invalid setup token');
 if (!timingSafeEqual(Buffer.from(row[4], 'hex'), Buffer.from(digest(token), 'hex'))) throw Error('Invalid setup token');
 const updated = await db(deps).sql('UPDATE tenant_setup_tokens SET consumed_at=? WHERE token_hash=? AND consumed_at IS NULL', [now.toISOString(), digest(token)]);
 if (!Number(updated?.affected_row_count ?? updated?.rowsAffected ?? 0)) throw Error('Invalid setup token');
 return {tokenId: row[0], organizationId: row[1], userId: row[2], email: row[3]};
}
// Crea el tenant con el cliente como owner (misma forma que
// admin.mjs:createTenant, pero el owner es el cliente que pagó, no el
// superadmin creador). La suite y las tools salen de la cotización pagada.
export async function createTenantForOrder({order, ownerUserId}, deps = {}) {
 const identity = deriveTenantIdentity(order?.email);
 const slug = await ensureUniqueSlug(identity.slugBase, deps);
 const toolIds = Array.isArray(order?.quote?.toolIds) && order.quote.toolIds.length ? order.quote.toolIds : defaultToolIds();
 const data = normalizeTenantInput({name: identity.name, slug, suiteId: order?.suiteId, displayName: identity.name, primaryColor: '#7c5cfc', secondaryColor: '#ec4899', toolIds});
 const id = randomUUID();
 const statements = [
  {sql: 'INSERT INTO organizations(id,slug,name) VALUES(?,?,?)', args: [id, data.slug, data.name]},
  {sql: 'INSERT INTO tenant_settings(organization_id,suite_id,display_name,primary_color,secondary_color) VALUES(?,?,?,?,?)', args: [id, data.suiteId, data.displayName, data.primaryColor, data.secondaryColor]},
  {sql: "INSERT INTO memberships(organization_id,user_id,role,status) VALUES(?,?,'owner','active')", args: [id, ownerUserId]},
  ...resolveEnabledTools(data.toolIds).map(t => ({sql: 'INSERT INTO tenant_tools(organization_id,tool_id,enabled) VALUES(?,?,?)', args: [id, t.toolId, t.enabled]})),
  {sql: 'INSERT INTO audit_events(id,organization_id,actor_user_id,action,target_type,target_id) VALUES(?,?,?,?,?,?)', args: [randomUUID(), id, ownerUserId, 'tenant.created', 'organization', id]}
 ];
 await db(deps).batch(statements);
 return {id, slug: data.slug, name: data.name, suiteId: data.suiteId};
}
// Círculo completo del alta autoservicio: pago sin tenant → usuario (nuevo o
// existente) + tenant con el cliente como owner + enlace de activación si el
// usuario es nuevo. Idempotente: una orden ya convertida, o un cliente que
// ya es owner de un tenant, NO crea otro tenant (segundo pago).
export async function provisionTenantFromPaidOrder({order, deps = {}, now = new Date()} = {}) {
 if (!order?.id || !order?.email || !order?.suiteId || !getSuite(order.suiteId)) throw Error('Invalid order');
 if (order.organizationId || order.status === 'converted') return {organizationId: order.organizationId, alreadyConverted: true, userId: null, isNewUser: false, setupToken: null};
 const {userId, isNew} = await findOrCreateUser(order.email, deps);
 const owned = await findTenantOwnedBy(userId, deps);
 const tenant = owned ? {id: owned} : await createTenantForOrder({order, ownerUserId: userId}, deps);
 let setup = null;
 if (isNew) setup = await issueSetupToken({organizationId: tenant.id, userId, email: order.email}, deps, {now});
 return {organizationId: tenant.id, alreadyConverted: false, userId, isNewUser: isNew, setupToken: setup?.token ?? null, setupTokenExpiresAt: setup?.expiresAt ?? null, activationPath: setup?.activationPath ?? null};
}
async function countWhere(sql, organizationId, deps) {
 const row = rows(await db(deps).sql(sql, [organizationId]))[0];
 return Number(row?.[0] ?? 0);
}
// Progreso de la guía: lo guardado por el usuario + lo que ya existe en los
// datos del tenant (un cliente, un artículo, una cotización, un segundo
// miembro o una suscripción marcan su paso aunque nadie lo haya marcado).
export async function getOnboardingProgress(organizationId, userId, deps = {}) {
 if (!organizationId || !userId) throw Error('Invalid onboarding progress');
 const stored = new Set(rows(await db(deps).sql('SELECT step_key FROM tenant_onboarding WHERE organization_id=? AND user_id=?', [organizationId, userId])).map(r => r[0]));
 const [clients, items, quotes, members, subs] = await Promise.all([
  countWhere('SELECT COUNT(*) FROM tenant_client_profiles WHERE organization_id=? AND archived_at IS NULL', organizationId, deps),
  countWhere('SELECT COUNT(*) FROM tenant_catalog_items WHERE organization_id=? AND active=1', organizationId, deps),
  countWhere('SELECT COUNT(*) FROM tenant_quotes WHERE organization_id=? AND archived_at IS NULL', organizationId, deps),
  countWhere("SELECT COUNT(*) FROM memberships WHERE organization_id=? AND status='active'", organizationId, deps),
  countWhere('SELECT COUNT(*) FROM tenant_subscriptions WHERE organization_id=?', organizationId, deps)
 ]);
 const derived = {'first-client': clients > 0, catalog: items > 0, quote: quotes > 0, team: members > 1, billing: subs > 0};
 const seeded = rows(await db(deps).sql('SELECT entity_type,entity_id FROM tenant_demo_seed WHERE organization_id=?', [organizationId]));
 const steps = ONBOARDING_STEPS.map(s => {
  const done = stored.has(s.key) || Boolean(derived[s.key]);
  return {...s, done, auto: Boolean(derived[s.key]) && !stored.has(s.key)};
 });
 const doneCount = steps.filter(s => s.done).length;
 return {organizationId, userId, steps, doneCount, total: steps.length, complete: doneCount === steps.length, demoSeeded: seeded.length > 0, demoCount: seeded.length};
}
export async function completeOnboardingStep(organizationId, userId, stepKey, deps = {}) {
 if (!organizationId || !userId || !STEP_KEYS.has(stepKey)) throw Error('Invalid onboarding step');
 await db(deps).sql('INSERT INTO tenant_onboarding(organization_id,user_id,step_key) VALUES(?,?,?) ON CONFLICT(organization_id,user_id,step_key) DO UPDATE SET completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP', [organizationId, userId, stepKey]);
 return getOnboardingProgress(organizationId, userId, deps);
}
// Replay de la guía: borra solo lo marcado a mano (lo derivado por datos
// reales se mantiene marcado, porque el dato ya existe).
export async function resetOnboardingProgress(organizationId, userId, deps = {}) {
 if (!organizationId || !userId) throw Error('Invalid onboarding progress');
 await db(deps).sql('DELETE FROM tenant_onboarding WHERE organization_id=? AND user_id=?', [organizationId, userId]);
 return getOnboardingProgress(organizationId, userId, deps);
}
export async function listDemoData(organizationId, deps = {}) {
 const seeded = rows(await db(deps).sql('SELECT entity_type,entity_id FROM tenant_demo_seed WHERE organization_id=?', [organizationId]));
 return seeded.map(r => ({entityType: r[0], entityId: r[1]}));
}
// Siembra por suite: 1 cliente demo, 1 producto/servicio demo (con el nombre
// de la suite) y 1 cotización de ejemplo con ese producto. Todo con el
// prefijo visible "DEMO — " y registrado en tenant_demo_seed para borrarlo
// en un clic. Idempotente: si ya hay datos de ejemplo, no duplica.
export async function seedDemoData(organizationId, userId, deps = {}, {suiteName = ''} = {}) {
 if (!organizationId || !userId) throw Error('Invalid demo seed');
 const existing = await listDemoData(organizationId, deps);
 if (existing.length) return {seeded: false, alreadySeeded: true, demo: existing};
 const clientId = randomUUID();
 const itemId = randomUUID();
 const quoteId = randomUUID();
 const lineId = randomUUID();
 const priceCents = 99000;
 const vatCents = Math.round(priceCents * 0.16);
 const productName = suiteName ? `Servicio de ejemplo — ${suiteName}` : 'Servicio de ejemplo';
 const statements = [
  {sql: 'INSERT INTO tenant_client_profiles(organization_id,id,name,company,email,phone,status,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?)',
   args: [organizationId, clientId, 'DEMO — Cliente de ejemplo', 'Empresa Demo', 'demo@ejemplo.invalid', '', 'prospect', 'Cliente de ejemplo (DEMO). Se puede eliminar desde la guía de primer uso.', userId]},
  {sql: 'INSERT INTO tenant_catalog_items(organization_id,id,sku,name,description,price_cents,category,active,created_by) VALUES(?,?,?,?,?,?,?,?,?)',
   args: [organizationId, itemId, 'DEMO-001', `DEMO — ${productName}`, 'Producto o servicio de ejemplo (DEMO). Precio de muestra, no es una venta real.', priceCents, 'General', 1, userId]},
  {sql: 'INSERT INTO tenant_quotes(organization_id,id,client_id,client_name,title,notes,vat_rate,status,valid_until,subtotal_cents,vat_cents,total_cents,public_token,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
   args: [organizationId, quoteId, clientId, 'DEMO — Cliente de ejemplo', 'DEMO — Cotización de ejemplo', 'Cotización de ejemplo (DEMO). No es una venta real.', 16, 'draft', null, priceCents, vatCents, priceCents + vatCents, randomBytes(16).toString('hex'), userId]},
  {sql: 'INSERT INTO tenant_quote_lines(organization_id,quote_id,id,description,quantity,unit_price_cents,line_total_cents,position) VALUES(?,?,?,?,?,?,?,?)',
   args: [organizationId, quoteId, lineId, `DEMO — ${productName}`, 1, priceCents, priceCents, 0]},
  {sql: 'INSERT INTO tenant_demo_seed(organization_id,entity_type,entity_id,created_by) VALUES(?,?,?,?)', args: [organizationId, 'client', clientId, userId]},
  {sql: 'INSERT INTO tenant_demo_seed(organization_id,entity_type,entity_id,created_by) VALUES(?,?,?,?)', args: [organizationId, 'catalog_item', itemId, userId]},
  {sql: 'INSERT INTO tenant_demo_seed(organization_id,entity_type,entity_id,created_by) VALUES(?,?,?,?)', args: [organizationId, 'quote', quoteId, userId]}
 ];
 await db(deps).batch(statements);
 return {seeded: true, alreadySeeded: false, demo: [{entityType: 'client', entityId: clientId}, {entityType: 'catalog_item', entityId: itemId}, {entityType: 'quote', entityId: quoteId}]};
}
// Borra solo lo registrado como ejemplo (líneas, cotización, artículo y
// cliente, en ese orden por las llaves foráneas) y el registro de siembra.
export async function clearDemoData(organizationId, deps = {}) {
 if (!organizationId) throw Error('Invalid demo seed');
 const seeded = await listDemoData(organizationId, deps);
 const byType = type => seeded.filter(s => s.entityType === type).map(s => s.entityId);
 const statements = [];
 for (const quoteId of byType('quote')) statements.push({sql: 'DELETE FROM tenant_quote_lines WHERE organization_id=? AND quote_id=?', args: [organizationId, quoteId]});
 for (const quoteId of byType('quote')) statements.push({sql: 'DELETE FROM tenant_quotes WHERE organization_id=? AND id=?', args: [organizationId, quoteId]});
 for (const itemId of byType('catalog_item')) statements.push({sql: 'DELETE FROM tenant_catalog_items WHERE organization_id=? AND id=?', args: [organizationId, itemId]});
 for (const clientId of byType('client')) statements.push({sql: 'DELETE FROM tenant_client_profiles WHERE organization_id=? AND id=?', args: [organizationId, clientId]});
 statements.push({sql: 'DELETE FROM tenant_demo_seed WHERE organization_id=?', args: [organizationId]});
 if (statements.length) await db(deps).batch(statements);
 return {removed: seeded.length, demo: seeded};
}
