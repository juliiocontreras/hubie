import json,sqlite3,subprocess,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
DB=ROOT/'turso/migrations'
ORGANIZATION='11111111-1111-4111-8111-111111111111'
ADMIN='22222222-2222-4222-8222-222222222222'
class StagingQASeed(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  self.db.execute('PRAGMA foreign_keys=ON')
  for file in sorted(DB.glob('0[0-1][0-9]_*.sql')):
   self.db.executescript(file.read_text())
  self.db.execute("INSERT INTO organizations(id,slug,name) VALUES(?,?,?)",(ORGANIZATION,'hubie-qa-piloto','Hubie QA · Empresa de Prueba'))
  self.db.execute("INSERT INTO users(id,email) VALUES(?,'qa-admin@example.invalid')",(ADMIN,))
  self.db.execute("INSERT INTO platform_admins(user_id) VALUES(?)",(ADMIN,))
  self.db.execute("INSERT INTO memberships(organization_id,user_id,role) VALUES(?,?,'owner')",(ORGANIZATION,ADMIN))
  self.db.execute("INSERT INTO tenant_settings(organization_id,suite_id,display_name) VALUES(?,'S006','Hubie QA · Empresa de Prueba')",(ORGANIZATION,))
  self.db.executemany("INSERT INTO tenant_tools(organization_id,tool_id,enabled) VALUES(?,?,1)",[(ORGANIZATION,t) for t in ['C001','C002','C003','C004','C005','C006','C007','C008','C009','C010','T004','T013']])
  code="import {makeQaSeedPlan} from './platform/staging-qa-fixture.mjs';console.log(JSON.stringify(makeQaSeedPlan(process.argv[1],process.argv[2])))"
  output=subprocess.run(['node','--input-type=module','-e',code,ORGANIZATION,ADMIN],cwd=ROOT,check=True,text=True,capture_output=True)
  self.statements=json.loads(output.stdout)
 def tearDown(self):self.db.close()
 def apply(self):
  with self.db:
   for query in self.statements:self.db.execute(query['sql'],query['args'])
 def test_seed_is_consistent_reentrant_and_fully_tenant_scoped(self):
  self.apply()
  for table in ['tenant_client_profiles','tenant_crm_deals','tenant_deal_clients','tenant_client_cases','tenant_schedule_events','tenant_appointment_links','tenant_inventory_items','tenant_case_documents','tenant_case_document_versions','pwa_media','tenant_entity_links']:
   self.assertGreater(self.db.execute('SELECT COUNT(*) FROM '+table+' WHERE organization_id=?',(ORGANIZATION,)).fetchone()[0],0,table)
  row=self.db.execute("SELECT c.name,d.title,k.title,e.title FROM tenant_client_profiles c JOIN tenant_deal_clients l ON l.organization_id=c.organization_id AND l.client_id=c.id JOIN tenant_crm_deals d ON d.organization_id=l.organization_id AND d.id=l.deal_id JOIN tenant_client_cases k ON k.organization_id=c.organization_id AND k.client_id=c.id JOIN tenant_appointment_links al ON al.organization_id=c.organization_id AND al.client_id=c.id AND al.deal_id=d.id JOIN tenant_schedule_events e ON e.organization_id=al.organization_id AND e.id=al.appointment_id WHERE c.organization_id=?",(ORGANIZATION,)).fetchone()
  self.assertTrue(all('DEMO' in x or 'Demo' in x for x in row))
  before={t:self.db.execute('SELECT COUNT(*) FROM '+t+' WHERE organization_id=?',(ORGANIZATION,)).fetchone()[0] for t in ['tenant_client_profiles','tenant_crm_deals','tenant_case_documents','tenant_tool_records','pwa_media']}
  self.apply()
  after={t:self.db.execute('SELECT COUNT(*) FROM '+t+' WHERE organization_id=?',(ORGANIZATION,)).fetchone()[0] for t in before}
  self.assertEqual(before,after,'repeated staging deployment must not double sample data')
  self.assertEqual(self.db.execute('PRAGMA foreign_key_check').fetchall(),[])
if __name__=='__main__':unittest.main()
