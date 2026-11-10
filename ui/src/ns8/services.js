//
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Vue 3 port of the NS8 UI library mixins used by this module
// (derived from @nethserver/ns8-ui-lib, Nethesis S.r.l., GPL-3.0-or-later).
import bus from "./events";
import { icons } from "./icons";

function getFromStorage(key) {
  const raw = window.localStorage.getItem(key);
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function getToken() {
  const loginInfo = getFromStorage("loginInfo");
  return loginInfo && loginInfo.token ? loginInfo.token : "";
}

export function uuidv4() {
  const bytes = window.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10).join(""),
  ].join("-");
}

export const IconService = {
  name: "IconService",
  data() {
    return { ...icons };
  },
};

export const UtilService = {
  name: "UtilService",
  methods: {
    getErrorMessage(error) {
      if (error.message === "Network Error") {
        return this.$t("error.network_error");
      }
      if (/^timeout of .+ exceeded$/.test(error.message)) {
        // axios timeout reached
        return this.$t("error.network_timeout");
      }
      if (error.response) {
        switch (error.response.status) {
          case 401:
            return this.$t("error.401");
          case 403:
            return this.$t("error.403");
          case 404:
            return this.$t("error.404");
        }
      }
      return this.$t("error.generic_error");
    },
    /** Clear errors inside context. Used before input data validation. */
    clearErrors() {
      this.clearStrings(this.error);
    },
    clearStrings(obj) {
      for (const key of Object.keys(obj)) {
        if (typeof obj[key] == "string") {
          obj[key] = "";
        } else if (typeof obj[key] == "boolean") {
          obj[key] = false;
        } else if (typeof obj[key] == "object") {
          this.clearStrings(obj[key]);
        } else {
          console.error("unexpected object type:", typeof obj[key]);
        }
      }
    },
    sortByProperty(property) {
      return function (a, b) {
        if (a[property] < b[property]) return -1;
        if (a[property] > b[property]) return 1;
        return 0;
      };
    },
    /** Translate an i18n key, or return "" for an empty key (no error). */
    tKey(key) {
      return key ? this.$t(key) : "";
    },
    focusElement(elementRef) {
      this.$nextTick(() => {
        const target = this.$refs[elementRef];
        if (!target) return;
        if (typeof target.focus === "function") {
          target.focus();
          return;
        }
        const el = target.$el || target;
        const focusable =
          el && el.querySelector
            ? el.matches("input, button, select, textarea")
              ? el
              : el.querySelector("input, button, select, textarea")
            : null;
        if (focusable) focusable.focus();
      });
    },
    getAppDescription(app, coreContext) {
      const langCode = coreContext.$root.$i18n.locale;
      let description = app.description[langCode];
      if (!description) {
        // fallback to english
        description = app.description.en;
      }
      return description;
    },
    getAppCategories(app, coreContext) {
      const i18nCategories = [];
      for (const category of app.categories) {
        if (category === "unknown") {
          return "";
        }
        i18nCategories.push(
          coreContext.$t("software_center.app_categories." + category),
        );
      }
      return i18nCategories.join(", ");
    },
    goToAppPage(instanceName, page, query) {
      const path = `/apps/${instanceName}?page=${page}`;
      if (this.core.$route.fullPath != path) {
        if (query) {
          this.core.$router.push({ path: path, query: query });
        } else {
          this.core.$router.push(path);
        }
      }
    },
    getUuid() {
      return uuidv4();
    },
  },
};

export const QueryParamService = {
  name: "QueryParamService",
  methods: {
    // register a watch for every object inside data.q
    watchQueryData(context) {
      if (context.q) {
        Object.keys(context.q).forEach((dataItem) => {
          context.$watch("q." + dataItem, () => {
            this.dataToQueryParams(context);
          });
        });
      }
    },
    // sync UI status with URL query parameters of the NS8 core
    initUrlBindingForApp(context, page) {
      const queryParams = this.getQueryParamsForApp();
      const requestedPage = queryParams.page || "status";
      if (requestedPage != page) {
        return;
      }
      this.syncQueryParamsAndDataForApp(context);
      return setInterval(() => this.checkUrlChangeForApp(context, page), 500);
    },
    syncQueryParamsAndDataForApp(context) {
      this.queryParamsToDataForApp(context);
      this.dataToQueryParams(context);
    },
    dataToQueryParams(context) {
      const queryParams = [];
      for (const [key, value] of Object.entries(context.q)) {
        queryParams.push(key + "=" + encodeURIComponent(value));
      }
      const urlWithParams =
        window.parent.core.$route.path + "?" + queryParams.join("&");
      if (window.parent.core.$route.fullPath != urlWithParams) {
        window.parent.core.$router.replace(urlWithParams);
      }
    },
    checkUrlChangeForApp(context, page) {
      const newUrl = window.parent.location.href;
      if (newUrl != this.currentUrlForApp) {
        const queryParams = this.getQueryParamsForApp();
        const requestedPage = queryParams.page || "status";

        // emit app navigation event (highlights current page in side menu)
        const appInstance = /#\/apps\/(\w+)/.exec(
          window.parent.location.hash,
        )[1];
        bus.emit("appNavigation", appInstance, requestedPage);
        if (requestedPage !== page) {
          // trigger a custom event to change app route
          window.dispatchEvent(
            new CustomEvent("changeRoute", { detail: requestedPage }),
          );
        } else {
          this.syncQueryParamsAndDataForApp(context);
        }
      }
      this.currentUrlForApp = window.parent.location.href;
    },
    getPage() {
      return this.getQueryParamsForApp().page || "status";
    },
    getTypedValue(stringValue) {
      if (stringValue === "true") return true;
      if (stringValue === "false") return false;
      return stringValue;
    },
    queryParamsToDataForApp(context) {
      const queryParams = this.getQueryParamsForApp();
      if (context.q) {
        Object.keys(context.q).forEach((dataItem) => {
          if (typeof queryParams[dataItem] !== "undefined") {
            context.q[dataItem] = this.getTypedValue(queryParams[dataItem]);
          }
        });
      }
    },
    getQueryParamsForApp() {
      const hash = window.parent.location.hash;
      if (!hash.includes("?") || hash.split("?").length < 2) {
        return {};
      }
      const params = new URLSearchParams(hash.split("?").pop());
      const queryParams = {};
      params.forEach((value, key) => {
        if (key) queryParams[key] = value;
      });
      return queryParams;
    },
  },
};

const taskOwners = new WeakMap();

export const TaskService = {
  name: "TaskService",
  created() {
    taskOwners.set(this, { disposed: false, subscriptions: new Map() });
  },
  beforeUnmount() {
    const owner = taskOwners.get(this);
    owner.disposed = true;
    for (const cleanup of owner.subscriptions.values()) cleanup();
    clearInterval(this.urlCheckInterval);
  },
  methods: {
    subscribeTask(taskAction, eventId, outcomes) {
      const owner = taskOwners.get(this);
      if (owner.disposed) return;
      const bus = this.core.$root;
      let active = true;
      const listeners = [];
      const cleanup = () => {
        active = false;
        for (const [event, handler] of listeners) bus.$off(event, handler);
        owner.subscriptions.delete(eventId);
      };
      owner.subscriptions.set(eventId, cleanup);
      for (const [outcome, callback] of Object.entries(outcomes)) {
        const event = `${taskAction}-${outcome}-${eventId}`;
        const handler = (...args) => {
          if (!active || owner.disposed) return;
          cleanup();
          callback(...args);
        };
        listeners.push([event, handler]);
        bus.$on(event, handler);
      }
    },
    createClusterTaskForApp(taskData) {
      return this.axios
        .post(`${window.parent.core.$root.apiUrl}/cluster/tasks`, taskData, {
          headers: { Authorization: `Bearer ${getToken()}` },
        })
        .catch((error) => {
          taskOwners.get(this).subscriptions.get(taskData.extra?.eventId)?.();
          throw error;
        });
    },
    createModuleTaskForApp(moduleId, taskData) {
      return this.axios
        .post(
          `${window.parent.core.$root.apiUrl}/module/${moduleId}/tasks`,
          taskData,
          { headers: { Authorization: `Bearer ${getToken()}` } },
        )
        .catch((error) => {
          taskOwners.get(this).subscriptions.get(taskData.extra?.eventId)?.();
          throw error;
        });
    },
    createErrorNotificationForApp(err, message) {
      console.error(err);
      window.parent.core.$root.$emit("createErrorNotification", err, message);
    },
    createNotificationForApp(notification) {
      window.parent.core.$root.$emit("createNotificationForApp", notification);
    },
    deleteNotificationForApp(notification) {
      window.parent.core.$root.$emit("deleteNotificationForApp", notification);
    },
  },
};

function getPageTitle(vm) {
  const { pageTitle } = vm.$options;
  if (pageTitle) {
    return typeof pageTitle === "function" ? pageTitle.call(vm) : pageTitle;
  }
}

export const PageTitleService = {
  name: "PageTitleService",
  created() {
    let pageTitle = getPageTitle(this);
    if (pageTitle) {
      if (pageTitle.includes(".title")) {
        // fallback title: i18n has not been loaded yet
        pageTitle = window.parent.CONFIG.PRODUCT_NAME;
      }
      // window.parent.document also supports external apps
      window.parent.document.title = pageTitle;
    }
  },
};
