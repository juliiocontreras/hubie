import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { executableStatements } from '../platform/migration-parser.mjs';

async function missing(path){
  try{ await access(path, constants.F_OK); return false; }
  catch{ return true; }
}

// Dead-code front (2026-11-13): contract that the removed legacy files stay
// removed, and that migration 025 drops the dead tenant_domains table.
test('legacy catalogue and mockups removed by the dead-code cleanup stay removed', async()=>{
  for(const path of [
    'data/suites.json',
    'data/tools.json',
    'data/tools_extras.json',
    'data/extras.json',
    'data/insumos.json',
    'data/servicios.json',
    'data/reglas-cobro.json',
    'data/backup/2026-09-01_resumen.md',
    'madre/index.html',
    'template/index.html',
    'panel/index.html',
    'assets/logo hubie.png',
  ]) assert.equal(await missing(path), true, path + ' should not exist');
});

test('migration 025 drops only the dead tenant_domains table, idempotently', async()=>{
  const sql = await readFile('turso/migrations/025_drop_tenant_domains.sql', 'utf8');
  const statements = executableStatements(sql);
  assert.equal(statements.length, 1);
  assert.match(statements[0], /^DROP TABLE IF EXISTS tenant_domains$/i);
});
