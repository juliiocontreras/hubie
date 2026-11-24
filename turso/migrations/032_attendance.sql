-- 032: Tool T027 Asistencia y vacaciones (Recursos Humanos).
-- Solo registro y aprobación: jornada por día (entrada/salida, horas
-- calculadas en el store, no guardadas) y solicitudes de vacaciones o
-- permiso (desde/hasta, motivo, estado). NO hay saldos ni políticas de
-- vacaciones inventadas: lo aprobado en el año se muestra como conteo de
-- días aprobados, nada más. La aprobación/rechazo es solo para dueño/admin
-- (se verifica session.role en platform/attendance-store.mjs).
-- Sin índices parciales (WHERE) ni índices de 4+ columnas; máximo 3 por
-- índice, sin PRAGMA (misma nota que la 026).

CREATE TABLE IF NOT EXISTS tenant_hr_attendance(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 employee_id TEXT NOT NULL,
 fecha TEXT NOT NULL CHECK(length(fecha)=10),
 entrada TEXT,
 salida TEXT,
 notas TEXT NOT NULL DEFAULT '',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 UNIQUE(organization_id,employee_id,fecha),
 FOREIGN KEY(organization_id,employee_id) REFERENCES tenant_training_employees(organization_id,id) ON DELETE CASCADE,
 CHECK(entrada IS NULL OR entrada GLOB '[0-2][0-9]:[0-5][0-9]'),
 CHECK(salida IS NULL OR salida GLOB '[0-2][0-9]:[0-5][0-9]'),
 CHECK(salida IS NULL OR entrada IS NULL OR salida>entrada)
);
CREATE INDEX IF NOT EXISTS idx_hr_attendance_employee ON tenant_hr_attendance(organization_id,employee_id,fecha);
CREATE INDEX IF NOT EXISTS idx_hr_attendance_date ON tenant_hr_attendance(organization_id,fecha);

CREATE TABLE IF NOT EXISTS tenant_hr_requests(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 employee_id TEXT NOT NULL,
 tipo TEXT NOT NULL CHECK(tipo IN ('vacaciones','permiso')),
 fecha_inicio TEXT NOT NULL CHECK(length(fecha_inicio)=10),
 fecha_fin TEXT NOT NULL CHECK(length(fecha_fin)=10),
 motivo TEXT NOT NULL CHECK(length(trim(motivo)) BETWEEN 2 AND 500),
 estado TEXT NOT NULL DEFAULT 'pendiente' CHECK(estado IN ('pendiente','aprobada','rechazada')),
 resuelta_por TEXT REFERENCES users(id) ON DELETE SET NULL,
 resuelta_at TEXT,
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,employee_id) REFERENCES tenant_training_employees(organization_id,id) ON DELETE CASCADE,
 CHECK(fecha_fin>=fecha_inicio)
);
CREATE INDEX IF NOT EXISTS idx_hr_requests_employee ON tenant_hr_requests(organization_id,employee_id,estado);
CREATE INDEX IF NOT EXISTS idx_hr_requests_status ON tenant_hr_requests(organization_id,estado,created_at);
