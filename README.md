# Proxmox Datacenter Manager for NethServer 8

This repository packages the [Proxmox Datacenter Manager](https://pdm.proxmox.com/)
(PDM) for NethServer 8. PDM gives one overview of many Proxmox VE and Proxmox
Backup Server installations. The module runs it as a rootless Podman container,
publishes it through the node Traefik with a host name and an optional Let's
Encrypt certificate, and includes its configuration and data in the NS8 backup.

> Status: pre-release (`0.1.0-rc.1`). The CI installs the module on a real
> NS8 node (Debian 13 and Rocky Linux 9) and checks configuration, login,
> password change, the Traefik route, persistence over a restart and the UI.
> **Not yet tested:** updating from a previous release, backup and restore, and
> adding real Proxmox remotes. Test on a non-productive node first.

## Install

Add the [Platypuschan NS8 module catalog](https://github.com/Platypuschan/ns8-modules#add-the-repository)
once this module is listed there, or install from the command line with a
released version from [`CATALOG_VERSION`](CATALOG_VERSION):

```bash
add-module ghcr.io/platypuschan/proxmox-datacenter-manager:0.1.0-rc.1 1
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

### Notes on the administrator password

The container applies the password at every start, from a SHA-512 hash stored in
`~/.config/state/admin.env` (mode 0600) of the module user. The clear text
password is not stored. Consequently a password changed inside the PDM
interface is reset at the next restart; change it in the module settings.

## What is stored and backed up

| Content | Location | Backup |
| --- | --- | --- |
| Remotes, API tokens, keys, certificates | Podman volume `pdm-config` | yes |
| Metrics database, tasks | Podman volume `pdm-data` | yes |
| Administrator password hash | `state/admin.env` | yes |

The volumes are copied while PDM is running. For a guaranteed consistent
snapshot stop the service (`runagent -m <id> systemctl --user stop pdm`) before
a manual backup. On restore, the module re-creates its Traefik route from the saved
settings (the restore path follows the ntfy module and is not yet tested on NS8).

## Design decisions

- **Image.** PDM has no official container image. The module uses the community
  image [`ghcr.io/dockur/proxmox-dm`](https://github.com/dockur/proxmox-dm)
  (MIT, Debian 13 plus the packages from the official Proxmox repository
  `download.proxmox.com/debian/pdm`), pinned to the tag in
  [`build-images.sh`](build-images.sh). Proxmox does not support this way of
  running PDM.
- **Rootless.** The image asks for `--privileged` and prints `ERROR: Please
  start the container with the --privileged flag!`. The check is only
  advisory with `DEBUG=Y`, which the unit sets; as tested, everything the
  application needs works inside the rootless user namespace
  (`--tmpfs` for its shared memory directory). The message in the log is
  expected.
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
./build-images.sh                                          # needs buildah
```

Every change to `imageroot/`, `ui/` or `build-images.sh` needs a bump of
[`CATALOG_VERSION`](CATALOG_VERSION) (checked in CI).

## License

The module code is GPL-3.0-or-later (see [`LICENSE`](LICENSE)). Proxmox
Datacenter Manager is AGPLv3 and a trademark of Proxmox Server Solutions GmbH;
this project is not affiliated with or endorsed by them.
