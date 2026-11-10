<!--
  Copyright (C) 2023 Nethesis S.r.l.
  SPDX-License-Identifier: GPL-3.0-or-later
  Vue 3 port of ns8-ui-lib component, see ./README.md
-->
<template>
  <!-- class/attrs land on this wrapper: CvComboBox would also apply them to
       its inner listbox -->
  <div class="ns-combo-box">
    <CvComboBox
      ref="combo"
      :model-value="modelValue"
      :options="options"
      :title="title"
      :label="label"
      :invalid-message="invalidMessage"
      :helper-text="helperText"
      :disabled="disabled"
      :is-light="light"
      :auto-highlight="autoHighlight"
      @update:model-value="$emit('update:modelValue', $event)"
      @change="$emit('change', $event)"
    />
  </div>
</template>

<script>
import { CvComboBox } from "@carbon/vue";

// Thin NS8 wrapper (same props as ns8-ui-lib NsComboBox for the subset used here)
export default {
  name: "NsComboBox",
  components: { CvComboBox },
  props: {
    modelValue: { type: String, default: undefined },
    options: { type: Array, required: true },
    title: { type: String, default: "" },
    label: { type: String, default: "" },
    invalidMessage: { type: String, default: undefined },
    helperText: { type: String, default: undefined },
    disabled: Boolean,
    light: Boolean,
    autoHighlight: Boolean,
  },
  emits: ["update:modelValue", "change"],
  methods: {
    focus() {
      const input = this.$el.querySelector("input");
      if (input) input.focus();
    },
  },
};
</script>
