-- 020: Centro de notificaciones por tenant (frente BÚSQUEDA + NOTIFICACIONES).
-- Aditiva; no toca tablas existentes. user_id NULL = para todo el tenant.
-- Tipos generados por platform/notifications.mjs: quote_expiring (cotización
-- sent por vencer), appointment_soon (cita en 24 h), payment_overdue (cobro
-- vencido), subscription_past_due (suscripción en mora); 'info' queda
-- reservado para avisos manuales o de otros frentes (T004, T011) que creen
-- notificaciones con createNotification() de platform/notifications.mjs.
-- REGLAS TURSO (vivas 2026-11-13): NADA de índices parciales (WHERE en
-- CREATE INDEX) ni índices de 4+ columnas: el motor en vivo los rechaza con
-- SQL_INPUT_ERROR "invalid expression in CREATE INDEX". Máximo 3 columnas
-- por índice, sin WHERE. NADA de sentencias PRAGMA. organization_id primero.
-- El dedupe de generadores (no duplicar una no leída del mismo tipo+enlace)
-- se hace en código, no con índice único parcial.
CREATE TABLE IF NOT EXISTS tenant_notifications(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
 type TEXT NOT NULL CHECK(type IN ('quote_expiring','appointment_soon','payment_overdue','subscription_past_due','info')),
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 180),
 body TEXT NOT NULL DEFAULT '' CHECK(length(body) <= 1000),
 link TEXT CHECK(link IS NULL OR length(link) <= 500),
 read_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id)
);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_unread ON tenant_notifications(organization_id,read_at,created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_user ON tenant_notifications(organization_id,user_id,created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_type ON tenant_notifications(organization_id,type,link);
