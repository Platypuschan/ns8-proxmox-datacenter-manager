<!--
  Copyright (C) 2023 Nethesis S.r.l.
  SPDX-License-Identifier: GPL-3.0-or-later
  Vue 3 port of ns8-ui-lib component, see ./README.md
-->
<template>
  <CvTile kind="standard" :light="light" class="info-card ns-card">
    <!-- overflow menu -->
    <slot v-if="$slots.menu" name="menu"></slot>
    <!-- icon -->
    <div v-if="icon" class="row">
      <NsSvg :svg="icon" />
    </div>
    <div v-if="isErrorShown" class="row">
      <NsInlineNotification
        kind="error"
        :title="errorTitle"
        :description="errorDescription"
        :show-close-button="false"
      />
    </div>
    <div v-else-if="loading" class="row">
      <CvSkeletonText
        :paragraph="true"
        :line-count="3"
        heading
        class="skeleton"
      />
    </div>
    <template v-else>
      <div v-if="title" class="row">
        <h3 :class="['title', wrapTitle ? 'wrap-text' : 'ellipsis']">
          {{ title }}
        </h3>
        <CvInteractiveTooltip
          v-if="$slots.titleTooltip || titleTooltip"
          :alignment="titleTooltipAlignment"
          :direction="titleTooltipDirection"
          class="info title-tooltip"
        >
          <template #trigger>
            <Information16 />
          </template>
          <template #content>
            <slot v-if="$slots.titleTooltip" name="titleTooltip"></slot>
            <div v-else>{{ titleTooltip }}</div>
          </template>
        </CvInteractiveTooltip>
      </div>
      <div v-if="description" class="row">
        <div class="description">{{ description }}</div>
      </div>
    </template>
    <div class="row slot">
      <slot v-if="$slots.content" name="content"></slot>
    </div>
  </CvTile>
</template>

<script>
import { CvTile, CvSkeletonText, CvInteractiveTooltip } from "@carbon/vue";
import Information16 from "@carbon/icons-vue/es/information/16";
import NsSvg from "./NsSvg";
import NsInlineNotification from "./NsInlineNotification.vue";

export default {
  name: "NsInfoCard",
  components: {
    CvTile,
    CvSkeletonText,
    CvInteractiveTooltip,
    NsSvg,
    NsInlineNotification,
    Information16,
  },
  props: {
    title: { type: String, required: false },
    description: { type: String, required: false },
    titleTooltip: { type: String, required: false },
    titleTooltipAlignment: {
      type: String,
      default: "center",
      validator: (val) => ["start", "center", "end"].includes(val),
    },
    titleTooltipDirection: {
      type: String,
      default: "bottom",
      validator: (val) => ["top", "right", "bottom", "left"].includes(val),
    },
    icon: { type: [String, Object, Function], default: undefined },
    loading: Boolean,
    // String first: Vue casts "" to true when Boolean precedes String
    isErrorShown: { type: [String, Boolean], default: false },
    errorTitle: String,
    errorDescription: String,
    wrapTitle: Boolean,
    light: Boolean,
  },
};
</script>

<style scoped lang="scss">
@import "../styles/ns8-tooltip";

.info-card {
  display: flex;
  flex-direction: column;
  min-height: 7rem;
  // needed for absolute positioning of overflow menu
  position: relative;
}

.skeleton {
  margin-top: 0.5rem;
  margin-left: auto;
  margin-right: auto;
}

.row {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 0.5rem;
}

.title {
  margin-left: 0.25rem;
  margin-right: 0.25rem;
  margin-bottom: 0.5rem;
  text-align: center;
}

.ellipsis {
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.wrap-text {
  overflow-wrap: anywhere;
}

.title-tooltip {
  position: relative;
  top: -2px;
}

.description {
  margin-left: 0.25rem;
  margin-right: 0.25rem;
}

.slot {
  margin-top: 0.5rem;
}

// interactive tooltip layout, from ns8-core _core.scss
.cv-interactive-tooltip {
  display: inline-block;
}

.cv-interactive-tooltip :deep(.bx--tooltip__label .bx--tooltip__trigger) {
  margin-left: 0;
}
</style>
