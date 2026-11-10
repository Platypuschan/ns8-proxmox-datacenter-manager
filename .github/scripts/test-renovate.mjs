// Run with the pinned official Renovate engine; do not approximate package rules.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { GlobalConfig } from '/usr/local/renovate/dist/config/global.js';
import { resolveConfigPresets } from '/usr/local/renovate/dist/config/presets/index.js';
import { applyPackageRules } from '/usr/local/renovate/dist/util/package-rules/index.js';
GlobalConfig.set({ platform: 'local', localDir: process.cwd() });
const { config } = await resolveConfigPresets(JSON.parse(await readFile('renovate.json', 'utf8')));
const resolve = (d) => applyPackageRules({ ...config, ...d });
for (const updateType of ['patch', 'minor', 'digest']) {
  const action = await resolve({ manager: 'github-actions', depType: 'action', packageName: 'actions/checkout', depName: 'actions/checkout', packageFile: '.github/workflows/validate.yml', updateType });
  assert.equal(action.automerge, true);
  assert.equal(action.minimumReleaseAge, '7 days');
  assert.equal(action.groupSlug, 'reviewed-github-actions');
}
for (const d of [
  { manager: 'github-actions', depType: 'action', packageName: 'actions/checkout', updateType: 'major' },
  { manager: 'github-actions', depType: 'github-runner', packageName: 'ubuntu', updateType: 'patch' },
  { manager: 'github-actions', depType: 'uses-with', packageName: 'actions/node-versions', updateType: 'patch' },
  { manager: 'github-actions', depType: 'workflow', packageName: 'NethServer/ns8-github-actions', updateType: 'patch' },
  { manager: 'npm', packageName: 'vue', packageFile: 'ui/package.json', updateType: 'major' },
  { manager: 'npm', packageName: 'axios', packageFile: 'ui/package.json', updateType: 'patch' },
  { manager: 'dockerfile', packageName: 'node', packageFile: 'ui/Containerfile', updateType: 'patch' },
]) {
  const out = await resolve({ depName: d.packageName, packageFile: '.github/workflows/validate.yml', ...d });
  assert.equal(out.automerge, false, JSON.stringify(d));
  if (d.updateType === 'major') assert.equal(out.dependencyDashboardApproval, true);
}
console.log('Conservative first-party Actions automerge policy verified by Renovate');
