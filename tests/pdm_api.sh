#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Authenticated PDM API call with curl, for the NS8 module tests.
#   PDM_PASSWORD=... [PDM_HOST=name] pdm_api.sh BASE_URL METHOD PATH [key=value ...]
# Prints the response body; exits 1 on an HTTP status >= 400.
set -Eeuo pipefail
base="$1"; method="$2"; path="$3"; shift 3
hostopt=(); [[ -n "${PDM_HOST:-}" ]] && hostopt=(-H "Host: ${PDM_HOST}")
login="$(curl -ksi --max-time 20 "${hostopt[@]}" --data-urlencode username=root@pam \
    --data-urlencode "password=${PDM_PASSWORD}" "${base}/api2/json/access/ticket")"
cookie="$(printf '%s' "$login" | tr -d '\r' | sed -n 's/^set-cookie: __Host-PDMAuthCookie=\([^;]*\);.*/\1/Ip')"
csrf="$(printf '%s' "$login" | tr -d '\r' | sed -n 's/.*"CSRFPreventionToken":"\([^"]*\)".*/\1/p')"
[[ -n "$cookie" && -n "$csrf" ]] || { echo "login failed: $(printf '%s' "$login" | head -1)" >&2; exit 1; }
args=()
if [[ "$method" != GET ]]; then
    args+=(-X "$method"); for kv in "$@"; do args+=(--data-urlencode "$kv"); done
fi
curl -ks --max-time 30 --fail-with-body "${hostopt[@]}" -H "Cookie: __Host-PDMAuthCookie=${cookie}" \
    -H "CSRFPreventionToken: ${csrf}" "${args[@]}" "${base}${path}"
