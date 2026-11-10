import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const pkg = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url)),
);
const majors = {
  vue: 3,
  vuex: 4,
  "vue-router": 5,
  "vue-i18n": 11,
  "vue-debounce": 6,
  "@carbon/vue": 3,
  "lottie-web-vue": 3,
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
