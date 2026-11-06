import sqlite3, unittest
from pathlib import Path
BASE=Path(__file__).resolve().parents[1]
NAMES=['001_core.sql','002_multitenant.sql','003_identity.sql','004_platform_admin.sql','005_google_oidc.sql','006_pwa_records.sql','007_operational_workflows.sql','008_clients.sql','009_appearance.sql','010_media.sql','011_cases.sql']
class DashboardCases(unittest.TestCase):
 def test_dashboard_counts_only_real_non_archived_cases(self):
  db=sqlite3.connect(':memory:')
  db.execute('PRAGMA foreign_keys=ON')
  for name in NAMES:db.executescript((BASE/'turso/migrations'/name).read_text())
  db.executemany('INSERT INTO organizations(id,slug,name) VALUES(?,?,?)',[('org-a','empresa-a','A'),('org-b','empresa-b','B')])
  for org in ('org-a','org-b'):db.execute("INSERT INTO tenant_tools(organization_id,tool_id,enabled) VALUES(?,'C003',1)",(org,))
  db.execute("INSERT INTO tenant_client_profiles(organization_id,id,name) VALUES('org-a','client-a','Cliente A')")
  db.execute("INSERT INTO tenant_client_cases(organization_id,id,client_id,title,kind,status) VALUES('org-a','case-a','client-a','Case A','general','open')")
  db.execute("INSERT INTO tenant_client_cases(organization_id,id,client_id,title,kind,status,archived_at) VALUES('org-a','case-b','client-a','Case B','general','open','2026-01-01')")
  db.execute("INSERT INTO tenant_tool_records(organization_id,id,tool_id,title) VALUES('org-a','legacy-case','C003','Legacy')")
  query=(BASE/'platform/dashboard-counts.sql').read_text()
  a=dict(db.execute(query,['org-a']*7).fetchall())
  b=dict(db.execute(query,['org-b']*7).fetchall())
  self.assertEqual(a.get('C003'),1)
  self.assertNotIn('C003',b)
  db.close()
if __name__=='__main__':unittest.main()
