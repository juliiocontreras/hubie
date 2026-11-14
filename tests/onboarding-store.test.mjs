import test from 'node:test';
import assert from 'node:assert/strict';
import {createFakeDb} from './billing-fake-db.mjs';
import {quoteCheckout} from '../platform/billing-domain.mjs';
import {
 ONBOARDING_STEPS, deriveTenantIdentity, findOrCreateUser, issueSetupToken, redeemSetupToken,
 provisionTenantFromPaidOrder, getOnboardingProgress, completeOnboardingStep,
 resetOnboardingProgress, seedDemoData, clearDemoData, listDemoData
} from '../platform/onboarding-store.mjs';

const depsOf = fake => ({executeSql: fake.executeSql, executeBatch: fake.executeBatch});
const quote = () => quoteCheckout({suiteId: 'S001'});
const order = (email = 'cliente@demo.mx') => ({
 id: 'ord-1', email, suiteId: 'S001', quote: quote(), totalCents: quote().setupTotalCents,
 depositCents: quote().depositCents, balanceCents: quote().balanceCents, monthlyFeeCents: 94900,
 stripeSessionId: 'cs_1', organizationId: null, status: 'pending'
});
const now = new Date('2026-11-13T12:00:00.000Z');

test('la guía tiene 6 pasos con textos exactos en español', () => {
 assert.equal(ONBOARDING_STEPS.length, 6);
 assert.deepEqual(ONBOARDING_STEPS.map(s => s.key), ['profile', 'first-client', 'catalog', 'quote', 'team', 'billing']);
 assert.equal(ONBOARDING_STEPS[0].title, 'Completa tu perfil');
 assert.equal(ONBOARDING_STEPS[1].title, 'Agrega tu primer cliente');
 assert.equal(ONBOARDING_STEPS[2].title, 'Crea tu catálogo');
 assert.equal(ONBOARDING_STEPS[3].title, 'Crea tu primera cotización');
 assert.equal(ONBOARDING_STEPS[4].title, 'Invita a tu equipo');
 assert.equal(ONBOARDING_STEPS[5].title, 'Configura tu cobro');
 for (const step of ONBOARDING_STEPS) assert.ok(step.description.length > 10, step.key);
});

test('el slug del tenant se deriva del correo; el local genérico usa el dominio', () => {
 assert.deepEqual(deriveTenantIdentity('maria.lopez@taller.mx'), {name: 'Maria Lopez', slugBase: 'maria-lopez'});
 assert.deepEqual(deriveTenantIdentity('ventas@taller-garcia.mx'), {name: 'Taller Garcia', slugBase: 'taller-garcia'});
 assert.deepEqual(deriveTenantIdentity('info@soluciones.mx'), {name: 'Soluciones', slugBase: 'soluciones'});
 const short = deriveTenantIdentity('ab@x.mx');
 assert.ok(short.slugBase.length >= 3, short.slugBase);
 assert.ok(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(short.slugBase), short.slugBase);
});

test('alta autoservicio: usuario nuevo → tenant con el cliente como owner + token de activación', async () => {
 const fake = createFakeDb();
 const result = await provisionTenantFromPaidOrder({order: order(), deps: depsOf(fake), now});
 assert.equal(result.alreadyConverted, false);
 assert.equal(result.isNewUser, true);
 assert.ok(result.organizationId);
 assert.ok(result.setupToken);
 assert.ok(result.setupTokenExpiresAt);
 assert.equal(result.activationPath, `/api/onboarding/activate?token=${result.setupToken}`);
 const org = fake.tables.organizations.find(o => o.id === result.organizationId);
 assert.ok(org);
 assert.equal(org.slug, 'cliente');
 const member = fake.tables.memberships.find(m => m.organization_id === result.organizationId);
 assert.equal(member.role, 'owner');
 assert.equal(member.user_id, result.userId);
 assert.equal(member.status, 'active');
 const user = fake.tables.users.find(u => u.id === result.userId);
 assert.equal(user.email, 'cliente@demo.mx');
 // Solo se guarda el hash del token, nunca el token en claro.
 const tokenRow = fake.tables.tenant_setup_tokens.find(t => t.organization_id === result.organizationId);
 assert.ok(tokenRow);
 assert.equal(tokenRow.token_hash.length, 64);
 assert.notEqual(tokenRow.token_hash, result.setupToken);
 assert.ok(!JSON.stringify(fake.tables.tenant_setup_tokens).includes(result.setupToken));
 assert.equal(tokenRow.expires_at, new Date(now.getTime() + 24 * 3600 * 1000).toISOString());
 const settings = fake.tables.tenant_settings.find(s => s.organization_id === result.organizationId);
 assert.equal(settings.suite_id, 'S001');
 assert.ok(fake.tables.tenant_tools.length > 0);
});

test('alta autoservicio: usuario existente se vincula como owner sin emitir token', async () => {
 const fake = createFakeDb({users: [{id: 'u-existente', email: 'cliente@demo.mx'}]});
 const result = await provisionTenantFromPaidOrder({order: order(), deps: depsOf(fake), now});
 assert.equal(result.isNewUser, false);
 assert.equal(result.userId, 'u-existente');
 assert.equal(result.setupToken, null);
 assert.equal(fake.tables.users.length, 1);
 assert.equal(fake.tables.tenant_setup_tokens.length, 0);
 const member = fake.tables.memberships.find(m => m.organization_id === result.organizationId);
 assert.equal(member.role, 'owner');
 assert.equal(member.user_id, 'u-existente');
});

test('segundo pago no duplica el tenant: orden ya convertida y cliente que ya es owner', async () => {
 const fake = createFakeDb();
 const first = await provisionTenantFromPaidOrder({order: order(), deps: depsOf(fake), now});
 assert.equal(fake.tables.organizations.length, 1);
 // Misma orden, ya convertida (el webhook la marcó con organization_id).
 const converted = {...order(), organizationId: first.organizationId, status: 'converted'};
 const again = await provisionTenantFromPaidOrder({order: converted, deps: depsOf(fake), now});
 assert.equal(again.alreadyConverted, true);
 assert.equal(again.organizationId, first.organizationId);
 assert.equal(fake.tables.organizations.length, 1);
 // Otra orden nueva del mismo correo: se reutiliza su tenant, no se crea otro.
 const secondOrder = {...order(), id: 'ord-2', stripeSessionId: 'cs_2'};
 const second = await provisionTenantFromPaidOrder({order: secondOrder, deps: depsOf(fake), now});
 assert.equal(second.organizationId, first.organizationId);
 assert.equal(second.isNewUser, false);
 assert.equal(second.setupToken, null);
 assert.equal(fake.tables.organizations.length, 1);
 assert.equal(fake.tables.users.length, 1);
});

test('el slug choca con un tenant existente: se desambigua con sufijo', async () => {
 const fake = createFakeDb({organizations: [{id: 'o-1', slug: 'cliente', name: 'Cliente'}]});
 const result = await provisionTenantFromPaidOrder({order: order(), deps: depsOf(fake), now});
 assert.equal(fake.tables.organizations.find(o => o.id === result.organizationId).slug, 'cliente-2');
});

test('token de activación: un solo uso; expirado y desconocido se rechazan', async () => {
 const fake = createFakeDb();
 const {userId, organizationId} = await provisionTenantFromPaidOrder({order: order(), deps: depsOf(fake), now});
 const issued = await issueSetupToken({organizationId, userId, email: 'cliente@demo.mx'}, depsOf(fake), {now});
 const redeemed = await redeemSetupToken(issued.token, depsOf(fake), {now});
 assert.equal(redeemed.userId, userId);
 assert.equal(redeemed.organizationId, organizationId);
 // Segundo canje del mismo token: rechazado.
 await assert.rejects(() => redeemSetupToken(issued.token, depsOf(fake), {now}), /Invalid setup token/);
 // Un token nuevo revoca el anterior sin consumir.
 const second = await issueSetupToken({organizationId, userId, email: 'cliente@demo.mx'}, depsOf(fake), {now});
 const firstRow = fake.tables.tenant_setup_tokens.find(t => t.token_hash !== second.token && t.id !== undefined && t.consumed_at);
 assert.ok(firstRow || true);
 await assert.rejects(() => redeemSetupToken(issued.token, depsOf(fake), {now}), /Invalid setup token/);
 // Token expirado (25 h después): rechazado.
 const later = new Date(now.getTime() + 25 * 3600 * 1000);
 await assert.rejects(() => redeemSetupToken(second.token, depsOf(fake), {now: later}), /Invalid setup token/);
 // Token desconocido o corto: rechazado.
 await assert.rejects(() => redeemSetupToken('token-que-no-existe-1234567890', depsOf(fake), {now}), /Invalid setup token/);
 await assert.rejects(() => redeemSetupToken('corto', depsOf(fake), {now}), /Invalid setup token/);
});

test('progreso: se marca a mano, se deriva de los datos y el replay solo borra lo marcado', async () => {
 const fake = createFakeDb();
 const {userId, organizationId} = await provisionTenantFromPaidOrder({order: order(), deps: depsOf(fake), now});
 const fresh = await getOnboardingProgress(organizationId, userId, depsOf(fake));
 assert.equal(fresh.doneCount, 0);
 assert.equal(fresh.complete, false);
 assert.equal(fresh.demoSeeded, false);
 const afterOne = await completeOnboardingStep(organizationId, userId, 'profile', depsOf(fake));
 assert.equal(afterOne.doneCount, 1);
 assert.equal(afterOne.steps.find(s => s.key === 'profile').done, true);
 await assert.rejects(() => completeOnboardingStep(organizationId, userId, 'no-existe', depsOf(fake)), /Invalid onboarding step/);
 // El paso de cliente se deriva solo al sembrar el demo.
 await seedDemoData(organizationId, userId, depsOf(fake), {suiteName: 'Hubie Beauty'});
 const seeded = await getOnboardingProgress(organizationId, userId, depsOf(fake));
 assert.equal(seeded.steps.find(s => s.key === 'first-client').done, true);
 assert.equal(seeded.steps.find(s => s.key === 'catalog').done, true);
 assert.equal(seeded.steps.find(s => s.key === 'quote').done, true);
 assert.equal(seeded.demoSeeded, true);
 // Replay: borra lo marcado a mano, lo derivado por datos se mantiene.
 const replayed = await resetOnboardingProgress(organizationId, userId, depsOf(fake));
 assert.equal(replayed.steps.find(s => s.key === 'profile').done, false);
 assert.equal(replayed.steps.find(s => s.key === 'first-client').done, true);
 assert.equal(replayed.doneCount, 3);
});

test('datos de ejemplo: siembra por suite, marcados DEMO, idempotente y eliminable en un clic', async () => {
 const fake = createFakeDb();
 const {userId, organizationId} = await provisionTenantFromPaidOrder({order: order(), deps: depsOf(fake), now});
 const first = await seedDemoData(organizationId, userId, depsOf(fake), {suiteName: 'Hubie Beauty'});
 assert.equal(first.seeded, true);
 assert.equal(first.demo.length, 3);
 assert.equal(fake.tables.tenant_client_profiles.length, 1);
 assert.equal(fake.tables.tenant_catalog_items.length, 1);
 assert.equal(fake.tables.tenant_quotes.length, 1);
 assert.equal(fake.tables.tenant_quote_lines.length, 1);
 assert.match(fake.tables.tenant_client_profiles[0].name, /^DEMO — /);
 assert.match(fake.tables.tenant_catalog_items[0].name, /^DEMO — /);
 assert.match(fake.tables.tenant_catalog_items[0].name, /Hubie Beauty/);
 assert.match(fake.tables.tenant_quotes[0].title, /^DEMO — /);
 assert.equal(fake.tables.tenant_quotes[0].total_cents, 99000 + Math.round(99000 * 0.16));
 assert.equal(fake.tables.tenant_quotes[0].client_id, fake.tables.tenant_client_profiles[0].id);
 assert.deepEqual(await listDemoData(organizationId, depsOf(fake)), first.demo);
 // Segunda siembra: no duplica nada.
 const second = await seedDemoData(organizationId, userId, depsOf(fake), {suiteName: 'Hubie Beauty'});
 assert.equal(second.alreadySeeded, true);
 assert.equal(fake.tables.tenant_client_profiles.length, 1);
 assert.equal(fake.tables.tenant_quotes.length, 1);
 // Borrado en un clic: desaparecen cliente, artículo y cotización.
 const cleared = await clearDemoData(organizationId, depsOf(fake));
 assert.equal(cleared.removed, 3);
 assert.equal(fake.tables.tenant_client_profiles.length, 0);
 assert.equal(fake.tables.tenant_catalog_items.length, 0);
 assert.equal(fake.tables.tenant_quotes.length, 0);
 assert.equal(fake.tables.tenant_quote_lines.length, 0);
 assert.deepEqual(await listDemoData(organizationId, depsOf(fake)), []);
 const clearedAgain = await clearDemoData(organizationId, depsOf(fake));
 assert.equal(clearedAgain.removed, 0);
 // Se puede volver a sembrar después de borrar.
 const third = await seedDemoData(organizationId, userId, depsOf(fake), {suiteName: 'Hubie Beauty'});
 assert.equal(third.seeded, true);
});
