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
import pdm_config  # noqa: E402


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


class ReadTests(unittest.TestCase):
    def test_never_returns_password(self):
        with tempfile.TemporaryDirectory() as d:
            env = {"TRAEFIK_HOST": "pdm.example.org", "TRAEFIK_HTTP2HTTPS": "True", "TRAEFIK_LETS_ENCRYPT": "False"}
            _, _, out = run(READ, d, None, env)
            self.assertEqual(json.loads(out), {
                "host": "pdm.example.org", "http2https": True,
                "lets_encrypt": False, "admin_password_set": False,
            })
            pdm_config.write_admin_password("long-enough-pass", d)
            _, _, out = run(READ, d, None, env)
            self.assertTrue(json.loads(out)["admin_password_set"])
            self.assertNotIn("long-enough-pass", out)
            self.assertNotIn("$6$", out)


class StaticTests(unittest.TestCase):
    def test_unit_file(self):
        unit = (ROOT / "imageroot/systemd/user/pdm.service").read_text()
        self.assertNotIn("%S/state", unit)
        for needle in ("${PROXMOX_DM_IMAGE}", "${TCP_PORT}:8443", "--tmpfs /run/proxmox-datacenter-manager/shmem",
                       "pdm-config:/etc/proxmox-datacenter-manager", "pdm-data:/var/lib/proxmox-datacenter-manager",
                       "admin.env", "DEBUG=Y"):
            self.assertIn(needle, unit)
        self.assertIn("127.0.0.1:${TCP_PORT}", unit)

    def test_backup_includes_cover_all_state(self):
        text = (ROOT / "imageroot/etc/state-include.conf").read_text()
        lines = [l for l in text.splitlines() if l and not l.startswith("#")]
        self.assertEqual(sorted(lines), ["state/admin.env", "volumes/pdm-config", "volumes/pdm-data"])
        unit = (ROOT / "imageroot/systemd/user/pdm.service").read_text()
        for line in lines:
            if line.startswith("volumes/"):
                self.assertIn(line.split("/", 1)[1] + ":", unit)

    def test_build_script_label_matches_env_name(self):
        script = (ROOT / "build-images.sh").read_text()
        image = re.search(r'PDM_IMAGE="([^"]+)"', script).group(1)
        # NS8 derives <NAME>_IMAGE from the last path segment of the image
        name = image.rsplit("/", 1)[1].split(":")[0].split("@")[0].upper().replace("-", "_")
        unit = (ROOT / "imageroot/systemd/user/pdm.service").read_text()
        self.assertIn("${%s_IMAGE}" % name, unit)


if __name__ == "__main__":
    unittest.main()
