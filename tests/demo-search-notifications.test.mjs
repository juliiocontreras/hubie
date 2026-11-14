import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemoStore} from '../assets/demo-backend.js';
import {catalog} from '../platform/catalog.mjs';

// Demo de búsqueda + notificaciones: mismo contrato que la API real.
// Incluye la regresión de la ruta /api/admin/tenants/search, que la ruta
// genérica /api/admin/tenants/:id tragaba como id 'search' (404).
test('demo: búsqueda global por tenant agrupa por módulo y respeta el tenant', async () => {
 const demo = createDemoStore(catalog);
 const result = await demo.request('/api/app/comercio-demo/search?q=ejemplo');
 assert.equal(result.query, 'ejemplo');
 assert.ok(result.total >= 1);
 assert.ok(result.groups.some(g => g.module === 'clients'));
 const other = await demo.request('/api/app/consultoria-demo/search?q=ejemplo');
 assert.ok(!other.groups.flatMap(g => g.items).some(i => i.title === 'Contacto de ejemplo'));
 await assert.rejects(() => demo.request('/api/app/comercio-demo/search?q=x'), /Invalid search query/);
});

test('demo: centro de notificaciones con semilla, marcar leída y todas leídas', async () => {
 const demo = createDemoStore(catalog);
 const first = await demo.request('/api/app/comercio-demo/notifications');
 assert.equal(first.unread, 1);
 assert.equal(first.notifications[0].type, 'info');
 await demo.request('/api/app/comercio-demo/notifications/' + first.notifications[0].id + '/read', {method: 'POST'});
 const after = await demo.request('/api/app/comercio-demo/notifications');
 assert.equal(after.unread, 0);
});

test('demo: buscador de Madre no se confunde con un id de tenant', async () => {
 const demo = createDemoStore(catalog);
 const result = await demo.request('/api/admin/tenants/search?q=comercio-demo');
 assert.equal(result.tenants.length, 1);
 assert.equal(result.tenants[0].slug, 'comercio-demo');
 assert.equal(result.tenants[0].billingStatus, 'none');
 // Por correo del owner coinciden las dos demos (mismo superadmin ficticio).
 const byOwner = await demo.request('/api/admin/tenants/search?q=ejemplo.invalid');
 assert.equal(byOwner.tenants.length, 2);
 const admin = await demo.request('/api/admin/notifications');
 assert.equal(admin.unread, 1);
 const generated = await demo.request('/api/admin/notifications/generate', {method: 'POST'});
 assert.equal(generated.tenants, 2);
 const sweep = await demo.request('/api/admin/billing/sweep', {method: 'POST'});
 assert.deepEqual(sweep, {checked: 0, suspended: [], suspendedCount: 0});
});
