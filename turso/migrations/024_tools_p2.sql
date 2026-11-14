-- 024: Tools P2 reales (T001 portal, T002 lealtad, T005 kanban, T006 firmas,
-- T011 lotes, T012 escáner sin tabla propia, T019 comisiones).
-- Aditivo; no toca tablas existentes ni billing/Stripe.
-- NOTA Turso: sin índices parciales (WHERE) ni índices de 4+ columnas; máximo
-- 3 columnas por índice, sin PRAGMA. La unicidad de lote activo, de ganancia
-- por cobro y de regla general se valida en código (operations-*.mjs).
-- T011: NO se crea tenant_notifications (la posee el frente search); la
-- operación de lotes expone los lotes próximos a caducar y el integrador la
-- conecta a esa tabla cuando exista.

CREATE TABLE IF NOT EXISTS portal_client_access(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 client_id TEXT NOT NULL,
 email TEXT NOT NULL,
 password_hash TEXT,
 activation_token_hash TEXT,
 activation_expires_at TEXT,
 activation_consumed_at TEXT,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','active','revoked')),
 last_login_at TEXT,
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,client_id) REFERENCES tenant_client_profiles(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_portal_access_org_client ON portal_client_access(organization_id,client_id);
CREATE INDEX IF NOT EXISTS idx_portal_access_org_email ON portal_client_access(organization_id,email);
CREATE INDEX IF NOT EXISTS idx_portal_access_token ON portal_client_access(organization_id,activation_token_hash);

CREATE TABLE IF NOT EXISTS portal_client_sessions(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 access_id TEXT NOT NULL,
 token_hash TEXT NOT NULL,
 expires_at TEXT NOT NULL,
 revoked_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,access_id) REFERENCES portal_client_access(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_token ON portal_client_sessions(organization_id,token_hash);
CREATE INDEX IF NOT EXISTS idx_portal_sessions_access ON portal_client_sessions(organization_id,access_id);

CREATE TABLE IF NOT EXISTS portal_requests(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 client_id TEXT NOT NULL,
 access_id TEXT,
 subject TEXT NOT NULL CHECK(length(trim(subject)) BETWEEN 2 AND 180),
 message TEXT NOT NULL CHECK(length(trim(message)) BETWEEN 2 AND 4000),
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','closed')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,client_id) REFERENCES tenant_client_profiles(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_portal_requests_org_client ON portal_requests(organization_id,client_id,status);
CREATE INDEX IF NOT EXISTS idx_portal_requests_org_status ON portal_requests(organization_id,status,created_at);

CREATE TABLE IF NOT EXISTS loyalty_config(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 points_per_peso INTEGER NOT NULL DEFAULT 1 CHECK(points_per_peso>=0 AND points_per_peso<=1000),
 point_value_cents INTEGER NOT NULL DEFAULT 10 CHECK(point_value_cents>=0 AND point_value_cents<=10000),
 min_redeem_points INTEGER NOT NULL DEFAULT 100 CHECK(min_redeem_points>=1 AND min_redeem_points<=100000),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id)
);

CREATE TABLE IF NOT EXISTS loyalty_ledger(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 client_id TEXT NOT NULL,
 delta_points INTEGER NOT NULL CHECK(delta_points!=0),
 kind TEXT NOT NULL CHECK(kind IN ('earn','redeem','adjust')),
 source_type TEXT NOT NULL DEFAULT '' CHECK(source_type IN ('','payment','quote','manual')),
 source_id TEXT NOT NULL DEFAULT '',
 balance_after INTEGER NOT NULL,
 note TEXT NOT NULL DEFAULT '',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,client_id) REFERENCES tenant_client_profiles(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_client ON loyalty_ledger(organization_id,client_id,created_at);
CREATE INDEX IF NOT EXISTS idx_loyalty_ledger_source ON loyalty_ledger(organization_id,source_type,source_id);

CREATE TABLE IF NOT EXISTS kanban_boards(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 name TEXT NOT NULL CHECK(length(trim(name)) BETWEEN 2 AND 120),
 source_tool_id TEXT NOT NULL CHECK(source_tool_id IN ('C002','C003','generic')),
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 archived_at TEXT,
 PRIMARY KEY(organization_id,id)
);
CREATE INDEX IF NOT EXISTS idx_kanban_boards_org ON kanban_boards(organization_id,archived_at);

CREATE TABLE IF NOT EXISTS kanban_phases(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 board_id TEXT NOT NULL,
 title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 80),
 position INTEGER NOT NULL DEFAULT 0 CHECK(position>=0 AND position<=100),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,board_id) REFERENCES kanban_boards(organization_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_kanban_phases_board ON kanban_phases(organization_id,board_id,position);

CREATE TABLE IF NOT EXISTS kanban_cards(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 board_id TEXT NOT NULL,
 phase_id TEXT NOT NULL,
 source_tool_id TEXT NOT NULL CHECK(source_tool_id IN ('C002','C003','generic')),
 source_record_id TEXT NOT NULL,
 assigned_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 position INTEGER NOT NULL DEFAULT 0 CHECK(position>=0 AND position<=10000),
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 archived_at TEXT,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,board_id) REFERENCES kanban_boards(organization_id,id) ON DELETE CASCADE,
 FOREIGN KEY(organization_id,phase_id) REFERENCES kanban_phases(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_kanban_cards_board_phase ON kanban_cards(organization_id,board_id,phase_id);
CREATE INDEX IF NOT EXISTS idx_kanban_cards_source ON kanban_cards(organization_id,source_tool_id,source_record_id);

CREATE TABLE IF NOT EXISTS tenant_signatures(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 target_type TEXT NOT NULL CHECK(target_type IN ('case','quote','generic')),
 target_id TEXT NOT NULL,
 signer_name TEXT NOT NULL CHECK(length(trim(signer_name)) BETWEEN 2 AND 160),
 signer_email TEXT NOT NULL DEFAULT '',
 consent_text TEXT NOT NULL,
 signature_data TEXT NOT NULL,
 signature_hash TEXT NOT NULL,
 signed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id)
);
CREATE INDEX IF NOT EXISTS idx_signatures_org_target ON tenant_signatures(organization_id,target_type,target_id);
CREATE INDEX IF NOT EXISTS idx_signatures_org_hash ON tenant_signatures(organization_id,signature_hash);

CREATE TABLE IF NOT EXISTS inventory_lots(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 item_id TEXT NOT NULL,
 lot_code TEXT NOT NULL CHECK(length(trim(lot_code)) BETWEEN 1 AND 48),
 quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity>=0 AND quantity<=1000000000),
 expires_at TEXT,
 received_on TEXT,
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 archived_at TEXT,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,item_id) REFERENCES tenant_inventory_items(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_lots_org_item ON inventory_lots(organization_id,item_id,lot_code);
CREATE INDEX IF NOT EXISTS idx_lots_org_expiry ON inventory_lots(organization_id,expires_at,archived_at);

CREATE TABLE IF NOT EXISTS commission_rules(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 scope TEXT NOT NULL CHECK(scope IN ('member','product','default')),
 member_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 catalog_item_id TEXT,
 percent_bp INTEGER NOT NULL CHECK(percent_bp>=0 AND percent_bp<=10000),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 archived_at TEXT,
 PRIMARY KEY(organization_id,id)
);
CREATE INDEX IF NOT EXISTS idx_commission_rules_org_scope ON commission_rules(organization_id,scope,active);
CREATE INDEX IF NOT EXISTS idx_commission_rules_member ON commission_rules(organization_id,member_user_id);

CREATE TABLE IF NOT EXISTS commission_entries(
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 payment_id TEXT NOT NULL,
 member_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 catalog_item_id TEXT,
 base_cents INTEGER NOT NULL CHECK(base_cents>0 AND base_cents<=100000000000),
 percent_bp INTEGER NOT NULL CHECK(percent_bp>=0 AND percent_bp<=10000),
 amount_cents INTEGER NOT NULL CHECK(amount_cents>=0 AND amount_cents<=100000000000),
 period TEXT NOT NULL,
 rule_id TEXT,
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,payment_id) REFERENCES tenant_collections(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_commission_entries_payment ON commission_entries(organization_id,payment_id);
CREATE INDEX IF NOT EXISTS idx_commission_entries_period ON commission_entries(organization_id,period,member_user_id);
