-- 007: Real tenant-isolated operational workflows (additive).
CREATE TABLE IF NOT EXISTS tenant_crm_deals (
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 title TEXT NOT NULL,
 customer TEXT NOT NULL DEFAULT '',
 amount_cents INTEGER NOT NULL DEFAULT 0 CHECK(amount_cents>=0),
 stage TEXT NOT NULL DEFAULT 'lead' CHECK(stage IN ('lead','qualified','proposal','negotiation','won','lost')),
 follow_up_at TEXT,
 notes TEXT NOT NULL DEFAULT '',
 archived_at TEXT,
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id)
);
CREATE INDEX IF NOT EXISTS idx_crm_org_stage ON tenant_crm_deals(organization_id,stage,archived_at);

CREATE TABLE IF NOT EXISTS tenant_schedule_events (
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 title TEXT NOT NULL,
 customer TEXT NOT NULL DEFAULT '',
 resource TEXT NOT NULL DEFAULT 'general',
 starts_at TEXT NOT NULL,
 ends_at TEXT NOT NULL CHECK(ends_at>starts_at),
 status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','cancelled')),
 notes TEXT NOT NULL DEFAULT '',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id)
);
CREATE INDEX IF NOT EXISTS idx_schedule_org_resource ON tenant_schedule_events(organization_id,resource,starts_at,ends_at,status);

CREATE TABLE IF NOT EXISTS tenant_inventory_items (
 organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
 id TEXT NOT NULL,
 sku TEXT NOT NULL,
 title TEXT NOT NULL,
 location TEXT NOT NULL DEFAULT '',
 quantity INTEGER NOT NULL DEFAULT 0 CHECK(quantity>=0),
 low_stock INTEGER NOT NULL DEFAULT 0 CHECK(low_stock>=0),
 archived_at TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 UNIQUE(organization_id,sku)
);
CREATE INDEX IF NOT EXISTS idx_stock_org_low ON tenant_inventory_items(organization_id,quantity,low_stock);

CREATE TABLE IF NOT EXISTS tenant_inventory_movements (
 organization_id TEXT NOT NULL,
 id TEXT NOT NULL,
 item_id TEXT NOT NULL,
 delta INTEGER NOT NULL CHECK(delta!=0),
 note TEXT NOT NULL DEFAULT '',
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(organization_id,id),
 FOREIGN KEY(organization_id,item_id) REFERENCES tenant_inventory_items(organization_id,id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_stock_movements_org_item ON tenant_inventory_movements(organization_id,item_id,created_at);
