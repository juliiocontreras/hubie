import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createDemoStore} from '../assets/demo-backend.js';
import {catalog} from '../platform/catalog.mjs';
import {ONBOARDING_STEPS} from '../platform/onboarding-store.mjs';

test('la guía de primer uso usa los textos exactos y la marca Hubie, sin emojis ni texto azul', async () => {
 const js = await readFile('assets/onboarding.js', 'utf8');
 // El frontend toma los textos de la API (/onboarding) y los pinta tal cual.
 assert.ok(js.includes('step.title') && js.includes('step.description'));
 // Los textos exactos viven en el store y en su espejo de demo.
 const demo = await readFile('assets/demo-backend.js', 'utf8');
 for (const step of ONBOARDING_STEPS) {
  assert.ok(demo.includes(step.title), step.title);
  assert.ok(demo.includes(step.description), step.key);
 }
 assert.ok(js.includes('Primeros pasos en Hubie'));
 assert.ok(js.includes('Cargar datos de ejemplo'));
 assert.ok(js.includes('Eliminar datos de ejemplo'));
 assert.ok(js.includes('Volver a ver la guía'));
 assert.ok(js.includes('Soporte'));
 assert.ok(js.includes('#16123a') && js.includes('#7c5cfc') && js.includes('#ec4899'));
 assert.ok(js.includes('scrollbar-width:none'));
 // Sin emojis como iconografía (rangos emoji) ni letras/caracteres como iconos.
 assert.doesNotMatch(js, /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
 assert.doesNotMatch(js, /content:\s*['"][⌄∨▾v]['"]/);
 assert.doesNotMatch(js, /color:\s*(blue|#0000ff|#276d89)/i);
 assert.ok(js.includes('checkSvg') || js.includes('M4 12.5l5 5L20 6.5'));
});

test('app-console engancha la guía al abrir la empresa; Madre muestra el owner y el enlace de activación', async () => {
 const appConsole = await readFile('assets/app-console.js', 'utf8');
 assert.match(appConsole, /import \{mountOnboardingGuide\} from '\.\/onboarding\.js'/);
 assert.match(appConsole, /mountOnboardingGuide\(\{api,write,getConfig/);
 const adminConsole = await readFile('assets/admin-console.js', 'utf8');
 assert.match(adminConsole, /Propietario: '\+t\.ownerEmail/);
 assert.match(adminConsole, /Generar enlace de activación/);
 assert.match(adminConsole, /\/api\/admin\/tenants\/'\+state\.selected\+'\/activation-link/);
 const server = await readFile('server.mjs', 'utf8');
 assert.match(server, /\/api\/onboarding\/activate/);
 assert.match(server, /\/onboarding\$\//);
 assert.match(server, /\/demo-data\$\//);
 assert.match(server, /\/activation-link\$\//);
});

test('demo-backend: guía, replay y datos de ejemplo con el mismo contrato que el flujo real', async () => {
 const demo = createDemoStore(catalog);
 const slug = 'comercio-demo';
 const base = '/api/app/' + slug + '/onboarding';
 const fresh = await demo.request(base);
 assert.equal(fresh.total, 6);
 assert.equal(fresh.doneCount, 1); // el demo ya trae 1 cliente
 assert.equal(fresh.steps.find(s => s.key === 'first-client').done, true);
 assert.equal(fresh.steps.find(s => s.key === 'first-client').auto, true);
 assert.equal(fresh.steps.find(s => s.key === 'profile').done, false);
 await assert.rejects(() => demo.request(base, {method: 'POST', body: JSON.stringify({step: 'no-existe'})}), /Invalid onboarding step/);
 const marked = await demo.request(base, {method: 'POST', body: JSON.stringify({step: 'profile'})});
 assert.equal(marked.steps.find(s => s.key === 'profile').done, true);
 const replayed = await demo.request(base, {method: 'POST', body: JSON.stringify({action: 'reset'})});
 assert.equal(replayed.steps.find(s => s.key === 'profile').done, false);
 assert.equal(replayed.steps.find(s => s.key === 'first-client').done, true); // derivado por datos
 // Datos de ejemplo: siembra y borrado en un clic.
 const demoBase = '/api/app/' + slug + '/demo-data';
 const seeded = await demo.request(demoBase, {method: 'POST', body: '{}'});
 assert.equal(seeded.seeded, true);
 assert.equal(seeded.demo.length, 3);
 const afterSeed = await demo.request(base);
 assert.equal(afterSeed.demoSeeded, true);
 assert.equal(afterSeed.steps.find(s => s.key === 'catalog').done, true);
 assert.equal(afterSeed.steps.find(s => s.key === 'quote').done, true);
 const seededAgain = await demo.request(demoBase, {method: 'POST', body: '{}'});
 assert.equal(seededAgain.alreadySeeded, true);
 const clients = await demo.request('/api/app/' + slug + '/workflows/clients');
 assert.ok(clients.clients.some(c => c.name.startsWith('DEMO — ')));
 const quotes = await demo.request('/api/app/' + slug + '/workflows/quotes');
 assert.ok(quotes.quotes.some(q => q.title.startsWith('DEMO — ')));
 const cleared = await demo.request(demoBase, {method: 'DELETE'});
 assert.equal(cleared.removed, 3);
 const afterClear = await demo.request(base);
 assert.equal(afterClear.demoSeeded, false);
 assert.equal(afterClear.steps.find(s => s.key === 'catalog').done, false);
 assert.equal(afterClear.steps.find(s => s.key === 'quote').done, false);
});
