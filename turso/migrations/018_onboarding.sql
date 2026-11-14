-- 018: Onboarding — alta autoservicio desde el pago de Stripe + guía de
-- primer uso + datos de ejemplo.
-- Aditivo; no toca tablas existentes ni el flujo de cobro (015/016).
-- Reglas Turso vivas (2026-11-13): NADA de índices parciales (WHERE en
-- CREATE INDEX) ni índices de 4+ columnas — el motor en vivo los rechaza
-- con SQL_INPUT_ERROR "invalid expression in CREATE INDEX". Máximo 3
-- columnas por índice, sin WHERE. NADA de sentencias PRAGMA.
-- Todo con scope por tenant (organization_id primero en cada clave).
-- Los tokens de activación guardan SOLO el hash sha256 del token (nunca el
-- token en claro); el token expira a las 24 h y es de un solo uso
-- (consumed_at). Hubie no tiene sistema de contraseñas (login por Google
-- OIDC): el enlace de activación verifica el correo y abre sesión, y el
-- cliente entra después con su cuenta de Google del mismo correo.
-- Los datos de ejemplo se registran en tenant_demo_seed (tipo + id de la
-- entidad) para poder borrarlos en un clic sin tocar datos reales; las
-- entidades llevan el prefijo visible "DEMO — " en su nombre.

CREATE TABLE IF NOT EXISTS tenant_onboarding(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 step_key TEXT NOT NULL CHECK(step_key IN ('profile','first-client','catalog','quote','team','billing')),
 completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,user_id,step_key)
);
CREATE INDEX IF NOT EXISTS idx_onboarding_tenant_user ON tenant_onboarding(organization_id,user_id);

CREATE TABLE IF NOT EXISTS tenant_setup_tokens(
 id TEXT NOT NULL,
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 email TEXT NOT NULL,
 token_hash TEXT NOT NULL UNIQUE,
 purpose TEXT NOT NULL DEFAULT 'activate' CHECK(purpose IN ('activate')),
 expires_at TEXT NOT NULL,
 consumed_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id)
);
CREATE INDEX IF NOT EXISTS idx_setup_tokens_hash ON tenant_setup_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_setup_tokens_tenant_user ON tenant_setup_tokens(organization_id,user_id);

CREATE TABLE IF NOT EXISTS tenant_demo_seed(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 entity_type TEXT NOT NULL CHECK(entity_type IN ('client','catalog_item','quote')),
 entity_id TEXT NOT NULL,
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,entity_type,entity_id)
);
CREATE INDEX IF NOT EXISTS idx_demo_seed_tenant_type ON tenant_demo_seed(organization_id,entity_type);
