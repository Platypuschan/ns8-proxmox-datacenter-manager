//
// Copyright (C) 2023 Nethesis S.r.l.
// SPDX-License-Identifier: GPL-3.0-or-later
//
import { createStore } from "vuex";
import { markRaw } from "vue";

export default createStore({
  state: {
    appName: "",
    instanceName: "",
    instanceLabel: "",
    core: null,
  },
  mutations: {
    setInstanceName(state, instanceName) {
      state.instanceName = instanceName;
    },
    setInstanceLabel(state, instanceLabel) {
      state.instanceLabel = instanceLabel;
    },
    setCore(state, core) {
      // `core` is the Vue 2 root of the NS8 core: it must never be proxied
      state.core = core ? markRaw(core) : core;
    },
    setAppName(state, appName) {
      state.appName = appName;
    },
  },
  actions: {
    setInstanceNameInStore(context, instanceName) {
      context.commit("setInstanceName", instanceName);
    },
    setInstanceLabelInStore(context, instanceLabel) {
      context.commit("setInstanceLabel", instanceLabel);
    },
    setCoreInStore(context, core) {
      context.commit("setCore", core);
    },
    setAppNameInStore(context, appName) {
      context.commit("setAppName", appName);
    },
  },
  modules: {},
});
