import unittest
from pathlib import Path
SQL = (Path(__file__).resolve().parents[1] / "supabase/migrations/202610300003_invitations.sql").read_text()
class InvitationContracts(unittest.TestCase):
 def test_invite_is_org_scoped(self):
  self.assertIn("public.hubie_has_org_role(p_org,array['owner','admin'])", SQL)
 def test_acceptance_requires_matching_authenticated_email(self):
  self.assertIn("auth.jwt() ->> 'email'", SQL)
  self.assertIn("lower(trim(v_inv.email))", SQL)
 def test_token_is_hashed(self):
  self.assertIn("digest(p_token,'sha256')", SQL)
  self.assertIn("token_hash bytea", SQL)
 def test_invite_expires_and_is_single_use(self):
  self.assertIn("expires_at > now()", SQL)
  self.assertIn("consumed_at = now()", SQL)
 def test_public_access_denied(self):
  self.assertIn("revoke all on public.organization_invitations from anon, authenticated", SQL)
if __name__ == '__main__': unittest.main()
