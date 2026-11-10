<!--
  Copyright (C) 2023 Nethesis S.r.l.
  SPDX-License-Identifier: GPL-3.0-or-later
  Vue 3 port of ns8-ui-lib component, see ../ns8/README.md
-->
<template>
  <div
    data-notification
    :class="[
      'cv-inline-notification',
      'bx--inline-notification',
      `bx--inline-notification--${kind.toLowerCase()}`,
      { 'bx--inline-notification--low-contrast': lowContrast },
    ]"
    :role="isAlert ? 'alert' : undefined"
    :aria-live="!isAlert ? 'polite' : undefined"
  >
    <div class="bx--inline-notification__details details">
      <component :is="icon" class="bx--inline-notification__icon" />
      <div class="bx--inline-notification__text-wrapper">
        <p
          v-if="$slots.title || title"
          class="bx--inline-notification__title title"
        >
          <slot v-if="$slots.title" name="title"></slot>
          <span v-else>{{ title }}</span>
        </p>
        <p
          v-if="$slots.description || description"
          :class="[
            'bx--inline-notification__subtitle',
            { 'mg-right': loading },
          ]"
        >
          <slot v-if="$slots.description" name="description"></slot>
          <span v-else>{{ description }}</span>
        </p>
        <p v-if="loading" class="loader"></p>
      </div>
    </div>
    <NsButton
      v-if="actionLabel"
      kind="ghost"
      size="sm"
      type="button"
      :loading="loadingAction"
      class="bx--inline-notification__action-button action-button"
      @click="$emit('action')"
    >
      {{ actionLabel }}
    </NsButton>
    <button
      v-if="showCloseButton"
      type="button"
      :aria-label="closeAriaLabel"
      data-notification-btn
      class="bx--inline-notification__close-button"
      @click="$emit('close')"
    >
      <Close20 class="bx--inline-notification__close-icon" />
    </button>
  </div>
</template>

<script>
import { markRaw } from "vue";
import Close20 from "@carbon/icons-vue/es/close/20";
import ErrorFilled20 from "@carbon/icons-vue/es/error--filled/20";
import InformationFilled20 from "@carbon/icons-vue/es/information--filled/20";
import WarningFilled20 from "@carbon/icons-vue/es/warning--filled/20";
import CheckmarkFilled20 from "@carbon/icons-vue/es/checkmark--filled/20";
import NsButton from "./NsButton.vue";

const icons = {
  error: markRaw(ErrorFilled20),
  info: markRaw(InformationFilled20),
  warning: markRaw(WarningFilled20),
  success: markRaw(CheckmarkFilled20),
};

export default {
  name: "NsInlineNotification",
  components: { NsButton, Close20 },
  props: {
    showCloseButton: { type: Boolean, default: false },
    title: { type: String, default: "" },
    description: String,
    actionLabel: { type: String, default: "" },
    closeAriaLabel: { type: String, default: "Dismiss notification" },
    kind: {
      type: String,
      default: "info",
      validator: (val) => ["error", "info", "warning", "success"].includes(val),
    },
    lowContrast: { type: Boolean, default: true },
    loading: { type: Boolean, default: false },
    loadingAction: { type: Boolean, default: false },
  },
  emits: ["action", "close"],
  computed: {
    icon() {
      return icons[this.kind];
    },
    isAlert() {
      return this.kind === "error" || this.kind === "warning";
    },
  },
};
</script>

<style scoped lang="scss">
@import "../styles/ns8-tokens";

.cv-inline-notification {
  margin-bottom: $spacing-07;
}

.title {
  margin-right: 0.75rem;
  margin-bottom: 0.2rem;
  font-size: 0.875rem !important;
  font-weight: 600 !important;
}

.mg-right {
  margin-right: 0.75rem;
}

.action-button {
  margin-right: 0.5rem;
}

.bx--inline-notification__text-wrapper p {
  // needed for inline notifications inside modal
  padding-right: 0 !important;
}

.loader {
  width: 1rem;
  height: 1rem;
  border: 3px solid transparent;
  border-radius: 50%;
  border-top: 3px solid currentColor;
  border-right: 3px solid currentColor;
  border-bottom: 3px solid currentColor;
  animation: spin 0.5s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
