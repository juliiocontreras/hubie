-- 023: Tools P1-B reales (T009 proveedores, T008 compras, T010 almacenes,
-- T016 caja, T017 cuentas por cobrar, T018 cuentas por pagar, C007 presupuestos).
-- Aditivo; no toca tablas existentes salvo una columna nueva en tenant_expenses
-- (supplier_id, sin FK en el ALTER: SQLite/Turso no admite añadir columna con
-- restricciones; la existencia del proveedor se valida en código, como el SKU
-- activo de catálogo en la 016). Moneda siempre en centavos enteros.
-- NOTA Turso 2026-11-13: el motor en vivo rechaza índices parciales (WHERE en
-- CREATE INDEX) e índices de 4+ columnas con SQL_INPUT_ERROR "invalid
-- expression in CREATE INDEX"; por eso todos los índices aquí son de 2-3
-- columnas, sin WHERE, y no hay sentencias PRAGMA.

CREATE TABLE IF NOT EXISTS tenant_suppliers(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 160),
 contact TEXT NOT NULL DEFAULT '',
 email TEXT NOT NULL DEFAULT '',
 phone TEXT NOT NULL DEFAULT '',
 payment_terms TEXT NOT NULL DEFAULT 'contado' CHECK(payment_terms IN ('contado','credito_7','credito_15','credito_30','credito_60')),
 notes TEXT NOT NULL DEFAULT '',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 archived_at TEXT,
 PRIMARY KEY(organization_id,id)
);
CREATE INDEX IF NOT EXISTS idx_suppliers_tenant_name ON tenant_suppliers(organization_id,name,archived_at);

CREATE TABLE IF NOT EXISTS tenant_supplier_documents(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 supplier_id TEXT NOT NULL,
 media_id TEXT NOT NULL,
 document_type TEXT NOT NULL CHECK(length(trim(document_type)) BETWEEN 1 AND 80),
 notes TEXT NOT NULL DEFAULT '',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 archived_at TEXT,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,supplier_id) REFERENCES tenant_suppliers(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY(media_id) REFERENCES pwa_media(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_supplier_docs_supplier ON tenant_supplier_documents(organization_id,supplier_id,archived_at);

CREATE TABLE IF NOT EXISTS tenant_purchase_orders(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 supplier_id TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','partially_received','received','cancelled')),
 notes TEXT NOT NULL DEFAULT '',
 expected_on TEXT,
 total_cents INTEGER NOT NULL DEFAULT 0 CHECK(total_cents>=0),
 received_at TEXT,
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 archived_at TEXT,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,supplier_id) REFERENCES tenant_suppliers(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant_status ON tenant_purchase_orders(organization_id,status,archived_at);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant_supplier ON tenant_purchase_orders(organization_id,supplier_id);

CREATE TABLE IF NOT EXISTS tenant_purchase_order_lines(
 organization_id TEXT NOT NULL,
 purchase_order_id TEXT NOT NULL,
 id TEXT NOT NULL,
 item_id TEXT,
 description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 300),
 quantity INTEGER NOT NULL CHECK(quantity>0 AND quantity<=100000),
 received_quantity INTEGER NOT NULL DEFAULT 0 CHECK(received_quantity>=0),
 unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents>=0 AND unit_price_cents<=100000000000),
 line_total_cents INTEGER NOT NULL CHECK(line_total_cents>=0),
 position INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,purchase_order_id) REFERENCES tenant_purchase_orders(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY(organization_id,item_id) REFERENCES tenant_inventory_items(organization_id,id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_purchase_lines_order ON tenant_purchase_order_lines(organization_id,purchase_order_id,position);

CREATE TABLE IF NOT EXISTS tenant_warehouses(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 120),
 location TEXT NOT NULL DEFAULT '',
 responsible TEXT NOT NULL DEFAULT '',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 archived_at TEXT,
 PRIMARY KEY(organization_id,id)
);
CREATE INDEX IF NOT EXISTS idx_warehouses_tenant_name ON tenant_warehouses(organization_id,name,archived_at);

CREATE TABLE IF NOT EXISTS tenant_warehouse_stock(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 warehouse_id TEXT NOT NULL,
 item_id TEXT NOT NULL,
 quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity>=0),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,warehouse_id,item_id),
 FOREIGN KEY(organization_id,warehouse_id) REFERENCES tenant_warehouses(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY(organization_id,item_id) REFERENCES tenant_inventory_items(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_warehouse_stock_item ON tenant_warehouse_stock(organization_id,item_id,warehouse_id);

CREATE TABLE IF NOT EXISTS tenant_warehouse_transfers(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 from_warehouse_id TEXT NOT NULL,
 to_warehouse_id TEXT NOT NULL,
 item_id TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity>0 AND quantity<=1000000),
 note TEXT NOT NULL DEFAULT '',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,from_warehouse_id) REFERENCES tenant_warehouses(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,to_warehouse_id) REFERENCES tenant_warehouses(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,item_id) REFERENCES tenant_inventory_items(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_org ON tenant_warehouse_transfers(organization_id,created_at);
CREATE INDEX IF NOT EXISTS idx_warehouse_transfers_item ON tenant_warehouse_transfers(organization_id,item_id,created_at);

CREATE TABLE IF NOT EXISTS tenant_cashboxes(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 responsible TEXT NOT NULL CHECK(length(trim(responsible)) BETWEEN 2 AND 160),
 shift TEXT NOT NULL DEFAULT '',
 opening_cents INTEGER NOT NULL CHECK(opening_cents>=0 AND opening_cents<=100000000000),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
 notes TEXT NOT NULL DEFAULT '',
 opened_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 closed_at TEXT,
 closed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 counted_cents INTEGER,
 difference_cents INTEGER,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id)
);
CREATE INDEX IF NOT EXISTS idx_cashboxes_tenant_status ON tenant_cashboxes(organization_id,status,opened_at);

CREATE TABLE IF NOT EXISTS tenant_cashbox_movements(
 organization_id TEXT NOT NULL,
 cashbox_id TEXT NOT NULL,
 id TEXT NOT NULL,
 direction TEXT NOT NULL CHECK(direction IN ('in','out')),
 kind TEXT NOT NULL DEFAULT '',
 amount_cents INTEGER NOT NULL CHECK(amount_cents>0 AND amount_cents<=100000000000),
 source_type TEXT,
 source_id TEXT,
 notes TEXT NOT NULL DEFAULT '',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,cashbox_id) REFERENCES tenant_cashboxes(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_cashbox_movements_box ON tenant_cashbox_movements(organization_id,cashbox_id,created_at);

CREATE TABLE IF NOT EXISTS tenant_cashbox_counts(
 organization_id TEXT NOT NULL,
 cashbox_id TEXT NOT NULL,
 id TEXT NOT NULL,
 counted_cents INTEGER NOT NULL CHECK(counted_cents>=0 AND counted_cents<=100000000000),
 expected_cents INTEGER NOT NULL CHECK(expected_cents>=0),
 difference_cents INTEGER NOT NULL,
 notes TEXT NOT NULL DEFAULT '',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,cashbox_id) REFERENCES tenant_cashboxes(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_cashbox_counts_box ON tenant_cashbox_counts(organization_id,cashbox_id,created_at);

CREATE TABLE IF NOT EXISTS tenant_receivables(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 quote_id TEXT NOT NULL,
 client_id TEXT,
 client_name TEXT NOT NULL DEFAULT '',
 total_cents INTEGER NOT NULL CHECK(total_cents>0 AND total_cents<=100000000000),
 due_on TEXT,
 notes TEXT NOT NULL DEFAULT '',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 archived_at TEXT,
 PRIMARY KEY(organization_id,id),
 UNIQUE(organization_id,quote_id),
 FOREIGN KEY(organization_id,quote_id) REFERENCES tenant_quotes(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY(organization_id,client_id) REFERENCES tenant_client_profiles(organization_id,id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_receivables_tenant_due ON tenant_receivables(organization_id,due_on,archived_at);
CREATE INDEX IF NOT EXISTS idx_receivables_tenant_client ON tenant_receivables(organization_id,client_id);

CREATE TABLE IF NOT EXISTS tenant_payables(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 supplier_id TEXT NOT NULL,
 purchase_order_id TEXT,
 description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 2 AND 300),
 total_cents INTEGER NOT NULL CHECK(total_cents>0 AND total_cents<=100000000000),
 due_on TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','paid','cancelled')),
 approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 approved_at TEXT,
 notes TEXT NOT NULL DEFAULT '',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 archived_at TEXT,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,supplier_id) REFERENCES tenant_suppliers(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,purchase_order_id) REFERENCES tenant_purchase_orders(organization_id,id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_payables_tenant_status ON tenant_payables(organization_id,status,due_on);
CREATE INDEX IF NOT EXISTS idx_payables_tenant_supplier ON tenant_payables(organization_id,supplier_id,archived_at);

CREATE TABLE IF NOT EXISTS tenant_payable_installments(
 organization_id TEXT NOT NULL,
 payable_id TEXT NOT NULL,
 id TEXT NOT NULL,
 amount_cents INTEGER NOT NULL CHECK(amount_cents>0 AND amount_cents<=100000000000),
 paid_on TEXT NOT NULL,
 method TEXT NOT NULL CHECK(method IN ('efectivo','transferencia','tarjeta')),
 reference TEXT NOT NULL DEFAULT '',
 notes TEXT NOT NULL DEFAULT '',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,payable_id) REFERENCES tenant_payables(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_payable_installments_payable ON tenant_payable_installments(organization_id,payable_id,paid_on);

CREATE TABLE IF NOT EXISTS tenant_expense_budgets(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('insumos','renta','servicios','transporte','marketing','personal','impuestos','otros')),
 month TEXT NOT NULL,
 limit_cents INTEGER NOT NULL CHECK(limit_cents>0 AND limit_cents<=100000000000),
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 UNIQUE(organization_id,category,month)
);
CREATE INDEX IF NOT EXISTS idx_expense_budgets_month ON tenant_expense_budgets(organization_id,month,category);

-- C007: gasto ligado a proveedor real (tabla de T009).
ALTER TABLE tenant_expenses ADD COLUMN supplier_id TEXT;
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_supplier ON tenant_expenses(organization_id,supplier_id);
