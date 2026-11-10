//
// SPDX-License-Identifier: GPL-3.0-or-later
//
import ArrowRight20 from "@carbon/icons-vue/es/arrow--right/20";
import Launch20 from "@carbon/icons-vue/es/launch/20";
import Save20 from "@carbon/icons-vue/es/save/20";
import Save32 from "@carbon/icons-vue/es/save/32";
import Warning16 from "@carbon/icons-vue/es/warning/16";
import Wikis32 from "@carbon/icons-vue/es/wikis/32";
import Application32 from "@carbon/icons-vue/es/application/32";
import Chip32 from "@carbon/icons-vue/es/chip/32";
import Cube32 from "@carbon/icons-vue/es/cube/32";
import Catalog32 from "@carbon/icons-vue/es/catalog/32";
import { markRaw } from "vue";

// Same names the NS8 IconService exposed; components are never reactive.
export const icons = {
  ArrowRight20: markRaw(ArrowRight20),
  Launch20: markRaw(Launch20),
  Save20: markRaw(Save20),
  Save32: markRaw(Save32),
  Warning16: markRaw(Warning16),
  Wikis32: markRaw(Wikis32),
  Application32: markRaw(Application32),
  Chip32: markRaw(Chip32),
  Cube32: markRaw(Cube32),
  Catalog32: markRaw(Catalog32),
};
