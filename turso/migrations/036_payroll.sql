-- 036: Tool T031 Nómina (Recursos Humanos).
-- Periodos (quincenal/mensual, borrador/calculado/pagado), conceptos
-- configurables de percepción/deducción (monto fijo o porcentaje del salario
-- base) y recibos por empleado con el detalle por concepto. El salario base
-- se toma de tenant_training_employees.salario_mensual_cents (T026); un
-- periodo quincenal usa la mitad del mensual.
-- LÍMITE HONESTO: cálculo básico, sin timbrado CFDI de nómina ni cálculo
-- real de IMSS/ISR (la UI lo etiqueta igual que T015 lleva su "Sin CFDI
-- (pendiente PAC)"). Nunca se finge un cálculo fiscal real.
-- Sin índices parciales (WHERE) ni índices de 4+ columnas; máximo 3 por
-- índice, sin PRAGMA (misma nota que la 026).

CREATE TABLE IF NOT EXISTS tenant_payroll_periods(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 tipo TEXT NOT NULL CHECK(tipo IN ('quincenal','mensual')),
 fecha_inicio TEXT NOT NULL CHECK(length(fecha_inicio)=10),
 fecha_fin TEXT NOT NULL CHECK(length(fecha_fin)=10),
 estado TEXT NOT NULL DEFAULT 'borrador' CHECK(estado IN ('borrador','calculado','pagado')),
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 UNIQUE(organization_id,tipo,fecha_inicio),
 CHECK(fecha_fin>=fecha_inicio)
);
CREATE INDEX IF NOT EXISTS idx_payroll_periods_org ON tenant_payroll_periods(organization_id,fecha_inicio);

CREATE TABLE IF NOT EXISTS tenant_payroll_concepts(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 nombre TEXT NOT NULL CHECK(length(trim(nombre)) BETWEEN 2 AND 120),
 tipo TEXT NOT NULL CHECK(tipo IN ('percepcion','deduccion')),
 modo TEXT NOT NULL CHECK(modo IN ('fijo','porcentaje')),
 monto_cents INTEGER CHECK(monto_cents IS NULL OR monto_cents>=0),
 porcentaje REAL CHECK(porcentaje IS NULL OR (porcentaje>=0 AND porcentaje<=100)),
 activo INTEGER NOT NULL DEFAULT 1 CHECK(activo IN (0,1)),
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 CHECK((modo='fijo' AND monto_cents IS NOT NULL AND porcentaje IS NULL) OR (modo='porcentaje' AND porcentaje IS NOT NULL AND monto_cents IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_payroll_concepts_org ON tenant_payroll_concepts(organization_id,activo);

CREATE TABLE IF NOT EXISTS tenant_payroll_receipts(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 period_id TEXT NOT NULL,
 employee_id TEXT NOT NULL,
 salario_base_cents INTEGER NOT NULL CHECK(salario_base_cents>=0),
 percepciones_cents INTEGER NOT NULL DEFAULT 0 CHECK(percepciones_cents>=0),
 deducciones_cents INTEGER NOT NULL DEFAULT 0 CHECK(deducciones_cents>=0),
 neto_cents INTEGER NOT NULL CHECK(neto_cents>=0),
 estado TEXT NOT NULL DEFAULT 'calculado' CHECK(estado IN ('calculado','pagado')),
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 UNIQUE(organization_id,period_id,employee_id),
 FOREIGN KEY(organization_id,period_id) REFERENCES tenant_payroll_periods(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY(organization_id,employee_id) REFERENCES tenant_training_employees(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_payroll_receipts_period ON tenant_payroll_receipts(organization_id,period_id,employee_id);

CREATE TABLE IF NOT EXISTS tenant_payroll_receipt_items(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 receipt_id TEXT NOT NULL,
 concept_id TEXT,
 nombre TEXT NOT NULL CHECK(length(trim(nombre)) BETWEEN 2 AND 120),
 tipo TEXT NOT NULL CHECK(tipo IN ('percepcion','deduccion')),
 monto_cents INTEGER NOT NULL CHECK(monto_cents>=0),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,receipt_id) REFERENCES tenant_payroll_receipts(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY(organization_id,concept_id) REFERENCES tenant_payroll_concepts(organization_id,id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_payroll_receipt_items_receipt ON tenant_payroll_receipt_items(organization_id,receipt_id);
