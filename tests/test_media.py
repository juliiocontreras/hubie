import sqlite3,unittest
from pathlib import Path
BASE=Path(__file__).resolve().parents[1]/'turso/migrations'
class MediaTest(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  for name in ['001_core.sql','002_multitenant.sql','003_identity.sql','004_platform_admin.sql','005_google_oidc.sql','006_pwa_records.sql','007_operational_workflows.sql','008_clients.sql','009_appearance.sql','010_media.sql']:
   self.db.executescript((BASE/name).read_text())
  self.db.executemany('INSERT INTO organizations(id,slug,name) VALUES(?,?,?)',[('a','empresa-a','A'),('b','empresa-b','B')])
 def tearDown(self):self.db.close()
 def test_per_tenant_media_independent(self):
  self.db.executemany('INSERT INTO pwa_media(id,scope,organization_id,kind,name,mime,size_bytes,content_b64) VALUES(?,?,?,?,?,?,?,?)',[
   ('p1','tenant','a','dashboard_bg','foto.png','image/png',10,'xxx'),
   ('p2','tenant','b','dashboard_bg','foto.png','image/png',10,'yyy')])
  self.assertEqual(self.db.execute("SELECT content_b64 FROM pwa_media WHERE scope='tenant' AND organization_id='a'").fetchone()[0],'xxx')
  self.assertEqual(self.db.execute("SELECT count(*) FROM pwa_media WHERE scope='tenant' AND organization_id='b'").fetchone()[0],1)
 def test_rejects_tenantless_tenant_attachment(self):
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO pwa_media(id,scope,kind,name,mime,size_bytes,content_b64) VALUES('id','tenant','attachment','x','application/pdf',1,'AA==')")
if __name__=='__main__':unittest.main()
