-- 035: Tool T030 Punto de venta (ventas rápidas con ticket, cobro e IVA).
-- Aditivo; no toca tablas existentes. Precios base SIN IVA: el IVA (16%) se
-- agrega al cobrar, como en T013/billing (quoteTotals). El cobro se registra
-- en tenant_collections (la tabla de T014) y, si el método es efectivo y hay
-- caja abierta, el movimiento va a tenant_cashbox_movements (T016).
-- El descuento de existencias usa tenant_inventory_variants por SKU exacto
-- (C005): si no hay variante para ese SKU, la venta se hace igual y queda
-- el aviso en la respuesta (stock_deducted=0); nunca se bloquea la venta.
-- NOTA Turso: sin índices parciales (WHERE) ni índices de 4+ columnas;
-- máximo 3 columnas por índice, sin PRAGMA (como en 026). El folio es
-- secuencial por tenant (MAX(folio)+1 en platform/pos-store.mjs) con
-- UNIQUE(organization_id,folio) y reintento ante colisión.

CREATE TABLE IF NOT EXISTS tenant_pos_sales(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 folio INTEGER NOT NULL CHECK(folio>=1),
 client_id TEXT,
 client_name TEXT NOT NULL DEFAULT '',
 method TEXT NOT NULL DEFAULT 'efectivo' CHECK(method IN ('efectivo','tarjeta','transferencia')),
 mode TEXT NOT NULL DEFAULT 'para_llevar' CHECK(mode IN ('para_llevar','en_local','a_domicilio')),
 subtotal_cents INTEGER NOT NULL CHECK(subtotal_cents>=0),
 vat_cents INTEGER NOT NULL CHECK(vat_cents>=0),
 total_cents INTEGER NOT NULL CHECK(total_cents>0),
 payment_id TEXT,
 cashbox_id TEXT,
 cashbox_movement_id TEXT,
 status TEXT NOT NULL DEFAULT 'completada' CHECK(status IN ('completada','cancelada')),
 notes TEXT NOT NULL DEFAULT '',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 UNIQUE(organization_id,folio)
);
CREATE INDEX IF NOT EXISTS idx_pos_sales_org_created ON tenant_pos_sales(organization_id,created_at);
CREATE INDEX IF NOT EXISTS idx_pos_sales_org_method ON tenant_pos_sales(organization_id,method);

CREATE TABLE IF NOT EXISTS tenant_pos_sale_lines(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 sale_id TEXT NOT NULL,
 catalog_item_id TEXT NOT NULL,
 variant_id TEXT,
 sku TEXT NOT NULL DEFAULT '',
 name TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity>=1 AND quantity<=10000),
 unit_price_cents INTEGER NOT NULL CHECK(unit_price_cents>=0),
 line_total_cents INTEGER NOT NULL CHECK(line_total_cents>=0),
 stock_deducted INTEGER NOT NULL DEFAULT 0 CHECK(stock_deducted IN (0,1)),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,sale_id) REFERENCES tenant_pos_sales(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pos_sale_lines_org_sale ON tenant_pos_sale_lines(organization_id,sale_id);
