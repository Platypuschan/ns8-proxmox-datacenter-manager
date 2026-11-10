<!--
  Copyright (C) 2023 Nethesis S.r.l.
  SPDX-License-Identifier: GPL-3.0-or-later
  Vue 3 port of ns8-ui-lib component, see ./README.md
-->
<template>
  <div class="cv-code-snippet-multiline" :class="classes" data-code-snippet>
    <div :class="['bx--snippet-container', { 'no-expand': hideExpandButton }]">
      <code ref="code">
        <pre><slot /></pre>
      </code>
    </div>
    <CvIconButton
      v-if="!hideCopyButton"
      type="button"
      class="bx--copy-btn"
      kind="ghost"
      :icon="Copy20"
      :label="tooltipToShow"
      tip-position="bottom"
      tip-alignment="end"
      :disabled="disabled"
      @click="copyCode"
    />
    <CvButton
      v-if="!hideExpandButton"
      type="button"
      kind="ghost"
      size="small"
      class="bx--snippet-btn--expand"
      @click="toggleExpand"
    >
      <span class="bx--snippet-btn--text">{{ expandButtonText }}</span>
      <ChevronDown20 class="bx--icon-chevron--down" />
    </CvButton>
  </div>
</template>

<script>
import { CvButton, CvIconButton } from "@carbon/vue";
import { markRaw } from "vue";
import Copy20 from "@carbon/icons-vue/es/copy/20";
import ChevronDown20 from "@carbon/icons-vue/es/chevron--down/20";

export default {
  name: "NsCodeSnippet",
  components: { CvButton, CvIconButton, ChevronDown20 },
  props: {
    expanded: { type: Boolean, default: false },
    wrapText: { type: Boolean, default: true },
    disabled: Boolean,
    hideCopyButton: Boolean,
    lessText: { type: String, default: "Show less" },
    moreText: { type: String, default: "Show more" },
    hideExpandButton: Boolean,
    copyTooltip: { type: String, default: "Copy to clipboard" },
    copyFeedback: { type: String, default: "Copied" },
    light: Boolean,
  },
  data() {
    return {
      justCopied: false,
      Copy20: markRaw(Copy20),
      isExpanded: this.expanded,
    };
  },
  computed: {
    classes() {
      return [
        "cv-code-snippet",
        "bx--snippet",
        "bx--snippet--multi",
        {
          "bx--snippet--light": this.light,
          "bx--snippet--no-copy": this.hideCopyButton,
          "bx--snippet--wraptext": this.wrapText,
          "bx--snippet--expand": this.isExpanded,
          "bx--snippet--disabled": this.disabled,
        },
      ];
    },
    tooltipToShow() {
      return this.justCopied ? this.copyFeedback : this.copyTooltip;
    },
    expandButtonText() {
      return this.isExpanded ? this.lessText : this.moreText;
    },
  },
  watch: {
    expanded() {
      this.isExpanded = this.expanded;
    },
  },
  methods: {
    toggleExpand() {
      this.isExpanded = !this.isExpanded;
    },
    async copyCode() {
      const text = this.$refs.code.innerText;
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // clipboard API unavailable (insecure context): legacy fallback
        const area = document.createElement("textarea");
        area.value = text;
        area.style.cssText = "position:absolute;left:-9999px;opacity:0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
      }
      this.justCopied = true;
      setTimeout(() => {
        this.justCopied = false;
      }, 2000);
    },
  },
};
</script>

<style scoped lang="scss">
.bx--snippet--multi .bx--snippet-container {
  min-height: 4.5rem;
  max-height: 9.6rem;
  overflow-y: hidden;
}

.bx--snippet--multi .bx--snippet-container.no-expand {
  min-height: 2.5rem;
}

.bx--snippet--multi.bx--snippet--expand .bx--snippet-container {
  max-height: 100%;
}

.bx--snippet--multi .bx--copy-btn {
  position: absolute !important;
  top: 0.5rem;
  right: 0.5rem;
  z-index: 11;
  width: 3rem;
  height: 2rem;
}

.bx--snippet-btn--expand {
  right: 0.5rem;
  bottom: 0.5rem;
}
</style>
