-- 011: Client-linked operational dossiers C003; additive, isolated from legacy generic rows.
CREATE TABLE IF NOT EXISTS tenant_client_cases (
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 client_id TEXT NOT NULL,
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 180),
 kind TEXT NOT NULL DEFAULT 'general' CHECK(kind IN ('general','commercial','contract','service','administrative')),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','on_hold','completed')),
 notes TEXT NOT NULL DEFAULT '',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 archived_at TEXT,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,client_id) REFERENCES tenant_client_profiles(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_cases_client ON tenant_client_cases(organization_id,client_id,archived_at,updated_at);
CREATE INDEX IF NOT EXISTS idx_cases_status ON tenant_client_cases(organization_id,status,archived_at);
CREATE TABLE IF NOT EXISTS tenant_case_events (
 organization_id TEXT NOT NULL,
 id TEXT NOT NULL,
 case_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('created','updated','archived','document_added','document_removed')),
 description TEXT NOT NULL DEFAULT '',
 actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,case_id) REFERENCES tenant_client_cases(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_case_events_history ON tenant_case_events(organization_id,case_id,created_at);
