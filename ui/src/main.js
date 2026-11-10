//
// Copyright (C) 2023 Nethesis S.r.l.
// SPDX-License-Identifier: GPL-3.0-or-later
//
import { createApp } from "vue";
import App from "./App.vue";
import router from "./router";
import store from "./store";
import { loadLanguage } from "./i18n";
import { createI18n } from "vue-i18n";
import { registerCarbonComponents } from "./carbon";
import * as ns8 from "./ns8";

import axios from "axios";

axios.defaults.timeout = 10000;

loadI18n();

async function loadI18n() {
  const navigatorLang = navigator.language.substring(0, 2);
  const messages = await loadLanguage(navigatorLang);
  const fallbackMessages = await loadLanguage("en");
  const i18n = createI18n({
    legacy: false,
    globalInjection: true,
    locale: navigatorLang,
    fallbackLocale: "en",
    // the NS8 core owns the UI language; missing keys are not worth a warning
    missingWarn: false,
    fallbackWarn: false,
    messages: {
      en: fallbackMessages.default,
      [navigatorLang]: messages.default,
    },
  });

  const app = createApp(App);
  registerCarbonComponents(app);
  for (const [name, component] of Object.entries(ns8)) {
    if (name.startsWith("Ns")) app.component(name, component);
  }
  app.use(router);
  app.use(store);
  app.use(i18n);
  // Vue 2 replaced the #ns8-app boot loader; Vue 3 mounts *into* the target.
  // Swap the loader for a plain container so App.vue's own #ns8-app root is
  // the only one and the loader styles (height, background, centered text)
  // do not leak into the app.
  const loader = document.getElementById("ns8-app");
  const container = document.createElement("div");
  loader.replaceWith(container);
  app.mount(container);
}
