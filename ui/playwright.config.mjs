// Browser regression suite for the module UI.
// Runs against the production build (dist/) served by `vite preview`; the NS8
// core is replaced by a labelled FIXTURE (tests/e2e/fixture/host.html).
// Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to use a pre-installed Chromium,
// otherwise run `yarn playwright install chromium` once.
import { defineConfig } from "@playwright/test";

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/*.spec.mjs",
  timeout: 30000,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    locale: "en-US",
    timezoneId: "UTC",
    viewport: { width: 1280, height: 900 },
    launchOptions: {
      executablePath,
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    // UI_DIST=dist-dev runs the same tests against the development build,
    // where Vue prints its [Vue warn] diagnostics
    command: `node node_modules/vite/bin/vite.js preview --outDir ${process.env.UI_DIST || "dist"} --host 127.0.0.1 --port 4173 --strictPort`,
    url: "http://127.0.0.1:4173/",
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
