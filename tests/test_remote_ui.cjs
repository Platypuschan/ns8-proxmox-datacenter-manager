// SPDX-License-Identifier: GPL-3.0-or-later
// Runs against the actual packaged PDM WASM UI; only remote data is a fixture.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const path = require('node:path');
const base = process.env.PDM_TEST_URL || 'https://127.0.0.1:18443';
const node = {type:'node', id:'remote/cluster-home/node/pve-1', node:'pve-1', status:'online', level:'',
  'cgroup-mode':2, cpu:0.1, maxcpu:4, maxmem:8589934592, mem:1024, uptime:123};
async function setup(t, deferFirst = false) {
  const browser = await chromium.launch({headless:true});
  t.after(()=>browser.close());
  const page = await browser.newPage({ignoreHTTPSErrors:true,viewport:{width:1920,height:1080}});
  const errors = [];
  page.on('pageerror',e=>errors.push(e.message));
  let online = true;
  let releaseFirst;
  const firstResult = new Promise(resolve=>{releaseFirst=resolve;});
  if (!deferFirst) releaseFirst();
  t.after(()=>releaseFirst());
  await page.route('**/api2/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/remotes/remote')) return route.fulfill({json:{success:true,data:[
      {type:'pve',id:'cluster-home',nodes:['hostname=pve.example.invalid'],authid:'root@pam!fixture',token:''}
    ]}});
    if (url.pathname.endsWith('/pve/remotes/cluster-home/resources')) {
      await firstResult;
      return route.fulfill({json:online
      ? {success:true,data:[node]}
      : {success:false,message:'Fixture: remote connection refused',data:null}});
    }
    if (url.pathname.endsWith('/pve/remotes/cluster-home/options')) return route.fulfill({json:{success:true,data:{description:'Fixture notes'}}});
    return route.continue();
  });
  await page.goto(base);
  await page.locator('input[type=text]').nth(1).fill('root');
  await page.locator('input[type=password]').fill(process.env.PDM_TEST_PASSWORD);
  await page.getByRole('button',{name:'Login',exact:true}).click();
  await page.getByText('cluster-home',{exact:true}).first().click();
  if (!deferFirst) await page.getByText('Host CPU usage (avg.)',{exact:true}).waitFor();
  t.after(()=>assert.deepEqual(errors,[]));
  return {page, releaseFirst, setOnline:value=>{online=value;}};
}

test('does not claim reachability before the first remote API result',async t=>{
  const {page,releaseFirst}=await setup(t,true);
  await page.locator('[data-ns8-reachability="unknown"] .fa-question-circle').waitFor();
  assert.equal(await page.locator('[data-ns8-reachability="online"]').count(),0);
  releaseFirst();
  await page.locator('[data-ns8-reachability="online"] .fa-check-circle').waitFor();
});

test('reachability uses remote API result, not subscription; recovers after failure', async t=>{
  const {page,setOnline} = await setup(t);
  // Fixture has no subscription, but a successful API result must be green.
  await page.getByText('Reachability',{exact:true}).waitFor({timeout:5000});
  await page.locator('[data-ns8-reachability="online"] i.fa-check-circle.pwt-color-success').waitFor();
  assert.equal(await page.getByText('Subscription Level',{exact:true}).count(),0);
  setOnline(false);
  await page.locator('[data-ns8-reachability="offline"] i.fa-times-circle.pwt-color-error').waitFor({timeout:15000});
  if (process.env.PDM_TEST_ARTIFACT_DIR) await page.screenshot({path:path.join(process.env.PDM_TEST_ARTIFACT_DIR,'remote-offline.png')});
  assert.equal(await page.getByText('Fixture: remote connection refused',{exact:false}).count()>0,true);
  const dialog=page.locator('dialog[open]');
  if(await dialog.count()) await dialog.getByRole('button',{name:'Continue',exact:true}).click();
  setOnline(true);
  await page.locator('[data-ns8-reachability="online"] i.fa-check-circle.pwt-color-success').waitFor({timeout:15000});
});

test('resource deep link survives a full page reload and returns to Resources',async t=>{
  const {page}=await setup(t);
  await page.locator('[data-ns8-remote-resources]').getByText('pve-1',{exact:true}).click();
  await page.getByText('Back to Resources',{exact:true}).waitFor();
  const resourceUrl = page.url();
  await page.reload();
  assert.equal(page.url(),resourceUrl);
  await page.getByText('Back to Resources',{exact:true}).waitFor();
  await page.getByText('Back to Resources',{exact:true}).click();
  await page.locator('[data-ns8-remote-resources]').getByText('pve-1',{exact:true}).waitFor();
});

test('Resources is first/default right-side tab; Tasks and Notes still work',async t=>{
  const {page} = await setup(t);
  const resourcesTab=page.locator('[data-ns8-remote-tabs] a.pwt-nav-link').filter({hasText:'Resources'});
  await resourcesTab.waitFor({timeout:5000});
  const labels=await page.locator('[data-ns8-remote-tabs] a.pwt-nav-link').allTextContents();
  assert.deepEqual(labels.map(s=>s.trim()),['Resources','Tasks','Notes']);
  const tree=page.locator('[data-ns8-remote-resources]');
  await tree.getByText('pve-1',{exact:true}).waitFor();
  const left=await page.getByText('Open Web UI',{exact:true}).boundingBox();
  const right=await tree.boundingBox();
  assert.ok(right.x > left.x,'resource tree must be to the right of the summary');
  await page.locator('[data-ns8-remote-tabs] a.pwt-nav-link').filter({hasText:'Tasks'}).click();
  await page.getByText('Start Time',{exact:true}).waitFor();
  await page.locator('[data-ns8-remote-tabs] a.pwt-nav-link').filter({hasText:'Notes'}).click();
  await page.getByText('Fixture notes',{exact:false}).waitFor();
  await resourcesTab.click();
  await tree.getByText('pve-1',{exact:true}).waitFor();
  await tree.getByText('pve-1',{exact:true}).click();
  await page.getByText('Back to Resources',{exact:true}).waitFor();
  await page.getByText('Back to Resources',{exact:true}).click();
  await tree.getByText('Datacenter',{exact:true}).waitFor();
  // Returning creates a fresh tree; its root may initially be collapsed.
  if (!(await tree.getByText('pve-1',{exact:true}).isVisible())) {
    await tree.locator('.pwt-tree-expander.fa-caret-right').first().click();
  }
  await tree.getByText('pve-1',{exact:true}).waitFor();
  await page.locator('[data-ns8-remote-tabs] a.pwt-nav-link').filter({hasText:'Tasks'}).waitFor({timeout:5000});
  await page.locator('[data-ns8-remote-tabs] a.pwt-nav-link').filter({hasText:'Notes'}).waitFor({timeout:5000});
  // The menu defaults must survive rebuilding PWT as well.
  assert.equal(await page.locator('[role=navigation]').getByText('Subscription',{exact:true}).isVisible(),false);
  if (process.env.PDM_TEST_ARTIFACT_DIR) {
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.screenshot({path:path.join(process.env.PDM_TEST_ARTIFACT_DIR,'remote-resources.png')});
  }
});
