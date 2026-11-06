import sqlite3,unittest
from pathlib import Path
BASE=Path(__file__).resolve().parents[1]/'turso/migrations'
FILES=[f'{i:03d}_'+n+'.sql' for i,n in [
 (1,'core'),(2,'multitenant'),(3,'identity'),(4,'platform_admin'),(5,'google_oidc'),(6,'pwa_records'),
 (7,'operational_workflows'),(8,'clients'),(9,'appearance'),(10,'media'),(11,'cases'),(12,'case_documents'),(13,'entity_relationships')]]
class RelationSchema(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:');self.db.execute('PRAGMA foreign_keys=ON')
  for file in FILES:self.db.executescript((BASE/file).read_text())
  self.db.executemany('INSERT INTO organizations(id,slug,name) VALUES(?,?,?)',[('org-a','empresa-a','A'),('org-b','empresa-b','B')])
  self.db.executemany('INSERT INTO tenant_client_profiles(organization_id,id,name) VALUES(?,?,?)',[('org-a','a-1','Cliente A'),('org-b','b-1','Cliente B')])
  self.db.execute("INSERT INTO tenant_crm_deals(organization_id,id,title) VALUES('org-a','d1','Venta A')")
  self.db.execute("INSERT INTO tenant_crm_deals(organization_id,id,title) VALUES('org-b','d2','Venta B')")
  self.db.execute("INSERT INTO tenant_schedule_events(organization_id,id,title,starts_at,ends_at) VALUES('org-a','e1','Visita','2026-11-09T12:00:00Z','2026-11-09T13:00:00Z')")
  self.db.executemany('INSERT INTO tenant_tools(organization_id,tool_id,enabled) VALUES(?,?,1)',[('org-a','C001'),('org-a','C002'),('org-a','C004'),('org-b','C001'),('org-b','C002')])
 def tearDown(self):self.db.close()
 def test_client_relation_rejects_cross_tenant_reference(self):
  self.db.execute("INSERT INTO tenant_deal_clients(organization_id,deal_id,client_id) VALUES('org-a','d1','a-1')")
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO tenant_deal_clients(organization_id,deal_id,client_id) VALUES('org-a','d2','a-1')")
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("UPDATE tenant_deal_clients SET client_id='b-1' WHERE organization_id='org-a' AND deal_id='d1'")
 def test_agenda_deal_and_client_links_are_company_scoped(self):
  self.db.execute("INSERT INTO tenant_appointment_links(organization_id,appointment_id,client_id,deal_id) VALUES('org-a','e1','a-1','d1')")
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("UPDATE tenant_appointment_links SET client_id='b-1' WHERE organization_id='org-a' AND appointment_id='e1'")
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("UPDATE tenant_appointment_links SET deal_id='d2' WHERE organization_id='org-a' AND appointment_id='e1'")
 def test_generic_link_tenant_partition_and_deduplication(self):
  self.db.execute("INSERT INTO tenant_entity_links(organization_id,id,left_tool_id,left_record_id,right_tool_id,right_record_id) VALUES('org-a','link-1','C001','a-1','C002','d1')")
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO tenant_entity_links(organization_id,id,left_tool_id,left_record_id,right_tool_id,right_record_id) VALUES('org-a','link-2','C001','a-1','C002','d1')")
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO tenant_entity_links(organization_id,id,left_tool_id,left_record_id,right_tool_id,right_record_id) VALUES('org-a','link-3','C001','a-1','C001','a-1')")
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO tenant_entity_links(organization_id,id,left_tool_id,left_record_id,right_tool_id,right_record_id) VALUES('org-b','link-4','C001','b-1','T004','task-a')")
 def test_reentrant_migration(self):self.db.executescript((BASE/'013_entity_relationships.sql').read_text())
if __name__=='__main__':unittest.main()
