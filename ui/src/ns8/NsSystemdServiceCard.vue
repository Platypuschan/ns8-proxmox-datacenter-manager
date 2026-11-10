<!--
  Copyright (C) 2023 Nethesis S.r.l.
  SPDX-License-Identifier: GPL-3.0-or-later
  Vue 3 port of ns8-ui-lib component, see ./README.md
-->
<template>
  <CvTile kind="standard" :light="light" class="service-card ns-card">
    <div v-if="icon" class="row">
      <NsSvg :svg="icon" />
    </div>
    <div class="row">
      <h3 class="service-name">{{ serviceName }}</h3>
    </div>
    <div class="row">
      <div class="stats">
        <CvTag v-if="failed" kind="red" :label="failedLabel" />
        <CvTag v-if="active" kind="green" :label="activeLabel" />
        <CvTag v-else kind="gray" :label="inactiveLabel" />
        <CvTag v-if="enabled" kind="blue" :label="enabledLabel" />
        <CvTag v-else kind="gray" :label="disabledLabel" />
      </div>
    </div>
  </CvTile>
</template>

<script>
import { CvTile, CvTag } from "@carbon/vue";
import NsSvg from "./NsSvg";

export default {
  name: "NsSystemdServiceCard",
  components: { NsSvg, CvTile, CvTag },
  props: {
    serviceName: { type: String, required: true },
    active: Boolean,
    failed: Boolean,
    enabled: Boolean,
    failedLabel: { type: String, default: "failed" },
    activeLabel: { type: String, default: "active" },
    inactiveLabel: { type: String, default: "inactive" },
    enabledLabel: { type: String, default: "enabled" },
    disabledLabel: { type: String, default: "disabled" },
    icon: { type: [String, Object, Function], default: undefined },
    light: Boolean,
  },
};
</script>

<style scoped lang="scss">
.service-card {
  display: flex;
  flex-direction: column;
}

.row {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 0.5rem;
}

.service-name {
  margin-left: 0.25rem;
  margin-right: 0.25rem;
  margin-bottom: 0.5rem;
  text-align: center;
  overflow-wrap: anywhere;
}

.stats {
  display: flex;
  align-items: center;
  margin-left: 0.5rem;
  margin-right: 0.5rem;
}
</style>
