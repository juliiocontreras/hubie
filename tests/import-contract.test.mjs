// Contrato de integración (importación + límite de adjuntos): comprueba por
// lectura estática que las rutas, la UI y la migración 017 están cableadas,
// sin levantar Turso. La 017 no crea tablas nuevas (rebuild de pwa_media),
// así que /healthz sigue en 34 tras la 017 (sin tablas nuevas); la 018 lo sube a 37.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {executableStatements} from '../platform/migration-parser.mjs';
import {existsSync} from 'node:fs';

const read=p=>readFile(p,'utf8');

test('rutas de importación y migración existen en server.mjs',async()=>{
 const server=await read('server.mjs');
 assert.match(server,/importClientsCsv,importCatalogCsv,importMigrationJson,importClientsForOrg,importCatalogForOrg,importMigrationForOrg/);
 assert.ok(server.includes('workflows\\/clients\\/import'));
 assert.ok(server.includes('workflows\\/catalog\\/import'));
 assert.ok(server.includes('/migration'));
 assert.ok(server.includes('tenants\\/([0-9a-f-]{36})\\/import'));
 assert.match(server,/maxBytes:600_000/);
 // La migración 017 está cableada en applyCoreSchema (integración hecha);
 // no crea tablas nuevas, así que /healthz sigue en 34 en este punto.
 assert.match(server,/'017_media_limit\.sql'/);
 assert.match(server,/schemaReady=tableCount===84/);
});

test('UI: botón Importar en Clientes y en Catálogo, y Migración en Configuración',async()=>{
 const clients=await read('assets/operational-clients.js');
 assert.match(clients,/Importar clientes desde CSV/);
 assert.match(clients,/workflows\/clients/);
 const commerce=await read('assets/operational-commerce.js');
 assert.match(commerce,/Importar catálogo desde CSV/);
 const console_=await read('assets/app-console.js');
 assert.match(console_,/migration-nav/);
 assert.match(console_,/showMigration/);
 assert.match(console_,/\/migration/);
 const appHtml=await read('app/index.html');
 assert.match(appHtml,/id="migration-nav"/);
 assert.match(appHtml,/id="migration"/);
 const admin=await read('assets/admin-console.js');
 assert.match(admin,/detail-import/);
 assert.match(admin,/renderAdminImport/);
 const madreHtml=await read('madre/app.html');
 assert.match(madreHtml,/id="detail-import"/);
 const importUi=await read('assets/import-ui.js');
 assert.match(importUi,/createImportPanel/);
 assert.match(importUi,/createMigrationPanel/);
});

test('migración 017 existe y no usa índices parciales ni de 4+ columnas ni PRAGMA',async()=>{
 assert.equal(existsSync('turso/migrations/017_media_limit.sql'),true);
 const sql=await read('turso/migrations/017_media_limit.sql');
 assert.match(sql,/size_bytes<=10000000/);
 assert.doesNotMatch(executableStatements(sql).join(';'),/PRAGMA/i);
 assert.ok(executableStatements(sql).filter(s=>/^CREATE INDEX/i.test(s)).every(s=>!/WHERE/i.test(s)));
 assert.doesNotMatch(sql,/018|019|020|021|022|023|024/);
});

test('demo-backend cubre la importación en modo demo',async()=>{
 const demo=await read('assets/demo-backend.js');
 assert.ok(demo.includes('workflows\\/(clients|catalog)\\/import'));
 assert.ok(demo.includes('/migration'));
 assert.ok(demo.includes('admin\\/tenants\\/([a-z0-9-]+)\\/import'));
});

test('migración 017 cableada en applyCoreSchema',async()=>{
 const server=await read('server.mjs');
 assert.match(server,/'017_media_limit\.sql'/);
 assert.match(server,/'016_commerce\.sql','017_media_limit\.sql'/);
});
