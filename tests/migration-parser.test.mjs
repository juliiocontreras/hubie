import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sqlStatements,executableStatements} from '../platform/migration-parser.mjs';

test('SQL migration ignores comment semicolons before splitting statements',()=>{
 const sql='-- 011; comentario\nCREATE TABLE IF NOT EXISTS sample(id TEXT);\n-- nota; otra\nCREATE INDEX IF NOT EXISTS idx_sample ON sample(id);';
 assert.deepEqual(sqlStatements(sql),['CREATE TABLE IF NOT EXISTS sample(id TEXT)','CREATE INDEX IF NOT EXISTS idx_sample ON sample(id)']);
});
test('SQL migration ignores blank lines and comment-only statements',()=>{
 assert.deepEqual(sqlStatements('-- only\n\n -- another; thing\n'),[]);
});

test('executableStatements quita el PRAGMA pero conserva el resto', () => {
 const sql = `-- comentario con ; punto y coma
PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS organizations (id TEXT PRIMARY KEY);
CREATE INDEX IF NOT EXISTS idx_x ON organizations(id);`;
 assert.deepEqual(sqlStatements(sql), [
  'PRAGMA foreign_keys=ON',
  'CREATE TABLE IF NOT EXISTS organizations (id TEXT PRIMARY KEY)',
  'CREATE INDEX IF NOT EXISTS idx_x ON organizations(id)',
 ]);
 assert.deepEqual(executableStatements(sql), [
  'CREATE TABLE IF NOT EXISTS organizations (id TEXT PRIMARY KEY)',
  'CREATE INDEX IF NOT EXISTS idx_x ON organizations(id)',
 ]);
 // La 001 real ya no aporta ningún PRAGMA al arranque en Turso.
 assert.equal(executableStatements('pragma foreign_keys=ON;').length, 0);
});

test('server: las migraciones son best-effort con el fallo exacto en el log', async () => {
 const server = await readFile('server.mjs', 'utf8');
 assert.match(server, /executableStatements\(sql\)/);
 assert.match(server, /Migration failed: \$\{migration\} #\$\{i\}/);
 assert.match(server, /Migration failures: /);
 assert.match(server, /Core migration failed:/);
 assert.match(server, /QA fixture failed:/);
 assert.doesNotMatch(server, /Core migration \/ QA fixture failed:/);
});

test('server: /healthz reporta cuántas tablas hay, no solo ready/not-ready', async () => {
 const server = await readFile('server.mjs', 'utf8');
 assert.match(server, /let tableCount=0/);
 assert.match(server, /tables:tableCount/);
 assert.match(server, /schemaReady=tableCount===84/);
});
