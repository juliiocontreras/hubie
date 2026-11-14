-- 021: TOOLS P0 (núcleo relacional) — C001/C002/C003/C009. Aditiva; no toca
-- tablas ni índices existentes. No cableada aún en server.mjs (applyCoreSchema)
-- ni en /healthz: el integrador la añade (ver INTEGRATION.md en la raíz).
-- Reglas Turso vivas: índices de máximo 3 columnas, sin WHERE en CREATE INDEX,
-- sin sentencias PRAGMA. Todas las tablas llevan organization_id primero.
-- Sin ALTER TABLE ADD COLUMN: SQLite no lo hace idempotente (segunda
-- aplicación = "duplicate column name") y el servidor reaplica cada migración
-- en cada arranque; por eso la asignación del trato y la visibilidad del
-- documento viven en tablas propias con IF NOT EXISTS.
-- NOTA: tenant_case_events NO se reconstruye: su CHECK de acciones ('created',
-- 'updated', 'archived', 'document_added', 'document_removed') se conserva y
-- los eventos nuevos (versión, acceso, vínculo) se registran con esas acciones
-- y descripción explícita, como ya hace updateCaseDocument ('updated').

-- C002: responsable del trato (miembro del equipo). Sin fila = sin asignar.
CREATE TABLE IF NOT EXISTS tenant_deal_assignments (
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 deal_id TEXT NOT NULL,
 assigned_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,deal_id),
 FOREIGN KEY(organization_id,deal_id) REFERENCES tenant_crm_deals(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_deal_assignments_user ON tenant_deal_assignments(organization_id,assigned_user_id);

-- C003: visibilidad por documento ('team' = todo el equipo con acceso al
-- expediente; 'restricted' = solo owner/admin y usuarios con concesión
-- explícita). Sin fila = 'team'.
CREATE TABLE IF NOT EXISTS tenant_case_document_settings (
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 document_id TEXT NOT NULL,
 visibility TEXT NOT NULL DEFAULT 'team' CHECK(visibility IN ('team','restricted')),
 updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,document_id),
 FOREIGN KEY(organization_id,document_id) REFERENCES tenant_case_documents(organization_id,id) ON DELETE CASCADE
);

-- C002: tareas ligadas al trato, con responsable y vencimiento.
CREATE TABLE IF NOT EXISTS tenant_crm_deal_tasks (
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 deal_id TEXT NOT NULL,
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 2 AND 180),
 due_at TEXT,
 status TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','doing','done')),
 assigned_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 completed_at TEXT,
 archived_at TEXT,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,deal_id) REFERENCES tenant_crm_deals(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_deal_tasks_deal ON tenant_crm_deal_tasks(organization_id,deal_id,status);
CREATE INDEX IF NOT EXISTS idx_deal_tasks_assignee ON tenant_crm_deal_tasks(organization_id,assigned_user_id,due_at);

-- C002: cotizaciones ligadas al trato (una cotización, como mucho, a un trato).
CREATE TABLE IF NOT EXISTS tenant_deal_quotes (
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 deal_id TEXT NOT NULL,
 quote_id TEXT NOT NULL,
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,quote_id),
 FOREIGN KEY(organization_id,deal_id) REFERENCES tenant_crm_deals(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY(organization_id,quote_id) REFERENCES tenant_quotes(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_deal_quotes_deal ON tenant_deal_quotes(organization_id,deal_id);

-- C003/C009: acceso por expediente (además del rol general y de la Tool C003).
CREATE TABLE IF NOT EXISTS tenant_case_access (
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 case_id TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 access TEXT NOT NULL CHECK(access IN ('read','write')),
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,case_id,user_id),
 FOREIGN KEY(organization_id,case_id) REFERENCES tenant_client_cases(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_case_access_user ON tenant_case_access(organization_id,user_id);

-- C003: concesión explícita por documento (para visibility='restricted').
CREATE TABLE IF NOT EXISTS tenant_case_document_access (
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 document_id TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 access TEXT NOT NULL CHECK(access IN ('read','write')),
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,document_id,user_id),
 FOREIGN KEY(organization_id,document_id) REFERENCES tenant_case_documents(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_case_doc_access_user ON tenant_case_document_access(organization_id,user_id);

-- C009: permiso por módulo y por miembro. Sin fila = permiso por defecto del rol
-- (viewer: lectura; member/admin/owner: escritura; C009: solo owner/admin).
CREATE TABLE IF NOT EXISTS tenant_member_tools (
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 tool_id TEXT NOT NULL,
 access TEXT NOT NULL CHECK(access IN ('none','read','write')),
 updated_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,user_id,tool_id),
 FOREIGN KEY(organization_id,tool_id) REFERENCES tenant_tools(organization_id,tool_id)
);
CREATE INDEX IF NOT EXISTS idx_member_tools_user ON tenant_member_tools(organization_id,user_id);

-- C001: auditoría de fusiones de duplicados (el cliente fusionado se archiva,
-- nunca se borra; sus relaciones se reasignan al cliente conservado).
CREATE TABLE IF NOT EXISTS tenant_client_merges (
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 kept_client_id TEXT NOT NULL,
 merged_client_id TEXT NOT NULL,
 merged_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 reason TEXT NOT NULL DEFAULT '',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,kept_client_id) REFERENCES tenant_client_profiles(organization_id,id),
 FOREIGN KEY(organization_id,merged_client_id) REFERENCES tenant_client_profiles(organization_id,id)
);
CREATE INDEX IF NOT EXISTS idx_client_merges_kept ON tenant_client_merges(organization_id,kept_client_id);
