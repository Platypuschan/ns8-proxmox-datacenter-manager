import contextlib
import io
import json
import os
import re
import runpy
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
ACTIONS = ROOT / "imageroot/actions"
sys.path.insert(0, str(ROOT / "imageroot/pypkg"))
import pdm_config
import pdm_options  # noqa: E402


class FakeAgent(types.ModuleType):
    def __init__(self):
        super().__init__("agent")
        self.status = None
        self.environment = {}
        self.dumped = False
        self.task_calls = []
        self.tasks = types.ModuleType("agent.tasks")
        self.tasks.run = self._run

    def _run(self, **kwargs):
        self.task_calls.append(kwargs)
        return {"exit_code": 0}

    def set_status(self, status):
        self.status = status

    def set_weight(self, step, weight):
        pass

    def set_env(self, variable, value):
        self.environment[variable] = value

    def dump_env(self):
        self.dumped = True

    route_in_use = False

    def http_route_in_use(self, **kwargs):
        return self.route_in_use

    def resolve_agent_id(self, name):
        return "module/traefik1"

    def assert_exp(self, expression, message=""):
        assert expression, message


@contextlib.contextmanager
def run_env(directory, stdin="", environment=None):
    previous = (os.getcwd(), sys.stdin, sys.stdout)
    fake = FakeAgent()
    out = io.StringIO()
    with patch.dict(os.environ, environment or {}, clear=True):
        with patch.dict(sys.modules, {"agent": fake, "agent.tasks": fake.tasks}):
            os.chdir(directory)
            sys.stdin, sys.stdout = io.StringIO(stdin), out
            try:
                yield fake, out
            finally:
                os.chdir(previous[0])
                sys.stdin, sys.stdout = previous[1], previous[2]


def run(action, directory, payload=None, environment=None):
    stdin = json.dumps(payload) if payload is not None else ""
    with run_env(directory, stdin, environment) as (fake, out):
        code = 0
        try:
            runpy.run_path(str(action), run_name="__main__")
        except SystemExit as exc:
            code = exc.code or 0
        return code, fake, out.getvalue()


VALIDATE = ACTIONS / "configure-module/02validate_admin_password"
WRITE = ACTIONS / "configure-module/10configure_admin_password"
TRAEFIK = ACTIONS / "configure-module/20configure_traefik"
READ = ACTIONS / "get-configuration/20read"


class ValidateTests(unittest.TestCase):
    def test_first_configuration_requires_password(self):
        with tempfile.TemporaryDirectory() as d:
            code, fake, out = run(VALIDATE, d, {"host": "pdm.example.org"})
            self.assertEqual(code, 2)
            self.assertEqual(fake.status, "validation-failed")
            self.assertEqual(json.loads(out)[0]["error"], "admin_password_required")

    def test_empty_password_is_fine_when_one_exists(self):
        with tempfile.TemporaryDirectory() as d:
            pdm_config.write_admin_password("existing-pass", d)
            code, fake, _ = run(VALIDATE, d, {"host": "pdm.example.org", "admin_password": ""})
            self.assertEqual(code, 0)
            self.assertIsNone(fake.status)

    def test_short_password_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            code, fake, out = run(VALIDATE, d, {"admin_password": "short"})
            self.assertEqual(code, 2)
            self.assertEqual(json.loads(out)[0]["error"], "admin_password_too_short")
            self.assertNotIn("short", json.dumps(json.loads(out)[0]["value"]))

    def test_good_password_accepted(self):
        with tempfile.TemporaryDirectory() as d:
            code, _, _ = run(VALIDATE, d, {"admin_password": "long-enough-pass"})
            self.assertEqual(code, 0)


class WriteTests(unittest.TestCase):
    def test_writes_hash_and_keeps_it_on_empty_input(self):
        with tempfile.TemporaryDirectory() as d:
            run(WRITE, d, {"admin_password": "long-enough-pass"})
            before = (Path(d) / "admin.env").read_text()
            self.assertIn("PASSWORD_HASH=$6$", before)
            run(WRITE, d, {"admin_password": ""})
            run(WRITE, d, {})
            self.assertEqual((Path(d) / "admin.env").read_text(), before)


class StartServicesTests(unittest.TestCase):
    def test_restart_only_after_password_change_or_when_stopped(self):
        text = (ACTIONS / "configure-module/80start_services").read_text()
        self.assertIn("take_restart_marker", text)
        self.assertIn("is-active", text)
        self.assertNotRegex(text, r"(?m)^systemctl --user restart")
        subprocess = __import__("subprocess")
        subprocess.run(["bash", "-n", str(ACTIONS / "configure-module/80start_services")], check=True)

    def test_write_action_sets_marker(self):
        with tempfile.TemporaryDirectory() as d:
            run(WRITE, d, {"admin_password": "long-enough-pass"})
            self.assertTrue(pdm_config.take_restart_marker(d))
            run(WRITE, d, {"admin_password": ""})
            self.assertFalse(pdm_config.take_restart_marker(d))


class TraefikTests(unittest.TestCase):
    def test_route_uses_https_backend_without_verification(self):
        with tempfile.TemporaryDirectory() as d:
            code, fake, _ = run(
                TRAEFIK, d,
                {"host": "pdm.example.org", "http2https": True, "lets_encrypt": False},
                {"MODULE_ID": "pdm1", "TCP_PORT": "20015"},
            )
            self.assertEqual(code, 0)
            call = fake.task_calls[0]
            self.assertEqual(call["action"], "set-route")
            self.assertEqual(call["data"]["url"], "https://127.0.0.1:20015")
            self.assertIs(call["data"]["skip_cert_verify"], True)
            self.assertEqual(call["data"]["instance"], "pdm1")
            self.assertEqual(fake.environment["TRAEFIK_HOST"], "pdm.example.org")
            self.assertTrue(fake.dumped)


CLONE = ACTIONS / "clone-module/50Traefik"
RESTORE = ACTIONS / "restore-module/50traefik"
ENV = {"MODULE_ID": "pdm2", "AGENT_ID": "module/pdm2", "TCP_PORT": "20016", "TRAEFIK_HOST": "pdm.example.org",
       "TRAEFIK_HTTP2HTTPS": "True", "TRAEFIK_LETS_ENCRYPT": "False"}


class RouteSharingTests(unittest.TestCase):
    def run_with(self, action, payload, route_in_use):
        with tempfile.TemporaryDirectory() as d:
            FakeAgent.route_in_use = route_in_use
            try:
                return run(action, d, payload, ENV)
            finally:
                FakeAgent.route_in_use = False

    def configure_data(self, fake):
        call = fake.task_calls[0]
        self.assertEqual(call["action"], "configure-module")
        return call["data"]

    def test_clone_next_to_source_does_not_register_the_route(self):
        _, fake, _ = self.run_with(CLONE, {"replace": False}, route_in_use=True)
        self.assertIs(self.configure_data(fake)["register_route"], False)

    def test_clone_that_replaces_the_source_takes_the_route(self):
        _, fake, _ = self.run_with(CLONE, {"replace": True}, route_in_use=True)
        self.assertIs(self.configure_data(fake)["register_route"], True)

    def test_clone_with_a_free_host_registers_the_route(self):
        _, fake, _ = self.run_with(CLONE, {"replace": False}, route_in_use=False)
        self.assertIs(self.configure_data(fake)["register_route"], True)

    def test_restore_follows_the_same_rule(self):
        env = {"TRAEFIK_HOST": "pdm.example.org", "TRAEFIK_HTTP2HTTPS": "True", "TRAEFIK_LETS_ENCRYPT": "False"}
        for replace, in_use, expected in ((False, True, False), (True, True, True), (False, False, True)):
            with self.subTest(replace=replace, in_use=in_use):
                _, fake, _ = self.run_with(RESTORE, {"environment": env, "replace": replace}, in_use)
                self.assertIs(self.configure_data(fake)["register_route"], expected)

    def test_configure_without_route_saves_settings_but_sets_no_route(self):
        with tempfile.TemporaryDirectory() as d:
            code, fake, _ = run(TRAEFIK, d, {"host": "pdm.example.org", "http2https": True,
                                             "lets_encrypt": False, "register_route": False}, ENV)
            self.assertEqual(code, 0)
            self.assertEqual(fake.task_calls, [])
            self.assertEqual(fake.environment["TRAEFIK_HOST"], "pdm.example.org")
            self.assertTrue(fake.dumped)


class ReadTests(unittest.TestCase):
    def test_never_returns_password(self):
        with tempfile.TemporaryDirectory() as d:
            env = {"TRAEFIK_HOST": "pdm.example.org", "TRAEFIK_HTTP2HTTPS": "True", "TRAEFIK_LETS_ENCRYPT": "False"}
            _, _, out = run(READ, d, None, env)
            result = json.loads(out)
            self.assertFalse(result["options_locked"])
            self.assertTrue(result["options"]["tls_import"])
            self.assertEqual({k: v for k, v in result.items() if k not in ("options", "options_locked")}, {
                "host": "pdm.example.org", "http2https": True,
                "lets_encrypt": False, "admin_password_set": False,
            })
            pdm_options.write_options({"ns8_layout": True}, d)
            _, _, out = run(READ, d, None, env)
            self.assertTrue(json.loads(out)["options_locked"])
            self.assertTrue(json.loads(out)["options"]["ns8_layout"])
            pdm_config.write_admin_password("long-enough-pass", d)
            _, _, out = run(READ, d, None, env)
            self.assertTrue(json.loads(out)["admin_password_set"])
            self.assertNotIn("long-enough-pass", out)
            self.assertNotIn("$6$", out)


class StaticTests(unittest.TestCase):
    def test_unit_file(self):
        unit = (ROOT / "imageroot/systemd/user/pdm.service").read_text()
        self.assertNotIn("%S/state", unit)
        for needle in ("${PDM_APP_IMAGE}", "${TCP_PORT}:8443", "--tmpfs /run/proxmox-datacenter-manager/shmem",
                       "pdm-config:/etc/proxmox-datacenter-manager", "pdm-data:/var/lib/proxmox-datacenter-manager",
                       "admin.env"):
            self.assertIn(needle, unit)
        self.assertIn("127.0.0.1:${TCP_PORT}", unit)

    def test_traefik_roles_cover_routes_and_certificates(self):
        # set-route needs routeadm, get-certificate needs certadm; a missing role
        # shows up as HTTP 403 from Traefik at run time.
        build = (ROOT / "build-images.sh").read_text()
        self.assertIn("traefik@node:routeadm", build)
        self.assertIn("traefik@node:certadm", build)

    def test_backup_includes_cover_all_state(self):
        text = (ROOT / "imageroot/etc/state-include.conf").read_text()
        lines = [l for l in text.splitlines() if l and not l.startswith("#")]
        self.assertEqual(sorted(lines), ["state/admin.env", "state/options.env", "volumes/pdm-config", "volumes/pdm-data", "volumes/pdm-log"])
        unit = (ROOT / "imageroot/systemd/user/pdm.service").read_text()
        for line in lines:
            if line.startswith("volumes/"):
                self.assertIn(line.split("/", 1)[1] + ":", unit)

    def test_app_image_name_matches_env_name(self):
        # NS8 derives <NAME>_IMAGE from the last path segment of the image
        script = (ROOT / ".github/scripts/app-image").read_text()
        name = re.search(r"/(pdm-app):%s", script).group(1).upper().replace("-", "_")
        unit = (ROOT / "imageroot/systemd/user/pdm.service").read_text()
        self.assertIn("${%s_IMAGE}" % name, unit)
        build = (ROOT / "build-images.sh").read_text()
        self.assertIn("org.nethserver.images=${PDM_IMAGE}", build)
        self.assertIn('PDM_IMAGE="$(.github/scripts/app-image)"', build)


class AppImageTests(unittest.TestCase):
    def test_containerfile_is_pinned_and_minimal(self):
        text = (ROOT / "app/Containerfile").read_text()
        self.assertRegex(text, r"(?m)^ARG PDM_VERSION=\d+\.\d+\.\d+$")
        self.assertRegex(text, r"(?m)^ARG PROXMOX_KEYRING_SHA256=[0-9a-f]{64}$")
        self.assertIn("sha256sum -c", text)
        self.assertIn('"proxmox-datacenter-manager=${PDM_VERSION}"', text)
        self.assertIn("--no-install-recommends", text)
        for forbidden in ("postfix", "supercronic", "nfs-common", "open-iscsi", "chpasswd"):
            self.assertNotIn(forbidden, text)
        # build-time stubs must not stay in the image
        self.assertIn("rm -f /usr/local/bin/systemctl /usr/sbin/policy-rc.d", text)

    def test_entrypoint_requires_a_hash_and_has_no_default_password(self):
        text = (ROOT / "app/entrypoint.sh").read_text()
        self.assertIn("PASSWORD_HASH", text)
        self.assertIn("chpasswd -e", text)
        self.assertNotIn(":=root", text)
        self.assertNotIn('PASSWORD:-', text)

    def test_entrypoint_passes_bash_syntax_check(self):
        import subprocess
        subprocess.run(["bash", "-n", str(ROOT / "app/entrypoint.sh")], check=True)

    def test_workflow_publishes_app_before_module(self):
        text = (ROOT / ".github/workflows/publish-images.yml").read_text()
        self.assertIn("app/", text)
        self.assertRegex(text, r"publish-images:\n\s+needs: \[app, existing-tag\]")


if __name__ == "__main__":
    unittest.main()
