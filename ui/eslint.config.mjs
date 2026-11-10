//
// SPDX-License-Identifier: GPL-3.0-or-later
//
// ESLint 10 flat config: Vue 3 recommended rules + Prettier 3 via the
// @vue/eslint-config-prettier flat config. Babel parser for <script> blocks.
import js from "@eslint/js";
import globals from "globals";
import pluginVue from "eslint-plugin-vue";
import vueParser from "vue-eslint-parser";
import babelParser from "@babel/eslint-parser";
import prettier from "@vue/eslint-config-prettier";

export default [
  { ignores: ["dist/**", "node_modules/**", "test-results/**"] },
  js.configs.recommended,
  ...pluginVue.configs["flat/recommended"],
  prettier,
  {
    files: ["**/*.{js,mjs,vue}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
      parser: vueParser,
      parserOptions: {
        parser: babelParser,
        requireConfigFile: false,
      },
    },
    rules: {
      "no-console": "off",
      "no-debugger": process.env.NODE_ENV === "production" ? "warn" : "off",
      "vue/multi-word-component-names": "off",
      // vue-router guards are conventionally declared after data
      "vue/order-in-components": "off",
      // optional props keep their undefined default, as in ns8-ui-lib
      "vue/require-default-prop": "off",
    },
  },
];
