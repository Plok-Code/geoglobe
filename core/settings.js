// @ts-check
// Persistent user preferences (localStorage), built on the observable store.
import { createStore } from "./store.js";

const KEY = "geoglobe.settings";

const DEFAULTS = {
  lang: "fr",          // 'fr' | 'en' — French is the default; English is opt-in
  theme: "system",     // 'system' | 'dark' | 'light' | 'hc'
  motion: "system",    // 'system' | 'full' | 'reduced'
  lastRoute: "",       // restore "Continue" on the hub
};

function load() {
  try { return Object.assign({}, DEFAULTS, JSON.parse(localStorage.getItem(KEY) || "{}")); }
  catch (e) { return Object.assign({}, DEFAULTS); }
}

const store = createStore(load());
store.subscribe((s) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) {} });

export const settings = {
  get: (k) => store.get()[k],
  set: (k, v) => store.set({ [k]: v }),
  all: () => store.get(),
  subscribe: store.subscribe,
  // Namespaced per-mode prefs so modes never clobber each other.
  modeGet(modeId, k, fallback) {
    const m = store.get()["mode:" + modeId] || {};
    return k in m ? m[k] : fallback;
  },
  modeSet(modeId, k, v) {
    const key = "mode:" + modeId;
    const m = Object.assign({}, store.get()[key], { [k]: v });
    store.set({ [key]: m });
  },
};
