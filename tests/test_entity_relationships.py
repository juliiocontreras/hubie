import sqlite3,unittest
from pathlib import Path
BASE=Path(__file__).resolve().parents[1]/'turso/migrations'
FILES=[f'{i:03d}_'+s+'.sql' for i,s in [
 (1,'core'),(2,'multitenant'),(3,'identity'),(4,'platform_admin'),(5,'google_oidc'),(6,'pwa_records'),
 (7,'operational_workflows'),(8,'clients'),(9,'appearance'),(10,'media'),(11,'cases'),(12,'case_documents'),(13,'entity_relationships')]]
class RelationSchema(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:');self.db.execute('PRAGMA foreign_keys=ON')
  for file in FILES:self.db.executescript((BASE/file).read_text())
  self.db.executemany('INSERT INTO organizations(id,slug,name) VALUES(?,?,?)',[('org-a','empresa-a','A'),('org-b','empresa-b','B')])
  self.db.executemany('INSERT INTO tenant_client_profiles(organization_id,id,name) VALUES(?,?,?)',[('org-a','a-1','Cliente A'),('org-b','b-1','Cliente B')])
 def tearDown(self):self.db.close()
 def test_client_link_guard_prevents_foreign_or_archived_client(self):
  self.db.execute("INSERT INTO tenant_crm_deals(organization_id,id,title,client_id) VALUES('org-a','d1','Deal A','a-1')")
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO tenant_crm_deals(organization_id,id,title,client_id) VALUES('org-a','d2','Deal B','b-1')")
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("UPDATE tenant_crm_deals SET client_id='b-1' WHERE organization_id='org-a' AND id='d1'")
 def test_agenda_deal_must_belong_to_company_and_client(self):
  self.db.execute("INSERT INTO tenant_crm_deals(organization_id,id,title,client_id) VALUES('org-a','d1','Deal A','a-1')")
  self.db.execute("INSERT INTO tenant_schedule_events(organization_id,id,title,starts_at,ends_at,client_id,deal_id) VALUES('org-a','e1','Visita','2026-11-09T12:00:00Z','2026-11-09T13:00:00Z','a-1','d1')")
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO tenant_schedule_events(organization_id,id,title,starts_at,ends_at,client_id,deal_id) VALUES('org-b','e2','Visita','2026-11-09T12:00:00Z','2026-11-09T13:00:00Z','b-1','d1')")
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("UPDATE tenant_schedule_events SET client_id='b-1' WHERE organization_id='org-a' AND id='e1'")
 def test_generic_relation_is_tenant_scoped_and_deduped(self):
  self.db.execute("INSERT INTO tenant_entity_links(organization_id,id,left_tool_id,left_record_id,right_tool_id,right_record_id) VALUES('org-a','link-1','C001','a-1','C002','d1')")
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO tenant_entity_links(organization_id,id,left_tool_id,left_record_id,right_tool_id,right_record_id) VALUES('org-a','link-2','C001','a-1','C002','d1')")
 def test_reentrant_migration(self):self.db.executescript((BASE/'013_entity_relationships.sql').read_text())
if __name__=='__main__':unittest.main()
