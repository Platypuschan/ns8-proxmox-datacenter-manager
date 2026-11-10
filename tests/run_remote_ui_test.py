#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Exercise the real PDM UI in a disposable container, with fixture remotes."""
import argparse
import json
import os
from pathlib import Path
import secrets
import ssl
import subprocess
import time
import urllib.error
import urllib.request


def sanitize_diagnostic(text, sensitive_values):
    for value in sensitive_values:
        if value:
            text = text.replace(value, "[REDACTED]")
    return text[-12000:]


def readiness_diagnostics(name, sensitive_values):
    # Never inspect Config/Env: it contains the disposable password hash.
    for command in (
        ["podman", "inspect", "--format", "{{json .State}}", name],
        ["podman", "logs", "--tail", "100", name],
    ):
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        print(sanitize_diagnostic(result.stdout + result.stderr, sensitive_values), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image")
    parser.add_argument("--browser-image", help="Optional local Playwright container")
    parser.add_argument("--artifacts-dir", type=Path, help="Optional browser screenshots")
    args = parser.parse_args()
    name = "pdm-remote-ui-test-" + secrets.token_hex(6)
    password = secrets.token_urlsafe(32)
    hashed = subprocess.run(
        ["openssl", "passwd", "-6", "-stdin"], input=password, text=True,
        capture_output=True, check=True,
    ).stdout.strip()
    env = dict(os.environ, PASSWORD_HASH=hashed, PDM_TEST_PASSWORD=password)
    repo = Path(__file__).resolve().parent.parent
    try:
        subprocess.run([
            "podman", "run", "-d", "--name", name,
            "-p", "127.0.0.1::8443", "--tmpfs", "/run/proxmox-datacenter-manager/shmem",
            "-e", "PASSWORD_HASH", args.image,
        ], env=env, check=True, stdout=subprocess.DEVNULL)
        binding = json.loads(subprocess.check_output([
            "podman", "inspect", "--format", "{{json .NetworkSettings.Ports}}", name,
        ], text=True))["8443/tcp"][0]
        base = "https://127.0.0.1:" + binding["HostPort"]
        # Only this loopback test service uses a disposable self-signed certificate.
        context = ssl._create_unverified_context()
        for _ in range(90):
            try:
                with urllib.request.urlopen(base, context=context, timeout=2) as response:
                    if response.status == 200:
                        break
            except (urllib.error.URLError, OSError):
                time.sleep(1)
        else:
            readiness_diagnostics(name, [password, hashed])
            raise RuntimeError("Disposable PDM service did not become ready")
        env["PDM_TEST_URL"] = base
        artifacts = args.artifacts_dir.resolve() if args.artifacts_dir else None
        if artifacts:
            artifacts.mkdir(parents=True, exist_ok=True)
            env["PDM_TEST_ARTIFACT_DIR"] = str(artifacts)
        if args.browser_image:
            command = [
                "podman", "run", "--rm", "--user", "0", "--network", "host",
                "--entrypoint", "/bin/sh", "-v", f"{repo}:/work:ro",
                "-e", "PDM_TEST_PASSWORD", "-e", "PDM_TEST_URL",
                "-e", "NODE_PATH=/home/pwuser/.venv/lib/python3.12/site-packages/Browser/wrapper/node_modules",
                args.browser_image, "-c", "node --test /work/tests/test_remote_ui.cjs",
            ]
            if artifacts:
                command[2:2] = ["-v", f"{artifacts}:/artifacts:rw", "-e", "PDM_TEST_ARTIFACT_DIR=/artifacts"]
        else:
            command = ["node", "--test", str(repo / "tests/test_remote_ui.cjs")]
        subprocess.run(command, env=env, check=True)
    finally:
        subprocess.run(["podman", "rm", "-f", name], stdout=subprocess.DEVNULL, check=False)


if __name__ == "__main__":
    main()
