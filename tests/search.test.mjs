import test from 'node:test';
import assert from 'node:assert/strict';
import {searchTenant, searchTenants, normalizeSearchQuery, escapeLike, likePattern} from '../platform/search.mjs';

// Fake mínimo: aplica el LIKE en JS sobre filas semilla. El patrón llega
// como '%...%' con %, _ y \ escapados; se desescapa antes de comparar.
const cells = values => values.map(value => ({value: value ?? null}));
const ok = (rows = []) => ({rows: rows.map(cells), affected_row_count: 0, rowsAffected: 0});
function unescapePattern(pattern) {
 return String(pattern).replace(/^%|%$/g, '').replace(/\\%/g, '%').replace(/\\_/g, '_').replace(/\\\\/g, '\\');
}
function likeMatch(value, pattern) {
 return String(value ?? '').toLowerCase().includes(unescapePattern(pattern).toLowerCase());
}
const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function createFakeDb() {
 const clientsA = Array.from({length: 12}, (_, i) => ({id: 'ca-' + i, name: 'Ana López ' + i, company: 'Empresa ' + i, email: 'ana' + i + '@ejemplo.mx'}));
 const clients = [
  ...clientsA,
  {id: 'cb-1', name: 'Ana Berta', company: 'Otra empresa', email: 'ana@otra.mx'},
  {id: 'ca-pct', name: '100% algodón', company: 'Textiles', email: 'telas@ejemplo.mx'},
  {id: 'ca-us', name: 'a_b', company: 'Guiones', email: 'ab@ejemplo.mx'},
  {id: 'ca-axb', name: 'axb', company: 'Sin guion', email: 'axb@ejemplo.mx'}
 ];
 const quotes = [
  {id: 'q1', title: 'Cotización cocina integral', client_name: 'Ana López 0', status: 'sent', valid_until: '2026-11-20'},
  {id: 'q2', title: 'Presupuesto anual', client_name: 'Otro', status: 'draft', valid_until: null}
 ];
 const catalog = [{id: 'k1', name: 'Silla plegable', sku: 'SIL-001', price_cents: 150000}];
 const expenses = [{id: 'e1', description: 'Compra de madera', vendor: 'Maderería Ana', amount_cents: 50000, occurred_on: '2026-11-10'}];
 const cases = [{id: 'c1', title: 'Expediente Ana', client_name: 'Ana López 0'}];
 const events = [{id: 'v1', title: 'Visita Ana', customer: 'Ana López 0', starts_at: '2026-11-14T10:00:00.000Z'}];
 const deals = [{id: 'd1', title: 'Trato Ana', customer: 'Ana López 0', stage: 'proposal'}];
 const items = [{id: 'i1', sku: 'MAD-01', title: 'Madera de pino', quantity: 5}];
 const orgs = [
  {id: ORG_A, slug: 'empresa-a', name: 'Empresa A', status: 'past_due', past_due_since: new Date(Date.now() - 4 * 86400000).toISOString(), ownerEmail: 'duena@empresa-a.mx'},
  {id: ORG_B, slug: 'empresa-b', name: 'Empresa B', status: 'active', past_due_since: null, ownerEmail: 'dueno@empresa-b.mx'}
 ];
 async function executeSql(sql, args = []) {
  const org = args[0];
  const p = args[1];
  if (sql.includes('FROM tenant_client_profiles WHERE')) {
   const list = clients.filter(c => (org === ORG_A ? c.id.startsWith('ca-') : c.id.startsWith('cb-')) && (likeMatch(c.name, p) || likeMatch(c.company, p) || likeMatch(c.email, p)));
   return ok(list.slice(0, 10).map(c => [c.id, c.name, c.company, c.email]));
  }
  if (sql.includes('FROM tenant_quotes WHERE')) {
   return ok(quotes.filter(q => likeMatch(q.title, p) || likeMatch(q.client_name, p)).map(q => [q.id, q.title, q.client_name, q.status, q.valid_until]));
  }
  if (sql.includes('FROM tenant_catalog_items WHERE')) {
   return ok(catalog.filter(x => likeMatch(x.name, p) || likeMatch(x.sku, p)).map(x => [x.id, x.name, x.sku, x.price_cents]));
  }
  if (sql.includes('FROM tenant_expenses WHERE')) {
   return ok(expenses.filter(x => likeMatch(x.description, p) || likeMatch(x.vendor, p)).map(x => [x.id, x.description, x.vendor, x.amount_cents, x.occurred_on]));
  }
  if (sql.includes('FROM tenant_client_cases c JOIN')) {
   return ok(cases.filter(x => likeMatch(x.title, p) || likeMatch(x.client_name, p)).map(x => [x.id, x.title, x.client_name]));
  }
  if (sql.includes('FROM tenant_schedule_events WHERE')) {
   return ok(events.filter(x => likeMatch(x.title, p) || likeMatch(x.customer, p)).map(x => [x.id, x.title, x.customer, x.starts_at]));
  }
  if (sql.includes('FROM tenant_crm_deals')) {
   return ok(deals.filter(x => likeMatch(x.title, p) || likeMatch(x.customer, p)).map(x => [x.id, x.title, x.customer, x.stage]));
  }
  if (sql.includes('FROM tenant_inventory_items WHERE')) {
   return ok(items.filter(x => likeMatch(x.title, p) || likeMatch(x.sku, p)).map(x => [x.id, x.sku, x.title, x.quantity]));
  }
  if (sql.includes('FROM organizations o LEFT JOIN tenant_subscriptions')) {
   const found = orgs.filter(o => likeMatch(o.name, args[0]) || likeMatch(o.slug, args[1]) || likeMatch(o.ownerEmail, args[2]));
   return ok(found.map(o => [o.id, o.slug, o.name, o.status, o.past_due_since, o.ownerEmail]));
  }
  throw Error('FakeDb: sentencia no soportada: ' + sql.slice(0, 80));
 }
 return {executeSql};
}
const depsOf = fake => ({executeSql: fake.executeSql});

test('consulta: mínimo 2 caracteres, máximo 100, sin espacios de más', () => {
 assert.equal(normalizeSearchQuery('  Ana   López '), 'Ana López');
 assert.throws(() => normalizeSearchQuery('a'), /Invalid search query/);
 assert.throws(() => normalizeSearchQuery(''), /Invalid search query/);
 assert.throws(() => normalizeSearchQuery('x'.repeat(101)), /Invalid search query/);
 assert.throws(() => normalizeSearchQuery(null), /Invalid search query/);
});

test('escape LIKE: %, _ y \\ son literales, no comodines', () => {
 assert.equal(escapeLike('100%_\\'), '100\\%\\_\\\\');
 assert.equal(likePattern('a_b'), '%a\\_b%');
});

test('aislamiento por tenant: no devuelve registros de otra empresa', async () => {
 const fake = createFakeDb();
 const result = await searchTenant(ORG_A, 'empresa-a', 'Ana', depsOf(fake));
 const clientGroup = result.groups.find(g => g.module === 'clients');
 assert.ok(clientGroup.items.length > 0);
 assert.ok(clientGroup.items.every(i => i.id.startsWith('ca-')));
 assert.ok(!result.groups.flatMap(g => g.items).some(i => i.id === 'cb-1'));
});

test('límite de 10 por módulo', async () => {
 const fake = createFakeDb();
 const result = await searchTenant(ORG_A, 'empresa-a', 'Ana', depsOf(fake));
 assert.equal(result.groups.find(g => g.module === 'clients').items.length, 10);
});

test('búsqueda sin resultados: total 0 y sin grupos', async () => {
 const fake = createFakeDb();
 const result = await searchTenant(ORG_A, 'empresa-a', 'zzzqqq', depsOf(fake));
 assert.equal(result.total, 0);
 assert.deepEqual(result.groups, []);
});

test('caracteres especiales: "100%" encuentra el literal y "a_b" no casa con "axb"', async () => {
 const fake = createFakeDb();
 const pct = await searchTenant(ORG_A, 'empresa-a', '100%', depsOf(fake));
 assert.ok(pct.groups.find(g => g.module === 'clients')?.items.some(i => i.id === 'ca-pct'));
 const under = await searchTenant(ORG_A, 'empresa-a', 'a_b', depsOf(fake));
 const ids = under.groups.find(g => g.module === 'clients')?.items.map(i => i.id) ?? [];
 assert.ok(ids.includes('ca-us'));
 assert.ok(!ids.includes('ca-axb'));
});

test('busca en los 8 módulos y respeta las herramientas habilitadas', async () => {
 const fake = createFakeDb();
 const ana = await searchTenant(ORG_A, 'empresa-a', 'Ana', depsOf(fake));
 assert.deepEqual(ana.groups.map(g => g.module), ['clients', 'quotes', 'expenses', 'cases', 'agenda', 'crm']);
 const silla = await searchTenant(ORG_A, 'empresa-a', 'Silla', depsOf(fake));
 assert.deepEqual(silla.groups.map(g => g.module), ['catalog']);
 const madera = await searchTenant(ORG_A, 'empresa-a', 'Madera', depsOf(fake));
 assert.deepEqual(madera.groups.map(g => g.module), ['expenses', 'inventory']);
 const onlyClients = await searchTenant(ORG_A, 'empresa-a', 'Ana', depsOf(fake), {enabledTools: ['C001']});
 assert.deepEqual(onlyClients.groups.map(g => g.module), ['clients']);
});

test('Madre: busca por nombre, slug y correo del owner, con estado de cobro efectivo', async () => {
 const fake = createFakeDb();
 const byEmail = await searchTenants('duena@empresa-a.mx', depsOf(fake));
 assert.equal(byEmail.tenants.length, 1);
 assert.equal(byEmail.tenants[0].slug, 'empresa-a');
 // past_due con 4 días: la gracia venció, el estado efectivo es suspended.
 assert.equal(byEmail.tenants[0].billingStatus, 'suspended');
 assert.equal(byEmail.tenants[0].billingStatusLabel, 'Suspendido');
 const bySlug = await searchTenants('empresa-b', depsOf(fake));
 assert.equal(bySlug.tenants[0].billingStatus, 'active');
 await assert.rejects(() => searchTenants('x', depsOf(fake)), /Invalid search query/);
});
