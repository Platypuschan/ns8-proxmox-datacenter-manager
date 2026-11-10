# NS8 UI layer (Vue 3)

`@nethserver/ns8-ui-lib` (latest 2.2.1) is a Vue 2-only package: its peer
dependency is `vue ^2.6.12`, its components are precompiled Vue 2 render
functions (`_vm._c`, `_vm._g`, `$listeners`, `extends: CvButton` of
Carbon Vue 2) and it registers Vue 2 filters. It cannot be mounted by Vue 3
(and `@vue/compat` does not provide the Vue 2 render helpers it needs).

This directory therefore holds a small Vue 3 port of exactly the parts this
module uses, derived from ns8-ui-lib (Nethesis S.r.l., GPL-3.0-or-later) and
built on Carbon Vue 3 (`@carbon/vue` 3):

- `services.js`: Task/Util/QueryParam/PageTitle/Icon mixins with the same
  method names and NS8 core contract (`window.parent.core`, task events on
  `core.$root`, `Authorization: Bearer` from `localStorage.loginInfo`).
- `Ns*.vue`: NsButton, NsInlineNotification, NsComboBox, NsCodeSnippet,
  NsEmptyState, NsInfoCard, NsSystemdServiceCard, NsSystemLogsCard,
  NsBackupCard with the same props and Carbon (`bx--`) classes.

Not ported (unused by this module): wizard, data table, modal, toast, timer,
Lottie empty-state animation and the other lib components.
