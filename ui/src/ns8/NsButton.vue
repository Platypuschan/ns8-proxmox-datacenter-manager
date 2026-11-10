<!--
  Copyright (C) 2023 Nethesis S.r.l.
  SPDX-License-Identifier: GPL-3.0-or-later
  Vue 3 port of ns8-ui-lib component, see ../ns8/README.md
-->
<template>
  <button
    class="cv-button bx--btn"
    :class="buttonClasses"
    :disabled="disabled"
    role="button"
  >
    <slot></slot>

    <!-- spinning loader -->
    <span v-if="loading" class="loader bx--btn__icon"></span>

    <!-- icon -->
    <NsSvg v-if="icon && !loading" :svg="icon" class="bx--btn__icon" />
  </button>
</template>

<script>
import NsSvg from "./NsSvg";

const kinds = [
  "default",
  "primary",
  "secondary",
  "tertiary",
  "ghost",
  "danger",
  "danger--ghost",
  "danger--tertiary",
];
const sizes = ["default", "field", "small", "sm", "lg", "xl"];

export default {
  name: "NsButton",
  components: { NsSvg },
  props: {
    icon: { type: [String, Object, Function], default: undefined },
    kind: {
      type: String,
      default: "secondary",
      validator: (val) => kinds.includes(val),
    },
    size: {
      type: String,
      default: "default",
      validator: (val) => sizes.includes(val),
    },
    loading: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
  },
  computed: {
    buttonClasses() {
      const classes = [`bx--btn--${this.kind.toLowerCase()}`];
      if (this.size && this.size !== "default") {
        classes.push(`bx--btn--${this.size === "small" ? "sm" : this.size}`);
      }
      return classes;
    },
  },
};
</script>

<style scoped lang="scss">
// icon size
.bx--btn .bx--btn__icon {
  width: 1.25rem;
  height: 1.25rem;
}

// icon size for small button
.bx--btn.bx--btn--sm .bx--btn__icon {
  width: 1rem;
  height: 1rem;
}

.loader {
  right: 1rem;
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
