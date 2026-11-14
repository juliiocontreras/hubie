import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {executableStatements} from '../platform/migration-parser.mjs';

const tables=['tenant_suppliers','tenant_supplier_documents','tenant_purchase_orders','tenant_purchase_order_lines',
 'tenant_warehouses','tenant_warehouse_stock','tenant_warehouse_transfers','tenant_cashboxes',
 'tenant_cashbox_movements','tenant_cashbox_counts','tenant_receivables','tenant_payables',
 'tenant_payable_installments','tenant_expense_budgets'];

test('migration 023 creates the fourteen P1-B tables scoped by tenant',async()=>{
 const sql=await readFile('turso/migrations/023_tools_p1b.sql','utf8');
 for(const table of tables){
  assert.match(sql,new RegExp('CREATE TABLE IF NOT EXISTS '+table));
  assert.match(sql,new RegExp(table+'[\\s\\S]{0,300}organization_id TEXT NOT NULL'));
 }
 assert.match(sql,/PRIMARY KEY\(organization_id,id\)/);
 assert.match(sql,/PRIMARY KEY\(organization_id,warehouse_id,item_id\)/);
 assert.match(sql,/UNIQUE\(organization_id,quote_id\)/);
 assert.match(sql,/UNIQUE\(organization_id,category,month\)/);
 assert.match(sql,/status TEXT NOT NULL DEFAULT 'draft' CHECK\(status IN \('draft','sent','partially_received','received','cancelled'\)\)/);
 assert.match(sql,/status TEXT NOT NULL DEFAULT 'pending' CHECK\(status IN \('pending','approved','paid','cancelled'\)\)/);
 assert.match(sql,/payment_terms TEXT NOT NULL DEFAULT 'contado' CHECK\(payment_terms IN \('contado','credito_7','credito_15','credito_30','credito_60'\)\)/);
 assert.match(sql,/direction TEXT NOT NULL CHECK\(direction IN \('in','out'\)\)/);
 assert.match(sql,/ALTER TABLE tenant_expenses ADD COLUMN supplier_id TEXT/);
 assert.match(sql,/FOREIGN KEY\(organization_id,supplier_id\) REFERENCES tenant_suppliers\(organization_id,id\)/);
 assert.match(sql,/FOREIGN KEY\(organization_id,quote_id\) REFERENCES tenant_quotes\(organization_id,id\)/);
});

test('migration 023 uses only indexes Turso accepts live (no WHERE, max 3 columns) and no PRAGMA',async()=>{
 const sql=await readFile('turso/migrations/023_tools_p1b.sql','utf8');
 const body=sql.replace(/^--.*$/gm,'');
 assert.doesNotMatch(body,/CREATE (UNIQUE )?INDEX[^;]*WHERE/i);
 assert.doesNotMatch(body,/^\s*PRAGMA\b/im);
 for(const match of body.matchAll(/CREATE (?:UNIQUE )?INDEX[^;]*ON \w+\(([^)]*)\)/g)){
  assert.ok(match[1].split(',').length<=3,'índice con más de 3 columnas: '+match[0]);
 }
 // La migración la parsea el mismo parser que usa el servidor al arrancar.
 const statements=executableStatements(sql);
 assert.ok(statements.length>=25,'la 023 debe aportar 14 tablas + índices + ALTER, no '+statements.length+' sentencias');
 assert.ok(statements.every(s=>!/^pragma\b/i.test(s)));
 assert.ok(statements.some(s=>s.startsWith('ALTER TABLE tenant_expenses')));
});

test('regla Turso viva 2b857e5: ningún índice sobre tenant_catalog_items en la 023 ni en archivos P1-B',async()=>{
 // El motor en vivo rechaza CUALQUIER índice sobre esa tabla (parcial, 4, 3
 // y 2 columnas), aunque pasen en libsql embebido. La 023 no crea ninguno:
 // las consultas van por organization_id (parte de la PK) y el SKU se
 // valida en código, como ya hace operations-catalog.mjs.
 const sql=await readFile('turso/migrations/023_tools_p1b.sql','utf8');
 assert.doesNotMatch(sql,/CREATE (UNIQUE )?INDEX[^;]*ON tenant_catalog_items/i);
 assert.doesNotMatch(sql,/tenant_catalog_items/);
 for(const file of ['platform/tools-p1b-domain.mjs','platform/operations-suppliers.mjs',
  'platform/operations-purchases.mjs','platform/operations-warehouses.mjs','platform/operations-cashbox.mjs',
  'platform/operations-receivables.mjs','platform/operations-payables.mjs','platform/operations-expenses.mjs',
  'assets/operational-p1b.js']){
  const content=await readFile(file,'utf8');
  assert.doesNotMatch(content,/CREATE (UNIQUE )?INDEX[^;]*ON tenant_catalog_items/i);
 }
});

test('server routes the six P1-B modules plus expense budgets and monthly report',async()=>{
 const server=await readFile('server.mjs','utf8');
 assert.match(server,/operations-suppliers\.mjs/);
 assert.match(server,/operations-purchases\.mjs/);
 assert.match(server,/operations-warehouses\.mjs/);
 assert.match(server,/operations-cashbox\.mjs/);
 assert.match(server,/operations-receivables\.mjs/);
 assert.match(server,/operations-payables\.mjs/);
 assert.match(server,/listExpenseBudgets, *setExpenseBudget, *monthlyExpenseReport/);
 assert.match(server,/workflows\\\/\(suppliers\|purchases\|warehouses\|cashbox\|receivables\|payables\)/);
 assert.match(server,/workflows\\\/expenses\\\/\(budgets\|report\)/);
 assert.match(server,/receivePurchaseOrder\(token,slug,id,body\)/);
 assert.match(server,/transferStock\(token,slug,body\)/);
 assert.match(server,/closeCashbox\(token,slug,id,body\)/);
 assert.match(server,/recordReceivableInstallment\(token,slug,id,body\)/);
 assert.match(server,/setPayableStatus\(token,slug,id,action/);
 // Migración 023 cableada por el integrador (applyCoreSchema + /healthz 72).
 assert.match(server,/'023_tools_p1b\.sql'/);
 assert.match(server,/schemaReady=tableCount===84/);
});

test('operations modules enforce the real rules in SQL, not only in the domain',async()=>{
 const purchases=await readFile('platform/operations-purchases.mjs','utf8');
 assert.match(purchases,/tenant_purchase_orders/);
 assert.match(purchases,/received_quantity=received_quantity\+\?/);
 assert.match(purchases,/received_quantity\+\?<=\s*quantity/);
 assert.match(purchases,/UPDATE tenant_inventory_items SET quantity=quantity\+\?/);
 assert.match(purchases,/INSERT INTO tenant_warehouse_stock/);
 assert.match(purchases,/ON CONFLICT\(organization_id,warehouse_id,item_id\)/);
 const warehouses=await readFile('platform/operations-warehouses.mjs','utf8');
 assert.match(warehouses,/quantity>=\?/);
 assert.match(warehouses,/Insufficient stock/);
 assert.match(warehouses,/tenant_warehouse_transfers/);
 const cashbox=await readFile('platform/operations-cashbox.mjs','utf8');
 assert.match(cashbox,/Cashbox already open/);
 assert.match(cashbox,/tenant_cashbox_counts/);
 assert.match(cashbox,/difference_cents/);
 const receivables=await readFile('platform/operations-receivables.mjs','utf8');
 assert.match(receivables,/status='accepted'/);
 assert.match(receivables,/Receivable already exists/);
 assert.match(receivables,/INSERT INTO tenant_collections/);
 assert.match(receivables,/Receivable has balance/);
 const payables=await readFile('platform/operations-payables.mjs','utf8');
 assert.match(payables,/Purchase order supplier mismatch/);
 assert.match(payables,/Payable has balance/);
 assert.match(payables,/approved_by/);
 const expenses=await readFile('platform/operations-expenses.mjs','utf8');
 assert.match(expenses,/supplier_id/);
 assert.match(expenses,/tenant_expense_budgets/);
 assert.match(expenses,/monthlyExpenseReport/);
 assert.match(expenses,/ON CONFLICT\(organization_id,category,month\)/);
 const suppliers=await readFile('platform/operations-suppliers.mjs','utf8');
 assert.match(suppliers,/Supplier has open purchase orders/);
 assert.match(suppliers,/pwa_media/);
 assert.match(suppliers,/tenant_supplier_documents/);
});

test('migración 023 cableada: applyCoreSchema, /healthz 72 y rutas P1-B en server.mjs',async()=>{
 const server=await readFile('server.mjs','utf8');
 assert.match(server,/'023_tools_p1b\.sql'/);
 assert.match(server,/schemaReady=tableCount===84/);
 for(const table of ['tenant_suppliers','tenant_supplier_documents','tenant_purchase_orders','tenant_purchase_order_lines','tenant_warehouses','tenant_warehouse_stock','tenant_warehouse_transfers','tenant_cashboxes','tenant_cashbox_movements','tenant_cashbox_counts','tenant_receivables','tenant_payables','tenant_payable_installments','tenant_expense_budgets'])assert.match(server,new RegExp("'"+table+"'"));
 assert.match(server,/workflows\\\/\(suppliers\|purchases\|warehouses\|cashbox\|receivables\|payables\)/);
 const workflows=await readFile('assets/app-workflows.js','utf8');
 assert.match(workflows,/operational-p1b\.js/);
 // La demo NO está extendida para estas 6 tools: en ?demo=1 caen en el
 // formulario genérico (decisión documentada del frente, no un olvido).
 const demo=await readFile('assets/demo-backend.js','utf8');
 assert.doesNotMatch(demo,/renderSuppliers|renderPurchases/);
});
