import test from "node:test";
import assert from "node:assert/strict";
import { ESLint } from "eslint";
import { readFileSync } from "node:fs";
const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url)),
);
test("unused UI plugins and eval-based animation are absent", () => {
  const lock = readFileSync(new URL("../yarn.lock", import.meta.url), "utf8");
  const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  for (const name of [
    "lottie-web",
    "lottie-web-vue",
    "vue-axios",
    "vue-debounce",
  ]) {
    assert.equal(pkg.dependencies[name], undefined);
    assert.ok(!lock.includes(name), `${name} remains in lockfile`);
    assert.ok(!main.includes(name), `${name} remains registered`);
  }
});

test("ESLint glob override retains source matching, ignores and diagnostics", async () => {
  const eslint = new ESLint();
  for (const file of ["src/main.js", "src/App.vue", "tests/stack.test.mjs"]) {
    const config = await eslint.calculateConfigForFile(file);
    assert.ok(config.languageOptions.parser);
    assert.equal(config.rules["no-undef"][0], 2);
  }
  for (const file of [
    "dist/probe.js",
    "node_modules/probe.js",
    "test-results/probe.js",
  ]) {
    assert.equal(await eslint.isPathIgnored(file), true);
  }
  const [result] = await eslint.lintText("missingFixtureName();\n", {
    filePath: "src/lint-probe.js",
  });
  assert.ok(result.messages.some((message) => message.ruleId === "no-undef"));
});

const majors = {
  vue: 3,
  vuex: 4,
  "vue-router": 5,
  "vue-i18n": 11,
  "@carbon/vue": 3,
  "@babel/core": 8,
  "@babel/eslint-parser": 8,
  eslint: 10,
  "eslint-plugin-vue": 10,
  "eslint-plugin-prettier": 5,
  "@vue/eslint-config-prettier": 10,
  prettier: 3,
  vite: 8,
  "carbon-components": 11,
};
for (const [name, major] of Object.entries(majors)) {
  test(`${name} declares and installs major ${major}`, () => {
    const range = pkg.dependencies[name] || pkg.devDependencies[name];
    assert.match(range, new RegExp(`^\\^${major}\\.`));
    const installed = JSON.parse(
      readFileSync(
        new URL(`../node_modules/${name}/package.json`, import.meta.url),
      ),
    );
    assert.equal(Number(installed.version.split(".")[0]), major);
  });
}
