# Coordinated dependency migration (0.2.0)

## Changes

The native Rust/WASM PDM frontend and backend are unchanged. This migration is
for the embedded NS8 module settings/status/about UI.

- Tooling PR #16 upgrades Ubuntu to 26.04 and devcontainer generation 0 to 1.
  Microsoft's published JavaScript image has no Node 24 tag: the supported
  `1-22-bookworm` base plus the official Node feature selects Node LTS 24.
  The real devcontainer CLI build was exercised, including the non-root user.
  The final Vue 3 development environment uses the now-published generation 5
  `5-22-bookworm` base and Node feature generation 2 (2.1.2), verified with the
  real devcontainer CLI build and non-root Node 24.22.2/Yarn 4.18.1 immutable
  install, lint, installed-stack tests and production build. Neither input is
  left a major behind after refreshing the dashboard.
- Scheduled maintenance PR #20 coordinates Node 24.22.2, Yarn 4.18.1,
  Renovate 44.225.0 and all existing-range lockfile updates, with one 0.1.6 bump.
- The module UI uses Vue 3, Router 5, Vuex 4, i18n 11, vue-debounce 6,
  lottie-web-vue 3, Carbon Vue 3, carbon-components 11, Vite 8, Babel 8,
  ESLint 10, eslint-plugin-vue 10, eslint-plugin-prettier 5, Prettier 3 and
  @vue/eslint-config-prettier 10. Installed majors are asserted by stack tests.
- The Vue-2-only ns8-ui-lib is replaced by the consumed GPL-licensed Vue 3
  bridge previously implemented for Organizr. The host core stays Vue 2 and
  is kept out of the module's reactive graph with markRaw. Its bearer-token,
  API endpoint, router, translation and task-event contracts are retained.
- Carbon 11 is used for Sass tokens, not a replacement host stylesheet.
  Carbon Vue 3 still emits `bx--` markup; loading `cds--` styles globally would
  break the NS8 core. Browser tests use real core.css extracted without running
  a digest-pinned core image. Carbon Vue's own legacy Carbon 10 transitive
  dependency is not falsely presented as removed.
- Task subscriptions are disposed after any terminal outcome, HTTP failure
  and unmount. Delayed/duplicate events do not trigger stale view requests.
- Vue i18n 11 requires literal `@` escaping: English/German `root@pam` help
  text now uses literal interpolation, preserving displayed text and avoiding
  the first-configuration render crash.

## Verification and boundaries

The settings browser fixture covers initial-password validation, unchanged
password preservation, hostname updates, option checkboxes, HTTPS/LE toggles,
open-PDM without submitting unsaved changes, error recovery, status/backup,
service/image/volume rendering, logs, about/version and event disposal.
Production and development bundles run the same suite; development warnings
and runtime exceptions fail tests. The surrounding NS8 API/event bus is
explicitly a fixture, not a claim of live core authentication.

Baseline lifecycle tests failed against the pre-migration Vue 2 build
(orphaned aborted listener; delayed repository completion created a request).
The first-setup browser case also reproduced the unescaped-@ render failure
before the translation fix. No acceptance assertions or existing suites were
disabled. Full remote native-PDM browser and Debian/Rocky QEMU install/update
checks remain separate mandatory gates before merging.

Registered-but-unused Lottie/debounce plugins are not claimed as functional
user paths. Upstream Lottie eval and vue-axios CommonJS/ESM build warnings
remain visible. VueUse 4 has missing Vue peer declarations in transitive
metadata; the root installed runtime is Vue 3 and the consumed UI is tested.

Security: no auth protocol, privilege, certificate or password-policy changes.
The host bridge retains bearer authentication and the existing API boundary;
real-browser tests use only a fixed labelled fixture token. No user instance
is deployed or restarted. First-party `actions/**` non-major maintenance alone
may automerge after seven days and all protected-branch checks; Node, runners,
UI, custom workflows, runtime inputs and all majors remain manually reviewed.
