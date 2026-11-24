-- 028: Tool T023 Contabilidad (plan de cuentas, pólizas/asientos con partida
-- doble, balanza de comprobación, estado de resultados y balance general).
-- Aditivo; no toca tablas existentes ni tenant_catalog_items ni sus índices.
-- NOTA Turso: sin índices parciales (WHERE) ni índices de 4+ columnas; máximo
-- 3 columnas por índice, sin PRAGMA. La unicidad de código de cuenta por
-- tenant y de folio de póliza por tenant se valida con UNIQUE (<=3 columnas);
-- la partida doble balanceada (debe == haber) se valida en código
-- (platform/accounting-store.mjs), como en 024/026.
-- SIN conexión al SAT ni timbrado: cálculo y reportes sobre los movimientos
-- del tenant. Precios base SIN IVA; el IVA se agrega al cobrar (T013/billing).

CREATE TABLE IF NOT EXISTS tenant_accounting_accounts(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 code TEXT NOT NULL CHECK(length(trim(code)) BETWEEN 1 AND 20),
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 160),
 type TEXT NOT NULL CHECK(type IN ('activo','pasivo','capital','ingreso','gasto')),
 nature TEXT NOT NULL CHECK(nature IN ('deudora','acreedora')),
 parent_id TEXT,
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 UNIQUE(organization_id,code),
 FOREIGN KEY(organization_id,parent_id) REFERENCES tenant_accounting_accounts(organization_id,id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_accounting_accounts_org_type ON tenant_accounting_accounts(organization_id,type,code);
CREATE INDEX IF NOT EXISTS idx_accounting_accounts_org_parent ON tenant_accounting_accounts(organization_id,parent_id);

CREATE TABLE IF NOT EXISTS tenant_accounting_entries(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 folio INTEGER NOT NULL CHECK(folio>0),
 entry_date TEXT NOT NULL,
 concept TEXT NOT NULL CHECK(length(trim(concept)) BETWEEN 2 AND 300),
 source_type TEXT NOT NULL DEFAULT 'manual' CHECK(source_type IN ('manual','sales_order','payment','invoice','expense')),
 source_id TEXT,
 status TEXT NOT NULL DEFAULT 'borrador' CHECK(status IN ('borrador','registrada','cancelada')),
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 UNIQUE(organization_id,folio)
);
CREATE INDEX IF NOT EXISTS idx_accounting_entries_org_date ON tenant_accounting_entries(organization_id,entry_date,folio);
CREATE INDEX IF NOT EXISTS idx_accounting_entries_org_status ON tenant_accounting_entries(organization_id,status,entry_date);

CREATE TABLE IF NOT EXISTS tenant_accounting_entry_lines(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 entry_id TEXT NOT NULL,
 account_id TEXT NOT NULL,
 debit_cents INTEGER NOT NULL DEFAULT 0 CHECK(debit_cents>=0 AND debit_cents<=100000000000),
 credit_cents INTEGER NOT NULL DEFAULT 0 CHECK(credit_cents>=0 AND credit_cents<=100000000000),
 memo TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,entry_id) REFERENCES tenant_accounting_entries(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY(organization_id,account_id) REFERENCES tenant_accounting_accounts(organization_id,id) ON DELETE RESTRICT,
 CHECK((debit_cents>0 AND credit_cents=0) OR (credit_cents>0 AND debit_cents=0))
);
CREATE INDEX IF NOT EXISTS idx_accounting_lines_entry ON tenant_accounting_entry_lines(organization_id,entry_id);
CREATE INDEX IF NOT EXISTS idx_accounting_lines_account ON tenant_accounting_entry_lines(organization_id,account_id);
