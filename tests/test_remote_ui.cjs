// SPDX-License-Identifier: GPL-3.0-or-later
// Actual packaged PDM WASM UI; remote API data and console content are fixtures.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
const path = require('node:path');
const base = process.env.PDM_TEST_URL || 'https://127.0.0.1:18443';
const node = {type:'node', id:'remote/cluster-home/node/pve-1', node:'pve-1', status:'online', level:'',
  'cgroup-mode':2, cpu:0.1, maxcpu:4, maxmem:8589934592, mem:1024, uptime:123};
const guest = {node:'pve-1',cpu:0,maxcpu:2,disk:0,maxdisk:4294967296,maxmem:4294967296,
  mem:0,pool:'',status:'stopped',tags:[],template:false,uptime:0};
const resources = [node,
  {...guest,type:'qemu',id:'remote/cluster-home/guest/100',vmid:100,name:'fixture-vm'},
  {...guest,type:'lxc',id:'remote/cluster-home/guest/105',vmid:105,name:'fixture-ct'},
  {type:'storage',id:'remote/cluster-home/storage/pve-1/local',node:'pve-1',storage:'local',
    disk:0,maxdisk:8589934592,status:'available',shared:false}];
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
      ? {success:true,data:resources}
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

for (const [name, title] of [['fixture-vm', /^VM .*fixture-vm/], ['fixture-ct', /^CT .*fixture-ct/]]) {
  test(`Back to Resources is below the right tabs only in guest details: ${name}`,async t=>{
    const {page}=await setup(t);
    const back=page.getByText('Back to Resources',{exact:true});
    assert.equal(await back.count(),0,'no Back button in remote overview');
    const tree=page.locator('[data-ns8-remote-resources]');
    await tree.getByText(new RegExp(name)).click();
    await back.waitFor();
    const box=await back.boundingBox();
    const tab=await page.locator('[data-ns8-remote-tabs] a.pwt-nav-link').filter({hasText:'Resources'}).boundingBox();
    const heading=await page.getByText(title).boundingBox();
    assert.ok(box.x >= tab.x-1,'Back must be in the right panel, not the summary');
    assert.ok(box.y >= tab.y+tab.height,'Back must be below the remote tab bar');
    assert.ok(box.y+box.height <= heading.y,'Back must precede the guest title');
    if(process.env.PDM_TEST_ARTIFACT_DIR) await page.screenshot({path:path.join(process.env.PDM_TEST_ARTIFACT_DIR,`${name}-back.png`)});
    await page.locator('[data-ns8-remote-tabs] a.pwt-nav-link').filter({hasText:'Tasks'}).click();
    await page.getByText('Start Time',{exact:true}).waitFor();
    assert.equal(await back.isVisible(),false,'no guest Back button on Tasks');
    await page.locator('[data-ns8-remote-tabs] a.pwt-nav-link').filter({hasText:'Notes'}).click();
    await page.getByText('Fixture notes',{exact:false}).waitFor();
    assert.equal(await back.isVisible(),false,'no guest Back button on Notes');
    await page.locator('[data-ns8-remote-tabs] a.pwt-nav-link').filter({hasText:'Resources'}).click();
    if(!(await back.isVisible())) await tree.getByText(new RegExp(name)).click();
    await back.click();
    await tree.getByText('Datacenter',{exact:true}).waitFor();
    assert.equal(await back.count(),0,'Back disappears after returning');
  });
}
for (const label of ['pve-1','local']) {
  test(`no guest Back button in node/storage details: ${label}`,async t=>{
    const {page}=await setup(t);
    const entry=page.locator('[data-ns8-remote-resources]').getByText(label,{exact:true});
    await entry.click();
    await entry.waitFor({state:'hidden'});
    assert.equal(await page.getByText('Back to Resources',{exact:true}).count(),0);
  });
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
  await page.locator('[data-ns8-remote-resources]').getByText(/fixture-vm/).click();
  await page.getByText('Back to Resources',{exact:true}).waitFor();
  const resourceUrl = page.url();
  await page.reload();
  assert.equal(page.url(),resourceUrl);
  await page.getByText('Back to Resources',{exact:true}).waitFor();
  await page.getByText('Back to Resources',{exact:true}).click();
  await page.locator('[data-ns8-remote-resources]').getByText('pve-1',{exact:true}).waitFor();
});

for (const [name,mode,consoleType] of [
  ['fixture-vm','novnc','kvm'],
  ['fixture-vm','xterm.js','kvm'],
  ['fixture-ct','Shell','lxc'],
]) {
  test(`guest ${name} ${mode} console fills remaining panel height and resizes`,async t=>{
    const {page}=await setup(t);
    // Exercise the actual WASM iframe/layout, not a live remote console session.
    await page.route('**/?*',async route=>{
      if (!new URL(route.request().url()).searchParams.has('console')) return route.fallback();
      return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Fixture console</title><body style="margin:0;background:black;color:white">Fixture console</body>'});
    });
    const resourcesPanel=page.locator('[data-ns8-remote-resources]');
    await resourcesPanel.getByText(new RegExp(name)).click();
    await page.getByText('Back to Resources',{exact:true}).waitFor();
    await resourcesPanel.getByText(mode,{exact:true}).click();
    const frame=page.locator('iframe:visible');
    await frame.waitFor();
    const initial=await frame.boundingBox();
    const consoleUrl=new URL(await frame.getAttribute('src'),base);
    assert.equal(consoleUrl.searchParams.get('console'),consoleType);
    assert.equal(consoleUrl.searchParams.get(mode==='novnc'?'novnc':'xtermjs'),'1');
    async function assertFills() {
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const box=await frame.boundingBox(),panel=await resourcesPanel.boundingBox();
      assert.ok(box.height>200,`${mode} should not remain at iframe's default 150px: ${box.height}`);
      assert.ok(Math.abs(box.y+box.height-panel.y-panel.height)<=3,`${mode} must fill panel down to the bottom: ${JSON.stringify({box,panel})}`);
      assert.ok(Math.abs(box.x-panel.x)<=2 && Math.abs(box.width-panel.width)<=3,`${mode} must fill panel width`);
      return box;
    }
    await assertFills();
    t.diagnostic(JSON.stringify({name,mode,consoleWidth:initial.width,consoleHeight:initial.height}));
    await page.setViewportSize({width:1920,height:880});
    const shorter=await assertFills();
    assert.ok(initial.height-shorter.height>150,'console height must track viewport height, not a fixed pixel size');
    await page.setViewportSize({width:1600,height:1080});
    await assertFills();
    await page.locator('[data-ns8-remote-tabs] a.pwt-nav-link').filter({hasText:'Tasks'}).click();
    assert.equal(await frame.count(),0);
    await page.locator('[data-ns8-remote-tabs] a.pwt-nav-link').filter({hasText:'Resources'}).click();
    // Outer-tab routing returns the inner guest panel to its default tab.
    // Explicitly reopen the console; do not imply a live session survived.
    await resourcesPanel.getByText(mode,{exact:true}).click();
    await frame.waitFor();
    await assertFills();
    if(process.env.PDM_TEST_ARTIFACT_DIR) await page.screenshot({path:path.join(process.env.PDM_TEST_ARTIFACT_DIR,`${name}-console-${mode}.png`)});
    await page.getByText('Back to Resources',{exact:true}).click();
    await resourcesPanel.getByText('pve-1',{exact:true}).waitFor();
  });
}

test('Resources tree uses the full right panel width',async t=>{
  const {page}=await setup(t);
  const panel=await page.locator('[data-ns8-remote-resources]').boundingBox();
  const tree=await page.locator('[data-ns8-remote-resources] [role=grid]').boundingBox();
  assert.ok(Math.abs(tree.x-panel.x)<=2,`tree must not have an extra horizontal inset: ${JSON.stringify({panel,tree})}`);
  assert.ok(Math.abs(tree.width-panel.width)<=3,'tree must use all available panel width');
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
  await tree.getByText(/fixture-vm/).click();
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
