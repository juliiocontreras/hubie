-- 029: Tool T024 Pedidos de venta (pedidos desde cotización aceptada de T013,
-- con entrega, conversión a cobro T014, a factura T015 y opcionalmente a CxC
-- T017). Aditivo; no toca tablas existentes ni tenant_catalog_items ni sus
-- índices. NO duplica cotizaciones ni facturación: el pedido copia las
-- partidas de la cotización (como createInvoice en operations-invoices.mjs)
-- y orquesta lo que ya existe.
-- NOTA Turso: sin índices parciales (WHERE) ni índices de 4+ columnas; máximo
-- 3 columnas por índice, sin PRAGMA. La unicidad de folio de pedido por
-- tenant se valida con UNIQUE (<=3 columnas); que haya un solo pedido activo
-- por cotización se valida en código (platform/sales-orders-store.mjs), como
-- en 024/026. Precios base SIN IVA; el IVA se agrega al cobrar (T013/billing).

CREATE TABLE IF NOT EXISTS tenant_sales_orders(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 folio INTEGER NOT NULL CHECK(folio>0),
 quote_id TEXT NOT NULL,
 client_id TEXT,
 client_name TEXT NOT NULL DEFAULT '',
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 2 AND 180),
 subtotal_cents INTEGER NOT NULL DEFAULT 0 CHECK(subtotal_cents>=0),
 vat_cents INTEGER NOT NULL DEFAULT 0 CHECK(vat_cents>=0),
 total_cents INTEGER NOT NULL DEFAULT 0 CHECK(total_cents>=0),
 vat_rate INTEGER NOT NULL DEFAULT 16 CHECK(vat_rate IN (0,8,16)),
 status TEXT NOT NULL DEFAULT 'borrador' CHECK(status IN ('borrador','confirmado','en preparación','enviado','entregado','cancelado')),
 delivery_date TEXT,
 carrier TEXT NOT NULL DEFAULT '',
 tracking_code TEXT NOT NULL DEFAULT '',
 notes TEXT NOT NULL DEFAULT '',
 invoice_id TEXT,
 receivable_id TEXT,
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 UNIQUE(organization_id,folio),
 FOREIGN KEY(organization_id,quote_id) REFERENCES tenant_quotes(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,client_id) REFERENCES tenant_client_profiles(organization_id,id) ON DELETE SET NULL,
 FOREIGN KEY(organization_id,invoice_id) REFERENCES tenant_invoices(organization_id,id) ON DELETE SET NULL,
 FOREIGN KEY(organization_id,receivable_id) REFERENCES tenant_receivables(organization_id,id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_sales_orders_org_status ON tenant_sales_orders(organization_id,status,folio);
CREATE INDEX IF NOT EXISTS idx_sales_orders_org_quote ON tenant_sales_orders(organization_id,quote_id,status);
CREATE INDEX IF NOT EXISTS idx_sales_orders_org_client ON tenant_sales_orders(organization_id,client_id,folio);

CREATE TABLE IF NOT EXISTS tenant_sales_order_lines(
 organization_id TEXT NOT NULL,
 order_id TEXT NOT NULL,
 id TEXT NOT NULL,
 description TEXT NOT NULL CHECK(length(trim(description)) BETWEEN 1 AND 300),
 quantity INTEGER NOT NULL CHECK(quantity>0 AND quantity<=100000),
 unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents>=0 AND unit_price_cents<=100000000000),
 line_total_cents INTEGER NOT NULL CHECK(line_total_cents>=0),
 position INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,order_id) REFERENCES tenant_sales_orders(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sales_order_lines_order ON tenant_sales_order_lines(organization_id,order_id,position);
