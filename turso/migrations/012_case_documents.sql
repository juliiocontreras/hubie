-- 012: C003 document taxonomy and immutable binary revisions. Additive; no existing media erased.
CREATE TABLE IF NOT EXISTS tenant_case_documents (
 organization_id TEXT NOT NULL,
 id TEXT NOT NULL,
 case_id TEXT NOT NULL,
 document_type TEXT NOT NULL DEFAULT 'other' CHECK(document_type IN ('other','contract','identification','invoice','consent','certificate')),
 expires_on TEXT CHECK(expires_on IS NULL OR (length(expires_on)=10 AND expires_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')),
 latest_version INTEGER NOT NULL DEFAULT 0 CHECK(latest_version>=0),
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,case_id) REFERENCES tenant_client_cases(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_case_documents_case ON tenant_case_documents(organization_id,case_id,expires_on);
CREATE TABLE IF NOT EXISTS tenant_case_document_versions (
 organization_id TEXT NOT NULL,
 document_id TEXT NOT NULL,
 media_id TEXT NOT NULL UNIQUE REFERENCES pwa_media(id) ON DELETE CASCADE,
 version INTEGER NOT NULL CHECK(version>=1),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,document_id,version),
 FOREIGN KEY(organization_id,document_id) REFERENCES tenant_case_documents(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_case_document_versions_media ON tenant_case_document_versions(media_id);
