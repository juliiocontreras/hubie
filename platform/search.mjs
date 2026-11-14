import {executeSql} from '../database.mjs';
import {statusAfterGrace, BILLING_STATUS_LABELS} from './billing-domain.mjs';
// Búsqueda global por tenant (P0) + buscador de empresas de Madre.
// LIKE con ESCAPE: los caracteres %, _ y \ de la consulta se tratan como
// literales, nunca como comodines. Scope estricto por tenant en cada
// consulta (organization_id=? siempre) y límite 10 por módulo.
const db = deps => ({sql: deps?.executeSql ?? executeSql});
export const PER_MODULE_LIMIT = 10;
export const ADMIN_SEARCH_LIMIT = 20;
export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 100;

export function normalizeSearchQuery(raw) {
 if (typeof raw !== 'string') throw Error('Invalid search query');
 const query = raw.trim().replace(/\s+/g, ' ');
 if (query.length < MIN_QUERY_LENGTH || query.length > MAX_QUERY_LENGTH) throw Error('Invalid search query');
 return query;
}
export function escapeLike(value) {
 return String(value).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}
export function likePattern(query) {
 return '%' + escapeLike(query) + '%';
}
const rows = r => r?.rows?.map(row => row.map(x => x?.value ?? null)) ?? [];

// Módulos buscables: tabla, herramienta que los habilita, campos LIKE y
// cómo se presenta cada fila. El enlace es la ruta de la PWA de cliente con
// el módulo y el registro, que assets/search.js interpreta con showTool.
const MODULES = [
 {module: 'clients', toolId: 'C001', label: 'Clientes',
  sql: `SELECT id,name,company,email FROM tenant_client_profiles WHERE organization_id=? AND archived_at IS NULL AND (name LIKE ? ESCAPE '\\' OR company LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\') ORDER BY updated_at DESC LIMIT ${PER_MODULE_LIMIT}`,
  map: (r, slug) => ({id: r[0], title: r[1], detail: [r[2], r[3]].filter(Boolean).join(' · ') || 'Contacto registrado', link: '/app/?tenant=' + slug + '&tool=C001&record=' + r[0]})},
 {module: 'quotes', toolId: 'T013', label: 'Cotizaciones',
  sql: `SELECT id,title,client_name,status,valid_until FROM tenant_quotes WHERE organization_id=? AND archived_at IS NULL AND (title LIKE ? ESCAPE '\\' OR client_name LIKE ? ESCAPE '\\') ORDER BY updated_at DESC LIMIT ${PER_MODULE_LIMIT}`,
  map: (r, slug) => ({id: r[0], title: r[1], detail: [r[2], r[3]].filter(Boolean).join(' · ') + (r[4] ? ' · vence ' + r[4] : ''), link: '/app/?tenant=' + slug + '&tool=T013&record=' + r[0]})},
 {module: 'catalog', toolId: 'C006', label: 'Catálogo',
  sql: `SELECT id,name,sku,price_cents FROM tenant_catalog_items WHERE organization_id=? AND archived_at IS NULL AND (name LIKE ? ESCAPE '\\' OR sku LIKE ? ESCAPE '\\') ORDER BY name LIMIT ${PER_MODULE_LIMIT}`,
  map: (r, slug) => ({id: r[0], title: r[1], detail: [r[2], r[3] != null ? '$' + (Number(r[3]) / 100).toLocaleString('es-MX') : null].filter(Boolean).join(' · '), link: '/app/?tenant=' + slug + '&tool=C006&record=' + r[0]})},
 {module: 'expenses', toolId: 'C007', label: 'Gastos',
  sql: `SELECT id,description,vendor,amount_cents,occurred_on FROM tenant_expenses WHERE organization_id=? AND archived_at IS NULL AND (description LIKE ? ESCAPE '\\' OR vendor LIKE ? ESCAPE '\\') ORDER BY occurred_on DESC LIMIT ${PER_MODULE_LIMIT}`,
  map: (r, slug) => ({id: r[0], title: r[1], detail: [r[2], r[3] != null ? '$' + (Number(r[3]) / 100).toLocaleString('es-MX') : null, r[4]].filter(Boolean).join(' · '), link: '/app/?tenant=' + slug + '&tool=C007&record=' + r[0]})},
 {module: 'cases', toolId: 'C003', label: 'Expedientes',
  sql: `SELECT c.id,c.title,p.name FROM tenant_client_cases c JOIN tenant_client_profiles p ON p.organization_id=c.organization_id AND p.id=c.client_id WHERE c.organization_id=? AND c.archived_at IS NULL AND (c.title LIKE ? ESCAPE '\\' OR p.name LIKE ? ESCAPE '\\') ORDER BY c.updated_at DESC LIMIT ${PER_MODULE_LIMIT}`,
  map: (r, slug) => ({id: r[0], title: r[1], detail: r[2] || 'Expediente', link: '/app/?tenant=' + slug + '&tool=C003&record=' + r[0]})},
 {module: 'agenda', toolId: 'C004', label: 'Agenda',
  sql: `SELECT id,title,customer,starts_at FROM tenant_schedule_events WHERE organization_id=? AND (title LIKE ? ESCAPE '\\' OR customer LIKE ? ESCAPE '\\') ORDER BY starts_at DESC LIMIT ${PER_MODULE_LIMIT}`,
  map: (r, slug) => ({id: r[0], title: r[1], detail: [r[2], r[3] ? new Date(r[3]).toLocaleString('es-MX', {dateStyle: 'medium', timeStyle: 'short'}) : null].filter(Boolean).join(' · '), link: '/app/?tenant=' + slug + '&tool=C004&record=' + r[0]})},
 {module: 'crm', toolId: 'C002', label: 'CRM',
  sql: `SELECT id,title,customer,stage FROM tenant_crm_deals WHERE organization_id=? AND archived_at IS NULL AND (title LIKE ? ESCAPE '\\' OR customer LIKE ? ESCAPE '\\') ORDER BY updated_at DESC LIMIT ${PER_MODULE_LIMIT}`,
  map: (r, slug) => ({id: r[0], title: r[1], detail: [r[2], r[3]].filter(Boolean).join(' · '), link: '/app/?tenant=' + slug + '&tool=C002&record=' + r[0]})},
 {module: 'inventory', toolId: 'C005', label: 'Inventario',
  sql: `SELECT id,sku,title,quantity FROM tenant_inventory_items WHERE organization_id=? AND archived_at IS NULL AND (title LIKE ? ESCAPE '\\' OR sku LIKE ? ESCAPE '\\') ORDER BY sku LIMIT ${PER_MODULE_LIMIT}`,
  map: (r, slug) => ({id: r[0], title: r[2], detail: [r[1], 'Existencias: ' + Number(r[3])].filter(Boolean).join(' · '), link: '/app/?tenant=' + slug + '&tool=C005&record=' + r[0]})}
];
export const SEARCH_MODULE_LABELS = Object.fromEntries(MODULES.map(m => [m.module, m.label]));

export async function searchTenant(organizationId, slug, rawQuery, deps = {}, {enabledTools = null} = {}) {
 const query = normalizeSearchQuery(rawQuery);
 if (!organizationId || typeof slug !== 'string' || !slug) throw Error('Invalid search query');
 const pattern = likePattern(query);
 const enabled = enabledTools == null ? null : new Set(enabledTools);
 const groups = [];
 let total = 0;
 for (const mod of MODULES) {
  if (enabled && !enabled.has(mod.toolId)) continue;
  const likeCount = (mod.sql.match(/LIKE \?/g) || []).length;
  const result = await db(deps).sql(mod.sql, [organizationId, ...Array(likeCount).fill(pattern)]);
  const items = rows(result).map(r => ({...mod.map(r, slug), toolId: mod.toolId, module: mod.module}));
  if (items.length) { groups.push({module: mod.module, toolId: mod.toolId, label: mod.label, items}); total += items.length; }
 }
 return {query, total, groups};
}

// Buscador de empresas de Madre: nombre, slug o correo del owner, con el
// estado de cobro efectivo (past_due con gracia vencida ya se ve suspended).
export async function searchTenants(rawQuery, deps = {}) {
 const query = normalizeSearchQuery(rawQuery);
 const pattern = likePattern(query);
 const result = await db(deps).sql(
  `SELECT o.id,o.slug,o.name,s.status,s.past_due_since,
   (SELECT u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=o.id AND m.role='owner' AND m.status='active' LIMIT 1)
   FROM organizations o LEFT JOIN tenant_subscriptions s ON s.organization_id=o.id
   WHERE o.name LIKE ? ESCAPE '\\' OR o.slug LIKE ? ESCAPE '\\'
   OR EXISTS (SELECT 1 FROM memberships m2 JOIN users u2 ON u2.id=m2.user_id WHERE m2.organization_id=o.id AND u2.email LIKE ? ESCAPE '\\')
   ORDER BY o.name LIMIT ${ADMIN_SEARCH_LIMIT}`,
  [pattern, pattern, pattern]);
 return {
  query,
  tenants: rows(result).map(r => {
   const status = r[3] ?? 'none';
   const effectiveStatus = statusAfterGrace(status, r[4] ?? null);
   return {
    id: r[0], slug: r[1], name: r[2], ownerEmail: r[5] ?? null,
    billingStatus: effectiveStatus, billingStatusLabel: BILLING_STATUS_LABELS[effectiveStatus],
    pastDueSince: r[4] ?? null
   };
  })
 };
}
