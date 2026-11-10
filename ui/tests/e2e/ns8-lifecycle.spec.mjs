// Real built UI, with a persistent Vue 2-compatible host bus and fixture API.
import { test, expect, configuration } from "./helpers.mjs";

async function trackHostBus(page) {
  await page.addInitScript(() => {
    let core;
    Object.defineProperty(window, "core", {
      configurable: true,
      get: () => core,
      set(value) {
        core = value;
        const handlers = new Map();
        const bus = value.$root;
        bus.$on = (event, fn) => {
          if (!handlers.has(event)) handlers.set(event, []);
          handlers.get(event).push(fn);
          return bus;
        };
        bus.$off = (event, fn) => {
          handlers.set(
            event,
            fn
              ? (handlers.get(event) || []).filter(
                  (handler) => handler !== fn && handler.fn !== fn,
                )
              : [],
          );
          return bus;
        };
        bus.$once = (event, fn) => {
          const once = (...args) => {
            bus.$off(event, once);
            fn(...args);
          };
          once.fn = fn;
          return bus.$on(event, once);
        };
        bus.$emit = (event, ...args) => {
          for (const fn of [...(handlers.get(event) || [])]) fn(...args);
          return bus;
        };
        window.__taskListeners = () =>
          [...handlers].flatMap(([event, fns]) =>
            /-(completed|aborted|validation-failed)-/.test(event)
              ? fns.map(() => event)
              : [],
          );
      },
    });
  });
}

async function navigate(page, view) {
  await page.locator("#module").evaluate((iframe, target) => {
    iframe.contentWindow.dispatchEvent(
      new CustomEvent("changeRoute", { detail: target }),
    );
  }, view);
  await expect(
    page.frameLocator("#module").getByRole("heading", {
      name:
        view === "about"
          ? "About"
          : view === "settings"
            ? "Settings"
            : "Status",
      exact: true,
    }),
  ).toBeVisible();
}

async function listeners(page, eventId) {
  return page.evaluate(
    (id) =>
      window.__taskListeners().filter((event) => !id || event.endsWith(id)),
    eventId,
  );
}

test("Status unmount releases all subscriptions before delayed repository completion", async ({
  page,
  ns8,
}) => {
  await trackHostBus(page);
  await ns8.open();
  const repository = await ns8.task("list-backup-repositories");
  const status = await ns8.task("get-status");
  await navigate(page, "about");
  await ns8.task("list-installed-modules");
  const before = ns8.requests.length;
  await ns8.complete("list-backup-repositories", repository.eventId, {
    repositories: [],
  });
  // Flushing a browser task also lets any unintended axios request reach routing.
  await page.waitForTimeout(100);
  expect(ns8.requests).toHaveLength(before);
  for (const task of [repository, status]) {
    expect(await listeners(page, task.eventId)).toEqual([]);
  }
  expect(ns8.problems).toEqual([]);
});

const backupCases = [
  { name: "success then pending", values: [true, null], kind: "warning" },
  { name: "pending then success", values: [null, true], kind: "warning" },
  { name: "all successful", values: [true, true], kind: "success" },
  { name: "all pending", values: [null, null], kind: "warning" },
  ...[
    [true, null, false],
    [true, false, null],
    [null, true, false],
    [null, false, true],
    [false, true, null],
    [false, null, true],
  ].map((values, index) => ({
    name: `failure precedence permutation ${index + 1}`,
    values,
    kind: "error",
  })),
  {
    name: "success then absent status",
    values: [true, undefined],
    kind: "warning",
  },
  {
    name: "absent status then success",
    values: [undefined, true],
    kind: "warning",
  },
  {
    name: "success then missing success field",
    values: [true, {}],
    kind: "warning",
  },
  {
    name: "missing success field then success",
    values: [{}, true],
    kind: "warning",
  },
  {
    name: "failure then absent status",
    values: [false, undefined],
    kind: "error",
  },
  {
    name: "absent status then failure",
    values: [undefined, false],
    kind: "error",
  },
  { name: "single missing success field", values: [{}], kind: "warning" },
  { name: "single absent status", values: [undefined], kind: "warning" },
  { name: "no backups", values: [], kind: "none" },
];

for (const { name, values, kind } of backupCases) {
  test(`Backup summary: ${name}`, async ({ ns8 }) => {
    const frame = await ns8.open();
    const repository = await ns8.task("list-backup-repositories");
    await ns8.complete("list-backup-repositories", repository.eventId, {
      repositories: [],
    });
    const task = await ns8.task("list-backups");
    await ns8.complete("list-backups", task.eventId, {
      backups: values.map((success, index) => ({
        id: `backup-${index}`,
        name: `backup-${index}`,
        enabled: true,
        instances: [
          {
            module_id: "proxmox-datacenter-manager1",
            ...(success === undefined
              ? {}
              : {
                  status:
                    typeof success === "object" && success !== null
                      ? success
                      : { success },
                }),
          },
        ],
      })),
    });
    const card = frame.locator(".ns-backup-card");
    if (kind === "none")
      await expect(
        card.getByText("No backup configured", { exact: true }),
      ).toBeVisible();
    else await expect(card.locator(`.status > .status-${kind}`)).toBeVisible();
    if (kind !== "success")
      await expect(card.locator(".status-success")).toHaveCount(0);
    expect(ns8.problems).toEqual([]);
  });
}

for (const outcome of ["completed", "aborted", "validation-failed"]) {
  test(`Settings ${outcome} removes all sibling task listeners`, async ({
    page,
    ns8,
  }) => {
    await trackHostBus(page);
    const frame = await ns8.open({ hash: "#/apps/proxmox-datacenter-manager1?page=settings" });
    const config = await ns8.task("get-configuration");
    await ns8.complete("get-configuration", config.eventId, configuration);
    expect(await listeners(page, config.eventId)).toEqual([]);
    await frame.getByRole("button", { name: "Save", exact: true }).click();
    const task = await ns8.task("configure-module");
    if (outcome === "completed") {
      await ns8.complete("configure-module", task.eventId, {});
      // The first completion legitimately refreshes configuration. Settle that
      // request before measuring whether a duplicate completion creates more.
      const refresh = await ns8.task("get-configuration", { nth: 1 });
      await ns8.complete("get-configuration", refresh.eventId, configuration);
      expect(await listeners(page, refresh.eventId)).toEqual([]);
    } else if (outcome === "aborted")
      await ns8.abort("configure-module", task.eventId);
    else
      await ns8.validationFailed("configure-module", task.eventId, [
        { parameter: "host", error: "host_pattern" },
      ]);
    expect(await listeners(page, task.eventId)).toEqual([]);
    const before = ns8.requests.length;
    await ns8.complete("configure-module", task.eventId, {});
    await page.waitForTimeout(100);
    expect(ns8.requests).toHaveLength(before);
    expect(ns8.problems).toEqual([]);
  });
}

test("Settings navigation discards delayed save completions", async ({
  page,
  ns8,
}) => {
  await trackHostBus(page);
  const frame = await ns8.open({ hash: "#/apps/proxmox-datacenter-manager1?page=settings" });
  const config = await ns8.task("get-configuration");
  await ns8.complete("get-configuration", config.eventId, configuration);
  await frame.getByRole("button", { name: "Save", exact: true }).click();
  const save = await ns8.task("configure-module");
  await navigate(page, "about");
  const about = await ns8.task("list-installed-modules");
  const before = ns8.requests.length;
  await ns8.complete("configure-module", save.eventId, {});
  await page.waitForTimeout(100);
  expect(ns8.requests).toHaveLength(before);
  for (const task of [config, save])
    expect(await listeners(page, task.eventId)).toEqual([]);
  await navigate(page, "status");
  expect(await listeners(page, about.eventId)).toEqual([]);
  await ns8.complete("list-installed-modules", about.eventId, {
    modules: [{ id: "proxmox-datacenter-manager1", version: "late" }],
  });
  expect(ns8.problems).toEqual([]);
});

for (const view of ["status", "settings", "about"]) {
  test(`${view} HTTP failure releases task subscriptions`, async ({
    page,
    ns8,
  }) => {
    await trackHostBus(page);
    ns8.setApi(() => ({ status: 500, body: "{}" }));
    await ns8.open({ hash: `#/apps/proxmox-datacenter-manager1?page=${view}` });
    const actions =
      view === "status"
        ? ["get-status", "list-backup-repositories"]
        : view === "settings"
          ? ["get-configuration"]
          : ["list-installed-modules"];
    for (const action of actions) {
      const task = await ns8.task(action);
      await expect.poll(() => listeners(page, task.eventId)).toEqual([]);
    }
    expect(ns8.problems).toEqual([]);
  });
}

for (const outcome of ["completed", "aborted"]) {
  test(`About ${outcome} clears its sibling listener`, async ({
    page,
    ns8,
  }) => {
    await trackHostBus(page);
    await ns8.open({ hash: "#/apps/proxmox-datacenter-manager1?page=about" });
    const task = await ns8.task("list-installed-modules");
    if (outcome === "completed")
      await ns8.complete("list-installed-modules", task.eventId, {
        modules: [{ id: "proxmox-datacenter-manager1", version: "1.2.3" }],
      });
    else await ns8.abort("list-installed-modules", task.eventId);
    expect(await listeners(page, task.eventId)).toEqual([]);
    expect(ns8.problems).toEqual([]);
  });
}
