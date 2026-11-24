// enhanceHtml del Worker (worker/src/enhance.mjs): copia literal de
// server.mjs aplicada al HTML que sale de Workers Static Assets.
import test from 'node:test';
import assert from 'node:assert/strict';
import {enhanceHtml} from '../worker/src/enhance.mjs';

const page = '<!doctype html><html><head><title>X</title>'
 + '<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400&display=swap" rel="stylesheet">'
 + '</head><body><header>viejo</header><main>hola</main>'
 + '<footer>viejo</footer><a href="productos.html">Tienda</a></body></html>';

test('enhanceHtml sustituye header y footer por los compartidos', () => {
 const out = enhanceHtml(page);
 assert.match(out, /hubie-brand/);
 assert.match(out, /hubie-site-footer/);
 assert.doesNotMatch(out, /<header>viejo<\/header>/);
 assert.doesNotMatch(out, /<footer>viejo<\/footer>/);
 assert.match(out, /<main>hola<\/main>/);
});

test('enhanceHtml añade el footer si la página no trae uno', () => {
 const out = enhanceHtml(page.replace('<footer>viejo</footer>', ''));
 assert.match(out, /hubie-site-footer/);
});

test('enhanceHtml reescribe productos.html a shop.html y Nunito a Poppins', () => {
 const out = enhanceHtml(page);
 assert.match(out, /href="\/shop\.html"/);
 assert.doesNotMatch(out, /productos\.html/);
 assert.match(out, /family=Poppins:wght@400;500;600;700;800/);
 assert.doesNotMatch(out, /family=Nunito/);
});

test('enhanceHtml inyecta navigation.css, el script del menú y los JS de catálogo/ambiente', () => {
 const out = enhanceHtml(page);
 assert.match(out, /href="\/assets\/navigation\.css"/);
 assert.match(out, /hubie-menu-toggle/);
 assert.match(out, /src="\/assets\/catalog-ui\.js"/);
 assert.match(out, /src="\/assets\/ambient-motion\.js"/);
});

test('enhanceHtml no duplica el enlace Poppins si ya viene', () => {
 const withPoppins = page.replace(/family=Nunito:[^"']+/,
  'family=Poppins:wght@400;500;600;700;800&display=swap');
 const out = enhanceHtml(withPoppins);
 assert.equal(out.match(/family=Poppins/g).length, 1);
});

test('enhance.mjs es copia literal de server.mjs (nav/header/footer/enhance)', async () => {
 const {readFile} = await import('node:fs/promises');
 const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
 const enhance = await readFile(new URL('../worker/src/enhance.mjs', import.meta.url), 'utf8');
 for (const piece of ['hubie-menu-toggle', 'hubie-navigation', 'hubie-brand',
  'hubie-site-footer', '© 2026 Hubie', 'catalog-ui.js', 'ambient-motion.js',
  'productos', 'family=Poppins']) {
  assert.match(enhance, new RegExp(piece), piece);
  assert.match(server, new RegExp(piece), piece);
 }
 assert.match(enhance, /export function enhanceHtml/);
});
