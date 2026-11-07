-- 006: Operational records for all tools, strictly partitioned by organization.
-- No destructive changes to existing tenant tables.
CREATE TABLE IF NOT EXISTS tenant_tool_records (
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 tool_id TEXT NOT NULL,
 title TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'active',
 fields_json TEXT NOT NULL DEFAULT '{}',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 archived_at TEXT,
 PRIMARY KEY (organization_id,id),
 FOREIGN KEY (organization_id,tool_id) REFERENCES tenant_tools(organization_id,tool_id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_tool_records_list ON tenant_tool_records(organization_id,tool_id,archived_at,created_at);
