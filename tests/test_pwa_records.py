import sqlite3
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
MIGRATIONS=[ROOT/'turso/migrations'/f'{n:03d}_{name}.sql' for n,name in [
 (1,'core'),(2,'multitenant'),(3,'identity'),(4,'platform_admin'),(5,'google_oidc'),(6,'pwa_records')]]
class TenantRecordsIntegrationTests(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  for p in MIGRATIONS:self.db.executescript(p.read_text())
  self.db.executemany('INSERT INTO organizations(id,slug,name) VALUES(?,?,?)',[
   ('org-a','org-aaa','Tenant A'),('org-b','org-bbb','Tenant B')])
  self.db.execute("INSERT INTO users(id,email) VALUES('user-a','a@example.test')")
  self.db.execute("INSERT INTO memberships(organization_id,user_id,role) VALUES('org-a','user-a','owner')")
  self.db.executemany('INSERT INTO tenant_settings(organization_id,suite_id,display_name) VALUES(?,?,?)',[
   ('org-a','S001','A'),('org-b','S001','B')])
  self.db.executemany('INSERT INTO tenant_tools(organization_id,tool_id,enabled) VALUES(?,?,?)',[
   ('org-a','C001',1),('org-b','C001',0)])
 def tearDown(self):self.db.close()
 def test_same_record_id_is_partitioned_by_org(self):
  self.db.executemany("INSERT INTO tenant_tool_records(organization_id,id,tool_id,title) VALUES(?,?,?,?)",[
   ('org-a','same-id','C001','A customer'),('org-b','same-id','C001','B customer')])
  a=self.db.execute("SELECT title FROM tenant_tool_records WHERE organization_id=? AND tool_id=? AND archived_at IS NULL",('org-a','C001')).fetchall()
  b=self.db.execute("SELECT title FROM tenant_tool_records WHERE organization_id=? AND tool_id=? AND archived_at IS NULL",('org-b','C001')).fetchall()
  self.assertEqual(a,[('A customer',)])
  self.assertEqual(b,[('B customer',)])
 def test_write_to_unknown_tool_is_rejected_by_foreign_key(self):
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO tenant_tool_records(organization_id,id,tool_id,title) VALUES('org-a','a-1','T999','Forbidden')")
 def test_cross_tenant_tool_reference_is_rejected(self):
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO tenant_tool_records(organization_id,id,tool_id,title) VALUES('org-b','b-1','T015','Forbidden')")
 def test_archiving_is_organization_scoped(self):
  self.db.executemany("INSERT INTO tenant_tool_records(organization_id,id,tool_id,title) VALUES(?,?,?,?)",[
   ('org-a','same-id','C001','A'),('org-b','same-id','C001','B')])
  self.db.execute("UPDATE tenant_tool_records SET archived_at=CURRENT_TIMESTAMP WHERE organization_id='org-a' AND tool_id='C001' AND id='same-id'")
  self.assertEqual(self.db.execute("SELECT archived_at FROM tenant_tool_records WHERE organization_id='org-a'").fetchone()[0] is not None,True)
  self.assertIsNone(self.db.execute("SELECT archived_at FROM tenant_tool_records WHERE organization_id='org-b'").fetchone()[0])
 def test_disabled_tool_remains_in_database_without_deleting_records(self):
  self.db.execute("INSERT INTO tenant_tool_records(organization_id,id,tool_id,title) VALUES('org-a','one','C001','Client')")
  self.db.execute("UPDATE tenant_tools SET enabled=0 WHERE organization_id='org-a' AND tool_id='C001'")
  self.assertEqual(self.db.execute("SELECT COUNT(*) FROM tenant_tool_records WHERE organization_id='org-a'").fetchone()[0],1)
  self.assertEqual(self.db.execute("SELECT COUNT(*) FROM tenant_tools WHERE organization_id='org-a' AND tool_id='C001' AND enabled=1").fetchone()[0],0)
if __name__=='__main__':unittest.main()
