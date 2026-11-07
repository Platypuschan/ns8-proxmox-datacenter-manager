import importlib.machinery
import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
loader = importlib.machinery.SourceFileLoader("update_pdm", str(ROOT / ".github/scripts/update-pdm"))
spec = importlib.util.spec_from_loader(loader.name, loader)
update_pdm = importlib.util.module_from_spec(spec)
loader.exec_module(update_pdm)

INDEX = """Package: proxmox-datacenter-manager
Version: 1.1.9
Architecture: amd64

Package: proxmox-datacenter-manager-ui
Version: 1.2.0
Architecture: amd64

Package: proxmox-datacenter-manager
Version: 1.1.10
Architecture: amd64

Package: proxmox-datacenter-manager
Version: 1.1.8
"""


class VersionTests(unittest.TestCase):
    def test_newest_version_compares_numerically_and_ignores_other_packages(self):
        self.assertEqual(update_pdm.newest_version(INDEX), "1.1.10")

    def test_unusable_index_fails(self):
        with self.assertRaises(ValueError):
            update_pdm.newest_version("Package: other\nVersion: 1.0.0\n")
        with self.assertRaises(ValueError):
            update_pdm.version_key("1.1.9-1+pmx")

    def test_catalog_version_bump(self):
        for before, after in (("0.1.0-rc.1", "0.1.0-rc.2"), ("0.1.0-rc.9", "0.1.0-rc.10"),
                              ("0.1.0", "0.1.1"), ("0.1.0-beta", "0.1.0-beta.1")):
            with self.subTest(before=before):
                self.assertEqual(update_pdm.bump_catalog_version(before), after)
        with self.assertRaises(ValueError):
            update_pdm.bump_catalog_version("latest")


class ApplyTests(unittest.TestCase):
    def test_apply_changes_only_the_version_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as d:
            cf, vf = Path(d) / "Containerfile", Path(d) / "CATALOG_VERSION"
            cf.write_text("FROM x\nARG PDM_VERSION=1.1.9\nARG OTHER=1\n")
            vf.write_text("0.1.0-rc.1\n")
            self.assertTrue(update_pdm.apply("1.1.10", cf, vf))
            self.assertEqual(cf.read_text(), "FROM x\nARG PDM_VERSION=1.1.10\nARG OTHER=1\n")
            self.assertEqual(vf.read_text(), "0.1.0-rc.2\n")
            self.assertFalse(update_pdm.apply("1.1.10", cf, vf))
            self.assertEqual(vf.read_text(), "0.1.0-rc.2\n")

    def test_apply_rejects_garbage(self):
        with tempfile.TemporaryDirectory() as d:
            cf, vf = Path(d) / "c", Path(d) / "v"
            cf.write_text("ARG PDM_VERSION=1.1.9\n"); vf.write_text("0.1.0\n")
            with self.assertRaises(ValueError):
                update_pdm.apply("1.1.9; rm -rf /", cf, vf)

    def test_repository_containerfile_is_parseable(self):
        text = (ROOT / "app/Containerfile").read_text()
        update_pdm.version_key(update_pdm.current_version(text))


if __name__ == "__main__":
    unittest.main()
