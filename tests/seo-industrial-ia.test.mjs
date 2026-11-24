import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync, readFileSync} from 'node:fs';
const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');
const ORIGIN = 'https://hubie-pwa-staging.onrender.com';
const PAGES = [
 ['gestion-recursos-saltillo.html', 'Gestión de recursos para la PyME industrial de Saltillo'],
 ['odoo-multitenant.html', 'Multitenant de verdad: todas tus empresas en una sola plataforma'],
 ['ia-para-empresas.html', 'IA para empresas, sin humo: primero ordena tu negocio'],
];
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

function jsonLd(html) {
 const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(m => m[1]);
 assert.ok(blocks.length >= 2, 'se esperaban al menos 2 bloques JSON-LD');
 return blocks.map(b => JSON.parse(b));
}

for (const [file, h1] of PAGES) {
 test(`${file} existe, con canonical al staging y H1`, () => {
  assert.ok(existsSync(new URL(file, root)), `${file} no existe`);
  const html = read(file);
  assert.ok(html.includes(`<link rel="canonical" href="${ORIGIN}/${file}">`), 'canonical al staging');
  assert.ok(html.includes(`<h1 class="h-hero">${h1}</h1>`), 'H1 con la keyword primaria');
 });
 test(`${file} tiene JSON-LD SoftwareApplication y FAQPage válidos`, () => {
  const docs = jsonLd(read(file));
  const types = docs.map(d => d['@type']);
  assert.ok(types.includes('SoftwareApplication'), 'falta SoftwareApplication');
  const faq = docs.find(d => d['@type'] === 'FAQPage');
  assert.ok(faq, 'falta FAQPage');
  assert.equal(faq.mainEntity.length, 6, 'el FAQ debe tener 6 preguntas');
  for (const q of faq.mainEntity) {
   assert.equal(q['@type'], 'Question');
   assert.ok(q.name.length > 5, 'pregunta vacía');
   assert.ok(q.acceptedAnswer.text.length > 20, 'respuesta vacía');
  }
  const app = docs.find(d => d['@type'] === 'SoftwareApplication');
  assert.equal(app.offers.price, '949');
  assert.equal(app.offers.priceCurrency, 'MXN');
 });
 test(`${file} no contiene emojis como iconografía`, () => {
  assert.doesNotMatch(read(file), EMOJI, 'emoji encontrado en la página');
 });
}

test('index.html enlaza a las 3 landings nuevas (sección y pie)', () => {
 const index = read('index.html');
 for (const [file] of PAGES) assert.ok(index.includes(`href="${file}"`), `index no enlaza a ${file}`);
});

test('sitemap.xml lista las 3 landings nuevas', () => {
 const sitemap = read('sitemap.xml');
 for (const [file] of PAGES) assert.ok(sitemap.includes(`${ORIGIN}/${file}`), `sitemap sin ${file}`);
 assert.ok(sitemap.includes('<changefreq>monthly</changefreq>'), 'changefreq monthly');
});

test('odoo-saltillo.html dice 41 herramientas, no 30+', () => {
 const odoo = read('odoo-saltillo.html');
 assert.ok(odoo.includes('41 herramientas'), 'falta el conteo 41');
 assert.doesNotMatch(odoo, /30\+ herramientas/, 'sigue el mock 30+');
 for (const [file] of PAGES) assert.doesNotMatch(read(file), /30\+ herramientas/);
 assert.doesNotMatch(read('index.html'), /30\+ herramientas/);
});

test('ia-para-empresas.html es honesta: hoy no tiene IA, Próximamente sin fechas', () => {
 const ia = read('ia-para-empresas.html');
 assert.match(ia, /Hoy no: Hubie no tiene funciones de inteligencia artificial/, 'falta la frase honesta');
 assert.ok(ia.includes('Próximamente'), 'falta la marca Próximamente');
 assert.doesNotMatch(ia, /con IA/, 'la página afirma IA actual con la frase "con IA"');
 assert.doesNotMatch(ia, /Hubie tiene IA[^?]/, 'la página afirma que Hubie tiene IA');
 assert.doesNotMatch(ia, /potenciado por IA|con inteligencia artificial integrada/i, 'afirmación de IA integrada');
});

test('odoo-multitenant.html enlaza a odoo-saltillo.html y lleva descargo de marca', () => {
 const multi = read('odoo-multitenant.html');
 assert.ok(multi.includes('href="odoo-saltillo.html"'), 'falta el enlace a odoo-saltillo.html');
 assert.ok(multi.includes('Odoo es una marca registrada de Odoo S.A. Hubie no está afiliado'), 'falta el descargo de marca');
});

test('gestion-recursos-saltillo.html dice de frente que Hubie no es un MRP', () => {
 const page = read('gestion-recursos-saltillo.html');
 assert.ok(page.includes('Hubie NO es un MRP'), 'falta el "NO es un MRP" de frente');
 assert.ok(page.includes('Sin PPAP'), 'falta la exclusión de PPAP');
 assert.ok(page.includes('EDI de armadora'), 'falta la exclusión de EDI');
});
