import sqlite3, unittest
from pathlib import Path
MIG=Path(__file__).resolve().parents[1]/'turso/migrations'
FILES=['001_core.sql','002_multitenant.sql','003_identity.sql','004_platform_admin.sql','005_google_oidc.sql','006_pwa_records.sql','007_operational_workflows.sql','008_clients.sql','009_appearance.sql','010_media.sql','011_cases.sql']
class CasesTest(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  self.db.execute('PRAGMA foreign_keys=ON')
  for name in FILES:self.db.executescript((MIG/name).read_text())
  self.db.executemany('INSERT INTO organizations(id,slug,name) VALUES(?,?,?)',[('org-a','empresa-a','A'),('org-b','empresa-b','B')])
  self.db.execute("INSERT INTO tenant_client_profiles(organization_id,id,name) VALUES('org-a','cliente-a','Cliente A')")
 def tearDown(self):self.db.close()
 def test_cross_tenant_client_fails_in_dossier(self):
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO tenant_client_cases(organization_id,id,client_id,title,kind,status) VALUES('org-b','case-b','cliente-a','Falso','general','open')")
 def test_valid_case_history_and_strict_status(self):
  self.db.execute("INSERT INTO tenant_client_cases(organization_id,id,client_id,title,kind,status) VALUES('org-a','case-a','cliente-a','Contrato','contract','open')")
  self.db.execute("INSERT INTO tenant_case_events(organization_id,id,case_id,action) VALUES('org-a','event-a','case-a','created')")
  self.assertEqual(self.db.execute("SELECT count(*) FROM tenant_case_events WHERE organization_id='org-a'").fetchone()[0],1)
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO tenant_client_cases(organization_id,id,client_id,title,kind,status) VALUES('org-a','case-b','cliente-a','Falso','general','wrong')")
 def test_migration_reentrant(self):
  self.db.executescript((MIG/'011_cases.sql').read_text())
if __name__=='__main__':unittest.main()
