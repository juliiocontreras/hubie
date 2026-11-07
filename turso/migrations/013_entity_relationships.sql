-- 013: Non-destructive, idempotent entity relationships using composite foreign keys.
-- Existing CRM / Agenda free-text rows remain readable; links live in new tables.
CREATE TABLE IF NOT EXISTS tenant_deal_clients (
 organization_id TEXT NOT NULL,
 deal_id TEXT NOT NULL,
 client_id TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,deal_id),
 FOREIGN KEY(organization_id,deal_id) REFERENCES tenant_crm_deals(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY(organization_id,client_id) REFERENCES tenant_client_profiles(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_deal_clients_client ON tenant_deal_clients(organization_id,client_id);
CREATE TABLE IF NOT EXISTS tenant_appointment_links (
 organization_id TEXT NOT NULL,
 appointment_id TEXT NOT NULL,
 client_id TEXT,
 deal_id TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,appointment_id),
 CHECK(client_id IS NOT NULL OR deal_id IS NOT NULL),
 FOREIGN KEY(organization_id,appointment_id) REFERENCES tenant_schedule_events(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY(organization_id,client_id) REFERENCES tenant_client_profiles(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,deal_id) REFERENCES tenant_crm_deals(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_appointment_links_client ON tenant_appointment_links(organization_id,client_id);
CREATE INDEX IF NOT EXISTS idx_appointment_links_deal ON tenant_appointment_links(organization_id,deal_id);
CREATE TABLE IF NOT EXISTS tenant_entity_links (
 organization_id TEXT NOT NULL,
 id TEXT NOT NULL,
 left_tool_id TEXT NOT NULL,
 left_record_id TEXT NOT NULL,
 right_tool_id TEXT NOT NULL,
 right_record_id TEXT NOT NULL,
 relation_type TEXT NOT NULL DEFAULT 'related' CHECK(relation_type IN ('related','depends_on','supports')),
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 UNIQUE(organization_id,left_tool_id,left_record_id,right_tool_id,right_record_id),
 CHECK(left_tool_id<right_tool_id OR (left_tool_id=right_tool_id AND left_record_id<right_record_id)),
 FOREIGN KEY(organization_id,left_tool_id) REFERENCES tenant_tools(organization_id,tool_id),
 FOREIGN KEY(organization_id,right_tool_id) REFERENCES tenant_tools(organization_id,tool_id)
);
CREATE INDEX IF NOT EXISTS idx_entity_links_left ON tenant_entity_links(organization_id,left_tool_id,left_record_id);
CREATE INDEX IF NOT EXISTS idx_entity_links_right ON tenant_entity_links(organization_id,right_tool_id,right_record_id);
