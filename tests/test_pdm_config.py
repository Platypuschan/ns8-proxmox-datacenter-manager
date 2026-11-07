import os
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "imageroot/pypkg"))
import pdm_config  # noqa: E402


class ValidatePasswordTests(unittest.TestCase):
    def test_accepts_normal_and_unicode_passwords(self):
        for value in ("abcdefgh", "p@ss w0rd with spaces", "Pässwörd-ß-€uro", "$6$x$y#'\"\\a" * 2):
            self.assertEqual(pdm_config.validate_password(value), value)

    def test_rejects_short(self):
        with self.assertRaises(pdm_config.PasswordError) as ctx:
            pdm_config.validate_password("a" * 7)
        self.assertEqual(ctx.exception.args[0], "admin_password_too_short")

    def test_rejects_control_characters_and_overlong(self):
        for value in ("abcdefgh\n", "abc\rdefgh", "abcdefg\x00", "a" * 129, None, 12345678):
            with self.subTest(value=value):
                with self.assertRaises(pdm_config.PasswordError) as ctx:
                    pdm_config.validate_password(value)
                self.assertEqual(ctx.exception.args[0], "invalid_admin_password")


class AdminEnvTests(unittest.TestCase):
    def test_hash_verifies_with_openssl(self):
        password = "correct horse $battery 'staple'"
        value = pdm_config.hash_password(password)
        self.assertRegex(value, pdm_config.HASH_RE)
        salt = value.split("$")[2]
        again = subprocess.run(
            ["openssl", "passwd", "-6", "-salt", salt, "-stdin"],
            input=password + "\n", capture_output=True, text=True, check=True,
        ).stdout.strip()
        self.assertEqual(value, again)

    def test_writes_private_hash_only_file(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertFalse(pdm_config.has_admin_password(directory))
            pdm_config.write_admin_password("super-secret-1", directory)
            path = Path(directory) / "admin.env"
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            content = path.read_text(encoding="utf-8")
            self.assertTrue(content.startswith("PASSWORD_HASH=$6$"))
            self.assertNotIn("super-secret-1", content)
            self.assertEqual(content.count("\n"), 1)
            self.assertTrue(pdm_config.has_admin_password(directory))
            self.assertEqual(sorted(os.listdir(directory)), ["admin.env", "restart-needed"])

    def test_rewrite_replaces_hash(self):
        with tempfile.TemporaryDirectory() as directory:
            pdm_config.write_admin_password("first-password", directory)
            first = (Path(directory) / "admin.env").read_text()
            pdm_config.write_admin_password("second-password", directory)
            self.assertNotEqual(first, (Path(directory) / "admin.env").read_text())

    def test_restart_marker_is_set_by_a_write_and_taken_once(self):
        with tempfile.TemporaryDirectory() as directory:
            self.assertFalse(pdm_config.take_restart_marker(directory))
            pdm_config.write_admin_password("first-password", directory)
            self.assertTrue(pdm_config.take_restart_marker(directory))
            self.assertFalse(pdm_config.take_restart_marker(directory))

    def test_invalid_password_is_not_written(self):
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(pdm_config.PasswordError):
                pdm_config.write_admin_password("short", directory)
            self.assertEqual(os.listdir(directory), [])


if __name__ == "__main__":
    unittest.main()
