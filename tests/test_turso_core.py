import sqlite3
import unittest
from pathlib import Path
SCHEMA = (Path(__file__).resolve().parents[1] / 'turso/migrations/001_core.sql').read_text()
class CoreSchemaTest(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  self.db.executescript(SCHEMA)
  self.db.executemany('INSERT INTO users(id,email) VALUES(?,?)',[('a','a@example.test'),('b','b@example.test')])
  self.db.executemany('INSERT INTO organizations(id,slug,name) VALUES(?,?,?)',[('org-a','org-a','A'),('org-b','org-b','B')])
 def tearDown(self): self.db.close()
 def test_org_scope(self):
  self.db.execute("INSERT INTO memberships(organization_id,user_id,role) VALUES('org-a','a','owner')")
  self.assertEqual(self.db.execute("SELECT count(*) FROM memberships WHERE organization_id='org-b'").fetchone()[0],0)
 def test_duplicate_membership(self):
  self.db.execute("INSERT INTO memberships(organization_id,user_id,role) VALUES('org-a','a','owner')")
  with self.assertRaises(sqlite3.IntegrityError): self.db.execute("INSERT INTO memberships(organization_id,user_id,role) VALUES('org-a','a','admin')")
 def test_invalid_role(self):
  with self.assertRaises(sqlite3.IntegrityError): self.db.execute("INSERT INTO memberships(organization_id,user_id,role) VALUES('org-a','a','superuser')")
 def test_foreign_key(self):
  with self.assertRaises(sqlite3.IntegrityError): self.db.execute("INSERT INTO memberships(organization_id,user_id,role) VALUES('missing','a','owner')")
 def test_invitation_token_unique(self):
  self.db.execute("INSERT INTO organization_invitations(id,organization_id,email,role,token_hash,created_by,expires_at) VALUES('i1','org-a','b@example.test','member','hash','a','2099-01-01')")
  with self.assertRaises(sqlite3.IntegrityError): self.db.execute("INSERT INTO organization_invitations(id,organization_id,email,role,token_hash,created_by,expires_at) VALUES('i2','org-b','b@example.test','member','hash','a','2099-01-01')")
if __name__=='__main__': unittest.main()
