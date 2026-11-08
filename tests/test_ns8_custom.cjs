// SPDX-License-Identifier: GPL-3.0-or-later
// Run: node --test tests/test_ns8_custom.cjs (requires Playwright).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');

// Shape of DashboardStatusRow/create_subscription_notice in PDM's
// ui/src/dashboard/status_row.rs. The notice is translated, hence icon/controls
// identify it, not its English text. Yew retains ownership of the DOM nodes.
function statusRow(text) {
  return `<div class="status-row pwt-d-flex">
    <div><i class="fa fa-refresh"></i></div><span>Last refresh</span>
    <div class="pwt-pointer notice"><div class="pwt-d-flex"><i class="fa fa-times-circle fa-lg"></i><div>${text}</div></div></div>
    <div><i class="fa fa-pencil"></i></div><div><i class="fa fa-cogs"></i></div>
  </div>`;
}
const warning = 'Too many remote nodes without basic or higher subscriptions! No access to Enterprise-Repository or Enterprise Support.';

async function setup(t, nag = true) {
  const browser = await chromium.launch({ headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setContent(`<style>i.fa { display: inline-block; width: 16px; height: 16px; }</style><main id="views">${statusRow(warning)}</main>
    <div id="other-error" class="pwt-pointer"><i class="fa fa-times-circle"></i>Remote connection failed</div>`);
  await page.evaluate(nag => { window.NS8_PDM = { nag, layout: false }; }, nag);
  await page.addScriptTag({ path: path.resolve(__dirname, '../app/ns8-custom.js') });
  t.after(() => assert.deepEqual(errors, []));
  return page;
}

// Wait for the MutationObserver -> requestAnimationFrame cycle, not a timeout.
async function settled(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

test('hides subscription notice in every view, including translated rerenders', async t => {
  const page = await setup(t);
  await settled(page);
  assert.equal(await page.locator('.notice').isVisible(), false);
  assert.equal(await page.locator('#other-error').isVisible(), true);
  assert.equal(await page.locator('.status-row .fa-refresh').isVisible(), true);
  assert.equal(await page.locator('.status-row .fa-cogs').isVisible(), true);
  assert.equal(await page.locator('.notice').count(), 1, 'must not remove Yew-owned nodes');
  await page.locator('#views').evaluate((el, markup) => { el.innerHTML = markup; },
    statusRow('Zu viele Remote-Knoten ohne Subscription') + statusRow('Autre langue'));
  await settled(page);
  assert.deepEqual(await page.locator('.notice').evaluateAll(nodes => nodes.map(n => getComputedStyle(n).display)), ['none', 'none']);
  assert.equal(await page.locator('#other-error').isVisible(), true);
});

test('keeps subscription notices when automatic dismissal is disabled', async t => {
  const page = await setup(t, false);
  await settled(page);
  assert.equal(await page.locator('.notice').isVisible(), true);
});
