// Handler fetch del Worker (worker/src/index.js) con Request/Response
// simulados y Assets falsos: routing, puertas (503/405/403), topes de
// cuerpo y mapeo de errores — sin tocar Turso ni la red.
// Los tests corren en orden: primero sin configurar (puerta 503), luego
// con el entorno staging (sin secretos reales) para 405/403/413/401/400.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';

const ORIGIN = 'https://hubie-api.juliiocontreras.workers.dev';
const assetFiles = new Map([
 ['/index.html', '<html><head></head><body><header>viejo</header><p>hola</p></body></html>'],
 ['/admin.html', '<html><head></head><body><header>admin</header></body></html>'],
 ['/invitacion.html', '<html><head></head><body><p>invitación</p></body></html>'],
 ['/assets/pwa-test.js', 'console.log(1)'],
 ['/assets/styles.css', 'body{}']
]);
const env = {ASSETS: {fetch: async req => {
 const path = new URL(req.url).pathname;
 const body = assetFiles.get(path);
 if (body === undefined) return new Response('Not found', {status: 404});
 return new Response(body, {status: 200});
}}};

const call = (path, {method = 'GET', headers = {}, body = null} = {}) =>
 worker.fetch(new Request(ORIGIN + path, {method, headers, body}), env);

test('sin configurar, /healthz es 503 degradado sin tocar la red', async () => {
 for (const v of ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'HUBIE_PUBLIC_ORIGIN',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'HUBIE_INITIAL_ADMIN_EMAIL',
  'HUBIE_AUTH_ENABLED']) delete process.env[v];
 const res = await call('/healthz');
 assert.equal(res.status, 503);
 const data = await res.json();
 assert.equal(data.status, 'degraded');
 assert.equal(data.database, 'not-configured');
 assert.equal(data.setup.readyForLive, false);
 assert.equal(data.tables, 0);
});

test('sin Google configurado, /api/auth/google/start redirige a configuración', async () => {
 const res = await call('/api/auth/google/start');
 assert.equal(res.status, 303);
 assert.equal(res.headers.get('location'), '/auth/configuracion.html');
});

test('sin Stripe, /api/checkout y el webhook dan 503 limpio sin leer el cuerpo', async () => {
 for (const path of ['/api/checkout', '/api/stripe/webhook']) {
  const res = await call(path, {method: 'POST', headers: {'content-type': 'application/json'}, body: '{}'});
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'Stripe no configurado');
 }
});

test('GET / sirve el index con enhanceHtml y caché pública de 300 s', async () => {
 const res = await call('/');
 assert.equal(res.status, 200);
 assert.equal(res.headers.get('content-type'), 'text/html; charset=utf-8');
 assert.equal(res.headers.get('cache-control'), 'public, max-age=300');
 assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
 const text = await res.text();
 assert.match(text, /hubie-brand/);
 assert.match(text, /family=Poppins/);
 assert.doesNotMatch(text, /<header>viejo<\/header>/);
});

test('GET /admin.html es app shell: tal cual y no-store', async () => {
 const res = await call('/admin.html');
 assert.equal(res.status, 200);
 assert.equal(res.headers.get('cache-control'), 'no-store');
 assert.equal(await res.text(), assetFiles.get('/admin.html'));
});

test('GET /invitacion sirve el HTML crudo sin enhance y con no-store', async () => {
 const res = await call('/invitacion');
 assert.equal(res.status, 200);
 assert.equal(res.headers.get('cache-control'), 'no-store');
 assert.equal(await res.text(), assetFiles.get('/invitacion.html'));
});

test('assets PWA van no-store con el MIME de la tabla de server.mjs', async () => {
 const res = await call('/assets/pwa-test.js');
 assert.equal(res.status, 200);
 assert.equal(res.headers.get('cache-control'), 'no-store');
 assert.equal(res.headers.get('content-type'), 'text/javascript; charset=utf-8');
 assert.equal(await res.text(), 'console.log(1)');
});

test('rutas protegidas y estático inexistente dan 404', async () => {
 for (const path of ['/platform/records.mjs', '/tests/x.test.mjs', '/no-existe.html', '/package.json']) {
  assert.equal((await call(path)).status, 404, path);
 }
});

test('HEAD / responde 200 sin cuerpo', async () => {
 const res = await call('/', {method: 'HEAD'});
 assert.equal(res.status, 200);
 assert.equal(await res.text(), '');
});

test('POST /api/leads con datos inválidos da 400 antes de tocar la base', async () => {
 const res = await call('/api/leads', {method: 'POST',
  headers: {'content-type': 'application/json'},
  body: JSON.stringify({nombre: '', email: 'no-es-correo'})});
 assert.equal(res.status, 400);
 assert.equal((await res.json()).error, 'Datos incompletos');
 const badJson = await call('/api/leads', {method: 'POST',
  headers: {'content-type': 'application/json'}, body: '{no-json'});
 assert.equal(badJson.status, 400);
});

// A partir de aquí el entorno staging está configurado (sin secretos
// reales): la puerta readyForLive pasa y se prueban 405/403/413/401/400.
test('entorno staging configurado para el resto de pruebas', () => {
 process.env.TURSO_DATABASE_URL = 'https://127.0.0.1:9/db';
 process.env.TURSO_AUTH_TOKEN = 'test-sin-valor';
 process.env.HUBIE_PUBLIC_ORIGIN = ORIGIN;
 process.env.GOOGLE_CLIENT_ID = 'test-staging-placeholder';
 process.env.GOOGLE_CLIENT_SECRET = 'test-staging-placeholder';
 process.env.HUBIE_INITIAL_ADMIN_EMAIL = 'juliiocontreras@gmail.com';
 process.env.HUBIE_AUTH_ENABLED = 'true';
});

test('método no permitido en /api/app/:slug/config da 405 con Allow', async () => {
 const res = await call('/api/app/demo-slug/config', {method: 'DELETE'});
 assert.equal(res.status, 405);
 assert.equal(res.headers.get('allow'), 'GET');
});

test('mutación sin Origin del Worker da 403 Origin forbidden', async () => {
 const res = await call('/api/app/demo-slug/tools/C001/records', {method: 'POST',
  headers: {'content-type': 'application/json', origin: 'https://evil.example'},
  body: JSON.stringify({title: 'x'})});
 assert.equal(res.status, 403);
 assert.equal((await res.json()).error, 'Origin forbidden');
});

test('tope de cuerpo por defecto (16.000 B) da 413 antes de tocar la base', async () => {
 const big = JSON.stringify({title: 'x'.repeat(20000)});
 assert.ok(big.length > 16000);
 const res = await call('/api/app/demo-slug/tools/C001/records', {method: 'POST',
  headers: {'content-type': 'application/json', origin: ORIGIN}, body: big});
 assert.equal(res.status, 413);
 assert.equal((await res.json()).error, 'Payload too large');
});

test('contenido no JSON da 415 antes de tocar la base', async () => {
 const res = await call('/api/app/demo-slug/tools/C001/records', {method: 'POST',
  headers: {'content-type': 'text/plain', origin: ORIGIN}, body: 'hola'});
 assert.equal(res.status, 415);
 assert.equal((await res.json()).error, 'Unsupported media type');
});

test('GET /api/admin/catalog sin sesión da 401 Unauthorized', async () => {
 const res = await call('/api/admin/catalog');
 assert.equal(res.status, 401);
 assert.equal((await res.json()).error, 'Unauthorized');
});

test('tool de solo lectura (C008) da 400 Read only tool sin tocar la base', async () => {
 const res = await call('/api/app/demo-slug/tools/C008/records', {method: 'POST',
  headers: {'content-type': 'application/json', origin: ORIGIN},
  body: JSON.stringify({title: 'x'})});
 assert.equal(res.status, 400);
 assert.equal((await res.json()).error, 'Read only tool');
});

test('tool inexistente da 404 Not found sin tocar la base', async () => {
 const res = await call('/api/app/demo-slug/tools/C999/records');
 assert.equal(res.status, 404);
 assert.equal((await res.json()).error, 'Not found');
});
