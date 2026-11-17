-- 026: Tool T022 Capacitaciones (panel RH de seguimiento de capacitación).
-- Aditivo; no toca tablas existentes ni tenant_catalog_items ni sus índices.
-- NOTA Turso: sin índices parciales (WHERE) ni índices de 4+ columnas; máximo
-- 3 columnas por índice, sin PRAGMA. La unicidad de asistencia por
-- sesión+empleado, de folio de constancia y de correo de empleado se valida
-- con UNIQUE (<=3 columnas); la de inscripción activa (un empleado, un curso)
-- se valida en código (platform/training-store.mjs), como en 024.
-- Módulos y quizzes (ampliación 2026-11-16): cada curso se compone de módulos
-- 'learning' (se completan al marcarlos) o 'certification' (se aprueban con
-- quiz). La configuración del quiz vive como JSON en la columna
-- quiz_config_json del módulo — mismo patrón que questions_json en
-- tenant_surveys (014) y answers_json en tenant_survey_responses —, no en
-- tabla aparte: el quiz pertenece a un solo módulo y se lee/escribe con él.
-- tenant_training_module_completions es la fuente de verdad del avance por
-- módulo; tenant_training_progress guarda el agregado derivado (completados /
-- total / %) que el store recalcula tras cada módulo completado o quiz
-- aprobado. Los intentos de quiz guardan answers_json tal como se respondió
-- y el puntaje calculado EN SERVIDOR (nunca se confía en el del cliente).
-- Categoría de curso: texto libre, NO enum cerrado — Julio compartirá
-- referencias de una empresa de capacitaciones y las categorías se ajustarán
-- en una segunda pasada. Formato de folio: CAP-AAAA-XXXXXX (ver
-- platform/training-domain.mjs), también ajustable en esa pasada.

CREATE TABLE IF NOT EXISTS tenant_training_courses(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 4 AND 140),
 description TEXT NOT NULL DEFAULT '',
 duration_hours REAL NOT NULL DEFAULT 0 CHECK(duration_hours>=0 AND duration_hours<=10000),
 modality TEXT NOT NULL DEFAULT 'en línea' CHECK(modality IN ('presencial','en línea','mixta')),
 instructor TEXT NOT NULL DEFAULT '',
 materials TEXT NOT NULL DEFAULT '',
 valid_until TEXT,
 status TEXT NOT NULL DEFAULT 'borrador' CHECK(status IN ('borrador','activo','archivado')),
 min_score INTEGER NOT NULL DEFAULT 70 CHECK(min_score>=0 AND min_score<=100),
 category TEXT NOT NULL DEFAULT '',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id)
);
CREATE INDEX IF NOT EXISTS idx_training_courses_org_status ON tenant_training_courses(organization_id,status,created_at);
CREATE INDEX IF NOT EXISTS idx_training_courses_org_valid ON tenant_training_courses(organization_id,valid_until);

CREATE TABLE IF NOT EXISTS tenant_training_sessions(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 course_id TEXT NOT NULL,
 starts_at TEXT NOT NULL,
 ends_at TEXT NOT NULL,
 place_or_link TEXT NOT NULL DEFAULT '',
 capacity INTEGER NOT NULL DEFAULT 30 CHECK(capacity>=1 AND capacity<=10000),
 instructor TEXT NOT NULL DEFAULT '',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,course_id) REFERENCES tenant_training_courses(organization_id,id) ON DELETE CASCADE,
 CHECK(ends_at>starts_at)
);
CREATE INDEX IF NOT EXISTS idx_training_sessions_course ON tenant_training_sessions(organization_id,course_id,starts_at);
CREATE INDEX IF NOT EXISTS idx_training_sessions_org_start ON tenant_training_sessions(organization_id,starts_at);

CREATE TABLE IF NOT EXISTS tenant_training_employees(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 160),
 email TEXT NOT NULL CHECK(length(trim(email)) BETWEEN 3 AND 200),
 position TEXT NOT NULL DEFAULT '',
 area TEXT NOT NULL DEFAULT '',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 UNIQUE(organization_id,email)
);
CREATE INDEX IF NOT EXISTS idx_training_employees_org_name ON tenant_training_employees(organization_id,name);

CREATE TABLE IF NOT EXISTS tenant_training_enrollments(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 employee_id TEXT NOT NULL,
 course_id TEXT NOT NULL,
 session_id TEXT,
 status TEXT NOT NULL DEFAULT 'inscrito' CHECK(status IN ('inscrito','en curso','completado','cancelado')),
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,employee_id) REFERENCES tenant_training_employees(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY(organization_id,course_id) REFERENCES tenant_training_courses(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY(organization_id,session_id) REFERENCES tenant_training_sessions(organization_id,id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_training_enroll_course ON tenant_training_enrollments(organization_id,course_id,status);
CREATE INDEX IF NOT EXISTS idx_training_enroll_employee ON tenant_training_enrollments(organization_id,employee_id,status);

CREATE TABLE IF NOT EXISTS tenant_training_attendance(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 session_id TEXT NOT NULL,
 employee_id TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'presente' CHECK(status IN ('presente','ausente','justificado')),
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 UNIQUE(organization_id,session_id,employee_id),
 FOREIGN KEY(organization_id,session_id) REFERENCES tenant_training_sessions(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY(organization_id,employee_id) REFERENCES tenant_training_employees(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_training_attendance_employee ON tenant_training_attendance(organization_id,employee_id);

CREATE TABLE IF NOT EXISTS tenant_training_progress(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 enrollment_id TEXT NOT NULL,
 completed_modules INTEGER NOT NULL DEFAULT 0 CHECK(completed_modules>=0),
 total_modules INTEGER NOT NULL DEFAULT 0 CHECK(total_modules>=0),
 percent INTEGER NOT NULL DEFAULT 0 CHECK(percent>=0 AND percent<=100),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 UNIQUE(organization_id,enrollment_id),
 FOREIGN KEY(organization_id,enrollment_id) REFERENCES tenant_training_enrollments(organization_id,id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tenant_training_evaluations(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 enrollment_id TEXT NOT NULL,
 employee_id TEXT NOT NULL,
 course_id TEXT NOT NULL,
 score INTEGER NOT NULL CHECK(score>=0 AND score<=100),
 passed INTEGER NOT NULL CHECK(passed IN (0,1)),
 evaluated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 UNIQUE(organization_id,enrollment_id),
 FOREIGN KEY(organization_id,enrollment_id) REFERENCES tenant_training_enrollments(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY(organization_id,employee_id) REFERENCES tenant_training_employees(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY(organization_id,course_id) REFERENCES tenant_training_courses(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_training_evaluations_course ON tenant_training_evaluations(organization_id,course_id,passed);

CREATE TABLE IF NOT EXISTS tenant_training_certificates(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 employee_id TEXT NOT NULL,
 course_id TEXT NOT NULL,
 enrollment_id TEXT NOT NULL,
 folio TEXT NOT NULL,
 issued_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 UNIQUE(organization_id,folio),
 FOREIGN KEY(organization_id,employee_id) REFERENCES tenant_training_employees(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY(organization_id,course_id) REFERENCES tenant_training_courses(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY(organization_id,enrollment_id) REFERENCES tenant_training_enrollments(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_training_certificates_employee ON tenant_training_certificates(organization_id,employee_id,issued_at);

CREATE TABLE IF NOT EXISTS tenant_training_modules(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 course_id TEXT NOT NULL,
 type TEXT NOT NULL DEFAULT 'learning' CHECK(type IN ('learning','certification')),
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 2 AND 160),
 description TEXT NOT NULL DEFAULT '',
 content TEXT NOT NULL DEFAULT '',
 position INTEGER NOT NULL DEFAULT 0 CHECK(position>=0 AND position<=10000),
 status TEXT NOT NULL DEFAULT 'borrador' CHECK(status IN ('borrador','activo','archivado')),
 quiz_config_json TEXT,
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,course_id) REFERENCES tenant_training_courses(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_training_modules_course ON tenant_training_modules(organization_id,course_id,position);
CREATE INDEX IF NOT EXISTS idx_training_modules_course_type ON tenant_training_modules(organization_id,course_id,type);

CREATE TABLE IF NOT EXISTS tenant_training_module_completions(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 enrollment_id TEXT NOT NULL,
 module_id TEXT NOT NULL,
 completed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 UNIQUE(organization_id,enrollment_id,module_id),
 FOREIGN KEY(organization_id,enrollment_id) REFERENCES tenant_training_enrollments(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY(organization_id,module_id) REFERENCES tenant_training_modules(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_training_completions_module ON tenant_training_module_completions(organization_id,module_id);

CREATE TABLE IF NOT EXISTS tenant_training_quiz_attempts(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 module_id TEXT NOT NULL,
 employee_id TEXT NOT NULL,
 enrollment_id TEXT NOT NULL,
 answers_json TEXT NOT NULL,
 score INTEGER NOT NULL CHECK(score>=0 AND score<=100),
 passed INTEGER NOT NULL CHECK(passed IN (0,1)),
 attempt_number INTEGER NOT NULL CHECK(attempt_number>=1),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,module_id) REFERENCES tenant_training_modules(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY(organization_id,employee_id) REFERENCES tenant_training_employees(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY(organization_id,enrollment_id) REFERENCES tenant_training_enrollments(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_training_attempts_module_emp ON tenant_training_quiz_attempts(organization_id,module_id,employee_id);
CREATE INDEX IF NOT EXISTS idx_training_attempts_enrollment ON tenant_training_quiz_attempts(organization_id,enrollment_id,attempt_number);
