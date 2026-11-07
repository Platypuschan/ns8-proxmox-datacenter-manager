import os
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "imageroot/pypkg"))
import pdm_options  # noqa: E402


class NormalizeTests(unittest.TestCase):
    def test_defaults_when_absent(self):
        values = pdm_options.normalize(None)
        self.assertTrue(values["tls_import"])
        self.assertTrue(values["ns8_layout"])
        self.assertTrue(values["disable_nag"])
        self.assertFalse(values["repo_test"])
        self.assertEqual(values["hide_menu"], ["subscription", "registry", "sdn", "ceph"])

    def test_partial_request_keeps_defaults(self):
        values = pdm_options.normalize({"disable_nag": True, "hide_menu": ["ceph", "sdn"]})
        self.assertTrue(values["disable_nag"])
        self.assertEqual(values["hide_menu"], ["sdn", "ceph"])  # canonical order

    def test_rejects_wrong_types_and_unknown_entries(self):
        for bad in ("x", {"tls_import": "yes"}, {"hide_menu": "ceph"}, {"hide_menu": ["dashboard"]}, 5):
            with self.subTest(bad=bad):
                with self.assertRaises(pdm_options.OptionsError):
                    pdm_options.normalize(bad)


class StoreTests(unittest.TestCase):
    def test_round_trip_and_env_format(self):
        with tempfile.TemporaryDirectory() as d:
            self.assertFalse(pdm_options.options_exist(d))
            self.assertIsNone(pdm_options.read_options(d))
            Path(d, "options.env").touch()  # created empty by the service unit
            self.assertFalse(pdm_options.options_exist(d))
            self.assertIsNone(pdm_options.read_options(d))
            written = pdm_options.write_options({"ns8_layout": True, "hide_menu": ["subscription", "registry"]}, d)
            self.assertEqual(pdm_options.read_options(d), written)
            text = Path(d, "options.env").read_text()
            self.assertIn("PDM_NS8_LAYOUT=1\n", text)
            self.assertIn("PDM_REPO_TEST=0\n", text)
            self.assertIn("PDM_HIDE_MENU=subscription,registry\n", text)
            self.assertFalse(Path(d, "options.env.tmp").exists())


if __name__ == "__main__":
    unittest.main()
