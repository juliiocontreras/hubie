-- 015: Cobro Stripe (modelo híbrido decidido por Julio 2026-11-13).
-- Pago único de configuración (suite + tools + extras, anticipo 50% + saldo
-- hasta 6 pagos) + mensualidad de plataforma $949 MXN/mes para las 10 suites.
-- Supuesto documentado en docs/STRIPE-BILLING.md: los precios del catálogo son
-- finales con IVA incluido (como Jobia); si Julio lo corrige, cambia solo
-- la constante PRICES_INCLUDE_TAX en platform/billing-domain.mjs.
-- Additive, no changes to existing company records. Todo con scope por tenant
-- (organization_id primero en cada clave). La suspensión por impago vive en
-- tenant_subscriptions.status='suspended' y NO toca organizations.status, para
-- que el resto de la app (login, membresías) siga leyendo su propio estado.
CREATE TABLE IF NOT EXISTS tenant_subscriptions(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 stripe_customer_id TEXT,
 stripe_subscription_id TEXT,
 status TEXT NOT NULL DEFAULT 'none' CHECK(status IN ('none','trialing','active','past_due','suspended','cancelled')),
 monthly_fee_cents INTEGER NOT NULL DEFAULT 94900 CHECK(monthly_fee_cents>=0),
 current_period_end TEXT,
 past_due_since TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id)
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_tenant_status ON tenant_subscriptions(organization_id,status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub ON tenant_subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS tenant_payments(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 type TEXT NOT NULL CHECK(type IN ('deposit','balance','monthly')),
 amount_cents INTEGER NOT NULL CHECK(amount_cents>=0),
 currency TEXT NOT NULL DEFAULT 'MXN',
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','failed','refunded')),
 stripe_payment_intent_id TEXT,
 stripe_invoice_id TEXT,
 stripe_checkout_session_id TEXT,
 installments_total INTEGER NOT NULL DEFAULT 1 CHECK(installments_total BETWEEN 1 AND 6),
 installment_number INTEGER NOT NULL DEFAULT 1 CHECK(installment_number BETWEEN 1 AND 6),
 due_at TEXT,
 paid_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id)
);
CREATE INDEX IF NOT EXISTS idx_payments_tenant_type ON tenant_payments(organization_id,type,status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_stripe_invoice ON tenant_payments(stripe_invoice_id) WHERE stripe_invoice_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS stripe_webhook_events(
 stripe_event_id TEXT PRIMARY KEY,
 organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
 type TEXT NOT NULL,
 payload_json TEXT NOT NULL,
 processed_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON stripe_webhook_events(type,created_at);
CREATE TABLE IF NOT EXISTS billing_checkout_orders(
 id TEXT PRIMARY KEY,
 email TEXT NOT NULL,
 suite_id TEXT NOT NULL,
 quote_json TEXT NOT NULL,
 total_cents INTEGER NOT NULL CHECK(total_cents>0),
 deposit_cents INTEGER NOT NULL CHECK(deposit_cents>=0),
 balance_cents INTEGER NOT NULL CHECK(balance_cents>=0),
 monthly_fee_cents INTEGER NOT NULL DEFAULT 94900 CHECK(monthly_fee_cents>=0),
 stripe_checkout_session_id TEXT,
 stripe_customer_id TEXT,
 organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','cancelled','converted')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 paid_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_checkout_orders_status ON billing_checkout_orders(status,created_at);
CREATE INDEX IF NOT EXISTS idx_checkout_orders_session ON billing_checkout_orders(stripe_checkout_session_id);
