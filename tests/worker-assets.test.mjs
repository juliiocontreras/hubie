// Lista permitida de Assets del Worker (scripts/build-worker-assets.mjs):
// solo lo que server.mjs servía; nunca código, migraciones ni secretos.
import test from 'node:test';
import assert from 'node:assert/strict';
import {access, mkdtemp, readFile, rm, writeFile, mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ROOT_FILES, SUBDIRS, ASSETS_DIR, verifyPublicDir, buildWorkerAssets} from '../scripts/build-worker-assets.mjs';

const repo = new URL('..', import.meta.url).pathname;
const forbidden = /\.(mjs|sql|map)$/i;

test('la lista permitida no incluye nada prohibido', () => {
 const all = [...ROOT_FILES, ...Object.values(SUBDIRS).flat()];
 assert.ok(all.length > 0);
 for (const f of all) {
  assert.doesNotMatch(f, forbidden, f);
  assert.doesNotMatch(f, /^(platform|turso|scripts|tests|docs|node_modules)\//, f);
  assert.doesNotMatch(f, /^package(-lock)?\.json$/, f);
 }
 assert.ok(ROOT_FILES.includes('index.html'));
 assert.ok(ROOT_FILES.includes('invitacion.html'));
 assert.ok(ROOT_FILES.includes('robots.txt'));
 assert.ok(ROOT_FILES.includes('sitemap.xml'));
 assert.deepEqual(SUBDIRS.app, ['index.html', 'manifest.webmanifest', 'sw.js']);
 assert.deepEqual(SUBDIRS.madre, ['app.html', 'manifest.webmanifest', 'sw.js']);
 assert.equal(ASSETS_DIR, 'assets');
});

test('cada archivo de la lista existe en el repo', async () => {
 for (const f of ROOT_FILES) await access(join(repo, f));
 for (const [dir, files] of Object.entries(SUBDIRS)) {
  for (const f of files) await access(join(repo, dir, f));
 }
 await access(join(repo, ASSETS_DIR, 'catalog.json'));
});

test('verifyPublicDir caza un .mjs plantado y pasa con un public limpio', async t => {
 const dir = await mkdtemp(join(tmpdir(), 'hubie-public-'));
 t.after(() => rm(dir, {recursive: true, force: true}));
 await writeFile(join(dir, 'index.html'), '<html></html>');
 assert.deepEqual(await verifyPublicDir(dir), []);
 await writeFile(join(dir, 'x.mjs'), 'export {}');
 const bad = await verifyPublicDir(dir);
 assert.equal(bad.length, 1);
 assert.match(bad[0], /x\.mjs/);
});

test('buildWorkerAssets copia la lista permitida y nada prohibido', async t => {
 const out = await mkdtemp(join(tmpdir(), 'hubie-worker-public-'));
 t.after(() => rm(out, {recursive: true, force: true}));
 const {count} = await buildWorkerAssets({root: repo, out});
 assert.ok(count >= ROOT_FILES.length + 7, `copió ${count}`);
 assert.equal(await readFile(join(out, 'index.html'), 'utf8'),
  await readFile(join(repo, 'index.html'), 'utf8'));
 await access(join(out, 'app', 'sw.js'));
 await access(join(out, 'madre', 'manifest.webmanifest'));
 await access(join(out, 'assets', 'catalog.json'));
 assert.deepEqual(await verifyPublicDir(out), []);
});

test('worker/public del repo está construido (lo que despliega wrangler)', async () => {
 await access(join(repo, 'worker', 'public', 'index.html'));
 await access(join(repo, 'worker', 'public', 'app', 'index.html'));
 await access(join(repo, 'worker', 'public', 'madre', 'app.html'));
 await access(join(repo, 'worker', 'public', 'assets', 'catalog.json'));
 const built = await readFile(join(repo, 'worker', 'public', 'index.html'), 'utf8');
 const live = await readFile(join(repo, 'index.html'), 'utf8');
 assert.equal(built, live, 'worker/public debe reconstruirse con build-worker-assets.mjs');
});
