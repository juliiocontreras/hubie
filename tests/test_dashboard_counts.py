import sqlite3, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
MIGRATIONS=['001_core.sql','002_multitenant.sql','003_identity.sql','004_platform_admin.sql','005_google_oidc.sql','006_pwa_records.sql','007_operational_workflows.sql','008_clients.sql','011_cases.sql']
class OperationalDashboardTests(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  for name in MIGRATIONS:self.db.executescript((ROOT/'turso/migrations'/name).read_text())
  self.db.executemany('INSERT INTO organizations(id,slug,name) VALUES(?,?,?)',[('a','org-aaa','Empresa A'),('b','org-bbb','Empresa B')])
  self.db.executemany('INSERT INTO tenant_tools(organization_id,tool_id,enabled) VALUES(?,?,?)',[
   ('a','C001',1),('a','C002',1),('a','C004',0),('a','C005',1),('a','T004',1),
   ('b','C001',1),('b','C002',1),('b','C004',1),('b','C005',1)])
  self.db.executemany('INSERT INTO tenant_client_profiles(organization_id,id,name,email) VALUES(?,?,?,?)',[
   ('a','c1','Uno',''),('a','c2','Dos',''),('b','c3','Tres','')])
  self.db.execute("UPDATE tenant_client_profiles SET archived_at=CURRENT_TIMESTAMP WHERE organization_id='a' AND id='c2'")
  self.db.executemany('INSERT INTO tenant_crm_deals(organization_id,id,title) VALUES(?,?,?)',[('a','d1','Venta A'),('b','d2','Venta B')])
  self.db.execute("INSERT INTO tenant_schedule_events(organization_id,id,title,starts_at,ends_at) VALUES('a','e1','Cita','2026-11-10T10:00:00.000Z','2026-11-10T11:00:00.000Z')")
  self.db.execute("INSERT INTO tenant_inventory_items(organization_id,id,sku,title) VALUES('a','i1','X1','Articulo')")
  self.db.execute("INSERT INTO tenant_tool_records(organization_id,id,tool_id,title) VALUES('a','rec1','T004','Tarea')")
 def tearDown(self):self.db.close()
 def metrics(self,org):
  sql=(ROOT/'platform/dashboard-counts.sql').read_text()
  return dict(self.db.execute(sql,(org,)*7).fetchall())
 def test_only_enabled_tools_and_actual_core_records(self):
  self.assertEqual(self.metrics('a'),{'C001':1,'C002':1,'C005':1,'T004':1})
 def test_no_cross_company_counts(self):
  self.assertEqual(self.metrics('b'),{'C001':1,'C002':1})
 def test_disabled_tool_never_appears_even_with_records(self):
  self.db.execute("UPDATE tenant_tools SET enabled=0 WHERE organization_id='a' AND tool_id='C005'")
  self.assertNotIn('C005',self.metrics('a'))
if __name__=='__main__':unittest.main()
