import sqlite3,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
MIGRATIONS=['001_core.sql','002_multitenant.sql','003_identity.sql','004_platform_admin.sql','005_google_oidc.sql','006_pwa_records.sql','007_operational_workflows.sql','008_clients.sql','009_appearance.sql']

class AppearanceIsolationTest(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  for name in MIGRATIONS:self.db.executescript((ROOT/'turso/migrations'/name).read_text())
  self.db.executemany('INSERT INTO organizations(id,slug,name) VALUES(?,?,?)',[('org-a','org-aaa','A'),('org-b','org-bbb','B')])
 def tearDown(self):self.db.close()
 def test_themes_are_isolated_per_tenant(self):
  self.db.execute("INSERT INTO tenant_appearance(organization_id,dashboard_preset,sidebar_preset,dashboard_color,sidebar_color) VALUES('org-a','pearl','midnight','#eeeeee','#112233')")
  self.db.execute("INSERT INTO tenant_appearance(organization_id,dashboard_preset,sidebar_preset,dashboard_color,sidebar_color) VALUES('org-b','hubie','platinum','#ccddee','#999999')")
  self.db.execute("UPDATE tenant_appearance SET sidebar_color='#445566' WHERE organization_id='org-a'")
  self.assertEqual(self.db.execute("SELECT sidebar_color FROM tenant_appearance WHERE organization_id='org-b'").fetchone()[0],'#999999')
 def test_madre_settings_do_not_overwrite_tenant_settings(self):
  self.db.execute("INSERT INTO platform_appearance(id,dashboard_preset,sidebar_preset,dashboard_color,sidebar_color) VALUES('madre','silver','midnight','#ccddee','#122233')")
  self.db.execute("INSERT INTO tenant_appearance(organization_id,dashboard_preset,sidebar_preset,dashboard_color,sidebar_color) VALUES('org-a','pearl','steel','#fafafa','#303e5d')")
  self.db.execute("UPDATE platform_appearance SET dashboard_color='#ffffff' WHERE id='madre'")
  self.assertEqual(self.db.execute("SELECT dashboard_color FROM tenant_appearance WHERE organization_id='org-a'").fetchone()[0],'#fafafa')
 def test_idempotent_migration_and_constraints(self):
  self.db.executescript((ROOT/'turso/migrations/009_appearance.sql').read_text())
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO tenant_appearance(organization_id,dashboard_preset,sidebar_preset,dashboard_color,sidebar_color) VALUES('org-a','bogus','midnight','#ffffff','#000000')")
if __name__=='__main__':unittest.main()
