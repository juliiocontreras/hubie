-- 008: Cliente / contacto normalizado por tenant. No toca los registros históricos C001.
CREATE TABLE IF NOT EXISTS tenant_clients (
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 name TEXT NOT NULL,
 company TEXT NOT NULL DEFAULT '',
 email TEXT NOT NULL DEFAULT '',
 phone TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'prospect' CHECK(status IN ('prospect','active','inactive')),
 notes TEXT NOT NULL DEFAULT '',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 archived_at TEXT,
 PRIMARY KEY(organization_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_unique_active_email
 ON tenant_clients(organization_id,email)
 WHERE archived_at IS NULL AND email <> '';
CREATE INDEX IF NOT EXISTS idx_clients_tenant_status
 ON tenant_clients(organization_id,status,archived_at);
