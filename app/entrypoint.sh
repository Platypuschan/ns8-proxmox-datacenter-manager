#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-or-later
#
# Start Proxmox Datacenter Manager inside a (rootless) container.
#   PASSWORD_HASH    required, crypt(3) hash of the password of the user root
#                    (login root@pam). There is deliberately no default password.
# Optional settings (the NS8 module writes them to an env file):
#   PDM_TLS_IMPORT   1 = use /run/ns8-tls/{cert,key}.pem (the Traefik certificate)
#   PDM_DISABLE_NAG  1 = confirm the subscription notice automatically
#   PDM_HIDE_MENU    comma separated left menu entries to hide:
#                    subscription,registry,sdn,ceph
#   PDM_NS8_LAYOUT   1 = menu order, Shell and Administration in the top bar
#   PDM_REPO_TEST    1 = add the pdm-test repository (disabled)
#   PDM_DEBIAN_EXTRA 1 = Debian components contrib and non-free-firmware
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

flag() { [[ "${!1:-0}" == 1 ]]; }

install -d -m 1770 -o root -g "$user" "$cfg" "$run"
install -d -m 0750 -o root -g "$user" "$cfg/auth"
install -d -m 0755 -o "$user" -g "$user" "$lib" "$lib/rrdb"
install -d -m 0755 -o root -g "$user" /var/log/proxmox-datacenter-manager
# Shared-memory cache of the API; with --tmpfs this is a mount point.
install -d -m 1770 -o "$user" -g "$user" "$run/shmem"
rm -f "$run/priv.sock" "$run/api.sock"

# DNS: restore what was entered in the web interface (see ns8-rename-shim.c);
# /etc/resolv.conf is a bind mount, so it is overwritten in place.
if [[ -s "$cfg/ns8-resolv.conf" ]]; then
    log "restoring the saved DNS settings"
    cat "$cfg/ns8-resolv.conf" > /etc/resolv.conf || log "could not restore the DNS settings"
fi
export LD_PRELOAD=/usr/lib/ns8-rename-shim.so NS8_PERSIST_DIR="$cfg"

# APT sources chosen at the first configuration
if flag PDM_DEBIAN_EXTRA && [[ -f /etc/apt/sources.list.d/debian.sources ]]; then
    sed -i 's/^Components: main$/Components: main contrib non-free-firmware/' /etc/apt/sources.list.d/debian.sources
fi
if flag PDM_REPO_TEST; then
    printf 'Types: deb\nURIs: http://download.proxmox.com/debian/pdm\nSuites: trixie\nComponents: pdm-test\nSigned-By: /usr/share/keyrings/proxmox-archive-keyring.gpg\nEnabled: false\n' \
        > /etc/apt/sources.list.d/pdm-test.sources
fi

# Web interface adjustments (ns8-custom.js reads this file)
www=/usr/share/javascript/proxmox-datacenter-manager
hide=""
if [[ "${PDM_HIDE_MENU:-}" =~ ^[a-z,]*$ && -n "${PDM_HIDE_MENU:-}" ]]; then
    hide="\"${PDM_HIDE_MENU//,/\",\"}\""
fi
printf 'window.NS8_PDM = { layout: %s, nag: %s, hide: [%s] };\n' \
    "$(flag PDM_NS8_LAYOUT && echo true || echo false)" \
    "$(flag PDM_DISABLE_NAG && echo true || echo false)" "$hide" > "$www/js/ns8-config.js"
sed -i "s#ns8-config.js[^\"]*\"#ns8-config.js?v=$(date +%s)\"#" "$www/index.hbs"

# TLS certificate of the host name, as served by Traefik
if flag PDM_TLS_IMPORT && [[ -s /run/ns8-tls/cert.pem && -s /run/ns8-tls/key.pem ]]; then
    cert_key="$(openssl x509 -in /run/ns8-tls/cert.pem -noout -pubkey 2>/dev/null | openssl sha256 || true)"
    key_key="$(openssl pkey -in /run/ns8-tls/key.pem -pubout 2>/dev/null | openssl sha256 || true)"
    if [[ -n "$cert_key" && "$cert_key" == "$key_key" ]]; then
        log "installing the Traefik certificate"
        install -d -m 0750 -o root -g "$user" "$cfg/auth"
        install -m 0640 -o root -g "$user" /run/ns8-tls/key.pem "$cfg/auth/api.key.new"
        install -m 0640 -o root -g "$user" /run/ns8-tls/cert.pem "$cfg/auth/api.pem.new"
        mv "$cfg/auth/api.key.new" "$cfg/auth/api.key"
        mv "$cfg/auth/api.pem.new" "$cfg/auth/api.pem"
    else
        log "the Traefik certificate does not match its key; keeping the current certificate"
    fi
fi

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
