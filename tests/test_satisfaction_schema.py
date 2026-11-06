import sqlite3,unittest
from pathlib import Path
BASE=Path(__file__).resolve().parents[1]/'turso/migrations'
class SatisfactionSchema(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:');self.db.execute('PRAGMA foreign_keys=ON')
  for f in sorted(BASE.glob('0??_*.sql')):self.db.executescript(f.read_text())
  self.db.executemany('INSERT INTO organizations(id,slug,name) VALUES(?,?,?)',[('a','org-a','Org A'),('b','org-b','Org B')])
  self.db.execute("INSERT INTO tenant_tools(organization_id,tool_id,enabled) VALUES('a','T021',1)")
  self.db.execute("INSERT INTO tenant_tools(organization_id,tool_id,enabled) VALUES('b','T021',1)")
 def tearDown(self):self.db.close()
 def test_rejects_cross_tenant_invitations_and_responses(self):
  self.db.execute("INSERT INTO tenant_surveys(organization_id,id,title,questions_json) VALUES('a','s1','Test','[]')")
  self.db.execute("INSERT INTO tenant_survey_invitations(organization_id,id,survey_id,token_hash,expires_at) VALUES('a','i1','s1','abcd','2030-01-01')")
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO tenant_survey_invitations(organization_id,id,survey_id,token_hash,expires_at) VALUES('b','i2','s1','efgh','2030-01-01')")
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO tenant_survey_responses(organization_id,id,invitation_id,survey_id,answers_json) VALUES('b','r2','i1','s1','{}')")
  self.db.execute("INSERT INTO tenant_survey_responses(organization_id,id,invitation_id,survey_id,answers_json) VALUES('a','r1','i1','s1','{}')")
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO tenant_survey_responses(organization_id,id,invitation_id,survey_id,answers_json) VALUES('a','r2','i1','s1','{}')")
 def test_idempotent(self):self.db.executescript((BASE/'014_satisfaction.sql').read_text())
if __name__=='__main__':unittest.main()
