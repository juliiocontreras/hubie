import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {executableStatements} from '../platform/migration-parser.mjs';

test('migración 018 crea las tres tablas de onboarding con scope por tenant', async () => {
 const sql = await readFile('turso/migrations/018_onboarding.sql', 'utf8');
 for (const table of ['tenant_onboarding', 'tenant_setup_tokens', 'tenant_demo_seed']) {
  assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`), table);
  assert.match(sql, new RegExp(`${table}\\([^)]*organization_id`), table);
 }
 assert.match(sql, /step_key TEXT NOT NULL CHECK\(step_key IN \('profile','first-client','catalog','quote','team','billing'\)\)/);
 assert.match(sql, /token_hash TEXT NOT NULL UNIQUE/);
 assert.match(sql, /expires_at TEXT NOT NULL/);
 assert.match(sql, /consumed_at TEXT/);
 assert.match(sql, /entity_type TEXT NOT NULL CHECK\(entity_type IN \('client','catalog_item','quote'\)\)/);
});

test('migración 018 respeta las reglas vivas de Turso: sin índices parciales, sin 4+ columnas, sin PRAGMA', async () => {
 const sql = await readFile('turso/migrations/018_onboarding.sql', 'utf8');
 const statements = executableStatements(sql);
 for (const s of statements) assert.doesNotMatch(s, /PRAGMA/i);
 const indexes = [...sql.matchAll(/CREATE (?:UNIQUE )?INDEX IF NOT EXISTS \w+\s+ON \w+\(([^)]+)\)/g)];
 assert.ok(indexes.length > 0, 'la migración define índices');
 for (const [, cols] of indexes) {
  assert.ok(cols.split(',').length <= 3, `índice con más de 3 columnas: ${cols}`);
 }
 assert.doesNotMatch(statements.join('\n'), /CREATE (?:UNIQUE )?INDEX[^;]*WHERE/i);
 assert.doesNotMatch(statements.join('\n'), /ON tenant_catalog_items/i); // Regla viva 2b857e5: Turso rechaza CUALQUIER índice sobre esa tabla.
 assert.ok(statements.length >= 6, `se esperaban al menos 6 sentencias, hay ${statements.length}`);
 for (const s of statements) assert.ok(/^CREATE (TABLE|INDEX)/i.test(s), s.slice(0, 60));
});

test('la migración 018 está cableada en server.mjs y /healthz cuenta sus 3 tablas', async () => {
 const server = await readFile('server.mjs', 'utf8');
 assert.match(server, /'018_onboarding\.sql'/);
 assert.match(server, /tenant_onboarding/);
 assert.match(server, /tenant_setup_tokens/);
 assert.match(server, /tenant_demo_seed/);
 assert.match(server, /schemaReady=tableCount===84/);
});
