<!--
  Copyright (C) 2023 Nethesis S.r.l.
  SPDX-License-Identifier: GPL-3.0-or-later
-->
<template>
  <div class="app-side-menu-content">
    <div class="instance-name">
      <div v-if="instanceLabel">{{ instanceLabel }}</div>
      <div v-else-if="instanceName">{{ instanceName }}</div>
      <cv-skeleton-text
        v-else
        :width="instanceNameSkeletonWidth"
      ></cv-skeleton-text>
    </div>

    <cv-side-nav-items>
      <cv-side-nav-link
        :class="{ 'current-page': isLinkActive('status') }"
        @click="goToAppPage(instanceName, 'status')"
      >
        <template #nav-icon><Activity20 /></template>
        <span>{{ $t("status.title") }}</span>
      </cv-side-nav-link>
      <cv-side-nav-link
        :class="{ 'current-page': isLinkActive('settings') }"
        @click="goToAppPage(instanceName, 'settings')"
      >
        <template #nav-icon><Settings20 /></template>
        <span>{{ $t("settings.title") }}</span>
      </cv-side-nav-link>
      <cv-side-nav-link
        :class="{ 'current-page': isLinkActive('about') }"
        @click="goToAppPage(instanceName, 'about')"
      >
        <template #nav-icon><Information20 /></template>
        <span>{{ $t("about.title") }}</span>
      </cv-side-nav-link>
    </cv-side-nav-items>
  </div>
</template>

<script>
import Settings20 from "@carbon/icons-vue/es/settings/20";
import Information20 from "@carbon/icons-vue/es/information/20";
import Activity20 from "@carbon/icons-vue/es/activity/20";
import { mapState } from "vuex";
import bus from "@/ns8/events";
import { QueryParamService, UtilService } from "@/ns8";

export default {
  name: "AppSideMenuContent",
  components: {
    Settings20,
    Information20,
    Activity20,
  },
  mixins: [QueryParamService, UtilService],
  data() {
    return {
      instanceNameSkeletonWidth: "70%",
    };
  },
  computed: {
    ...mapState(["instanceName", "instanceLabel", "core"]),
  },
  created() {
    // register to appNavigation event
    bus.on("appNavigation", this.onAppNavigation);
  },
  beforeUnmount() {
    // remove event listener
    bus.off("appNavigation", this.onAppNavigation);
  },
  methods: {
    isLinkActive(page) {
      return this.getPage() === page;
    },
    onAppNavigation() {
      // highlight current page in side menu
      this.$forceUpdate();
    },
  },
};
</script>

<style scoped lang="scss">
.instance-name span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
