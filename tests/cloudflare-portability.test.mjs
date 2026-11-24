// Portabilidad Cloudflare (Workers): platform/* sin fs.
// (a) platform/catalog.mjs importa assets/catalog.json como módulo JSON
// embebido; (b) platform/records.mjs lleva el SQL de dashboard-counts.sql
// como literal. Ninguno de los dos usa readFileSync: en Workers no hay fs
// y el bundler de Wrangler incluye ambos en el bundle.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {catalog, getSuite, getTool, defaultToolIds} from '../platform/catalog.mjs';
import {dashboardCountsSql} from '../platform/records.mjs';

test('catálogo embebido: idéntico al JSON de assets y congelado', async () => {
 const fromFile = JSON.parse(await readFile(new URL('../assets/catalog.json', import.meta.url), 'utf8'));
 assert.deepEqual(catalog, fromFile);
 assert.ok(Object.isFrozen(catalog));
 assert.ok(Array.isArray(catalog.suites) && catalog.suites.length > 0);
 assert.ok(Array.isArray(catalog.tools) && catalog.tools.length > 0);
 assert.equal(getSuite(catalog.suites[0].id)?.id, catalog.suites[0].id);
 assert.equal(getTool(catalog.tools[0].id)?.id, catalog.tools[0].id);
 assert.equal(getSuite('no-existe'), null);
 assert.equal(getTool('no-existe'), null);
 const included = defaultToolIds();
 assert.ok(included.length > 0 && included.length <= catalog.tools.length);
 assert.ok(included.every(id => getTool(id)?.included));
});

test('SQL del dashboard embebido: copia literal de dashboard-counts.sql', async () => {
 const fromFile = await readFile(new URL('../platform/dashboard-counts.sql', import.meta.url), 'utf8');
 assert.equal(dashboardCountsSql.trim(), fromFile.trim());
 assert.equal(dashboardCountsSql.split('?').length - 1, 7);
 assert.match(dashboardCountsSql, /tenant_tool_records/);
 assert.match(dashboardCountsSql, /HAVING SUM\(metrics\.qty\)>0/);
});

test('catalog.mjs y records.mjs ya no usan fs', async () => {
 for (const file of ['platform/catalog.mjs', 'platform/records.mjs']) {
  const src = await readFile(new URL('../' + file, import.meta.url), 'utf8');
  assert.doesNotMatch(src, /readFileSync/, file);
  assert.doesNotMatch(src, /node:fs/, file);
 }
 const catalogSrc = await readFile(new URL('../platform/catalog.mjs', import.meta.url), 'utf8');
 assert.match(catalogSrc, /catalog\.json'\s+with\s+\{\s*type:\s*'json'\s*\}/);
});
