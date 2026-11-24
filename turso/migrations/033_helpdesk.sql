-- 033: Tool T028 Mesa de ayuda (grupo Operación).
-- Aditivo; no toca tablas existentes.
-- NOTA Turso: sin índices parciales (WHERE) ni índices de 4+ columnas;
-- máximo 3 columnas por índice, sin PRAGMA (mismo patrón que 026).
-- Sin correo real: al asignar un ticket se crea un aviso en la app con el
-- motor canónico platform/notifications.mjs (tabla tenant_notifications
-- de la 020), como hace T004 con las tareas vencidas.
-- client_id es opcional y apunta a tenant_client_profiles (C001);
-- assignee_user_id es un miembro del equipo (memberships activas, se
-- valida en código con platform/team-members.mjs, como hace T004).
-- Las respuestas viven en hilo (tenant_helpdesk_replies) con autor
-- (user_id) y fecha; el autor se resuelve a email en el store.

CREATE TABLE IF NOT EXISTS tenant_helpdesk_tickets(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 subject TEXT NOT NULL CHECK(length(trim(subject)) BETWEEN 3 AND 200),
 description TEXT NOT NULL DEFAULT '',
 client_id TEXT,
 status TEXT NOT NULL DEFAULT 'abierto' CHECK(status IN ('abierto','en curso','en espera','resuelto','cerrado')),
 priority TEXT NOT NULL DEFAULT 'media' CHECK(priority IN ('baja','media','alta','urgente')),
 assignee_user_id TEXT,
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,client_id) REFERENCES tenant_client_profiles(organization_id,id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_helpdesk_org_status ON tenant_helpdesk_tickets(organization_id,status,created_at);
CREATE INDEX IF NOT EXISTS idx_helpdesk_org_priority ON tenant_helpdesk_tickets(organization_id,priority,created_at);
CREATE INDEX IF NOT EXISTS idx_helpdesk_org_assignee ON tenant_helpdesk_tickets(organization_id,assignee_user_id);

CREATE TABLE IF NOT EXISTS tenant_helpdesk_replies(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 ticket_id TEXT NOT NULL,
 author_user_id TEXT,
 body TEXT NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 4000),
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,ticket_id) REFERENCES tenant_helpdesk_tickets(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_helpdesk_replies_ticket ON tenant_helpdesk_replies(organization_id,ticket_id,created_at);
