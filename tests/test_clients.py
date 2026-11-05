import sqlite3
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
MIGRATIONS=['001_core.sql','002_multitenant.sql','003_identity.sql','004_platform_admin.sql','005_google_oidc.sql','006_pwa_records.sql','007_operational_workflows.sql','008_clients.sql']
class ClientRegistryTests(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  for name in MIGRATIONS:self.db.executescript((ROOT/'turso/migrations'/name).read_text())
  self.db.executemany("INSERT INTO organizations(id,slug,name) VALUES(?,?,?)",[('o1','org-uno','Empresa 1'),('o2','org-dos','Empresa 2')])
 def tearDown(self):self.db.close()
 def test_same_email_in_another_tenant_is_allowed(self):
  self.db.executemany("INSERT INTO tenant_clients(organization_id,id,name,email) VALUES(?,?,?,?)",[
   ('o1','c1','Cliente Uno','ventas@empresa.mx'),('o2','c2','Cliente Dos','ventas@empresa.mx')])
  self.assertEqual(self.db.execute('SELECT count(*) FROM tenant_clients').fetchone()[0],2)
 def test_duplicate_active_email_within_tenant_rejected(self):
  self.db.execute("INSERT INTO tenant_clients(organization_id,id,name,email) VALUES('o1','c1','Cliente 1','a@b.mx')")
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO tenant_clients(organization_id,id,name,email) VALUES('o1','c2','Cliente 2','a@b.mx')")
  self.db.execute("UPDATE tenant_clients SET archived_at=CURRENT_TIMESTAMP WHERE organization_id='o1' AND id='c1'")
  self.db.execute("INSERT INTO tenant_clients(organization_id,id,name,email) VALUES('o1','c2','Cliente 2','a@b.mx')")
  self.assertEqual(self.db.execute("SELECT count(*) FROM tenant_clients WHERE organization_id='o1' AND archived_at IS NULL").fetchone()[0],1)
 def test_optional_email_and_tenant_scoped_edits(self):
  self.db.executemany("INSERT INTO tenant_clients(organization_id,id,name,email) VALUES(?,?,?,?)",[
   ('o1','c1','Cliente Uno',''),('o1','c2','Cliente Dos',''),('o2','c3','Cliente Tres','')])
  self.db.execute("UPDATE tenant_clients SET name='Nuevo' WHERE organization_id='o1' AND id='c3'")
  self.assertEqual(self.db.execute("SELECT name FROM tenant_clients WHERE organization_id='o2' AND id='c3'").fetchone()[0],'Cliente Tres')
 def test_status_constraints(self):
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO tenant_clients(organization_id,id,name,status) VALUES('o1','c1','Cliente Uno','stolen')")
if __name__=='__main__':unittest.main()
