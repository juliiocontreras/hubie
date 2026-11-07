import sqlite3
import unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
NAMES=['001_core.sql','002_multitenant.sql','003_identity.sql','004_platform_admin.sql','005_google_oidc.sql','006_pwa_records.sql','007_operational_workflows.sql']

class OperationalWorkflowsTest(unittest.TestCase):
 def setUp(self):
  self.db=sqlite3.connect(':memory:')
  for name in NAMES:self.db.executescript((ROOT/'turso/migrations'/name).read_text())
  self.db.executemany('INSERT INTO organizations(id,slug,name) VALUES(?,?,?)',[('org-a','org-aaa','A'),('org-b','org-bbb','B')])
  self.db.execute("INSERT INTO users(id,email) VALUES('user-a','a@test.invalid')")
 def tearDown(self):self.db.close()
 def test_crm_isolation_stage_constraint(self):
  self.db.executemany('INSERT INTO tenant_crm_deals(organization_id,id,title) VALUES(?,?,?)',[('org-a','deal-1','Venta A'),('org-b','deal-1','Venta B')])
  self.db.execute("UPDATE tenant_crm_deals SET stage='won' WHERE organization_id='org-a' AND id='deal-1'")
  self.assertEqual(self.db.execute("SELECT stage FROM tenant_crm_deals WHERE organization_id='org-b' AND id='deal-1'").fetchone()[0],'lead')
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO tenant_crm_deals(organization_id,id,title,stage) VALUES('org-a','deal-2','Venta','unverified')")
 def book(self,org,id,start,end,resource='sala-1'):
  query="""INSERT INTO tenant_schedule_events(organization_id,id,title,resource,starts_at,ends_at)
   SELECT ?,?,?,?,?,? WHERE NOT EXISTS(
    SELECT 1 FROM tenant_schedule_events WHERE organization_id=? AND resource=?
    AND status='scheduled' AND starts_at < ? AND ends_at > ?)"""
  return self.db.execute(query,(org,id,'Reserva',resource,start,end,org,resource,end,start)).rowcount
 def test_schedule_prevents_overlap_only_within_tenant_and_resource(self):
  start='2026-11-12T15:00:00.000Z';end='2026-11-12T16:00:00.000Z'
  self.assertEqual(self.book('org-a','a1',start,end),1)
  self.assertEqual(self.book('org-a','a2','2026-11-12T15:30:00.000Z','2026-11-12T16:30:00.000Z'),0)
  self.assertEqual(self.book('org-a','a3',end,'2026-11-12T17:00:00.000Z'),1)
  self.assertEqual(self.book('org-a','a4',start,end,'sala-2'),1)
  self.assertEqual(self.book('org-b','b1',start,end),1)
  self.assertEqual(self.db.execute("SELECT count(*) FROM tenant_schedule_events WHERE organization_id='org-a'").fetchone()[0],3)
 def test_stock_same_sku_different_organization_and_nonnegative(self):
  self.db.executemany('INSERT INTO tenant_inventory_items(organization_id,id,sku,title) VALUES(?,?,?,?)',[('org-a','item-a','SKU-100','Articulo A'),('org-b','item-b','SKU-100','Articulo B')])
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO tenant_inventory_items(organization_id,id,sku,title) VALUES('org-a','item-aa','SKU-100','Duplicado')")
  self.move('org-a','item-a',5,'m1')
  self.move('org-a','item-a',-3,'m2')
  self.assertEqual(self.move('org-a','item-a',-4,'m3'),0)
  self.assertEqual(self.db.execute("SELECT quantity FROM tenant_inventory_items WHERE organization_id='org-a'").fetchone()[0],2)
  self.assertEqual(self.db.execute("SELECT quantity FROM tenant_inventory_items WHERE organization_id='org-b'").fetchone()[0],0)
  self.assertEqual(self.db.execute("SELECT COUNT(*) FROM tenant_inventory_movements WHERE organization_id='org-a'").fetchone()[0],2)
 def move(self,org,item,delta,id):
  with self.db:
   inserted=self.db.execute("""INSERT INTO tenant_inventory_movements(organization_id,id,item_id,delta)
    SELECT ?,?,?,? FROM tenant_inventory_items WHERE organization_id=? AND id=? AND archived_at IS NULL AND quantity+? BETWEEN 0 AND 1000000000""",(org,id,item,delta,org,item,delta)).rowcount
   self.db.execute("""UPDATE tenant_inventory_items SET quantity=quantity+? WHERE organization_id=? AND id=?
    AND EXISTS (SELECT 1 FROM tenant_inventory_movements WHERE organization_id=? AND id=?)""",(delta,org,item,org,id))
   return inserted
 def test_movement_cannot_target_other_tenant_item(self):
  self.db.execute("INSERT INTO tenant_inventory_items(organization_id,id,sku,title) VALUES('org-a','item-a','SKU-100','Articulo A')")
  self.assertEqual(self.move('org-b','item-a',3,'m1'),0)
  self.assertEqual(self.db.execute('SELECT count(*) FROM tenant_inventory_movements').fetchone()[0],0)
if __name__=='__main__':unittest.main()
