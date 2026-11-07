#
# Copyright (C) 2026 Platypuschan
# SPDX-License-Identifier: GPL-3.0-or-later
#

"""First-configuration options of the Proxmox Datacenter Manager module.

The options are chosen once, when the module is configured for the first time,
and stored in ``options.env`` (read by the container as environment). Later
configuration requests do not change them: the file is only created if absent.
"""

import os

OPTIONS_ENV = "options.env"
HIDE_CHOICES = ("subscription", "registry", "sdn", "ceph")
FLAGS = (
    ("tls_import", "PDM_TLS_IMPORT"),
    ("disable_nag", "PDM_DISABLE_NAG"),
    ("ns8_layout", "PDM_NS8_LAYOUT"),
    ("repo_test", "PDM_REPO_TEST"),
    ("debian_extra", "PDM_DEBIAN_EXTRA"),
)
# Used when no options are stored (existing installations after an update, API
# requests without "options"). They equal the pre-selected check boxes of the
# settings page and the defaults of app/entrypoint.sh.
DEFAULTS = {"tls_import": True, "disable_nag": True, "ns8_layout": True,
            "repo_test": False, "debian_extra": True, "hide_menu": list(HIDE_CHOICES)}


class OptionsError(ValueError):
    """An option is not acceptable; ``args[0]`` is a stable error code."""


def options_path(state_dir=None):
    return os.path.join(state_dir or os.getcwd(), OPTIONS_ENV)


def options_exist(state_dir=None):
    # The service unit touches an empty file so the container can always read
    # it; an empty file means "first configuration still pending".
    try:
        return os.path.getsize(options_path(state_dir)) > 0
    except OSError:
        return False


def normalize(options):
    """Return a complete options dict from a possibly partial request object."""
    merged = dict(DEFAULTS)
    if options is None:
        return merged
    if not isinstance(options, dict):
        raise OptionsError("invalid_options")
    for key, _ in FLAGS:
        if key in options:
            if not isinstance(options[key], bool):
                raise OptionsError("invalid_options")
            merged[key] = options[key]
    hide = options.get("hide_menu", merged["hide_menu"])
    if not isinstance(hide, list) or any(h not in HIDE_CHOICES for h in hide):
        raise OptionsError("invalid_options")
    merged["hide_menu"] = [h for h in HIDE_CHOICES if h in hide]
    return merged


def write_options(options, state_dir=None):
    """Store the options atomically. Returns the normalized options."""
    values = normalize(options)
    lines = ["%s=%d\n" % (var, 1 if values[key] else 0) for key, var in FLAGS]
    lines.append("PDM_HIDE_MENU=%s\n" % ",".join(values["hide_menu"]))
    path = options_path(state_dir)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as stream:
        stream.writelines(lines)
    os.replace(tmp, path)
    return values


def read_options(state_dir=None):
    """Return the stored options, or None if the first configuration is pending."""
    if not options_exist(state_dir):
        return None
    try:
        with open(options_path(state_dir), encoding="utf-8") as stream:
            raw = dict(line.rstrip("\n").split("=", 1) for line in stream if "=" in line)
    except OSError:
        return None
    values = {key: raw.get(var) == "1" for key, var in FLAGS}
    values["hide_menu"] = [h for h in raw.get("PDM_HIDE_MENU", "").split(",") if h in HIDE_CHOICES]
    return values
