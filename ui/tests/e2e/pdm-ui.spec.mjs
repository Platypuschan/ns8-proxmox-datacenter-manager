// Real production/development UI; only the surrounding NS8 transport is a fixture.
import { test, expect, configuration, status } from "./helpers.mjs";

async function settings(ns8, config = configuration) {
  const frame = await ns8.open({
    hash: "#/apps/proxmox-datacenter-manager1?page=settings",
  });
  const task = await ns8.task("get-configuration");
  await ns8.complete("get-configuration", task.eventId, config);
  await expect(
    frame.getByLabel("Proxmox Datacenter Manager hostname (FQDN)", {
      exact: true,
    }),
    JSON.stringify(ns8.problems),
  ).toHaveValue(config.host);
  return frame;
}
const saves = (ns8) =>
  ns8.requests.filter((r) => r.payload?.action === "configure-module");

test("Settings preserves passwords and sends every real Carbon checkbox/toggle value", async ({
  ns8,
}) => {
  const frame = await settings(ns8);
  await expect(
    frame.getByLabel("Administrator password", { exact: true }),
  ).toHaveValue("");
  await frame
    .getByLabel("Proxmox Datacenter Manager hostname (FQDN)", { exact: true })
    .fill("new.example.org");
  // Carbon custom checkbox changes must update the saved bool and hide list.
  await frame
    .getByText('Confirm the "no subscription" notice automatically', {
      exact: true,
    })
    .click();
  await frame.getByText("Hide the menu entry Ceph", { exact: true }).click();
  await frame
    .locator("label.bx--toggle-input__label")
    .filter({ hasText: "Request LE Certificate" })
    .click();
  await frame.getByRole("button", { name: "Save", exact: true }).click();
  const task = await ns8.task("configure-module");
  expect(task.path).toBe("/module/proxmox-datacenter-manager1/tasks");
  expect(task.headers.authorization).toBe("Bearer fixture-token");
  expect(task.payload.data).toEqual({
    host: "new.example.org",
    lets_encrypt: false,
    http2https: true,
    admin_password: "",
    options: {
      ...configuration.options,
      disable_nag: false,
      hide_menu: ["subscription", "registry", "sdn"],
    },
  });
  await ns8.complete("configure-module", task.eventId, {});
  const refresh = await ns8.task("get-configuration", { nth: 1 });
  await ns8.complete("get-configuration", refresh.eventId, {
    ...configuration,
    host: "new.example.org",
  });
  expect(ns8.problems).toEqual([]);
});

test("Open PDM uses the saved hostname without submitting unsaved changes", async ({
  ns8,
  page,
}) => {
  const frame = await settings(ns8);
  await frame
    .getByLabel("Proxmox Datacenter Manager hostname (FQDN)", { exact: true })
    .fill("unsaved.example.org");
  await page.locator("#module").evaluate((iframe) => {
    iframe.contentWindow.open = (...args) => {
      window.__opened = args;
    };
  });
  await frame
    .getByRole("button", {
      name: "Open Proxmox Datacenter Manager",
      exact: true,
    })
    .click();
  expect(await page.evaluate(() => window.__opened)).toEqual([
    "https://pdm.example.org",
    "_blank",
    "noopener",
  ]);
  expect(saves(ns8)).toHaveLength(0);
  expect(ns8.problems).toEqual([]);
});

test("First setup requires a password and hostname before requesting any save", async ({
  ns8,
}) => {
  const frame = await settings(ns8, {
    ...configuration,
    host: "",
    admin_password_set: false,
  });
  await frame.getByRole("button", { name: "Save", exact: true }).click();
  await expect(frame.getByText("Required", { exact: true })).toBeVisible();
  expect(saves(ns8)).toHaveLength(0);
  await frame
    .getByLabel("Proxmox Datacenter Manager hostname (FQDN)", { exact: true })
    .fill("pdm.example.org");
  await frame.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    frame.getByText("A password is required for the first configuration", {
      exact: true,
    }),
  ).toBeVisible();
  expect(saves(ns8)).toHaveLength(0);
  expect(ns8.problems).toEqual([]);
});

for (const outcome of ["abort", "validation", "http"]) {
  test(`Save ${outcome} exposes an error and recovers without duplicate subscriptions`, async ({
    ns8,
  }) => {
    const frame = await settings(ns8);
    if (outcome === "http") ns8.setApi(() => ({ status: 403, body: "{}" }));
    await frame.getByRole("button", { name: "Save", exact: true }).click();
    const task = await ns8.task("configure-module");
    if (outcome === "abort") await ns8.abort("configure-module", task.eventId);
    if (outcome === "validation")
      await ns8.validationFailed("configure-module", task.eventId, [
        { parameter: "host", error: "host_pattern" },
      ]);
    const message =
      outcome === "abort"
        ? "Something went wrong"
        : outcome === "validation"
          ? "Must be a valid fully qualified domain name"
          : "Operation not authorized";
    await expect(frame.getByText(message, { exact: true })).toBeVisible();
    await expect(
      frame.getByRole("button", { name: "Save", exact: true }),
    ).toBeEnabled();
    await ns8.complete("configure-module", task.eventId, {});
    await expect
      .poll(
        () =>
          ns8.requests.filter((r) => r.payload?.action === "get-configuration")
            .length,
      )
      .toBe(1);
    expect(ns8.problems).toEqual([]);
  });
}

test("Status renders service, image, volume, backup and host log navigation", async ({
  ns8,
}) => {
  const frame = await ns8.open();
  for (const [action, output] of [
    ["get-name", { name: "PDM test" }],
    ["get-status", { ...status, instance: "proxmox-datacenter-manager1" }],
    ["list-backup-repositories", { repositories: [] }],
  ]) {
    const task = await ns8.task(action);
    await ns8.complete(action, task.eventId, output);
  }
  const backup = await ns8.task("list-backups");
  await ns8.complete("list-backups", backup.eventId, { backups: [] });
  await expect(
    frame.getByText("No backup configured", { exact: true }),
  ).toBeVisible();
  await expect(
    frame.getByText(status.images[0].name, { exact: true }),
  ).toBeVisible();
  await expect(
    frame.getByText(status.volumes[0].mount, { exact: true }),
  ).toBeVisible();
  await frame
    .getByRole("button", { name: "Go to System logs", exact: true })
    .click();
  expect((await ns8.pushed()).some((p) => p.includes("system-logs"))).toBe(
    true,
  );
  expect(ns8.problems).toEqual([]);
});

test("About retains the Vue-2 host translations and installed-module version", async ({
  ns8,
}) => {
  const frame = await ns8.open({
    hash: "#/apps/proxmox-datacenter-manager1?page=about",
  });
  const task = await ns8.task("list-installed-modules");
  await ns8.complete("list-installed-modules", task.eventId, {
    modules: [{ id: "proxmox-datacenter-manager1", version: "0.2.0" }],
  });
  await expect(frame.getByText("0.2.0", { exact: true })).toBeVisible();
  await expect(
    frame.getByRole("heading", { name: "About", exact: true }),
  ).toBeVisible();
  expect(ns8.problems).toEqual([]);
});
