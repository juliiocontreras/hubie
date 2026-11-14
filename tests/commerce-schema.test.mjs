import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('migration 016 creates the six commerce tables scoped by tenant',async()=>{
 const sql=await readFile('turso/migrations/016_commerce.sql','utf8');
 for(const table of ['tenant_quotes','tenant_quote_lines','tenant_catalog_items','tenant_expenses','tenant_collections','tenant_invoices']){
  assert.match(sql,new RegExp('CREATE TABLE IF NOT EXISTS '+table));
  assert.match(sql,new RegExp(table+'[\\s\\S]{0,400}organization_id TEXT NOT NULL'));
 }
 assert.match(sql,/PRIMARY KEY\(organization_id,id\)/);
 assert.match(sql,/status TEXT NOT NULL DEFAULT 'draft' CHECK\(status IN \('draft','sent','accepted','rejected'\)\)/);
 assert.match(sql,/CHECK\(category IN \('insumos','renta','servicios','transporte','marketing','personal','impuestos','otros'\)\)/);
 assert.match(sql,/CHECK\(method IN \('efectivo','transferencia','tarjeta'\)\)/);
 assert.match(sql,/UNIQUE\(organization_id,folio\)/);
 assert.match(sql,/public_token TEXT NOT NULL UNIQUE/);
 const sqlBody=sql.replace(/^--.*$/gm,'');
 assert.doesNotMatch(sqlBody,/stripe/i);
 assert.doesNotMatch(sqlBody,/cfdi|timbrado|sello|SAT/i);
});

test('migration 016 usa solo índices que Turso acepta en vivo (sin WHERE parcial ni 4 columnas)',async()=>{
 const sql=await readFile('turso/migrations/016_commerce.sql','utf8');
 const body=sql.replace(/^--.*$/gm,'');
 // El motor en vivo rechazó el índice único parcial y el de 4 columnas con
 // "invalid expression in CREATE INDEX" (SQL_INPUT_ERROR, 2026-11-13).
 assert.doesNotMatch(body,/CREATE (UNIQUE )?INDEX[^;]*WHERE/i);
 assert.match(body,/CREATE INDEX IF NOT EXISTS idx_catalog_items_tenant_sku\s+ON tenant_catalog_items\(organization_id,sku\)/);
 assert.match(body,/CREATE INDEX IF NOT EXISTS idx_catalog_items_tenant_cat ON tenant_catalog_items\(organization_id,category,active\)/);
 for(const match of body.matchAll(/CREATE (?:UNIQUE )?INDEX[^;]*ON \w+\(([^)]*)\)/g)){
  assert.ok(match[1].split(',').length<=3,'índice con más de 3 columnas: '+match[0]);
 }
 const catalog=await readFile('platform/operations-catalog.mjs','utf8');
 // Sin índice único parcial, el alta valida el SKU activo en código.
 assert.match(catalog,/SELECT id FROM tenant_catalog_items WHERE organization_id=\? AND sku=\? AND archived_at IS NULL LIMIT 1/);
 assert.match(catalog,/throw Error\('Duplicate SKU'\)/);
});

test('server applies migration 016, routes the commerce workflows and exports CSV',async()=>{
 const server=await readFile('server.mjs','utf8');
 assert.match(server,/'016_commerce\.sql'/);
 assert.match(server,/\(quotes\|catalog\|expenses\|payments\|invoices\|reports\)/);
 assert.match(server,/workflows\\?\/reports\\?\/export/);
 assert.match(server,/api\\?\/public\\?\/quotes\\?\//);
 assert.match(server,/tenant_quotes','tenant_quote_lines','tenant_catalog_items','tenant_expenses','tenant_collections','tenant_invoices'/);
 assert.match(server,/===34/); // 24 base + 4 billing (015) + 6 commerce (016)
 assert.doesNotMatch(server,/operations-quotes\.mjs.*stripe|stripe.*operations-quotes/i);
 const health=await readFile('turso/migrations/016_commerce.sql','utf8');
 assert.ok(health.length>1000);
});

test('attachments reuse the existing media store for catalog photos and expense receipts',async()=>{
 const media=await readFile('platform/media-store.mjs','utf8');
 assert.match(media,/'C006':'tenant_catalog_items'/);
 assert.match(media,/'C007':'tenant_expenses'/);
 const policy=await readFile('platform/media-policy.mjs','utf8');
 assert.match(policy,/MAX_ATTACHMENT_BYTES=10_000_000/);
});

test('client routes the six tools to the real operational UI, not the generic form',async()=>{
 const workflows=await readFile('assets/app-workflows.js','utf8');
 for(const [id,fn] of [['C006','renderCatalog'],['C007','renderExpenses'],['T013','renderQuotes'],['T014','renderPayments'],['T015','renderInvoices'],['T020','renderReports']]){
  assert.match(workflows,new RegExp("key==='"+id+"'\\?"+fn));
 }
 const records=await readFile('assets/app-records.js','utf8');
 assert.match(records,/'C006','C007','T013','T014','T015','T020'/);
 const commerce=await readFile('assets/operational-commerce.js','utf8');
 for(const fn of ['renderQuotes','renderCatalog','renderExpenses','renderPayments','renderInvoices','renderReports']){
  assert.match(commerce,new RegExp('export async function '+fn));
 }
 assert.match(commerce,/Sin CFDI \(pendiente PAC\)/);
 assert.match(commerce,/window\.print/);
 assert.match(commerce,/cotizacion\.html\?token=/);
 assert.doesNotMatch(commerce,/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
 const forms=await readFile('assets/tool-forms.js','utf8');
 assert.match(forms,/Factura administrativa sin CFDI \(pendiente PAC\)/);
 assert.match(forms,/Cobro manual registrado fuera de Hubie/);
 const page=await readFile('cotizacion.html','utf8');
 assert.match(page,/\/api\/public\/quotes\//);
 assert.match(page,/Aceptar cotización/);
 assert.match(page,/Rechazar cotización/);
});
