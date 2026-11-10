"""Readiness diagnostics must never expose disposable authentication values."""
import importlib.machinery
import importlib.util
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
loader = importlib.machinery.SourceFileLoader("remote_ui_runner", str(ROOT / "tests/run_remote_ui_test.py"))
spec = importlib.util.spec_from_loader(loader.name, loader)
assert spec is not None
runner = importlib.util.module_from_spec(spec)
loader.exec_module(runner)

class DiagnosticTests(unittest.TestCase):
    def test_redacts_password_and_hash(self):
        formatter = getattr(runner, "sanitize_diagnostic", None)
        self.assertIsNotNone(formatter, "Readiness diagnostics need a redacting formatter")
        assert formatter is not None
        raw = "container exited: plain-disposable-password hash-value-for-password"
        result = formatter(raw, ["plain-disposable-password", "hash-value-for-password"])
        self.assertNotIn("plain-disposable-password", result)
        self.assertNotIn("hash-value-for-password", result)
        self.assertIn("container exited", result)

    def test_bounds_output_and_ignores_empty_secret(self):
        formatter = getattr(runner, "sanitize_diagnostic", None)
        self.assertIsNotNone(formatter)
        assert formatter is not None
        self.assertEqual(formatter("safe", [""]), "safe")
        self.assertLessEqual(len(formatter("x" * 20000, [])), 12000)

    def test_fixture_matches_production_hostname_and_owns_dns_search(self):
        factory = getattr(runner, "container_command", None)
        self.assertIsNotNone(factory, "Fixture must own its certificate identity inputs")
        assert factory is not None
        command = factory("owned-fixture", "example.invalid/image:test")
        hostname = command[command.index("--hostname") + 1]
        search = command[command.index("--dns-search") + 1]
        self.assertEqual(hostname, "pdm")
        self.assertIn("--hostname " + hostname, (ROOT / "imageroot/systemd/user/pdm.service").read_text())
        self.assertEqual(search, "pdm-test.invalid")
        self.assertLessEqual(len(hostname + "." + search), 64)

    def test_fixture_keeps_loopback_binding_and_hash_in_environment_only(self):
        factory = getattr(runner, "container_command", None)
        self.assertIsNotNone(factory)
        assert factory is not None
        command = factory("owned-fixture", "example.invalid/image:test")
        self.assertEqual(command[command.index("-p") + 1], "127.0.0.1::8443")
        self.assertEqual(command[command.index("-e") + 1], "PASSWORD_HASH")
        self.assertEqual(command[-1], "example.invalid/image:test")
