import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sql = readFileSync(resolve(root, 'turso/migrations/020_notifications.sql'), 'utf8');

test('migración 020: crea tenant_notifications con las columnas del contrato', () => {
 assert.match(sql, /CREATE TABLE IF NOT EXISTS tenant_notifications\(/);
 for (const col of ['organization_id', 'id', 'user_id', 'type', 'title', 'body', 'link', 'read_at', 'created_at']) {
  assert.ok(sql.includes(col), 'falta columna ' + col);
 }
 assert.ok(sql.includes('PRIMARY KEY(organization_id,id)'), 'la PK empieza por organization_id');
 for (const type of ['quote_expiring', 'appointment_soon', 'payment_overdue', 'subscription_past_due', 'info']) {
  assert.ok(sql.includes("'" + type + "'"), 'falta tipo ' + type);
 }
});

test('migración 020: reglas Turso — sin PRAGMA, sin índices parciales, máx 3 columnas', () => {
 assert.ok(!/^\s*PRAGMA/m.test(sql), 'las migraciones no llevan PRAGMA');
 // Los comentarios explican las reglas; el chequeo de WHERE solo vale
 // sobre las sentencias CREATE INDEX reales, no sobre el texto del archivo.
 const statements = sql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
 const indexes = [...statements.matchAll(/CREATE INDEX IF NOT EXISTS (\w+)\s+ON \w+\(([^)]+)\)/g)];
 assert.ok(indexes.length >= 1, 'se esperan índices de la tabla');
 for (const [, name, cols] of indexes) {
  assert.ok(cols.split(',').length <= 3, 'índice ' + name + ' con más de 3 columnas');
  assert.ok(cols.trim().startsWith('organization_id'), 'índice ' + name + ' no empieza por organization_id');
 }
 assert.ok(!/CREATE (UNIQUE )?INDEX[^;]*WHERE/i.test(statements), 'índice parcial (WHERE) prohibido en Turso');
});

test('regla Turso viva 2026-11-13 (main 2b857e5): ningún archivo de este frente crea índices sobre tenant_catalog_items', () => {
 // El motor en vivo rechaza CUALQUIER índice sobre esa tabla (parcial, 4, 3
 // y 2 columnas); las consultas van por organization_id (parte de la PK) y
 // el SKU se valida en código. Los 2 índices de 016 en esta copia son de la
 // base 28a59f0: main 2b857e5 ya los eliminó; el integrador toma la 016 de main.
 for (const file of ['turso/migrations/020_notifications.sql', 'platform/search.mjs', 'platform/notifications.mjs', 'server.mjs']) {
  const content = readFileSync(resolve(root, file), 'utf8');
  assert.ok(!/CREATE (UNIQUE )?INDEX[^;]*tenant_catalog_items/i.test(content), file + ' crea un índice sobre tenant_catalog_items');
 }
});
