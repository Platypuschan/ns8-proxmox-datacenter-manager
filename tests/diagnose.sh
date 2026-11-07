#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Diagnostic for the test suite: the same authenticated GET against a PDM
# listening on https://127.0.0.1:$1, directly and through Traefik (host $2).
set -u
port="$1"; host="$2"; pw="$PDM_PASSWORD"
try() {  # label base [extra curl args...]
    local label="$1" base="$2"; shift 2
    local out cookie csrf code
    out="$(curl -ksi --max-time 15 "$@" --data-urlencode username=root@pam --data-urlencode "password=$pw" "$base/api2/json/access/ticket")"
    cookie="$(printf '%s' "$out" | tr -d '\r' | sed -n 's/^set-cookie: __Host-PDMAuthCookie=\([^;]*\);.*/\1/Ip')"
    csrf="$(printf '%s' "$out" | tr -d '\r' | sed -n 's/.*"CSRFPreventionToken":"\([^"]*\)".*/\1/p')"
    echo "$label login: $(printf '%s' "$out" | head -1 | tr -d '\r') cookie_len=${#cookie}"
    code="$(curl -ks --max-time 15 "$@" -o /dev/null -w '%{http_code}' -H "Cookie: __Host-PDMAuthCookie=${cookie}" -H "CSRFPreventionToken: ${csrf}" "$base/api2/json/access/users")"
    echo "$label users (cookie header as sent by the server): $code"
    code="$(curl -ks --max-time 15 "$@" -o /dev/null -w '%{http_code}' -b "__Host-PDMAuthCookie=${cookie}" -H "CSRFPreventionToken: ${csrf}" "$base/api2/json/access/users")"
    echo "$label users (-b): $code"
}
try "direct-https"          "https://127.0.0.1:$port"
try "direct-https+Host"     "https://127.0.0.1:$port" -H "Host: $host"
try "traefik-http+Host"     "http://127.0.0.1" -H "Host: $host"
