"""Guard update ownership and the actual pins consumed by CI/builds."""
import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class RenovatePolicyTests(unittest.TestCase):
    def config(self):
        path = ROOT / "renovate.json"
        self.assertTrue(path.exists(), "Renovate needs a repository policy")
        return json.loads(path.read_text())

    def test_no_competing_runtime_updater_or_unreviewed_merges(self):
        config = self.config()
        self.assertFalse(config["automerge"])
        self.assertIn("app/**", config["ignorePaths"])
        self.assertTrue(any(r.get("enabled") is False and r.get("matchFileNames") == [r"/^package\.json$/"]
                            for r in config["packageRules"]))
        self.assertEqual(config["rebaseWhen"], "behind-base-branch")
        majors = [r for r in config["packageRules"] if "major" in r.get("matchUpdateTypes", [])]
        self.assertTrue(any(r.get("dependencyDashboardApproval") for r in majors))

    def test_custom_managers_cover_all_shell_and_browser_pins(self):
        config = self.config()
        extracted = []
        for manager in config["customManagers"]:
            # File patterns are explicit paths; exercise the configured regexes,
            # translating only the named-group spelling for Python's regex engine.
            for name in manager["managerFilePatterns"]:
                text = (ROOT / name).read_text()
                for expression in manager["matchStrings"]:
                    expression = re.sub(r"\(\?<([A-Za-z]+)>", r"(?P<\1>", expression)
                    extracted.extend((name, m.group("depName"), m.group("currentValue"))
                                     for m in re.finditer(expression, text))
        node_versions = {version for _, dep, version in extracted if dep == "node"}
        self.assertEqual(len(node_versions), 1)
        node_version = next(iter(node_versions))
        self.assertIn(f"FROM node:{node_version}-bookworm", (ROOT / "ui/Containerfile").read_text())
        browser_versions = {version for _, dep, version in extracted if dep == "playwright"}
        self.assertEqual(len(browser_versions), 1)
        for name in (".github/workflows/validate.yml", ".github/workflows/publish-images.yml"):
            self.assertIn((name, "playwright", next(iter(browser_versions))), extracted)
            text = (ROOT / name).read_text()
            self.assertEqual(set(re.findall(r'node-version: "([^\"]+)"', text)), node_versions)

    def test_ui_updates_raise_catalog_version_without_hosted_post_upgrade_tasks(self):
        config = self.config()
        self.assertNotIn("postUpgradeTasks", config)
        rules = [r for r in config["packageRules"] if "ui/**" in r.get("matchFileNames", [])]
        bumps = [b for r in rules for b in r.get("bumpVersions", [])]
        self.assertTrue(bumps, "UI dependency/lockfile updates must bump CATALOG_VERSION")
        bump = bumps[0]
        self.assertEqual(bump["filePatterns"], ["CATALOG_VERSION"])
        self.assertEqual(bump["bumpType"], "patch")
        expression = bump["matchStrings"][0].replace("(?<version>", "(?P<version>")
        match = re.search(expression, (ROOT / "CATALOG_VERSION").read_text())
        self.assertIsNotNone(match)
        self.assertRegex(match.group("version"), r"^\d+\.\d+\.\d+$")

    def test_node_stays_on_supported_corepack_major_and_is_grouped(self):
        config = self.config()
        rules = [r for r in config["packageRules"] if "node" in r.get("matchPackageNames", [])]
        self.assertTrue(any(r.get("allowedVersions") == ">=24.0.0 <25.0.0" for r in rules))
        self.assertTrue(any(r.get("groupName") == "Node.js 24 build toolchain" for r in rules))
        self.assertTrue(any("actions/node-versions" in r["matchPackageNames"] for r in rules))
        actions = next(r for r in config["packageRules"]
                       if r.get("groupName") == "GitHub Actions non-major updates")
        self.assertEqual(set(actions["matchDepTypes"]), {"action", "workflow", "github-runner"})


if __name__ == "__main__":
    unittest.main()
