import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(resolve(root, p), 'utf8');
const emoji = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

test('cableado: rutas de búsqueda, notificaciones y barrido en server.mjs', () => {
 const server = read('server.mjs');
 for (const needle of [
  '\\/search$', '/api/admin/tenants/search', '/api/admin/billing/sweep',
  '\\/notifications$', 'read-all', '/api/admin/notifications',
  '/api/admin/notifications/generate'
 ]) assert.ok(server.includes(needle), 'falta ruta ' + needle);
 assert.ok(server.includes('sweepPastDueSuspensions'));
 assert.ok(server.includes('searchTenant'));
 assert.ok(server.includes('generateNotificationsForTenant'));
 assert.ok(server.includes('listAdminNotifications'));
 assert.ok(server.includes('markAllNotificationsRead'));
});

test('C010 real: app-console intercepta C010 y tool-forms ya no tiene su formulario', () => {
 const appConsole = read('assets/app-console.js');
 assert.ok(appConsole.includes("if(id==='C010')return showNotifications();"));
 assert.ok(appConsole.includes('global-search-input'));
 assert.ok(appConsole.includes('notifications-bell'));
 assert.ok(appConsole.includes('createGlobalSearch'));
 assert.ok(appConsole.includes('createTenantNotificationCenter'));
 const toolForms = read('assets/tool-forms.js');
 assert.ok(!toolForms.includes("C010:'"), 'C010 sigue como formulario genérico en tool-forms.js');
});

test('Madre: buscador por servidor y vista de notificaciones cableados', () => {
 const admin = read('assets/admin-console.js');
 assert.ok(admin.includes('searchTenantsServer'));
 assert.ok(admin.includes('/api/admin/tenants/search'));
 assert.ok(admin.includes('renderAdminNotifications'));
 assert.ok(admin.includes('createAdminNotificationCenter'));
 const madre = read('madre/app.html');
 assert.ok(madre.includes('view-notifications'));
 assert.ok(madre.includes('generate-notifications'));
 const appHtml = read('app/index.html');
 assert.ok(appHtml.includes('global-search-input'));
 assert.ok(appHtml.includes('notifications-view'));
 assert.ok(appHtml.includes('notifications-bell'));
});

test('marca: archivos nuevos sin emojis como iconografía y CSS sin barras visibles', () => {
 for (const file of ['assets/search.js', 'assets/notifications.js', 'assets/search.css']) {
  assert.ok(existsSync(resolve(root, file)), 'falta ' + file);
  assert.ok(!emoji.test(read(file)), 'emoji en ' + file);
 }
 const css = read('assets/search.css');
 assert.ok(css.includes('scrollbar-width:none') || css.includes('scrollbar-width: none'));
 assert.ok(css.includes('::-webkit-scrollbar'));
 assert.ok(!/#276d89|color:\s*blue/i.test(css), 'texto azul en search.css');
});

test('demo: búsqueda y notificaciones responden en demo-backend.js', () => {
 const demo = read('assets/demo-backend.js');
 assert.ok(demo.includes('/search'), 'falta ruta de búsqueda en la demo');
 assert.ok(demo.includes('/notifications'), 'falta ruta de notificaciones en la demo');
 assert.ok(demo.includes('/api/admin/tenants/search'));
 assert.ok(demo.includes('/api/admin/billing/sweep'));
 assert.ok(demo.includes('demoGenerate'));
});
