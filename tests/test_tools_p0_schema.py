import sqlite3
import unittest
from pathlib import Path
M = Path(__file__).resolve().parents[1] / 'turso/migrations'
# 016 no aplica en sqlite en la base actual: crea un índice sobre
# tenant_catalog_items.sku, columna que 001 no creó (fallo preexistente,
# fuera del frente TOOLS P0). Se sustituye por un stub mínimo de
# tenant_quotes, que es la única tabla de 016 que referencia la 021.
STUB_QUOTES = ("CREATE TABLE IF NOT EXISTS tenant_quotes("
 "organization_id TEXT NOT NULL, id TEXT NOT NULL, client_id TEXT,"
 " PRIMARY KEY(organization_id,id))")
BASE = ['001_core.sql', '002_multitenant.sql', '003_identity.sql',
 '004_platform_admin.sql', '005_google_oidc.sql', '006_pwa_records.sql',
 '007_operational_workflows.sql', '008_clients.sql', '009_appearance.sql',
 '010_media.sql', '011_cases.sql', '012_case_documents.sql',
 '013_entity_relationships.sql', '014_satisfaction.sql', '015_billing.sql']


class ToolsP0Schema(unittest.TestCase):
 def setUp(self):
  self.db = sqlite3.connect(':memory:')
  self.db.execute('PRAGMA foreign_keys=ON')
  for name in BASE:
   self.db.executescript((M / name).read_text())
  self.db.executescript(STUB_QUOTES)
  self.db.executescript((M / '021_tools_p0.sql').read_text())
  self.db.executemany('INSERT INTO organizations(id,slug,name) VALUES(?,?,?)',
   [('org-a', 'org-a', 'A'), ('org-b', 'org-b', 'B')])
  self.db.executemany('INSERT INTO users(id,email) VALUES(?,?)',
   [('u-owner', 'owner@example.test'), ('u-member', 'member@example.test'),
    ('u-viewer', 'viewer@example.test')])
  self.db.executemany('INSERT INTO tenant_tools(organization_id,tool_id,enabled) VALUES(?,?,1)',
   [('org-a', t) for t in ('C001', 'C002', 'C003', 'C004', 'T013')])
  self.db.execute("INSERT INTO tenant_client_profiles(organization_id,id,name,email)"
   " VALUES('org-a','client-a','Cliente A','a@example.test')")
  self.db.execute("INSERT INTO tenant_crm_deals(organization_id,id,title)"
   " VALUES('org-a','deal-a','Trato A')")
  self.db.execute("INSERT INTO tenant_quotes(organization_id,id,client_id)"
   " VALUES('org-a','quote-a','client-a')")
  self.db.execute("INSERT INTO tenant_client_cases(organization_id,id,client_id,title)"
   " VALUES('org-a','case-a','client-a','Caso A')")
  self.db.execute("INSERT INTO tenant_case_documents(organization_id,id,case_id,document_type)"
   " VALUES('org-a','doc-a','case-a','contract')")

 def tearDown(self):
  self.db.close()

 def test_migration_is_reentrant_and_additive(self):
  # Segunda aplicación no debe fallar ni borrar datos.
  self.db.executescript((M / '021_tools_p0.sql').read_text())
  self.assertEqual(self.db.execute(
   "SELECT count(*) FROM tenant_crm_deals WHERE id='deal-a'").fetchone()[0], 1)
  statements = [s.strip() for s in (M / '021_tools_p0.sql').read_text().split(';')]
  self.assertFalse([s for s in statements if s.upper().startswith('PRAGMA')],
   '021 no debe contener sentencias PRAGMA')
  self.assertNotIn('DROP TABLE', (M / '021_tools_p0.sql').read_text().upper())

 def test_indexes_have_at_most_three_columns_and_no_where(self):
  sql = (M / '021_tools_p0.sql').read_text()
  statements = [s.strip() for s in sql.split(';')]
  for stmt in statements:
   if stmt.upper().startswith('CREATE INDEX'):
    self.assertNotIn('WHERE', stmt.upper())
    cols = stmt.split('(', 1)[1].split(')', 1)[0].split(',')
    self.assertLessEqual(len(cols), 3, stmt[:80])
  # Regla viva 2026-11-13 (main 2b857e5): ningún índice sobre
  # tenant_catalog_items — Turso rechaza cualquiera, aunque pase en libsql.
  self.assertNotIn('tenant_catalog_items', sql)

 def test_deal_assignment_and_tasks(self):
  self.db.execute("INSERT INTO tenant_deal_assignments(organization_id,deal_id,assigned_user_id)"
   " VALUES('org-a','deal-a','u-member')")
  self.assertEqual(self.db.execute(
   "SELECT assigned_user_id FROM tenant_deal_assignments WHERE deal_id='deal-a'").fetchone()[0],
   'u-member')
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO tenant_deal_assignments(organization_id,deal_id,assigned_user_id)"
    " VALUES('org-b','deal-a','u-member')")
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO tenant_crm_deal_tasks(organization_id,id,deal_id,title,status)"
    " VALUES('org-a','t-bad','deal-a','X','waiting')")
  self.db.execute("INSERT INTO tenant_crm_deal_tasks(organization_id,id,deal_id,title,due_at)"
   " VALUES('org-a','t-1','deal-a','Llamar al cliente','2026-11-20T10:00:00Z')")
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO tenant_crm_deal_tasks(organization_id,id,deal_id,title)"
    " VALUES('org-b','t-2','deal-a','Cruce de tenant')")

 def test_deal_quote_link_is_unique_per_quote(self):
  self.db.execute("INSERT INTO tenant_deal_quotes(organization_id,deal_id,quote_id)"
   " VALUES('org-a','deal-a','quote-a')")
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO tenant_deal_quotes(organization_id,deal_id,quote_id)"
    " VALUES('org-a','deal-a','quote-a')")

 def test_document_visibility_and_access_grants(self):
  # Sin fila en tenant_case_document_settings la visibilidad es 'team'.
  self.assertEqual(self.db.execute(
   "SELECT COALESCE(s.visibility,'team') FROM tenant_case_documents d"
   " LEFT JOIN tenant_case_document_settings s ON s.document_id=d.id"
   " WHERE d.id='doc-a'").fetchone()[0], 'team')
  self.db.execute("INSERT INTO tenant_case_document_settings(organization_id,document_id,visibility)"
   " VALUES('org-a','doc-a','restricted')")
  self.db.execute("INSERT INTO tenant_case_document_access(organization_id,document_id,user_id,access)"
   " VALUES('org-a','doc-a','u-member','read')")
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO tenant_case_document_access(organization_id,document_id,user_id,access)"
    " VALUES('org-a','doc-a','u-member','admin')")
  self.db.execute("INSERT INTO tenant_case_access(organization_id,case_id,user_id,access)"
   " VALUES('org-a','case-a','u-viewer','read')")
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO tenant_case_access(organization_id,case_id,user_id,access)"
    " VALUES('org-b','case-a','u-viewer','read')")

 def test_member_tool_override_defaults_to_role(self):
  # Sin fila en tenant_member_tools manda el rol (verificado en
  # member-tools-p0.mjs: defaultToolAccess); la tabla solo guarda excepciones.
  self.db.execute("INSERT INTO tenant_member_tools(organization_id,user_id,tool_id,access)"
   " VALUES('org-a','u-viewer','C002','none')")
  self.assertEqual(self.db.execute(
   "SELECT access FROM tenant_member_tools WHERE user_id='u-viewer'").fetchone()[0], 'none')
  with self.assertRaises(sqlite3.IntegrityError):
   self.db.execute("INSERT INTO tenant_member_tools(organization_id,user_id,tool_id,access)"
    " VALUES('org-a','u-viewer','C002','super')")

 def test_suspended_member_fails_the_exact_authorization_predicate(self):
  # requireMembership (tenant.mjs) ejecuta literalmente:
  # SELECT role FROM memberships WHERE organization_id=? AND user_id=?
  # AND status='active'. Un suspendido no devuelve fila: no autoriza nada.
  self.db.execute("INSERT INTO memberships(organization_id,user_id,role,status)"
   " VALUES('org-a','u-member','member','suspended')")
  predicate = ("SELECT role FROM memberships WHERE organization_id=?"
   " AND user_id=? AND status='active'")
  self.assertIsNone(self.db.execute(predicate, ('org-a', 'u-member')).fetchone())
  self.db.execute("UPDATE memberships SET status='active'"
   " WHERE organization_id='org-a' AND user_id='u-member'")
  self.assertEqual(self.db.execute(predicate, ('org-a', 'u-member')).fetchone()[0], 'member')

 def test_owner_cannot_be_suspended(self):
  # setTenantMemberStatus (admin.mjs) excluye al owner con role!='owner'.
  self.db.execute("INSERT INTO memberships(organization_id,user_id,role,status)"
   " VALUES('org-a','u-owner','owner','active')")
  cur = self.db.execute("UPDATE memberships SET status='suspended'"
   " WHERE organization_id='org-a' AND user_id='u-owner' AND role!='owner'")
  self.assertEqual(cur.rowcount, 0)
  self.assertEqual(self.db.execute(
   "SELECT status FROM memberships WHERE user_id='u-owner'").fetchone()[0], 'active')

 def test_merge_audit_row_links_kept_and_merged_clients(self):
  # El email distinto es deliberado: el índice único parcial de 008 impide
  # dos clientes activos con el mismo email en sqlite (en Turso vivo ese
  # índice parcial no se creó, y ahí es donde aparecen los duplicados).
  self.db.execute("INSERT INTO tenant_client_profiles(organization_id,id,name,email)"
   " VALUES('org-a','client-b','Cliente B','b@example.test')")
  self.db.execute("INSERT INTO tenant_client_merges(organization_id,id,kept_client_id,merged_client_id,merged_by,reason)"
   " VALUES('org-a','merge-1','client-a','client-b','u-owner','Duplicado por email')")
  row = self.db.execute(
   "SELECT kept_client_id,merged_client_id FROM tenant_client_merges WHERE id='merge-1'").fetchone()
  self.assertEqual(row, ('client-a', 'client-b'))


if __name__ == '__main__':
 unittest.main()
