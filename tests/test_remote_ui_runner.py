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
