-- 034: Tool T029 Marketing (campañas, segmentos y registro de envíos).
-- Aditivo; no toca tablas existentes. Los segmentos se construyen solo con
-- campos que existen en tenant_client_profiles (C001): status
-- (prospect/active/inactive) y company (texto libre). No hay ciudad ni
-- etiquetas en clientes: no se inventan campos de segmentación.
-- El envío real por correo vive en platform/email.mjs (Resend): sin
-- RESEND_API_KEY no se envía nada y el envío queda como 'sin_envio'
-- (ver platform/marketing-store.mjs). Nunca se finge un envío.
-- NOTA Turso: sin índices parciales (WHERE) ni índices de 4+ columnas;
-- máximo 3 columnas por índice, sin PRAGMA (como en 026).

CREATE TABLE IF NOT EXISTS tenant_marketing_segments(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 120),
 description TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT '' CHECK(status IN ('','prospect','active','inactive')),
 company_contains TEXT NOT NULL DEFAULT '',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id)
);
CREATE INDEX IF NOT EXISTS idx_marketing_segments_org_name ON tenant_marketing_segments(organization_id,name);

CREATE TABLE IF NOT EXISTS tenant_marketing_campaigns(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 140),
 subject TEXT NOT NULL CHECK(length(trim(subject)) BETWEEN 2 AND 200),
 content TEXT NOT NULL DEFAULT '',
 segment_id TEXT,
 status TEXT NOT NULL DEFAULT 'borrador' CHECK(status IN ('borrador','programada','enviada')),
 scheduled_at TEXT,
 sent_at TEXT,
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,segment_id) REFERENCES tenant_marketing_segments(organization_id,id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_org_status ON tenant_marketing_campaigns(organization_id,status,created_at);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_org_segment ON tenant_marketing_campaigns(organization_id,segment_id);

CREATE TABLE IF NOT EXISTS tenant_marketing_sends(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 campaign_id TEXT NOT NULL,
 client_id TEXT,
 recipient_name TEXT NOT NULL DEFAULT '',
 recipient_email TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pendiente' CHECK(status IN ('pendiente','enviado','fallido','sin_envio')),
 error TEXT NOT NULL DEFAULT '',
 sent_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,campaign_id) REFERENCES tenant_marketing_campaigns(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_marketing_sends_org_campaign ON tenant_marketing_sends(organization_id,campaign_id,status);
CREATE INDEX IF NOT EXISTS idx_marketing_sends_org_email ON tenant_marketing_sends(organization_id,recipient_email);
