//
// SPDX-License-Identifier: GPL-3.0-or-later
//
// Tiny event bus replacing Vue 2 `$root.$on/$emit` (removed in Vue 3) for
// events that stay inside the module UI iframe.
const handlers = new Map();

export default {
  on(event, fn) {
    if (!handlers.has(event)) handlers.set(event, new Set());
    handlers.get(event).add(fn);
  },
  off(event, fn) {
    const set = handlers.get(event);
    if (!set) return;
    if (fn) set.delete(fn);
    else set.clear();
  },
  emit(event, ...args) {
    for (const fn of [...(handlers.get(event) || [])]) fn(...args);
  },
};
