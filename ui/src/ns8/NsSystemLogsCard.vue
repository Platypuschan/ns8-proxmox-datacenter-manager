<!--
  Copyright (C) 2023 Nethesis S.r.l.
  SPDX-License-Identifier: GPL-3.0-or-later
  Vue 3 port of ns8-ui-lib component, see ./README.md
-->
<template>
  <NsInfoCard
    :title="title"
    :description="description"
    :light="light"
    :icon="Catalog32"
    class="ns-system-logs-card ns-card"
  >
    <template #content>
      <NsButton kind="ghost" :icon="ArrowRight20" @click="goToLogs">
        {{ buttonLabel }}
      </NsButton>
    </template>
  </NsInfoCard>
</template>

<script>
import { IconService } from "./services";
import NsInfoCard from "./NsInfoCard.vue";
import NsButton from "./NsButton.vue";

export default {
  name: "NsSystemLogsCard",
  components: { NsInfoCard, NsButton },
  mixins: [IconService],
  props: {
    title: { type: String, default: "Logs" },
    description: { type: String, default: "" },
    buttonLabel: { type: String, default: "Go to System logs" },
    router: { type: Object, default: null },
    context: {
      type: String,
      default: "cluster",
      validator: (val) => ["cluster", "node", "module"].includes(val),
    },
    nodeId: { type: String, default: "" },
    moduleId: { type: String, default: "" },
    searchQuery: { type: String, default: "" },
    maxLines: { type: String, default: "" },
    startDate: { type: String, default: "" },
    startTime: { type: String, default: "" },
    endDate: { type: String, default: "" },
    endTime: { type: String, default: "" },
    followLogs: Boolean,
    light: Boolean,
  },
  computed: {
    logsUrl() {
      const queryParams = [];
      if (this.context) queryParams.push(`context=${this.context}`);
      if (this.context == "node" && this.nodeId) {
        queryParams.push(`selectedNodeId=${this.nodeId}`);
      }
      if (this.context == "module" && this.moduleId) {
        queryParams.push(`selectedAppId=${this.moduleId}`);
      }
      if (this.searchQuery) queryParams.push(`searchQuery=${this.searchQuery}`);
      if (this.maxLines) queryParams.push(`maxLines=${this.maxLines}`);
      if (this.startDate) queryParams.push(`startDate=${this.startDate}`);
      if (this.startTime) queryParams.push(`startTime=${this.startTime}`);
      if (this.endDate) queryParams.push(`endDate=${this.endDate}`);
      if (this.endTime) queryParams.push(`endTime=${this.endTime}`);
      if (this.followLogs) queryParams.push(`followLogs=${this.followLogs}`);
      return "/system-logs?" + queryParams.join("&");
    },
  },
  methods: {
    goToLogs() {
      if (this.router) {
        // the NS8 core router is a handle, not module state
        // eslint-disable-next-line vue/no-mutating-props
        this.router.push(this.logsUrl);
      }
    },
  },
};
</script>
