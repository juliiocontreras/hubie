// Script de migraciones a Turso de pruebas (scripts/migrate-test-db.mjs):
// aplica 001–036 contra una base local file: y verifica idempotencia y
// conteo de tablas. Nunca toca Turso cloud ni la base viva.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createClient} from '@libsql/client';
import {MIGRATIONS, CORE_TABLES, migrateDatabase} from '../scripts/migrate-test-db.mjs';

const run = promisify(execFile);
const tempDb = async t => {
 const dir = await mkdtemp(join(tmpdir(), 'hubie-migrate-'));
 t.after(() => rm(dir, {recursive: true, force: true}));
 return {dir, url: 'file:' + join(dir, 'test.db')};
};

test('lista de migraciones: 35 archivos 001–036 sin 019, mismo orden que server', () => {
 assert.equal(MIGRATIONS.length, 35);
 assert.equal(MIGRATIONS[0], '001_core.sql');
 assert.equal(MIGRATIONS.at(-1), '036_payroll.sql');
 assert.ok(!MIGRATIONS.includes('019_core.sql') && !MIGRATIONS.some(m => m.startsWith('019')));
 assert.equal(new Set(MIGRATIONS).size, 35);
 assert.deepEqual(CORE_TABLES, ['organizations', 'users', 'memberships', 'organization_invitations', 'audit_events']);
});

test('sin credenciales el script exige env vars y no toca nada', async () => {
 await assert.rejects(() => migrateDatabase({url: '', authToken: ''}), /Faltan TURSO_DATABASE_URL/);
});

test('migra una base local: 127 tablas, 5 core, idempotente en segunda pasada', async t => {
 const {url} = await tempDb(t);
 const first = await migrateDatabase({url, authToken: 'local-sin-token'});
 assert.deepEqual(first.failures, []);
 assert.equal(first.coreCount, 5);
 assert.equal(first.tableCount, 127);
 assert.ok(first.applied > 300);
 const second = await migrateDatabase({url, authToken: 'local-sin-token'});
 assert.deepEqual(second.failures, []);
 assert.equal(second.tableCount, 127);
 assert.equal(second.coreCount, 5);
 assert.ok(second.alreadyApplied > 0, 'la segunda pasada tolera duplicate column');
 assert.equal(second.applied + second.alreadyApplied, first.applied + first.alreadyApplied);
});

test('la 027 deja sku en tenant_catalog_items y acepta INSERT con sku', async t => {
 const {url} = await tempDb(t);
 await migrateDatabase({url, authToken: 'local-sin-token'});
 const client = createClient({url});
 try {
  const cols = await client.execute('SELECT name FROM pragma_table_info(?)', ['tenant_catalog_items']);
  const names = cols.rows.map(r => r.name ?? r[0]);
  assert.ok(names.includes('sku'), 'tenant_catalog_items debe tener sku (migración 027)');
  await client.execute(
   "INSERT INTO organizations(id,slug,name) VALUES('org-prueba','org-prueba','Org Prueba')");
  await client.execute(
   "INSERT INTO tenant_catalog_items(organization_id,id,sku,name,price_cents,active) VALUES('org-prueba','item-prueba','SKU-PRUEBA','Artículo de prueba',100,1)");
  const found = await client.execute("SELECT sku FROM tenant_catalog_items WHERE id='item-prueba'");
  assert.equal(found.rows[0]?.sku ?? found.rows[0]?.[0], 'SKU-PRUEBA');
  await client.execute("DELETE FROM tenant_catalog_items WHERE id='item-prueba'");
  await client.execute("DELETE FROM organizations WHERE id='org-prueba'");
  const left = await client.execute('SELECT COUNT(*) AS n FROM tenant_catalog_items');
  assert.equal(Number(left.rows[0]?.n ?? left.rows[0]?.[0]), 0);
 } finally {
  client.close();
 }
});

test('CLI: sin --apply sale con código 2; con --apply migra y reporta 127 tablas', async t => {
 await assert.rejects(run('node', ['scripts/migrate-test-db.mjs'], {cwd: new URL('..', import.meta.url).pathname}),
  error => error.code === 2);
 const {url} = await tempDb(t);
 const {stdout} = await run('node', ['scripts/migrate-test-db.mjs', '--apply'], {
  cwd: new URL('..', import.meta.url).pathname,
  env: {...process.env, TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: 'local-sin-token'}
 });
 assert.match(stdout, /127 tablas/);
 assert.match(stdout, /5\/5 tablas core/);
});

test('marketing_leads (server.mjs:137) existe y acepta INSERT, también en segunda pasada', async t => {
 const {url} = await tempDb(t);
 const first = await migrateDatabase({url, authToken: 'local-sin-token'});
 assert.equal(first.marketingLeads, true);
 const client = createClient({url});
 try {
  const cols = await client.execute('SELECT name FROM pragma_table_info(?)', ['marketing_leads']);
  const names = cols.rows.map(r => r.name ?? r[0]);
  assert.deepEqual([...names].sort(), ['created_at', 'email', 'giro', 'id', 'mensaje', 'negocio', 'nombre', 'tel']);
  await client.execute(
   "INSERT INTO marketing_leads(id,nombre,negocio,giro,email,tel,mensaje,created_at) VALUES('lead-prueba','Ana','Tienda X','Retail','ana@example.com','8440000000','Hola', '2026-11-24T00:00:00.000Z')");
  const found = await client.execute("SELECT email FROM marketing_leads WHERE id='lead-prueba'");
  assert.equal(found.rows[0]?.email ?? found.rows[0]?.[0], 'ana@example.com');
  await client.execute("DELETE FROM marketing_leads WHERE id='lead-prueba'");
  const second = await migrateDatabase({url, authToken: 'local-sin-token'});
  assert.equal(second.tableCount, 127);
  assert.deepEqual(second.failures, []);
 } finally {
  client.close();
 }
});
