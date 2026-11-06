-- 010: Small bounded attachment and optional background image storage.
-- No Render filesystem reliance; separate tenant memberships gate every access.
CREATE TABLE IF NOT EXISTS pwa_media (
 id TEXT PRIMARY KEY,
 scope TEXT NOT NULL CHECK(scope IN ('madre','tenant')),
 organization_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('dashboard_bg','sidebar_bg','attachment')),
 tool_id TEXT,
 record_id TEXT,
 name TEXT NOT NULL,
 mime TEXT NOT NULL,
 size_bytes INTEGER NOT NULL CHECK(size_bytes>0 AND size_bytes<=2000000),
 content_b64 TEXT NOT NULL,
 created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ((scope='madre' AND organization_id IS NULL AND kind!='attachment' AND tool_id IS NULL AND record_id IS NULL)
  OR (scope='tenant' AND organization_id IS NOT NULL)),
 CHECK ((kind='attachment' AND tool_id IS NOT NULL AND record_id IS NOT NULL)
  OR (kind!='attachment' AND tool_id IS NULL AND record_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_pwa_media_background ON pwa_media(scope,organization_id,kind,created_at);
CREATE INDEX IF NOT EXISTS idx_pwa_media_record ON pwa_media(organization_id,tool_id,record_id,created_at);
