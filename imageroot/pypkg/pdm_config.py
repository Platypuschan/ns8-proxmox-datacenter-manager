#
# Copyright (C) 2026 Platypuschan
# SPDX-License-Identifier: GPL-3.0-or-later
#

"""Administrator password handling for the Proxmox Datacenter Manager module.

The container sets the password of its PAM user ``root`` (realm ``root@pam``)
at every start from the ``PASSWORD_HASH`` variable. Only a SHA-512 crypt hash is
stored on the node, never the clear text password.
"""

import os
import re
import subprocess

ADMIN_ENV = "admin.env"
RESTART_MARKER = "restart-needed"
MIN_LENGTH = 8
MAX_LENGTH = 128
HASH_RE = re.compile(r"^\$6\$[./0-9A-Za-z]{1,16}\$[./0-9A-Za-z]{86}$")


class PasswordError(ValueError):
    """The password is not acceptable; ``args[0]`` is a stable error code."""


def validate_password(password):
    """Return the password if usable, raise PasswordError otherwise."""
    if not isinstance(password, str):
        raise PasswordError("invalid_admin_password")
    if len(password) < MIN_LENGTH:
        raise PasswordError("admin_password_too_short")
    if len(password) > MAX_LENGTH:
        raise PasswordError("invalid_admin_password")
    # Control characters (and therefore line breaks) would corrupt chpasswd
    # input and the env file.
    if any(ord(c) < 32 or ord(c) == 127 for c in password):
        raise PasswordError("invalid_admin_password")
    return password


def hash_password(password):
    """Return a SHA-512 crypt hash; the password is passed on stdin only."""
    validate_password(password)
    result = subprocess.run(
        ["openssl", "passwd", "-6", "-stdin"],
        input=password + "\n",
        capture_output=True,
        text=True,
        check=True,
    )
    value = result.stdout.strip()
    if not HASH_RE.match(value):
        raise RuntimeError("openssl returned an unexpected password hash")
    return value


def admin_env_path(state_dir=None):
    return os.path.join(state_dir or os.getcwd(), ADMIN_ENV)


def has_admin_password(state_dir=None):
    try:
        with open(admin_env_path(state_dir), encoding="utf-8") as stream:
            return any(line.startswith("PASSWORD_HASH=$6$") for line in stream)
    except OSError:
        return False


def write_admin_password(password, state_dir=None):
    """Atomically store the hash of ``password`` in a 0600 env file."""
    path = admin_env_path(state_dir)
    tmp = path + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            stream.write("PASSWORD_HASH=" + hash_password(password) + "\n")
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)
    os.chmod(path, 0o600)
    # Tell 80start_services that the running container has the old password.
    with open(os.path.join(os.path.dirname(path), RESTART_MARKER), "w", encoding="utf-8"):
        pass


def take_restart_marker(state_dir=None):
    """Return True once if a new password was written since the last call."""
    path = os.path.join(state_dir or os.getcwd(), RESTART_MARKER)
    try:
        os.unlink(path)
        return True
    except FileNotFoundError:
        return False
