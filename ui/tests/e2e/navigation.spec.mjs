import { test, expect, configuration } from "./helpers.mjs";

test("Desktop menu routes through the host and returns to the original module instance", async ({
  ns8,
  page,
}) => {
  const frame = await ns8.open();
  await frame
    .locator(".app-side-menu-content")
    .getByText("Settings", { exact: true })
    .click();
  await expect(
    frame.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  const config = await ns8.task("get-configuration");
  expect(config.path).toBe("/module/proxmox-datacenter-manager1/tasks");
  await ns8.complete("get-configuration", config.eventId, configuration);
  await frame
    .locator(".app-side-menu-content")
    .getByText("About", { exact: true })
    .click();
  await expect(
    frame.getByRole("heading", { name: "About", exact: true }),
  ).toBeVisible();
  await frame
    .locator(".app-side-menu-content")
    .getByText("Status", { exact: true })
    .click();
  await expect(
    frame.getByRole("heading", { name: "Status", exact: true }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.location.hash)).toBe(
    "#/apps/proxmox-datacenter-manager1?page=status",
  );
  expect(ns8.problems).toEqual([]);
});

test.describe("German first setup", () => {
  test.use({ locale: "de-DE" });
  test("renders literal root@pam help and validates before submitting", async ({
    ns8,
  }) => {
    const frame = await ns8.open({
      hash: "#/apps/proxmox-datacenter-manager1?page=settings",
    });
    const task = await ns8.task("get-configuration");
    await ns8.complete("get-configuration", task.eventId, {
      ...configuration,
      host: "",
      admin_password_set: false,
    });
    await expect(frame.getByText(/Anmeldung root@pam/)).toBeVisible();
    await frame.getByRole("button", { name: "Speichern", exact: true }).click();
    await expect(
      frame.getByText("Erforderlich", { exact: true }),
    ).toBeVisible();
    expect(
      ns8.requests.filter((r) => r.payload?.action === "configure-module"),
    ).toHaveLength(0);
    expect(ns8.problems).toEqual([]);
  });
});
