<!--
  Copyright (C) 2022 Nethesis S.r.l.
  SPDX-License-Identifier: GPL-3.0-or-later
-->
<template>
  <cv-grid fullWidth>
    <cv-row>
      <cv-column class="page-title">
        <h2>{{ $t("settings.title") }}</h2>
      </cv-column>
    </cv-row>
    <cv-row v-if="error.getConfiguration">
      <cv-column>
        <NsInlineNotification
          kind="error"
          :title="$t('action.get-configuration')"
          :description="error.getConfiguration"
          :showCloseButton="false"
        />
      </cv-column>
    </cv-row>
    <cv-row>
      <cv-column>
        <cv-tile light>
          <cv-form @submit.prevent="configureModule">
            <cv-text-input
              :label="$t('settings.pdm_fqdn')"
              placeholder="pdm.example.org"
              v-model.trim="host"
              class="mg-bottom"
              :invalid-message="$t(error.host)"
              :disabled="loading.getConfiguration || loading.configureModule"
              ref="host"
            >
            </cv-text-input>
            <cv-toggle
              value="letsEncrypt"
              :label="$t('settings.lets_encrypt')"
              v-model="isLetsEncryptEnabled"
              :disabled="loading.getConfiguration || loading.configureModule"
              class="mg-bottom"
            >
              <template slot="text-left">{{
                $t("settings.disabled")
              }}</template>
              <template slot="text-right">{{
                $t("settings.enabled")
              }}</template>
            </cv-toggle>
            <cv-toggle
              value="httpToHttps"
              :label="$t('settings.http_to_https')"
              v-model="isHttpToHttpsEnabled"
              :disabled="loading.getConfiguration || loading.configureModule"
              class="mg-bottom"
            >
              <template slot="text-left">{{
                $t("settings.disabled")
              }}</template>
              <template slot="text-right">{{
                $t("settings.enabled")
              }}</template>
            </cv-toggle>
            <cv-text-input
              :label="$t('settings.admin_password')"
              type="password"
              v-model="adminPassword"
              autocomplete="new-password"
              password-hide-label="Hide"
              password-show-label="Show"
              :helper-text="
                isPasswordSet
                  ? $t('settings.admin_password_help_set')
                  : $t('settings.admin_password_help_new')
              "
              :invalid-message="error.admin_password"
              :disabled="loading.getConfiguration || loading.configureModule"
              class="mg-bottom"
              ref="admin_password"
            >
            </cv-text-input>
            <div class="mg-bottom">
              <h5 class="mg-bottom">{{ $t("settings.first_setup") }}</h5>
              <p class="mg-bottom">
                {{ $t("settings.first_setup_help") }}
              </p>
              <cv-checkbox
                v-for="item in optionItems"
                :key="item.key"
                :label="$t('settings.opt_' + item.key)"
                :value="item.key"
                :checked="isChecked(item)"
                :disabled="loading.getConfiguration || loading.configureModule"
                @change="setOption(item, $event)"
              />
            </div>
            <cv-row v-if="error.configureModule">
              <cv-column>
                <NsInlineNotification
                  kind="error"
                  :title="$t('action.configure-module')"
                  :description="error.configureModule"
                  :showCloseButton="false"
                />
              </cv-column>
            </cv-row>
            <NsButton
              kind="primary"
              :icon="Save20"
              :loading="loading.configureModule"
              :disabled="loading.getConfiguration || loading.configureModule"
              >{{ $t("settings.save") }}</NsButton
            >
            <NsButton
              v-if="savedHost"
              kind="secondary"
              class="mg-left"
              :icon="Launch20"
              :disabled="loading.getConfiguration || loading.configureModule"
              @click.prevent="openPdm"
              >{{ $t("settings.open_pdm") }}</NsButton
            >
          </cv-form>
        </cv-tile>
      </cv-column>
    </cv-row>
  </cv-grid>
</template>

<script>
import to from "await-to-js";
import Launch20 from "@carbon/icons-vue/es/launch/20";
import { mapState } from "vuex";
import {
  QueryParamService,
  UtilService,
  TaskService,
  IconService,
  PageTitleService,
} from "@nethserver/ns8-ui-lib";

export default {
  name: "Settings",
  mixins: [
    TaskService,
    IconService,
    UtilService,
    QueryParamService,
    PageTitleService,
  ],
  pageTitle() {
    return this.$t("settings.title") + " - " + this.appName;
  },
  data() {
    return {
      Launch20,
      q: {
        page: "settings",
      },
      urlCheckInterval: null,
      host: "",
      savedHost: "",
      isLetsEncryptEnabled: false,
      isHttpToHttpsEnabled: true,
      isPasswordSet: false,
      adminPassword: "",
      options: {
        tls_import: true,
        disable_nag: true,
        ns8_layout: true,
        repo_test: false,
        debian_extra: true,
        hide_menu: ["subscription", "registry", "sdn", "ceph"],
      },
      optionItems: [
        { key: "tls_import" },
        { key: "disable_nag" },
        { key: "ns8_layout" },
        { key: "debian_extra" },
        { key: "repo_test" },
        { key: "hide_subscription", hide: "subscription" },
        { key: "hide_registry", hide: "registry" },
        { key: "hide_sdn", hide: "sdn" },
        { key: "hide_ceph", hide: "ceph" },
      ],
      loading: {
        getConfiguration: false,
        configureModule: false,
      },
      error: {
        getConfiguration: "",
        configureModule: "",
        host: "",
        lets_encrypt: "",
        http2https: "",
        admin_password: "",
      },
    };
  },
  computed: {
    ...mapState(["instanceName", "core", "appName"]),
  },
  created() {
    this.getConfiguration();
  },
  beforeRouteEnter(to, from, next) {
    next((vm) => {
      vm.watchQueryData(vm);
      vm.urlCheckInterval = vm.initUrlBindingForApp(vm, vm.q.page);
    });
  },
  beforeRouteLeave(to, from, next) {
    clearInterval(this.urlCheckInterval);
    next();
  },
  methods: {
    async getConfiguration() {
      this.loading.getConfiguration = true;
      this.error.getConfiguration = "";
      const taskAction = "get-configuration";
      const eventId = this.getUuid();

      // register to task error
      this.core.$root.$once(
        `${taskAction}-aborted-${eventId}`,
        this.getConfigurationAborted
      );

      // register to task completion
      this.core.$root.$once(
        `${taskAction}-completed-${eventId}`,
        this.getConfigurationCompleted
      );

      const res = await to(
        this.createModuleTaskForApp(this.instanceName, {
          action: taskAction,
          extra: {
            title: this.$t("action." + taskAction),
            isNotificationHidden: true,
            eventId,
          },
        })
      );
      const err = res[0];

      if (err) {
        console.error(`error creating task ${taskAction}`, err);
        this.error.getConfiguration = this.getErrorMessage(err);
        this.loading.getConfiguration = false;
        return;
      }
    },
    getConfigurationAborted(taskResult, taskContext) {
      console.error(`${taskContext.action} aborted`, taskResult);
      this.error.getConfiguration = this.$t("error.generic_error");
      this.loading.getConfiguration = false;
    },
    getConfigurationCompleted(taskContext, taskResult) {
      const config = taskResult.output;
      this.host = config.host;
      this.savedHost = config.host;
      this.isLetsEncryptEnabled = config.lets_encrypt;
      this.isHttpToHttpsEnabled = config.http2https;
      this.isPasswordSet = config.admin_password_set;
      this.adminPassword = "";
      this.options = config.options;

      this.loading.getConfiguration = false;
      this.focusElement("host");
    },
    isChecked(item) {
      return item.hide
        ? this.options.hide_menu.includes(item.hide)
        : !!this.options[item.key];
    },
    setOption(item, checked) {
      if (item.hide) {
        const rest = this.options.hide_menu.filter((h) => h !== item.hide);
        this.options.hide_menu = checked ? [...rest, item.hide] : rest;
      } else {
        this.options[item.key] = checked;
      }
    },
    validateConfigureModule() {
      this.clearErrors(this);

      let isValidationOk = true;
      if (!this.host) {
        this.error.host = "common.required";
        this.focusElement("host");
        isValidationOk = false;
      }
      if (!this.isPasswordSet && !this.adminPassword) {
        this.error.admin_password = this.$t("settings.admin_password_required");
        if (isValidationOk) {
          this.focusElement("admin_password");
        }
        isValidationOk = false;
      }
      return isValidationOk;
    },
    configureModuleValidationFailed(validationErrors) {
      this.loading.configureModule = false;
      let focusAlreadySet = false;

      for (const validationError of validationErrors) {
        const param = validationError.parameter;
        // set i18n error message
        this.error[param] = this.$t("settings." + validationError.error);

        if (!focusAlreadySet) {
          this.focusElement(param);
          focusAlreadySet = true;
        }
      }
    },
    async configureModule() {
      const isValidationOk = this.validateConfigureModule();
      if (!isValidationOk) {
        return;
      }

      this.loading.configureModule = true;
      const taskAction = "configure-module";
      const eventId = this.getUuid();

      // register to task error
      this.core.$root.$once(
        `${taskAction}-aborted-${eventId}`,
        this.configureModuleAborted
      );

      // register to task validation
      this.core.$root.$once(
        `${taskAction}-validation-failed-${eventId}`,
        this.configureModuleValidationFailed
      );

      // register to task completion
      this.core.$root.$once(
        `${taskAction}-completed-${eventId}`,
        this.configureModuleCompleted
      );
      const res = await to(
        this.createModuleTaskForApp(this.instanceName, {
          action: taskAction,
          data: {
            host: this.host,
            lets_encrypt: this.isLetsEncryptEnabled,
            http2https: this.isHttpToHttpsEnabled,
            admin_password: this.adminPassword,
            options: this.options,
          },
          extra: {
            title: this.$t("settings.instance_configuration"),
            description: this.$t("settings.configuring"),
            eventId,
          },
        })
      );
      const err = res[0];

      if (err) {
        console.error(`error creating task ${taskAction}`, err);
        this.error.configureModule = this.getErrorMessage(err);
        this.loading.configureModule = false;
        return;
      }
    },
    configureModuleAborted(taskResult, taskContext) {
      console.error(`${taskContext.action} aborted`, taskResult);
      this.error.configureModule = this.$t("error.generic_error");
      this.loading.configureModule = false;
    },
    configureModuleCompleted() {
      this.loading.configureModule = false;

      // reload configuration
      this.getConfiguration();
    },
    openPdm() {
      window.open("https://" + this.savedHost, "_blank", "noopener");
    },
  },
};
</script>

<style scoped lang="scss">
@import "../styles/carbon-utils";
.mg-bottom {
  margin-bottom: $spacing-06;
}

.mg-left {
  margin-left: $spacing-05;
}
</style>
