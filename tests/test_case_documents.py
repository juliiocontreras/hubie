import sqlite3,unittest
from pathlib import Path
M=Path(__file__).resolve().parents[1]/'turso/migrations'
N=['001_core.sql','002_multitenant.sql','003_identity.sql','004_platform_admin.sql','005_google_oidc.sql','006_pwa_records.sql','007_operational_workflows.sql','008_clients.sql','009_appearance.sql','010_media.sql','011_cases.sql','012_case_documents.sql']
class CaseDocumentSchema(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:');self.db.execute('PRAGMA foreign_keys=ON')
  for name in N:self.db.executescript((M/name).read_text())
  self.db.executemany('INSERT INTO organizations(id,slug,name) VALUES(?,?,?)',[('a','empresa-a','A'),('b','empresa-b','B')])
  self.db.execute("INSERT INTO tenant_client_profiles(organization_id,id,name) VALUES('a','client-a','Cliente A')")
  self.db.execute("INSERT INTO tenant_client_cases(organization_id,id,client_id,title) VALUES('a','case-a','client-a','Caso A')")
 def tearDown(self):self.db.close()
 def test_document_cannot_reference_case_in_another_organization(self):
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO tenant_case_documents(organization_id,id,case_id,document_type) VALUES('b','doc-b','case-a','contract')")
 def test_revision_relates_only_to_exact_document_and_its_media(self):
  self.db.execute("INSERT INTO tenant_case_documents(organization_id,id,case_id,document_type,expires_on) VALUES('a','doc-a','case-a','contract','2027-02-28')")
  self.db.execute("INSERT INTO pwa_media(id,scope,organization_id,kind,tool_id,record_id,name,mime,size_bytes,content_b64) VALUES('media-a','tenant','a','attachment','C003','case-a','contrato.pdf','application/pdf',4,'QUJDRA==')")
  self.db.execute("INSERT INTO tenant_case_document_versions(organization_id,document_id,media_id,version) VALUES('a','doc-a','media-a',1)")
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO tenant_case_document_versions(organization_id,document_id,media_id,version) VALUES('b','doc-a','media-a',2)")
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO tenant_case_document_versions(organization_id,document_id,media_id,version) VALUES('a','doc-a','media-a',2)")
  self.assertEqual(self.db.execute("SELECT version FROM tenant_case_document_versions WHERE organization_id='a'").fetchone()[0],1)
 def test_reentrant(self):self.db.executescript((M/'012_case_documents.sql').read_text())
if __name__=='__main__':unittest.main()
