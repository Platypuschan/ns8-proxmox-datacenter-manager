<!--
  Copyright (C) 2023 Nethesis S.r.l.
  SPDX-License-Identifier: GPL-3.0-or-later
-->
<template>
  <transition name="slide-menu">
    <div
      v-if="isMenuShown"
      class="mobile-side-menu cv-side-nav bx--side-nav bx--side-nav__navigation bx--side-nav--expanded app-side-nav"
    >
      <AppSideMenuContent />
    </div>
  </transition>
</template>

<script>
import bus from "@/ns8/events";
import AppSideMenuContent from "@/components/AppSideMenuContent.vue";

export default {
  name: "AppMobileSideMenu",
  components: { AppSideMenuContent },
  data() {
    return {
      isMenuShown: false,
      isClickOutsideEnabled: false,
    };
  },
  created() {
    // register to the toggle event
    bus.on("toggleMobileSideMenu", this.toggleMobileSideMenu);
  },
  mounted() {
    // prevent glitch: click-outside is incorrectly detected when mobile side menu appears
    setTimeout(() => {
      this.isClickOutsideEnabled = true;
    }, 200);
  },
  beforeUnmount() {
    // remove event listener
    bus.off("toggleMobileSideMenu", this.toggleMobileSideMenu);
  },
  methods: {
    toggleMobileSideMenu() {
      this.isMenuShown = !this.isMenuShown;
    },
    clickOutside() {
      setTimeout(() => {
        this.isMenuShown = false;
      }, 200);
    },
  },
};
</script>

<style scoped lang="scss">
@import "../styles/carbon-utils";

.mobile-side-menu {
  width: $side-menu-width;
  height: calc(100vh - 3rem);
  position: fixed;
  top: 3rem;
  left: 0;
  z-index: 10000;
  overflow: auto;
}

.slide-menu-enter-active,
.slide-menu-leave-active {
  transition: all 0.3s ease;
}

.slide-menu-enter-from,
.slide-menu-leave-to {
  transform: translateX(-$side-menu-width);
}
</style>
