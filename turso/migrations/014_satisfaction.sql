-- 014: Satisfaction survey Tool T021. Additive, no changes to existing company records.
CREATE TABLE IF NOT EXISTS tenant_surveys(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 4 AND 140),
 questions_json TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','closed')),
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id)
);
CREATE INDEX IF NOT EXISTS idx_surveys_tenant ON tenant_surveys(organization_id,created_at);
CREATE TABLE IF NOT EXISTS tenant_survey_invitations(
 organization_id TEXT NOT NULL,
 id TEXT NOT NULL,
 survey_id TEXT NOT NULL,
 client_id TEXT,
 deal_id TEXT,
 token_hash TEXT NOT NULL UNIQUE,
 expires_at TEXT NOT NULL,
 used_at TEXT,
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,survey_id) REFERENCES tenant_surveys(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY(organization_id,client_id) REFERENCES tenant_client_profiles(organization_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(organization_id,deal_id) REFERENCES tenant_crm_deals(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_survey_invites_survey ON tenant_survey_invitations(organization_id,survey_id);
CREATE TABLE IF NOT EXISTS tenant_survey_responses(
 organization_id TEXT NOT NULL,
 id TEXT NOT NULL,
 invitation_id TEXT NOT NULL,
 survey_id TEXT NOT NULL,
 answers_json TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 UNIQUE(organization_id,invitation_id),
 FOREIGN KEY(organization_id,invitation_id) REFERENCES tenant_survey_invitations(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY(organization_id,survey_id) REFERENCES tenant_surveys(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_survey_responses ON tenant_survey_responses(organization_id,survey_id,created_at);
