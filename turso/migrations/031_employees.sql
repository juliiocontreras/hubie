-- 031: Tool T026 Empleados (directorio de Recursos Humanos).
-- REUTILIZA tenant_training_employees de T022 (026): los empleados de
-- capacitación SON los mismos, no se crea otra tabla de empleados. Esta
-- migración solo AÑADE columnas NULLables (o con default) a esa tabla; los
-- empleados creados en T022 aparecen aquí y viceversa, y createEmployee de
-- T022 sigue funcionando (sus columnas nuevas van con defaults NULL).
-- Sin índices parciales (WHERE) ni índices de 4+ columnas; máximo 3 por
-- índice, sin PRAGMA (misma nota que la 026).
-- Documentos: solo metadatos (tipo, nombre, fecha, notas), sin subida de
-- binarios. El archivo físico se guarda fuera de Hubie por ahora.

ALTER TABLE tenant_training_employees ADD COLUMN fecha_ingreso TEXT;
ALTER TABLE tenant_training_employees ADD COLUMN tipo_contrato TEXT CHECK(tipo_contrato IS NULL OR tipo_contrato IN ('indefinido','temporal','por obra','prácticas'));
ALTER TABLE tenant_training_employees ADD COLUMN salario_mensual_cents INTEGER CHECK(salario_mensual_cents IS NULL OR salario_mensual_cents>=0);
ALTER TABLE tenant_training_employees ADD COLUMN estado TEXT NOT NULL DEFAULT 'activo' CHECK(estado IN ('activo','inactivo'));

CREATE TABLE IF NOT EXISTS tenant_hr_documents(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 employee_id TEXT NOT NULL,
 tipo TEXT NOT NULL CHECK(tipo IN ('contrato','identificación','comprobante','certificado','otro')),
 nombre TEXT NOT NULL CHECK(length(trim(nombre)) BETWEEN 2 AND 160),
 fecha TEXT,
 notas TEXT NOT NULL DEFAULT '',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,employee_id) REFERENCES tenant_training_employees(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_hr_documents_employee ON tenant_hr_documents(organization_id,employee_id,created_at);
