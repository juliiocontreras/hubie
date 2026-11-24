"""Static guardrails for the first Hubie tenancy migration.
Run: python -m unittest discover -s tests -p 'test_*.py'
These are NOT a substitute for live Postgres/RLS integration tests.
"""
from pathlib import Path
import unittest

SQL = (Path(__file__).resolve().parents[1] / "supabase/migrations/202610300001_core_tenancy.sql").read_text()

class TenantMigrationContractTests(unittest.TestCase):
    def test_all_private_tables_enable_rls(self):
        for table in ("organizations", "memberships", "audit_events"):
            self.assertIn(f"alter table public.{table} enable row level security;", SQL)

    def test_all_private_tables_have_no_client_write_policy(self):
        self.assertNotIn("for insert to authenticated", SQL.lower())
        self.assertNotIn("for update to authenticated", SQL.lower())
        self.assertNotIn("for delete to authenticated", SQL.lower())
        for table in ("organizations", "memberships", "audit_events"):
            self.assertIn(f"revoke insert,update,delete on public.organizations,public.memberships,public.audit_events from authenticated;", SQL)

    def test_membership_scope_requires_authenticated_active_member(self):
        for clause in ("auth.uid() is not null", "m.user_id = auth.uid()", "m.status = 'active'", "m.organization_id = p_org"):
            self.assertIn(clause, SQL)

    def test_audit_read_requires_admin_or_owner(self):
        self.assertIn("array['owner','admin']", SQL)

if __name__ == "__main__":
    unittest.main()
