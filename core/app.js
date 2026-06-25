// @ts-check
// App shell: builds the persistent chrome (header, toolbar slot, main, live regions,
// settings dialog), runs the router, and mounts/unmounts modes with automatic cleanup.
import { findMode, modes } from "./modeRegistry.js?v=22";
import { createRouter } from "./router.js";
import { settings } from "./settings.js";
import { theme } from "./theme.js";
import { t, getLang, setLang, onLangChange } from "./i18n.js";
import { el, clear } from "./dom.js";

let shell = null;
let current = null; // { entry, mode, controller }
let router = null;

export function start() {
  theme.apply();
  document.documentElement.lang = getLang();
  shell = buildShell();
  router = createRouter(activate);
  onLangChange(() => {
    renderChrome();
    if (!current) return;
    if (settingsDialog && settingsDialog.open) fillSettings(settingsDialog);
    refreshHeader();
    // Stateful modes update strings in place; stateless ones just re-mount.
    if (current.mode.onLangChange) current.mode.onLangChange();
    else remountCurrent();
  });
  theme.onChange(() => { /* canvas modes re-read palette via their own subscription */ });
  router.start();
}

function buildShell() {
  const app = document.getElementById("app") || document.body;
  clear(app);

  const skip = el("a", { class: "skip-link", href: "#main" }, t("a11y.skip"));

  const backBtn = el("a", { class: "icon-btn back-btn", href: "#/", "aria-label": t("nav.home"), title: t("nav.home") }, "←");
  const homeLink = el("a", { class: "brand", href: "#/", "aria-label": t("nav.home") }, [
    el("img", { class: "brand-logo", src: "assets/logo.png?v=1", alt: "Plok Voyage", width: "34", height: "34" }),
    el("span", { class: "brand-name" }, t("app.name")),
  ]);
  const title = el("h1", { class: "mode-title", id: "mode-title" }, "");
  const settingsBtn = el("button", { class: "icon-btn settings-btn", type: "button", "aria-haspopup": "dialog", "aria-label": t("nav.settings"), title: t("nav.settings"), html: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="3.1"/><path d="M19.4 13a7.8 7.8 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.6 7.6 0 0 0-1.7-1L14 2H10l-.4 2.6a7.6 7.6 0 0 0-1.7 1l-2.4-1-2 3.4L3.6 11a7.8 7.8 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.6 7.6 0 0 0 1.7 1L10 22h4l.4-2.6a7.6 7.6 0 0 0 1.7-1l2.4 1 2-3.4Z"/></svg>' });
  settingsBtn.addEventListener("click", openSettings);

  const header = el("header", { class: "app-header" }, [
    el("div", { class: "header-left" }, [backBtn, homeLink, title]),
    el("div", { class: "header-right" }, [settingsBtn]),
  ]);

  const toolbar = el("div", { class: "mode-toolbar", id: "toolbar" });
  const root = el("main", { class: "mode-root", id: "main", tabindex: "-1" });
  const srStatus = el("div", { class: "sr-only", id: "sr-status", role: "status", "aria-live": "polite" });
  const srAlert = el("div", { class: "sr-only", id: "sr-alert", role: "alert", "aria-live": "assertive" });

  app.append(skip, header, toolbar, root, srStatus, srAlert);
  return { app, header, backBtn, homeLink, title, settingsBtn, toolbar, root, srStatus, srAlert };
}

function renderChrome() {
  shell.backBtn.setAttribute("aria-label", t("nav.home"));
  shell.backBtn.title = t("nav.home");
  shell.settingsBtn.setAttribute("aria-label", t("nav.settings"));
  shell.settingsBtn.title = t("nav.settings");
  shell.homeLink.querySelector(".brand-name").textContent = t("app.name");
}

function refreshHeader() {
  if (!current) return;
  setHeader(current.entry, current.mode);
}
function setHeader(entry, mode) {
  const titleText = (mode && mode.title && mode.title()) || t(entry.labelKey);
  shell.title.textContent = entry.id === "home" ? "" : titleText;
  shell.backBtn.hidden = entry.id === "home";
  document.title = entry.id === "home" ? t("app.name") : t("app.name") + " - " + titleText;
}

function buildContext(entry, params, signal) {
  return {
    root: shell.root,
    toolbar: shell.toolbar,
    t,
    settings,
    theme,
    params,
    signal,
    engine: undefined, // shared GeoEngine wired in for map modes in a later phase
    router: {
      navigate: (id, p) => router.navigate(id, p),
      replace: (id, p) => router.replace(id, p),
      current: () => router.current,
    },
    announce: (msg, assertive) => {
      const node = assertive ? shell.srAlert : shell.srStatus;
      node.textContent = "";
      // next tick so screen readers re-announce identical text
      requestAnimationFrame(() => { node.textContent = msg; });
    },
  };
}

function remountCurrent() {
  if (!current) return;
  const id = current.entry.id;
  const params = router.current.params;
  current.controller.abort();
  try { if (current.mode.unmount) current.mode.unmount(); } catch (e) { console.error(e); }
  current = null;
  activate(id, params);
}

async function activate(routeId, params) {
  const entry = findMode(routeId) || findMode("home");
  if (current && current.entry === entry) {
    if (current.mode.onParamsChange) current.mode.onParamsChange(params);
    return;
  }
  if (current) {
    current.controller.abort();
    try { if (current.mode.unmount) current.mode.unmount(); } catch (e) { console.error(e); }
    current = null;
  }
  clear(shell.root);
  clear(shell.toolbar);
  settings.set("lastRoute", location.hash);
  shell.root.setAttribute("aria-busy", "true");
  document.body.dataset.mode = entry.id;

  let mod;
  try { mod = (await entry.load()).default; }
  catch (e) { console.error(e); return showError(); }

  const controller = new AbortController();
  const ctx = buildContext(entry, params, controller.signal);
  current = { entry, mode: mod, controller };
  setHeader(entry, mod);
  try { await mod.mount(ctx); }
  catch (e) { console.error(e); showError(); }
  shell.root.removeAttribute("aria-busy");
  shell.root.focus({ preventScroll: true });
}

function showError() {
  clear(shell.root);
  shell.root.append(el("div", { class: "state-panel" }, [
    el("p", {}, t("state.error")),
    el("button", { class: "btn primary", type: "button", onClick: () => location.reload() }, t("common.retry")),
  ]));
}

// ---- settings dialog ----
function seg(labelKey, current, options, onPick) {
  const group = el("div", { class: "field" }, [el("span", { class: "field-label" }, t(labelKey))]);
  const row = el("div", { class: "seg", role: "group", "aria-label": t(labelKey) });
  options.forEach((o) => {
    const b = el("button", { type: "button", class: "seg-btn" + (o.val === current ? " active" : ""), "aria-pressed": String(o.val === current) }, o.label);
    b.addEventListener("click", () => { onPick(o.val); row.querySelectorAll(".seg-btn").forEach((x) => { x.classList.remove("active"); x.setAttribute("aria-pressed", "false"); }); b.classList.add("active"); b.setAttribute("aria-pressed", "true"); });
    row.append(b);
  });
  group.append(row);
  return group;
}

let settingsDialog = null;

function fillSettings(dialog) {
  clear(dialog);
  const close = () => { try { dialog.close(); } catch (e) {} };
  dialog.append(el("div", { class: "dialog-body" }, [
    el("div", { class: "dialog-head" }, [
      el("h2", {}, t("settings.title")),
      el("button", { class: "icon-btn", type: "button", "aria-label": t("nav.close"), onClick: close }, "×"),
    ]),
    seg("settings.language", getLang(), [{ val: "fr", label: "Français" }, { val: "en", label: "English" }], (v) => setLang(v)),
    seg("settings.theme", settings.get("theme"), [
      { val: "system", label: t("theme.system") }, { val: "dark", label: t("theme.dark") },
      { val: "light", label: t("theme.light") }, { val: "hc", label: t("theme.hc") },
    ], (v) => { settings.set("theme", v); theme.apply(); }),
    seg("settings.motion", settings.get("motion"), [
      { val: "system", label: t("motion.system") }, { val: "full", label: t("motion.full") }, { val: "reduced", label: t("motion.reduced") },
    ], (v) => { settings.set("motion", v); theme.apply(); }),
  ]));
}

function openSettings() {
  const dialog = el("dialog", { class: "settings-dialog" });
  dialog.addEventListener("click", (e) => { if (e.target === dialog) { try { dialog.close(); } catch (err) {} } });
  dialog.addEventListener("close", () => { dialog.remove(); settingsDialog = null; });
  fillSettings(dialog);
  document.body.append(dialog);
  settingsDialog = dialog;
  dialog.showModal();
}

start();
