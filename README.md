# Proxmox Datacenter Manager for NethServer 8

This repository packages the [Proxmox Datacenter Manager](https://pdm.proxmox.com/)
(PDM) for NethServer 8. PDM gives one overview of many Proxmox VE and Proxmox
Backup Server installations. The module runs it as a rootless Podman container,
publishes it through the node Traefik with a host name and an optional Let's
Encrypt certificate, and includes its configuration and data in the NS8 backup.

> Status: first stable release (`0.1.0`). The CI installs the module on real
> NS8 nodes (Debian 13 and Rocky Linux 9) and checks configuration, login,
> password change, the Traefik route and certificate (including renewal),
> persistence, backup and restore, clone, the web shell, the options, and an
> update from the previous release.
> **Not tested:** adding real Proxmox VE / Backup Server remotes, a Let's
> Encrypt certificate from a real CA, and the web interface adjustments in a
> real Firefox (checked in Chromium and Playwright Firefox only). Make a backup
> before updating. This is an unofficial community module, not supported by
> Proxmox.

## Install

Add the [Platypuschan NS8 module catalog](https://github.com/Platypuschan/ns8-modules#add-the-repository)
and install *Proxmox Datacenter Manager* in the Software Center, or install from
the command line with a released version from [`CATALOG_VERSION`](CATALOG_VERSION):

```bash
add-module ghcr.io/platypuschan/proxmox-datacenter-manager:0.1.0 1
```

The command returns an instance ID such as `proxmox-datacenter-manager1`.
Do not install production instances from `:latest` or a branch tag: NS8 only
offers updates to instances with a SemVer version.

## Configure

Open the application in the NS8 cluster admin interface and use **Settings**, or
use the command line (instance ID `proxmox-datacenter-manager1`):

```bash
api-cli run module/proxmox-datacenter-manager1/configure-module --data '{
  "host": "pdm.example.org",
  "http2https": true,
  "lets_encrypt": true,
  "admin_password": "choose-a-long-password"
}'
```

- `host`: fully qualified host name; its DNS record must point to the node.
- `http2https`: redirect HTTP to HTTPS.
- `lets_encrypt`: request a Let's Encrypt certificate (needs public HTTP access).
- `admin_password`: password of the user `root` in the realm *Linux PAM*.
  Required for the first configuration (there is no default password), 8 to
  128 characters. An empty value keeps the current password.

Log in at `https://<host>` with user name `root`, realm **Linux PAM**
(`root@pam`) and the password you chose.

Read the configuration with `api-cli run module/<id>/get-configuration`. The
password is never returned, only `admin_password_set`.

### Options

These can be changed at any time (check boxes in **Settings**, the `options`
object of `configure-module`). They are stored in `~/.config/state/options.env`
and included in the backup. A change restarts the service when you save; reload
the Proxmox page with Ctrl+F5 afterwards. A request without `options` keeps the
stored values. As long as nothing is stored (for example on an installation
updated from an older release) the pre-selected defaults apply: Traefik
certificate, subscription notice, NS8 layout, Debian extra components on, all
four menu entries hidden, pdm-test repository off.

- `tls_import`: use the certificate Traefik serves for the host name (Let's
  Encrypt or custom) as the certificate of PDM, so the *Certificates* page shows
  it. The module fetches it with the NS8 `get-certificate` helper and refreshes
  it on every `certificate-changed` event (the container restarts when it
  changes).
- `disable_nag`: confirm the "no subscription" dialog automatically (the one
  that appears for example on *Administration / Updates / Refresh*) and hide
  the subscription warning in all custom *Views*. This only changes the UI;
  subscription status, repository access and support eligibility are unchanged.
- `ns8_layout`: menu order Dashboard, Views, Notes, Remotes, Guests,
  Configuration; the button *Shell* replaces the theme button and
  *Administration* replaces *Documentation* in the top bar, both removed from
  the left menu.
- `hide_menu`: any of `subscription`, `registry`, `sdn`, `ceph` to hide the menu
  entry.
- `debian_extra`: add the Debian components `contrib` and `non-free-firmware`.
- `repo_test`: add the `pdm-test` repository, disabled.

The menu changes are made by a small script (`app/ns8-custom.js`) that the image
adds to the PDM web interface. It only changes attributes and styles of existing
elements; a PDM update that renames its CSS classes can make it stop working,
and then PDM simply shows its normal interface.

### Remote detail view

The PVE remote summary shows **Reachability** instead of Subscription Level:
- green circle with a check: the latest remote resources API request succeeded;
- red circle with an X: the request failed (the original error and certificate
  check remain available);
- a neutral question mark until the first result is available.

This indicates authenticated API reachability, not ICMP/ping availability or a
subscription entitlement. The existing five-second refresh detects failures and
recovery. **Resources** is the first/default tab in the right-hand panel, before
**Tasks** and **Notes**. In VM/container details, **Back to Resources** appears
on the right below this tab bar and above the guest title, and returns to the
tree. It is absent in the remote overview, node/storage details and Tasks/Notes.
The Resources tree and detail content use the full width of the right-hand
block. Embedded noVNC/xterm.js consoles (including the LXC shell) fill the
remaining panel height and resize with the browser window.

These changes are native Yew UI changes, not DOM-node relocation. The application
image builds UI 1.1.4 from pinned upstream commit
`aae6607b38f1b3701d88ceef25f14ce72bb258ca` with `app/pdm-ui.patch`. The build fails
if the patch no longer applies. The packaged UI version is pinned alongside the
source; review both when upgrading it. Build dependencies from the Proxmox devel
repository are confined to the builder, not the runtime. The patched source,
build package list and patch are included at `/js/ns8-pdm-ui-source.tar.gz` on the
PDM web endpoint (AGPL corresponding-source download).

Browser regression command (Playwright installed on the runner):
`python3 tests/run_remote_ui_test.py <application-image>`.
It starts a disposable local PDM container with a random temporary credential,
loads the actual packaged WASM, and replaces remote API data and embedded console
content with fixtures. Console tests verify real iframe geometry, resizing and
reopening after tab changes, not live remote WebSocket/VNC sessions.

### Container specifics

- `/etc/resolv.conf` is a bind mount in the container; PDM's atomic rename onto
  it failed with "Device or resource busy". A small preload library
  (`app/ns8-rename-shim.c`) writes in place instead and keeps the value in the
  `pdm-config` volume, so DNS settings entered in PDM survive restarts.
- The packages PDM lists under *Package Versions* are installed in the image
  (`ifupdown2`, `proxmox-mail-forward`, `proxmox-offline-mirror-helper`,
  `zfsutils-linux`). `proxmox-datacenter-manager-meta` is a placeholder without
  the kernel and init dependencies of the original. PDM itself is held and is
  updated with the module, not with *Upgrade* in the interface.
- Package upgrades started in the interface run non-interactively (no debconf
  messages).

### Notes on the administrator password

The container applies the password at every start, from a SHA-512 hash stored in
`~/.config/state/admin.env` (mode 0600) of the module user. The clear text
password is not stored. Consequently a password changed inside the PDM
interface is reset at the next restart; change it in the module settings.

## What is stored and backed up

| Content | Location | Backup |
| --- | --- | --- |
| Remotes, API tokens, keys, certificates | Podman volume `pdm-config` | yes |
| Metrics database | Podman volume `pdm-data` | yes |
| Task logs, access and auth logs | Podman volume `pdm-log` | yes |
| Administrator password hash | `state/admin.env` | yes |

The volumes are copied while PDM is running. For a guaranteed consistent
snapshot stop the service (`runagent -m <id> systemctl --user stop pdm`) before
a manual backup. On restore, the module re-creates its Traefik route from the saved
settings (not yet tested on NS8).

## Design decisions

- **Image.** PDM has no official container image, so [`app/`](app) builds one:
  Debian 13 (`trixie-slim`) plus the packages of the official Proxmox
  repository `download.proxmox.com/debian/pdm`, with `PDM_VERSION` pinned in
  [`app/Containerfile`](app/Containerfile) and the repository key checked
  against a pinned checksum. Only what PDM needs is installed (about 280 MB
  instead of 490 MB for the community image `dockurr/proxmox-dm`): no mail
  server, no storage tools, no cron, no systemd. The tag of the image is the
  Git tree hash of `app/`, CI publishes it as `ghcr.io/platypuschan/pdm-app`
  before the module image and never overwrites a tag. Proxmox does not
  support this way of running PDM.
- **Updates of PDM.** A weekly workflow ([`update-pdm.yml`](.github/workflows/update-pdm.yml))
  compares `PDM_VERSION` with the Proxmox repository and the pinned digest of
  `debian:trixie-slim` with Docker Hub, and opens a pull request with the new
  version and/or digest and a raised `CATALOG_VERSION`. Nothing is merged or
  released automatically.
- **Rootless.** The container needs no extra privileges, only `--tmpfs` for the
  shared-memory directory of the API. PDM prints `Unable to open syslog` at
  start because there is no systemd journal; its log goes to the container log.
- **Password.** The entrypoint refuses to start without `PASSWORD_HASH`; the
  image has no default login.
- **Traefik.** PDM only speaks HTTPS with a self-signed certificate on the
  loopback port, so the route uses `https://127.0.0.1:<port>` with
  `skip_cert_verify`. Only Traefik is exposed; the container port is bound to
  127.0.0.1.
- **No local mail server.** Postfix is disabled (`POSTFIX=N`); e-mail
  notifications from PDM through the NS8 smarthost are not wired up yet.
- **No LDAP/AD realm** is configured. Use the PAM realm or add a realm in PDM.

## Network requirements

The node must reach the Proxmox VE / Backup Server API (TCP 8006 / 8007) of
every remote you add. Rootless Podman uses the node network for outgoing
connections.

## Development

```bash
python3 -m unittest discover -s tests -p 'test_*.py' -v   # module logic
cd ui && yarn install --immutable && yarn lint && yarn build
./build-images.sh                                          # needs buildah; builds app/ locally first
```

Every change to `imageroot/`, `ui/`, `app/` or `build-images.sh` needs a bump of
[`CATALOG_VERSION`](CATALOG_VERSION) (checked in CI).

## License

The module code is GPL-3.0-or-later (see [`LICENSE`](LICENSE)). Proxmox
Datacenter Manager is AGPLv3 and a trademark of Proxmox Server Solutions GmbH;
this project is not affiliated with or endorsed by them.
