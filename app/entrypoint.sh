#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Start Proxmox Datacenter Manager inside a (rootless) container.
#   PASSWORD_HASH  required, crypt(3) hash of the password of the user root
#                  (login root@pam). There is deliberately no default password.
set -Eeuo pipefail

log() { echo "[pdm] $*"; }

cfg=/etc/proxmox-datacenter-manager
lib=/var/lib/proxmox-datacenter-manager
run=/run/proxmox-datacenter-manager
bin=/usr/libexec/proxmox
user=www-data

[[ "$(id -u)" -eq 0 ]] || { log "must run as root inside the container"; exit 11; }
[[ "${PASSWORD_HASH:-}" =~ ^\$[56y]\$ ]] || { log "PASSWORD_HASH is missing or not a crypt hash"; exit 12; }

printf 'root:%s\n' "$PASSWORD_HASH" | chpasswd -e
unset PASSWORD_HASH

install -d -m 1770 -o root -g "$user" "$cfg" "$run"
install -d -m 0750 -o root -g "$user" "$cfg/auth"
install -d -m 0755 -o "$user" -g "$user" "$lib" "$lib/rrdb"
install -d -m 0755 -o root -g "$user" /var/log/proxmox-datacenter-manager
# Shared-memory cache of the API; with --tmpfs this is a mount point.
install -d -m 1770 -o "$user" -g "$user" "$run/shmem"
rm -f "$run/priv.sock" "$run/api.sock"

# No syslog daemon: without the systemd journal PDM logs to stderr, which is
# the container log. (It prints "Unable to open syslog" once per daemon.)

# Authentication keys and CSRF secret, created once by the PDM tooling itself.
if [[ ! -f "$cfg/auth/authkey.key" || ! -f "$cfg/auth/csrf.key" ]]; then
    log "first start: creating authentication keys"
    "$bin/proxmox-datacenter-privileged-api" setup
fi

"$bin/proxmox-datacenter-privileged-api" &
priv_pid=$!
for _ in $(seq 1 60); do
    [[ -S "$run/priv.sock" ]] && break
    kill -0 "$priv_pid" 2>/dev/null || { log "privileged API exited"; exit 1; }
    sleep 1
done
[[ -S "$run/priv.sock" ]] || { log "privileged API socket missing after 60 s"; exit 1; }

# Harmless and repeated in containers: there is no block device to inspect.
runuser -u "$user" -- "$bin/proxmox-datacenter-api" \
    2> >(grep --line-buffered -v 'failed to collect blockdev statistics' >&2) &
api_pid=$!

stop() {
    log "stopping"
    kill -TERM "$api_pid" "$priv_pid" 2>/dev/null || true
    wait "$api_pid" "$priv_pid" 2>/dev/null || true
    exit 0
}
trap stop TERM INT

log "Proxmox Datacenter Manager $(cat /etc/pdm-version) is starting"
# Leave when either daemon dies, so the supervisor restarts the container.
wait -n "$api_pid" "$priv_pid" || true
log "a PDM daemon exited"
kill -TERM "$api_pid" "$priv_pid" 2>/dev/null || true
exit 1
