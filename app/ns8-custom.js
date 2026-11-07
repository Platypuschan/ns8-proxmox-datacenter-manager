// SPDX-License-Identifier: GPL-3.0-or-later
//
// Interface adjustments of the NethServer 8 module for the Proxmox Datacenter
// Manager web interface. Loaded from index.hbs; the settings come from
// ns8-config.js, which the container entrypoint writes at every start:
//
//   window.NS8_PDM = { layout: true, hide: ["subscription", ...], nag: true }
//
// The interface is a WebAssembly (Yew) application that renders and patches
// the DOM itself, so this script never inserts or removes elements. It sets
// attributes and styles on existing elements and re-applies them whenever the
// DOM changes. Entries are recognised by their icon class, not by their label,
// so the language of the interface does not matter.
(function () {
  "use strict";
  var cfg = window.NS8_PDM || {};
  var hide = {};
  (cfg.hide || []).forEach(function (key) { hide[key] = true; });

  // icon class of a navigation entry -> key
  var NAV = {
    "fa-tachometer": "dashboard",
    "fa-th-large": "views",
    "fa-sticky-note-o": "notes",
    "fa-gears": "configuration",
    "fa-id-card": "registry",
    "fa-wrench": "administration",
    "fa-sdn": "sdn",
    "fa-ceph": "ceph",
    "fa-desktop": "guests",
    "fa-server": "remotes",
    // children
    "fa-support": "subscription",
    "fa-terminal": "shell",
  };
  var ORDER = ["dashboard", "views", "notes", "remotes", "guests", "configuration"];
  // always removed from the left menu when the layout is active: they move to the top bar
  var MOVED = { shell: true, administration: true };

  function keyOf(link) {
    var icon = link.querySelector("i.pwt-nav-menu-icon");
    if (!icon) return null;
    for (var cls in NAV) if (icon.classList.contains(cls)) return NAV[cls];
    return null;
  }

  function setHidden(el, on) {
    if (on) { if (!el.hasAttribute("data-ns8-hidden")) { el.setAttribute("data-ns8-hidden", ""); el.style.display = "none"; } }
    else if (el.hasAttribute("data-ns8-hidden")) { el.removeAttribute("data-ns8-hidden"); el.style.display = ""; }
  }

  function isContainer(el) {
    return el && el.classList && el.classList.contains("pwt-nav-menu-animation-container");
  }

  function applyMenu() {
    var nav = document.querySelector('[role="navigation"].pwt-nav-menu');
    if (!nav) return;
    var entries = {}; // every entry by key, for the top bar buttons
    var top = {};     // top-level entries by key
    Array.prototype.forEach.call(nav.children, function (el) {
      if (!el.matches || !el.matches("a.pwt-nav-link")) return;
      var key = keyOf(el);
      if (!key) return;
      var container = isContainer(el.nextElementSibling) ? el.nextElementSibling : null;
      entries[key] = top[key] = { link: el, container: container };
      var off = !!hide[key] || (cfg.layout && !!MOVED[key]);
      setHidden(el, off);
      if (container) {
        setHidden(container, off);
        Array.prototype.forEach.call(container.querySelectorAll("a.pwt-nav-link"), function (child) {
          var ckey = keyOf(child);
          if (!ckey) return;
          entries[ckey] = { link: child, container: null };
          setHidden(child, !!hide[ckey] || (cfg.layout && !!MOVED[ckey]));
        });
      }
    });
    if (cfg.layout) {
      var position = 0;
      var place = function (key) {
        var e = top[key];
        if (!e) return;
        e.link.style.order = String(position++);
        if (e.container) e.container.style.order = String(position++);
      };
      ORDER.forEach(place);
      Object.keys(top).forEach(function (key) { if (ORDER.indexOf(key) < 0) place(key); });
    }
    window.NS8_PDM_NAV = entries;
  }

  // Repurpose an existing top bar button: change icon and label in place and
  // make a click open the matching left menu entry (which stays in the DOM, hidden).
  function repurpose(button, iconClass, label, key) {
    if (!button) return;
    // Idempotent: the framework may re-render the button, so every property is
    // compared first. Writing unchanged values would retrigger the observer.
    if (button.getAttribute("data-ns8-role") !== key) button.setAttribute("data-ns8-role", key);
    if (button.getAttribute("aria-label") !== label) button.setAttribute("aria-label", label);
    if (button.title !== label) button.title = label;
    var icon = button.querySelector("i.fa");
    var want = "fa fa-fw " + iconClass;
    if (icon && icon.className !== want) icon.className = want;
    var textNodes = Array.prototype.filter.call(button.childNodes, function (n) { return n.nodeType === 3 && n.nodeValue.trim() !== ""; });
    if (textNodes.length) {
      textNodes.forEach(function (n) { if (n.nodeValue !== label) n.nodeValue = label; });
    } else {
      // icon-only (the former theme button): add the label as text
      button.appendChild(document.createTextNode(label));
    }
    button.classList.remove("circle");
  }

  // The framework handles clicks high up in the capture phase, before they reach
  // the button. A capture listener on window runs first and keeps the original
  // action (theme mode, documentation) from running.
  window.addEventListener("click", function (event) {
    var target = event.target && event.target.closest ? event.target.closest("[data-ns8-role]") : null;
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    var entry = (window.NS8_PDM_NAV || {})[target.getAttribute("data-ns8-role")];
    if (entry) entry.link.click();
  }, true);

  function applyTopBar() {
    var banner = document.querySelector('[role="banner"]');
    if (!banner) return;
    var theme = banner.querySelector('button[aria-label="Select Theme Mode"]');
    if (theme) repurpose(theme, "fa-terminal", "Shell", "shell");
    var buttons = banner.querySelectorAll("button.pwt-button");
    Array.prototype.forEach.call(buttons, function (b) {
      if (b.querySelector("i.fa-book")) repurpose(b, "fa-wrench", "Administration", "administration");
    });
  }

  // Subscription notice: confirm "Continue" on the dialog that points to pdm.proxmox.com
  function applyNag() {
    Array.prototype.forEach.call(document.querySelectorAll("dialog.pwt-outer-dialog"), function (dialog) {
      if (dialog.getAttribute("data-ns8-nag") || (dialog.textContent || "").indexOf("pdm.proxmox.com") === -1) return;
      dialog.setAttribute("data-ns8-nag", "1");
      var tries = 15;
      (function tick() {
        if (!dialog.isConnected || tries-- <= 0) return;
        var button = dialog.querySelector("button.pwt-button");
        try { if (button) button.click(); else dialog.close(); } catch (e) { /* retry */ }
        setTimeout(tick, 150);
      })();
    });
  }

  var scheduled = false;
  function apply() {
    scheduled = false;
    try {
      applyMenu();
      if (cfg.layout) applyTopBar();
      if (cfg.nag) applyNag();
    } catch (e) {
      if (window.console) console.warn("ns8-custom:", e);
    }
  }
  function schedule() {
    if (!scheduled) { scheduled = true; window.requestAnimationFrame(apply); }
  }

  function start() {
    schedule();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  }
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
})();
