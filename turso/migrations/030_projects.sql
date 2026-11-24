-- 030: Tool T025 Proyectos (grupo Operación).
-- Aditivo; no toca tablas existentes.
-- NOTA Turso: sin índices parciales (WHERE) ni índices de 4+ columnas;
-- máximo 3 columnas por índice, sin PRAGMA (mismo patrón que 026).
-- Las tareas del proyecto NO viven aquí: se crean en tenant_tasks
-- (migración 022) con source_tool_id='T025' y
-- source_record_id=<projectId>, reutilizando platform/operations-tasks.mjs
-- (ver platform/projects-store.mjs, createProjectTask). El tablero Kanban
-- tampoco se reimplementa: el proyecto guarda kanban_board_id (nullable)
-- y el tablero se crea con platform/operations-kanban.mjs (T005).
-- El avance es derivado en el store (% hitos completados + % tareas
-- hechas); no hay columna de avance guardada.
-- client_id es opcional y apunta a tenant_client_profiles (C001);
-- owner_user_id es un miembro del equipo (memberships activas, se valida
-- en código con platform/team-members.mjs, como hace T004).

CREATE TABLE IF NOT EXISTS tenant_projects(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 3 AND 160),
 description TEXT NOT NULL DEFAULT '',
 client_id TEXT,
 starts_on TEXT,
 ends_on TEXT,
 status TEXT NOT NULL DEFAULT 'planificado' CHECK(status IN ('planificado','en curso','en pausa','completado','cancelado')),
 owner_user_id TEXT,
 kanban_board_id TEXT,
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,client_id) REFERENCES tenant_client_profiles(organization_id,id) ON DELETE SET NULL,
 FOREIGN KEY(organization_id,kanban_board_id) REFERENCES kanban_boards(organization_id,id) ON DELETE SET NULL,
 CHECK(ends_on IS NULL OR starts_on IS NULL OR ends_on>=starts_on)
);
CREATE INDEX IF NOT EXISTS idx_projects_org_status ON tenant_projects(organization_id,status,created_at);
CREATE INDEX IF NOT EXISTS idx_projects_org_client ON tenant_projects(organization_id,client_id);
CREATE INDEX IF NOT EXISTS idx_projects_org_owner ON tenant_projects(organization_id,owner_user_id);

CREATE TABLE IF NOT EXISTS tenant_project_milestones(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 project_id TEXT NOT NULL,
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 2 AND 160),
 due_on TEXT,
 status TEXT NOT NULL DEFAULT 'pendiente' CHECK(status IN ('pendiente','completado','cancelado')),
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,project_id) REFERENCES tenant_projects(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_project_milestones_project ON tenant_project_milestones(organization_id,project_id,due_on);
CREATE INDEX IF NOT EXISTS idx_project_milestones_org_due ON tenant_project_milestones(organization_id,due_on);
