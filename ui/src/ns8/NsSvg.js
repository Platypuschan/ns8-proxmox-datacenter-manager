//
// Copyright (C) 2023 Nethesis S.r.l.
// SPDX-License-Identifier: GPL-3.0-or-later
//
import { h } from "vue";

// Renders a Carbon icon component, inline <svg> markup, a sprite symbol or an image URL.
export default {
  name: "NsSvg",
  props: {
    svg: { type: [String, Object, Function], default: undefined },
  },
  render() {
    const svg = this.svg;
    if (!svg) return null;
    if (typeof svg === "object" || typeof svg === "function") {
      return h(svg);
    }
    if (svg.indexOf("<svg") >= 0) {
      return h("svg", { innerHTML: svg });
    }
    if (svg.indexOf("#") >= 0) {
      return h("svg", {}, [h("use", { href: svg })]);
    }
    return h("img", { src: svg });
  },
};
