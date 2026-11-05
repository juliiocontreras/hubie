import sqlite3
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
class TenantAccessRevocationTest(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  self.db.executescript((ROOT/'turso/migrations/001_core.sql').read_text())
  self.db.executemany('INSERT INTO organizations(id,slug,name) VALUES(?,?,?)',[('org-a','org-aaa','A'),('org-b','org-bbb','B')])
  self.db.executemany('INSERT INTO users(id,email) VALUES(?,?)',[('owner','o@test.invalid'),('member','m@test.invalid')])
  self.db.executemany('INSERT INTO memberships(organization_id,user_id,role) VALUES(?,?,?)',[('org-a','owner','owner'),('org-a','member','member'),('org-b','member','admin')])
 def tearDown(self): self.db.close()
 def test_member_revocation_is_scoped_to_single_company(self):
  result=self.db.execute("UPDATE memberships SET status='suspended' WHERE organization_id='org-a' AND user_id='member' AND role!='owner'")
  self.assertEqual(result.rowcount,1)
  self.assertEqual(self.db.execute("SELECT status FROM memberships WHERE organization_id='org-a' AND user_id='member'").fetchone()[0],'suspended')
  self.assertEqual(self.db.execute("SELECT status FROM memberships WHERE organization_id='org-b' AND user_id='member'").fetchone()[0],'active')
 def test_owner_cannot_be_suspended_by_member_route(self):
  result=self.db.execute("UPDATE memberships SET status='suspended' WHERE organization_id='org-a' AND user_id='owner' AND role!='owner'")
  self.assertEqual(result.rowcount,0)
  self.assertEqual(self.db.execute("SELECT status FROM memberships WHERE organization_id='org-a' AND user_id='owner'").fetchone()[0],'active')
if __name__=='__main__':unittest.main()
