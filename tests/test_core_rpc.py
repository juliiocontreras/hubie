import unittest
from pathlib import Path

SQL = (Path(__file__).resolve().parents[1] / "supabase/migrations/202610300002_core_rpc.sql").read_text()

class CoreRpcTests(unittest.TestCase):
    def test_authenticated_owner_creation(self):
        self.assertIn("auth.uid() is null", SQL)
        self.assertIn("'owner', 'active'", SQL)
    def test_owner_safety(self):
        self.assertIn("last active owner", SQL)
        self.assertIn("for update", SQL)
    def test_public_execute_revoked(self):
        self.assertIn("from public;", SQL)
    def test_search_path(self):
        self.assertEqual(SQL.count("set search_path = ''"), 2)
