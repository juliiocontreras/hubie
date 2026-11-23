-- 027 — Columnas faltantes de tenant_catalog_items.
--
-- La 002 creó la tabla en forma reducida (id, organization_id, name,
-- price_cents, active) y la 016 la redefinió completa (sku, description,
-- category, created_by, created_at, updated_at, archived_at) con
-- CREATE TABLE IF NOT EXISTS — que es no-op porque la tabla ya existía.
-- Ninguna migración añadió las columnas después, así que en una base
-- fresca el tool C006 (Catálogo), la importación (import-store) y la
-- siembra de datos demo (seedDemoData) fallaban con
-- "no such column: sku" / "table tenant_catalog_items has no column
-- named sku". Detectado en la verificación multitenant 2026-11-23.
--
-- Se añaden con ALTER TABLE ADD COLUMN con los mismos tipos y DEFAULT
-- que la 016 (NOT NULL con DEFAULT es válido para filas existentes).
-- Si la base ya tiene las columnas (p. ej. una base construida a mano),
-- cada ALTER falla con 'duplicate column name', que el runner de
-- server.mjs tolera como "ya aplicada" (mismo patrón que la 023).
ALTER TABLE tenant_catalog_items ADD COLUMN sku TEXT NOT NULL DEFAULT '';
ALTER TABLE tenant_catalog_items ADD COLUMN description TEXT NOT NULL DEFAULT '';
ALTER TABLE tenant_catalog_items ADD COLUMN category TEXT NOT NULL DEFAULT 'General' CHECK(length(trim(category)) BETWEEN 1 AND 80);
ALTER TABLE tenant_catalog_items ADD COLUMN created_by TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tenant_catalog_items ADD COLUMN created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE tenant_catalog_items ADD COLUMN updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE tenant_catalog_items ADD COLUMN archived_at TEXT;
