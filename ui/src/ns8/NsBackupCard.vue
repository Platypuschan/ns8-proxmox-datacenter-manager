<!--
  Copyright (C) 2023 Nethesis S.r.l.
  SPDX-License-Identifier: GPL-3.0-or-later
  Vue 3 port of ns8-ui-lib component, see ./README.md
-->
<template>
  <CvTile kind="standard" :light="light" class="ns-backup-card ns-card">
    <div class="row">
      <NsSvg :svg="Save32" />
    </div>
    <div class="row">
      <h3 class="title">{{ title }}</h3>
    </div>
    <div v-if="loading" class="row">
      <CvSkeletonText
        :paragraph="true"
        :line-count="2"
        class="loading-skeleton"
      />
    </div>
    <template v-else-if="!backupsContainingInstance.length">
      <div class="row no-backup">
        <NsSvg :svg="Warning16" class="icon status-warning" />
        <span>{{ noBackupMessage }}</span>
      </div>
    </template>
    <template v-else>
      <div class="backups">
        <div v-if="backupsContainingInstance.length == 1" class="backup">
          <div class="table-wrapper">
            <div class="table">
              <div class="tr">
                <div class="td label">{{ statusLabel }}</div>
                <div class="td status">
                  <span v-if="!singleBackup.enabled" class="status-warning">
                    {{ backupDisabledLabel }}
                  </span>
                  <span
                    v-else-if="
                      status[singleBackup.id] &&
                      status[singleBackup.id].success == true
                    "
                    class="status-success"
                  >
                    {{ statusSuccessLabel }}
                  </span>
                  <span
                    v-else-if="
                      status[singleBackup.id] &&
                      status[singleBackup.id].success == false
                    "
                    class="status-error"
                  >
                    {{ statusErrorLabel }}
                  </span>
                  <span v-else class="status-warning">
                    {{ statusNotRunLabel }}
                  </span>
                </div>
              </div>
              <div class="tr">
                <div class="td label">{{ repositoryLabel }}</div>
                <div class="td">{{ singleBackup.repoName }}</div>
              </div>
              <div class="tr">
                <div class="td label">{{ completedLabel }}</div>
                <div class="td">
                  <CvInteractiveTooltip
                    v-if="completedAt"
                    alignment="center"
                    direction="bottom"
                    class="info tooltip-with-text-trigger"
                  >
                    <template #trigger>{{ completedRelative }}</template>
                    <template #content>{{ completedAbsolute }}</template>
                  </CvInteractiveTooltip>
                  <span v-else>-</span>
                </div>
              </div>
              <div class="tr">
                <div class="td label">{{ durationLabel }}</div>
                <div class="td">{{ durationText }}</div>
              </div>
              <div class="tr">
                <div class="td label">{{ totalSizeLabel }}</div>
                <div class="td">{{ totalSizeText }}</div>
              </div>
              <div class="tr">
                <div class="td label">{{ totalFileCountLabel }}</div>
                <div class="td">{{ totalFileCountText }}</div>
              </div>
            </div>
          </div>
        </div>
        <div v-else>
          <!-- multiple backups for this instance -->
          <div class="table-wrapper">
            <div class="table">
              <div class="tr">
                <div class="td label">{{ statusLabel }}</div>
                <div class="td status">
                  <span
                    v-if="summaryStatus && summaryStatus.success == true"
                    class="status-success"
                  >
                    {{ statusSuccessLabel }}
                  </span>
                  <span
                    v-else-if="summaryStatus && summaryStatus.success == false"
                    class="status-error"
                  >
                    {{ statusErrorLabel }}
                  </span>
                  <span v-else class="status-warning">
                    {{ multipleUncertainStatusLabel }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
    <div>
      <div class="row footer">
        <NsButton
          kind="ghost"
          :icon="ArrowRight20"
          :disabled="loading"
          @click="goToBackup"
          >{{ goToBackupLabel }}
        </NsButton>
      </div>
    </div>
  </CvTile>
</template>

<script>
import { CvTile, CvSkeletonText, CvInteractiveTooltip } from "@carbon/vue";
import { IconService } from "./services";
import NsSvg from "./NsSvg";
import NsButton from "./NsButton.vue";

function byteFormat(size) {
  if (size === null || size === "" || isNaN(size)) return "-";
  if (size >= 0 && size < 1024) return size + " B";
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let value = size;
  let i = -1;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return Math.round(value * 100) / 100 + " " + units[i];
}

const pad = (n) => String(n).padStart(2, "0");

// yyyy-MM-dd HH:mm:ss in the browser time zone
function absoluteTime(ms) {
  const d = new Date(ms);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

// "3 years ago" style distance, localized with Intl
function relativeTime(ms, locale) {
  const units = [
    ["year", 365 * 24 * 3600],
    ["month", 30 * 24 * 3600],
    ["day", 24 * 3600],
    ["hour", 3600],
    ["minute", 60],
  ];
  const seconds = Math.round((ms - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) {
      return formatter.format(Math.round(seconds / size), unit);
    }
  }
  return formatter.format(seconds, "second");
}

function secondsFormat(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (h) parts.push(h + "h");
  if (m) parts.push(m + "m");
  parts.push((s % 60) + "s");
  return parts.join(" ");
}

export default {
  name: "NsBackupCard",
  components: { CvTile, CvSkeletonText, CvInteractiveTooltip, NsSvg, NsButton },
  mixins: [IconService],
  props: {
    title: { type: String, default: "Backup" },
    noBackupMessage: { type: String, default: "No backup configured" },
    goToBackupLabel: { type: String, default: "Go to Backup" },
    repositoryLabel: { type: String, default: "Repository" },
    statusLabel: { type: String, default: "Status" },
    statusSuccessLabel: { type: String, default: "Success" },
    statusNotRunLabel: { type: String, default: "Backup has not run yet" },
    statusErrorLabel: { type: String, default: "Error" },
    completedLabel: { type: String, default: "Completed" },
    durationLabel: { type: String, default: "Duration" },
    totalSizeLabel: { type: String, default: "Total size" },
    totalFileCountLabel: { type: String, default: "Total file count" },
    backupDisabledLabel: { type: String, default: "Disabled" },
    showMoreLabel: { type: String, default: "Show more" },
    multipleUncertainStatusLabel: {
      type: String,
      default: "Some backups failed or are pending",
    },
    moduleId: { type: String, required: true },
    moduleUiName: { type: String, default: "" },
    repositories: { type: Array, required: true },
    backups: { type: Array, required: true },
    loading: { type: Boolean, default: false },
    coreContext: { type: Object, required: true },
    light: Boolean,
  },
  data() {
    return {
      backupsContainingInstance: [],
      status: {},
      summaryStatus: undefined,
    };
  },
  computed: {
    singleBackup() {
      return this.backupsContainingInstance.length === 1
        ? this.backupsContainingInstance[0]
        : null;
    },
    singleStatus() {
      return this.singleBackup ? this.status[this.singleBackup.id] : null;
    },
    completedAt() {
      const end = this.singleStatus && this.singleStatus.end;
      return end ? end * 1000 : 0;
    },
    completedRelative() {
      const locale =
        (this.coreContext.$root.$i18n && this.coreContext.$root.$i18n.locale) ||
        navigator.language;
      return relativeTime(this.completedAt, locale);
    },
    completedAbsolute() {
      return absoluteTime(this.completedAt);
    },
    durationText() {
      const st = this.singleStatus;
      return st && st.end && st.start ? secondsFormat(st.end - st.start) : "-";
    },
    totalSizeText() {
      const st = this.singleStatus;
      return st && st.total_size ? byteFormat(st.total_size) : "-";
    },
    totalFileCountText() {
      const st = this.singleStatus;
      return st && st.total_file_count ? String(st.total_file_count) : "-";
    },
  },
  watch: {
    repositories() {
      this.updateData();
    },
    backups() {
      this.updateData();
    },
  },
  created() {
    this.updateData();
  },
  methods: {
    updateData() {
      const backupsContainingInstance = [];
      for (const backup of this.backups) {
        for (const instance of backup.instances) {
          if (instance.module_id == this.moduleId) {
            backupsContainingInstance.push(backup);
          }
        }
      }
      this.backupsContainingInstance = backupsContainingInstance;

      const status = {};
      let summaryStatus = undefined;
      for (const backup of backupsContainingInstance) {
        const instance = backup.instances.find(
          (i) => i.module_id == this.moduleId,
        );
        const instanceStatus = instance.status || { success: null };
        status[backup.id] = instanceStatus;

        // Precedence: failure > pending/absent > success. An absent result
        // must not double as the initial, not-yet-aggregated summary.
        if (
          summaryStatus === undefined ||
          instanceStatus.success === false ||
          (instanceStatus.success !== true && summaryStatus.success === true)
        ) {
          summaryStatus = instanceStatus;
        }
      }
      this.status = status;
      this.summaryStatus = summaryStatus;
    },
    goToBackup() {
      if (this.coreContext && this.coreContext.$router) {
        // the NS8 core router is a handle, not module state
        // eslint-disable-next-line vue/no-mutating-props
        this.coreContext.$router.push("/backup");
      }
    },
  },
};
</script>

<style scoped lang="scss">
@import "../styles/ns8-tooltip";

.ns-backup-card {
  display: flex;
  flex-direction: column;
  min-height: 7rem;
}

.backup {
  margin-bottom: 1rem;
}

.backup:last-child {
  margin-bottom: 0;
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
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 0.5rem;
  margin-bottom: 0.5rem;
}

.table {
  display: table;
}

.tr {
  display: table-row;
}

.td {
  display: table-cell;
}

.label {
  padding-right: 0.75rem;
  font-weight: bold;
  text-align: right;
  padding-bottom: 0.5rem;
}

.status {
  font-weight: bold;
}

.loading-skeleton,
.footer {
  margin-top: $spacing-03;
}

.no-backup .icon {
  margin-right: $spacing-03;
}

.tooltip-with-text-trigger
  :deep(.bx--tooltip__trigger:not(.bx--btn--icon-only)) {
  font-size: 14px;
  color: $interactive-01;
}

// interactive tooltip layout, from ns8-core _core.scss
.cv-interactive-tooltip {
  display: inline-block;
}

.cv-interactive-tooltip :deep(.bx--tooltip__label .bx--tooltip__trigger) {
  margin-left: 0;
}

.status-success {
  color: $support-02;
  fill: $support-02;
}

.status-error {
  color: $danger-01;
  fill: $danger-01;
}

.status-warning {
  color: $ns-warning-color;
  fill: $ns-warning-color;
}
</style>
