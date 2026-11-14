-- 016: Commerce tools reales (T013 cotizaciones, C006 catálogo, C007 gastos,
-- T014 cobros manuales, T015 facturación administrativa sin CFDI).
-- Aditivo; no toca billing/Stripe ni tablas existentes. La 015 queda reservada
-- para el trabajo de Stripe en paralelo.
-- Moneda siempre en centavos enteros; IVA configurable por cotización/factura.

CREATE TABLE IF NOT EXISTS tenant_quotes(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 client_id TEXT,
 client_name TEXT NOT NULL DEFAULT '',
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 2 AND 180),
 notes TEXT NOT NULL DEFAULT '',
 vat_rate INTEGER NOT NULL DEFAULT 16 CHECK(vat_rate IN (0,8,16)),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','sent','accepted','rejected')),
 valid_until TEXT,
 subtotal_cents INTEGER NOT NULL DEFAULT 0 CHECK(subtotal_cents>=0),
 vat_cents INTEGER NOT NULL DEFAULT 0 CHECK(vat_cents>=0),
 total_cents INTEGER NOT NULL DEFAULT 0 CHECK(total_cents>=0),
 public_token TEXT NOT NULL UNIQUE,
 accepted_at TEXT,
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 archived_at TEXT,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,client_id) REFERENCES tenant_client_profiles(organization_id,id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_quotes_tenant_status ON tenant_quotes(organization_id,status,archived_at);
CREATE INDEX IF NOT EXISTS idx_quotes_tenant_client ON tenant_quotes(organization_id,client_id);

CREATE TABLE IF NOT EXISTS tenant_quote_lines(
 organization_id TEXT NOT NULL,
 quote_id TEXT NOT NULL,
 id TEXT NOT NULL,
 description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 300),
 quantity INTEGER NOT NULL CHECK(quantity>0 AND quantity<=100000),
 unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents>=0 AND unit_price_cents<=100000000000),
 line_total_cents INTEGER NOT NULL CHECK(line_total_cents>=0),
 position INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,quote_id) REFERENCES tenant_quotes(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_quote_lines_quote ON tenant_quote_lines(organization_id,quote_id,position);

CREATE TABLE IF NOT EXISTS tenant_catalog_items(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 sku TEXT NOT NULL DEFAULT '',
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 180),
 description TEXT NOT NULL DEFAULT '',
 price_cents INTEGER NOT NULL CHECK(price_cents>=0 AND price_cents<=100000000000),
 category TEXT NOT NULL DEFAULT 'General' CHECK(length(trim(category)) BETWEEN 1 AND 80),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 archived_at TEXT,
 PRIMARY KEY(organization_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_catalog_items_unique_active_sku
 ON tenant_catalog_items(organization_id,sku)
 WHERE archived_at IS NULL AND sku <> '';
CREATE INDEX IF NOT EXISTS idx_catalog_items_tenant_cat ON tenant_catalog_items(organization_id,category,active,archived_at);

CREATE TABLE IF NOT EXISTS tenant_expenses(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 occurred_on TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('insumos','renta','servicios','transporte','marketing','personal','impuestos','otros')),
 description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 2 AND 300),
 amount_cents INTEGER NOT NULL CHECK(amount_cents>0 AND amount_cents<=100000000000),
 vendor TEXT NOT NULL DEFAULT '',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 archived_at TEXT,
 PRIMARY KEY(organization_id,id)
);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_date ON tenant_expenses(organization_id,occurred_on,archived_at);
CREATE INDEX IF NOT EXISTS idx_expenses_tenant_cat ON tenant_expenses(organization_id,category,occurred_on);

CREATE TABLE IF NOT EXISTS tenant_collections(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 quote_id TEXT,
 client_id TEXT,
 client_name TEXT NOT NULL DEFAULT '',
 amount_cents INTEGER NOT NULL CHECK(amount_cents>0 AND amount_cents<=100000000000),
 paid_on TEXT NOT NULL,
 method TEXT NOT NULL CHECK(method IN ('efectivo','transferencia','tarjeta')),
 reference TEXT NOT NULL DEFAULT '',
 notes TEXT NOT NULL DEFAULT '',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 archived_at TEXT,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,quote_id) REFERENCES tenant_quotes(organization_id,id) ON DELETE SET NULL,
 FOREIGN KEY(organization_id,client_id) REFERENCES tenant_client_profiles(organization_id,id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_quote ON tenant_collections(organization_id,quote_id,archived_at);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_date ON tenant_collections(organization_id,paid_on,archived_at);

CREATE TABLE IF NOT EXISTS tenant_invoices(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 folio INTEGER NOT NULL CHECK(folio>0),
 quote_id TEXT,
 client_name TEXT NOT NULL DEFAULT '',
 rfc TEXT NOT NULL DEFAULT '',
 items_json TEXT NOT NULL DEFAULT '[]',
 subtotal_cents INTEGER NOT NULL DEFAULT 0 CHECK(subtotal_cents>=0),
 vat_cents INTEGER NOT NULL DEFAULT 0 CHECK(vat_cents>=0),
 total_cents INTEGER NOT NULL DEFAULT 0 CHECK(total_cents>=0),
 vat_rate INTEGER NOT NULL DEFAULT 16 CHECK(vat_rate IN (0,8,16)),
 status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued','cancelled')),
 notes TEXT NOT NULL DEFAULT '',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 archived_at TEXT,
 PRIMARY KEY(organization_id,id),
 UNIQUE(organization_id,folio),
 FOREIGN KEY(organization_id,quote_id) REFERENCES tenant_quotes(organization_id,id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_status ON tenant_invoices(organization_id,status,archived_at);
