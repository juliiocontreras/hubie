-- 022: TOOLS P1-A (C004, C005, C008, T003, T004, T007). Aditivo; no toca
-- tablas existentes. Todas las tablas llevan organization_id primero.
-- REGLAS TURSO (lecciones vivas): sin índices parciales (sin WHERE en
-- CREATE INDEX), máximo 3 columnas por índice, sin sentencias PRAGMA.
-- tenant_notifications NO se crea aquí: es del frente search (020). Los
-- recordatorios de agenda y los avisos de tareas vencidas intentan insertar
-- en ella solo si existe (platform/notifications.mjs); si no existe, el
-- recordatorio queda guardado con notified_at NULL y se anota como pendiente.
-- Calendarios externos (Google/Outlook) fuera de alcance. El multi-almacén
-- con transferencias es T010 (frente p1b) y la orden de compra real es T008
-- (frente p1b): aquí el almacén es un campo por variante y el proveedor un
-- campo de texto por variante, con enlace preparado a T008 en la UI.

-- C004 Agenda: responsable (miembro del equipo) y recordatorio ligado.
CREATE TABLE IF NOT EXISTS tenant_appointment_assignees (
 organization_id TEXT NOT NULL,
 appointment_id TEXT NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,appointment_id),
 FOREIGN KEY(organization_id,appointment_id) REFERENCES tenant_schedule_events(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_appt_assignees_user ON tenant_appointment_assignees(organization_id,user_id);

CREATE TABLE IF NOT EXISTS tenant_appointment_reminders (
 organization_id TEXT NOT NULL,
 id TEXT NOT NULL,
 appointment_id TEXT NOT NULL,
 remind_minutes_before INTEGER NOT NULL CHECK(remind_minutes_before>=0 AND remind_minutes_before<=10080),
 notify_at TEXT NOT NULL,
 notified_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,appointment_id) REFERENCES tenant_schedule_events(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_appt_reminders_due ON tenant_appointment_reminders(organization_id,notify_at,notified_at);

-- C005 Inventario: variante con SKU propio, stock propio, almacén, lote,
-- caducidad y proveedor. El SKU es anulable: UNIQUE permite varios NULL,
-- así las variantes sin SKU propio no colisionan entre sí.
CREATE TABLE IF NOT EXISTS tenant_inventory_variants (
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 item_id TEXT NOT NULL,
 label TEXT NOT NULL CHECK(length(trim(label)) BETWEEN 2 AND 120),
 sku TEXT,
 quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity>=0),
 low_stock INTEGER NOT NULL DEFAULT 0 CHECK(low_stock>=0),
 warehouse TEXT NOT NULL DEFAULT '',
 lot TEXT NOT NULL DEFAULT '',
 expires_on TEXT,
 supplier TEXT NOT NULL DEFAULT '',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 archived_at TEXT,
 PRIMARY KEY(organization_id,id),
 UNIQUE(organization_id,sku),
 FOREIGN KEY(organization_id,item_id) REFERENCES tenant_inventory_items(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_variants_item ON tenant_inventory_variants(organization_id,item_id,archived_at);
CREATE INDEX IF NOT EXISTS idx_variants_expiry ON tenant_inventory_variants(organization_id,expires_on,archived_at);

-- Historial de movimientos por variante (la tabla 007 de movimientos no
-- tiene columna de variante y no se altera: ALTER no es idempotente en el
-- arranque repetido de applyCoreSchema). El movimiento a nivel de artículo
-- sigue registrándose en tenant_inventory_movements.
CREATE TABLE IF NOT EXISTS tenant_inventory_variant_movements (
 organization_id TEXT NOT NULL,
 id TEXT NOT NULL,
 variant_id TEXT NOT NULL,
 item_id TEXT NOT NULL,
 delta INTEGER NOT NULL CHECK(delta!=0),
 note TEXT NOT NULL DEFAULT '',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,variant_id) REFERENCES tenant_inventory_variants(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY(organization_id,item_id) REFERENCES tenant_inventory_items(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_variant_movements_variant ON tenant_inventory_variant_movements(organization_id,variant_id,created_at);

-- T003 Checklists: plantillas reutilizables, checklists con ítems
-- verificables (responsable, vencimiento, evidencia en pwa_media).
CREATE TABLE IF NOT EXISTS tenant_checklist_templates (
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 2 AND 180),
 description TEXT NOT NULL DEFAULT '',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 archived_at TEXT,
 PRIMARY KEY(organization_id,id)
);
CREATE INDEX IF NOT EXISTS idx_checklist_templates_org ON tenant_checklist_templates(organization_id,archived_at,created_at);

CREATE TABLE IF NOT EXISTS tenant_checklist_template_items (
 organization_id TEXT NOT NULL,
 id TEXT NOT NULL,
 template_id TEXT NOT NULL,
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 2 AND 180),
 position INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,template_id) REFERENCES tenant_checklist_templates(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_checklist_template_items ON tenant_checklist_template_items(organization_id,template_id,position);

CREATE TABLE IF NOT EXISTS tenant_checklists (
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 template_id TEXT,
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 2 AND 180),
 source_tool_id TEXT,
 source_record_id TEXT,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed')),
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 archived_at TEXT,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,template_id) REFERENCES tenant_checklist_templates(organization_id,id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_checklists_org ON tenant_checklists(organization_id,status,archived_at);

CREATE TABLE IF NOT EXISTS tenant_checklist_items (
 organization_id TEXT NOT NULL,
 id TEXT NOT NULL,
 checklist_id TEXT NOT NULL,
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 2 AND 180),
 assignee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 due_on TEXT,
 checked_at TEXT,
 checked_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 evidence_media_id TEXT REFERENCES pwa_media(id) ON DELETE SET NULL,
 position INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,checklist_id) REFERENCES tenant_checklists(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_checklist_items_list ON tenant_checklist_items(organization_id,checklist_id,position);
CREATE INDEX IF NOT EXISTS idx_checklist_items_assignee ON tenant_checklist_items(organization_id,assignee_user_id,checked_at);

-- T004 Tareas: responsable real, vencimiento, estados; notified_at marca el
-- aviso de vencimiento ya enviado (una sola vez por tarea).
CREATE TABLE IF NOT EXISTS tenant_tasks (
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 2 AND 180),
 notes TEXT NOT NULL DEFAULT '',
 assignee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 due_on TEXT,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','in_progress','done')),
 priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high')),
 source_tool_id TEXT,
 source_record_id TEXT,
 notified_at TEXT,
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 archived_at TEXT,
 PRIMARY KEY(organization_id,id)
);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tenant_tasks(organization_id,assignee_user_id,status);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tenant_tasks(organization_id,due_on,status);
CREATE INDEX IF NOT EXISTS idx_tasks_overdue ON tenant_tasks(organization_id,notified_at,due_on);

-- T007 Formularios personalizados: definición (campos JSON) y respuestas
-- tipadas en tenant_form_submissions (respuestas JSON validadas en código).
CREATE TABLE IF NOT EXISTS tenant_forms (
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 2 AND 180),
 description TEXT NOT NULL DEFAULT '',
 fields_json TEXT NOT NULL DEFAULT '[]',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 archived_at TEXT,
 PRIMARY KEY(organization_id,id)
);
CREATE INDEX IF NOT EXISTS idx_forms_org ON tenant_forms(organization_id,archived_at,created_at);

CREATE TABLE IF NOT EXISTS tenant_form_submissions (
 organization_id TEXT NOT NULL,
 id TEXT NOT NULL,
 form_id TEXT NOT NULL,
 answers_json TEXT NOT NULL DEFAULT '{}',
 submitted_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,form_id) REFERENCES tenant_forms(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_form_submissions_form ON tenant_form_submissions(organization_id,form_id,created_at);

-- C008 Dashboard: objetivo mensual de cobros por tenant (un renglón por mes).
CREATE TABLE IF NOT EXISTS tenant_dashboard_goals (
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 month TEXT NOT NULL CHECK(length(month)=7),
 target_cents INTEGER NOT NULL CHECK(target_cents>=0 AND target_cents<=100000000000),
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 UNIQUE(organization_id,month)
);
CREATE INDEX IF NOT EXISTS idx_dashboard_goals_month ON tenant_dashboard_goals(organization_id,month);
