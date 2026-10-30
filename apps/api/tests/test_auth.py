"""认证与权限的服务层用例（HTTP 层在真机冒烟验证）。"""
import unittest

from helpers import make_user, DEMO_PASSWORD

from app.db import q_one
from app.deps import user_roles
from app.security import verify_password


class TestAuthService(unittest.TestCase):
    def test_user_roles(self):
        uid = make_user(("user",))
        self.assertEqual(user_roles(uid), {"user"})
        staff = make_user(("staff",))
        self.assertEqual(user_roles(staff), {"staff"})

    def test_password_verify(self):
        uid = make_user()
        row = q_one("SELECT password_hash FROM users WHERE id = ?", (uid,))
        self.assertTrue(verify_password("Test1234!", row["password_hash"]))
        self.assertFalse(verify_password("wrong-pass", row["password_hash"]))

    def test_seed_accounts_exist_with_roles(self):
        admin = q_one("SELECT id FROM users WHERE email = 'admin@demo.local'")
        staff = q_one("SELECT id FROM users WHERE email = 'staff@demo.local'")
        self.assertIsNotNone(admin)
        self.assertIsNotNone(staff)
        self.assertIn("admin", user_roles(admin["id"]))
        self.assertIn("staff", user_roles(staff["id"]))


if __name__ == "__main__":
    unittest.main()
