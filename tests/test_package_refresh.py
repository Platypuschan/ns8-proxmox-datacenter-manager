import json
import io
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from test_update_pdm import ROOT, update_pdm


class PackageRefreshTests(unittest.TestCase):
    def test_parses_apt_targets_including_new_dependencies_and_multiarch(self):
        output = """Reading package lists...
Inst openssl [3.5.1-1] (3.5.1-2 Debian:13/stable [amd64])
Inst libnew1 (1:2.0-3 Debian:13/stable [amd64])
Inst libc6:amd64 [2.41-1] (2.41-2 Debian:13/stable [amd64])
Conf openssl (3.5.1-2 Debian:13/stable [amd64])
"""
        self.assertEqual(update_pdm.parse_upgrade_targets(output), {
            "openssl": "3.5.1-2", "libnew1": "1:2.0-3", "libc6:amd64": "2.41-2"})
        self.assertEqual(update_pdm.parse_upgrade_targets("0 upgraded, 0 newly installed.\n"), {})
    def test_runtime_only_refresh_is_cumulative_idempotent_and_bumps_once(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            cf, vf, stamp = root / "Containerfile", root / "CATALOG_VERSION", root / "package-refresh.json"
            cf.write_text("ARG PDM_VERSION=1.1.9\n")
            vf.write_text("0.1.0\n")
            stamp.write_text('{"packages": {"old-library": "1.0", "openssl": "3.0"}}\n')
            original_cf = cf.read_bytes()
            changes = update_pdm.rewrite(cf, vf, packages={"openssl": "3.1"}, refresh_file=stamp)
            self.assertEqual(changes, ["runtime packages (1 new target)"])
            self.assertEqual(json.loads(stamp.read_text()), {"packages": {"old-library": "1.0", "openssl": "3.1"}})
            self.assertEqual(vf.read_text(), "0.1.1\n")
            self.assertEqual(cf.read_bytes(), original_cf)
            previous = stamp.read_bytes()
            self.assertEqual(update_pdm.rewrite(cf, vf, packages={"openssl": "3.1"}, refresh_file=stamp), [])
            self.assertEqual(update_pdm.rewrite(cf, vf, packages={}, refresh_file=stamp), [])
            self.assertEqual(update_pdm.rewrite(cf, vf, packages={"openssl": "3.0"}, refresh_file=stamp), [])
            self.assertEqual(stamp.read_bytes(), previous)
            self.assertEqual(vf.read_text(), "0.1.1\n")
            changes = update_pdm.rewrite(cf, vf, version="1.1.10", packages={"zlib1g": "1:1.3"}, refresh_file=stamp)
            self.assertEqual(len(changes), 2)
            self.assertEqual(vf.read_text(), "0.1.2\n")
    def test_probe_uses_immutable_disposable_unprivileged_container(self):
        image = "ghcr.io/example/pdm@sha256:" + "a" * 64
        with mock.patch.object(update_pdm.subprocess, "run", return_value=subprocess.CompletedProcess([], 0, "Inst openssl [3.0] (3.1 Debian [amd64])\n")) as run:
            self.assertEqual(update_pdm.probe_runtime_packages(image), {"openssl": "3.1"})
            command = run.call_args.args[0]
            self.assertEqual(command[:3], ["podman", "run", "--rm"])
            self.assertIn(image, command)
            self.assertIn("--cap-drop=all", command)
            self.assertIn("--security-opt=no-new-privileges", command)
            self.assertIn("--user=0", command)
            self.assertIn("--image-volume=ignore", command)
            self.assertIn("--timeout=540", command)
            self.assertIn("--entrypoint=/bin/sh", command)
            self.assertNotIn("--privileged", command)
            self.assertFalse(any(arg.startswith(("--mount", "--volume", "-v")) for arg in command))
            shell = command[-1]
            self.assertIn("apt-get update -o APT::Update::Error-Mode=any", shell)
            self.assertIn("apt-get -s --with-new-pkgs upgrade", shell)
            for package in ("proxmox-datacenter-manager", "proxmox-datacenter-manager-ui", "proxmox-datacenter-manager-docs", "proxmox-datacenter-manager-client", "proxmox-datacenter-manager-meta"):
                self.assertIn(package, shell)
            self.assertTrue(run.call_args.kwargs["check"])
        with mock.patch.object(update_pdm.subprocess, "run") as run:
            for image in ("ghcr.io/example/pdm:latest", "--privileged", "x@sha256:abc"):
                with self.assertRaises(ValueError):
                    update_pdm.probe_runtime_packages(image)
            run.assert_not_called()

    def test_held_pdm_and_malformed_upgrade_lines_fail_closed(self):
        for line in ("Inst proxmox-datacenter-manager [1.1.9] (1.2.0 Proxmox [amd64])", "Inst proxmox-datacenter-manager-ui:amd64 (1.2.0 Proxmox [amd64])", "Inst bad unparseable"):
            with self.subTest(line=line), self.assertRaises(ValueError):
                update_pdm.parse_upgrade_targets(line)
    def test_cli_update_probes_before_writing_and_retains_optional_mode(self):
        import sys
        image = "ghcr.io/example/pdm@sha256:" + "a" * 64
        with mock.patch.object(sys, "argv", ["update-pdm", "--update", "--runtime-image", image]), \
             mock.patch.object(update_pdm, "fetch_index", return_value="ignored"), \
             mock.patch.object(update_pdm, "newest_version", return_value="1.1.9"), \
             mock.patch.object(update_pdm, "fetch_base_digest", return_value="sha256:" + "b" * 64), \
             mock.patch.object(update_pdm, "probe_runtime_packages", return_value={"openssl": "3.1"}) as probe, \
             mock.patch.object(update_pdm, "rewrite", return_value=[]) as rewrite:
            self.assertEqual(update_pdm.main(), 0)
            probe.assert_called_once_with(image)
            self.assertEqual(rewrite.call_args.kwargs["packages"], {"openssl": "3.1"})
            probe.side_effect = subprocess.CalledProcessError(100, ["podman"])
            rewrite.reset_mock()
            with self.assertRaises(subprocess.CalledProcessError):
                update_pdm.main()
            rewrite.assert_not_called()
        with mock.patch.object(sys, "argv", ["update-pdm", "--latest", "--runtime-image", image]), \
             mock.patch.object(update_pdm, "fetch_index") as fetch, \
             mock.patch("sys.stderr", new_callable=io.StringIO):
            with self.assertRaises(SystemExit) as error:
                update_pdm.main()
            self.assertEqual(error.exception.code, 2)
            fetch.assert_not_called()
    def test_refresh_invalidates_only_runtime_apt_cache_and_preserves_holds(self):
        text = (ROOT / "app/Containerfile").read_text()
        builder, runtime = text.rsplit("FROM ${BASE_IMAGE}", 1)
        self.assertNotIn("COPY package-refresh.json", builder)
        self.assertLess(runtime.index("COPY package-refresh.json"), runtime.index("RUN set -eux;"))
        self.assertLess(runtime.index("apt-mark hold"), runtime.index("apt-get --with-new-pkgs upgrade -y"))
        self.assertLess(runtime.index("apt-get --with-new-pkgs upgrade -y"), runtime.index("rm -f /usr/local/bin/systemctl /usr/sbin/policy-rc.d"))
        self.assertIn("apt-get update -o APT::Update::Error-Mode=any", runtime)
        self.assertIn('"proxmox-datacenter-manager-client=${PDM_VERSION}"', runtime)
        self.assertIn('"proxmox-datacenter-manager-docs=${PDM_VERSION}"', runtime)
        self.assertIn("proxmox-kernel-*", runtime)
        self.assertIn("linux-image-*", runtime)
        stamp = json.loads((ROOT / "app/package-refresh.json").read_text())
        self.assertIsInstance(stamp["packages"], dict)
    def test_weekly_workflow_pins_original_runtime_and_serializes_proposals(self):
        text = (ROOT / ".github/workflows/update-pdm.yml").read_text()
        self.assertIn("concurrency:", text)
        self.assertIn("cancel-in-progress: false", text)
        self.assertIn("podman skopeo", text)
        self.assertLess(text.index("gh pr list"), text.index('runtime_tag="$(.github/scripts/app-image)"'))
        self.assertIn('startswith("update-pdm-")', text)
        self.assertLess(text.index('runtime_tag="$(.github/scripts/app-image)"'), text.index("update-pdm --update"))
        self.assertIn('skopeo inspect --format', text)
        self.assertIn('--runtime-image "${runtime_image}"', text)
        self.assertLess(text.index("git add -- app CATALOG_VERSION"), text.index("git diff --cached --binary -- app CATALOG_VERSION"))
        self.assertIn("PDM_UI_COMMIT", text)
        self.assertIn("not automatically", text)
    def test_workflow_shell_stops_for_open_pr_and_handles_package_only_changes(self):
        import os
        import textwrap
        text = (ROOT / ".github/workflows/update-pdm.yml").read_text()
        shell = textwrap.dedent(text.rsplit("        run: |\n", 1)[1])
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            scripts = root / ".github/scripts"
            scripts.mkdir(parents=True)
            bin_dir = root / "bin"
            bin_dir.mkdir()
            log = root / "calls"
            stubs = {
                bin_dir / "gh": 'printf "gh %s\\n" "$*" >> "$CALLS"; if [ "$1 $2" = "pr list" ]; then printf "%s" "$OPEN_PR"; fi',
                bin_dir / "skopeo": 'printf "skopeo\\n" >> "$CALLS"; printf "sha256:%064d\\n" 0',
                bin_dir / "git": 'printf "git %s\\n" "$*" >> "$CALLS"; case "$1" in ls-remote) exit 2;; diff) printf "%s" "$DIFF";; esac',
                scripts / "app-image": 'test ! -e updater-ran; printf "app-image\\n" >> "$CALLS"; printf "ghcr.io/example/pdm:old\\n"',
                scripts / "update-pdm": 'touch updater-ran; printf "updater %s\\n" "$*" >> "$CALLS"; printf "%s" "$SUMMARY"',
            }
            for path, source in stubs.items():
                path.write_text("#!/bin/sh\nset -eu\n" + source + "\n")
                path.chmod(0o755)
            environment = dict(os.environ, PATH=str(bin_dir) + ":" + os.environ["PATH"], CALLS=str(log), DEFAULT_BRANCH="main", OPEN_PR="update-pdm-existing", SUMMARY="runtime packages (1 new target)", DIFF="package-refresh target one")
            subprocess.run(["bash", "-c", shell], cwd=root, env=environment, check=True, capture_output=True)
            self.assertEqual(len(log.read_text().splitlines()), 1)
            self.assertFalse((root / "updater-ran").exists())
            environment["OPEN_PR"] = ""
            subprocess.run(["bash", "-c", shell], cwd=root, env=environment, check=True, capture_output=True)
            calls = log.read_text()
            self.assertLess(calls.index("app-image"), calls.index("updater --update"))
            self.assertIn("--runtime-image ghcr.io/example/pdm@sha256:", calls)
            self.assertIn("git add -- app CATALOG_VERSION", calls)
            self.assertIn("git diff --cached --binary -- app CATALOG_VERSION", calls)
            first_branch = next(line for line in calls.splitlines() if line.startswith("git switch"))
            log.unlink()
            (root / "updater-ran").unlink()
            environment["DIFF"] = "package-refresh target two"
            subprocess.run(["bash", "-c", shell], cwd=root, env=environment, check=True, capture_output=True)
            second_branch = next(line for line in log.read_text().splitlines() if line.startswith("git switch"))
            self.assertNotEqual(first_branch, second_branch)
            log.unlink()
            (root / "updater-ran").unlink()
            environment["SUMMARY"] = ""
            subprocess.run(["bash", "-c", shell], cwd=root, env=environment, check=True, capture_output=True)
            self.assertNotIn("git push", log.read_text())
            self.assertNotIn("gh pr create", log.read_text())


if __name__ == "__main__":
    unittest.main()
