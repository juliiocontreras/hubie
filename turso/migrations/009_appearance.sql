-- 009: Optional PWA appearance settings. Non-destructive and restart-safe.
-- Separate Hubie Madre theme from each company's Suite theme.
CREATE TABLE IF NOT EXISTS platform_appearance(
 id TEXT PRIMARY KEY CHECK(id='madre'),
 dashboard_preset TEXT NOT NULL DEFAULT 'hubie' CHECK(dashboard_preset IN ('hubie','pearl','silver','sand','custom')),
 sidebar_preset TEXT NOT NULL DEFAULT 'midnight' CHECK(sidebar_preset IN ('midnight','steel','platinum','graphite','custom')),
 dashboard_color TEXT NOT NULL DEFAULT '#eaf1ff' CHECK(length(dashboard_color)=7),
 sidebar_color TEXT NOT NULL DEFAULT '#10294b' CHECK(length(sidebar_color)=7),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS tenant_appearance(
 organization_id TEXT PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
 dashboard_preset TEXT NOT NULL DEFAULT 'hubie' CHECK(dashboard_preset IN ('hubie','pearl','silver','sand','custom')),
 sidebar_preset TEXT NOT NULL DEFAULT 'midnight' CHECK(sidebar_preset IN ('midnight','steel','platinum','graphite','custom')),
 dashboard_color TEXT NOT NULL DEFAULT '#eaf1ff' CHECK(length(dashboard_color)=7),
 sidebar_color TEXT NOT NULL DEFAULT '#10294b' CHECK(length(sidebar_color)=7),
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
