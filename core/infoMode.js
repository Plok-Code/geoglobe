// @ts-check
// Generic data-driven "info mode": a searchable country picker + a content panel.
// Future content modes reuse this; only the descriptor (base path) and content differ.
import { el, clear, injectCss } from "./dom.js";
import { loadAnswers } from "./data.js";
import { getLang, loc, t } from "./i18n.js";
import { norm } from "./text.js";

const STR = {
  en: { search: "Search a country", empty: "No country found", choose: "Pick a country to read about it.", noArticle: "No article for this country yet.", sources: "Sources", loadErr: "Could not load this article." },
  fr: { search: "Rechercher un pays", empty: "Aucun pays trouvé", choose: "Choisis un pays pour lire sa fiche.", noArticle: "Pas encore d'article pour ce pays.", sources: "Sources", loadErr: "Impossible de charger cette fiche." },
};
const s = (k) => (STR[getLang()] || STR.en)[k];

/**
 * @param {{id?:string, base:string}} descriptor
 * @returns {import('./types.js').Mode}
 */
export function makeInfoMode(descriptor) {
  let session = null;
  return {
    id: descriptor.id || "info",
    async mount(ctx) {
      const built = await build(ctx, descriptor);
      if (ctx.signal.aborted) return;
      session = built;
    },
    unmount() { session = null; },
    onLangChange() { if (session) session.relang(); },
    onParamsChange(params) { if (session) session.selectFrom(params); },
  };
}

async function build(ctx, descriptor) {
  injectCss("info-css", "core/infomode.css?v=1");
  const base = descriptor.base.replace(/\/?$/, "/");
  const { byId } = await loadAnswers();
  if (ctx.signal.aborted) return { relang() {}, selectFrom() {} };

  let manifest = { countries: [] };
  try { manifest = await (await fetch(base + "index.json", { signal: ctx.signal })).json(); }
  catch (e) { /* empty manifest = nothing authored yet */ }

  const lang = () => getLang();
  const nameOf = (id) => (lang() === "fr" ? (byId[id] && byId[id].name_fr) : (byId[id] && byId[id].name)) || id;
  // entries that have an article, sorted by localized name
  let entries = (manifest.countries || []).filter((id) => byId[id]).sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

  const cache = {};
  let selectedId = null;
  let activeIdx = -1;
  let filtered = entries.slice();

  // ---- layout ----
  const wrap = el("div", { class: "info-mode" });
  const pickerCol = el("div", { class: "info-picker" });
  const panel = el("div", { class: "info-panel", id: "info-panel", role: "region", "aria-live": "polite", tabindex: "-1" });
  wrap.append(pickerCol, panel);
  ctx.root.append(wrap);

  // ---- combobox ----
  const input = el("input", {
    class: "info-search", type: "text", role: "combobox", autocomplete: "off", spellcheck: "false",
    "aria-expanded": "true", "aria-controls": "info-listbox", "aria-autocomplete": "list",
    placeholder: s("search"), "aria-label": s("search"),
  });
  const listbox = el("ul", { class: "info-listbox", id: "info-listbox", role: "listbox" });
  pickerCol.append(input, listbox);

  function renderList() {
    clear(listbox);
    if (!filtered.length) { listbox.append(el("li", { class: "info-empty", role: "presentation" }, s("empty"))); return; }
    filtered.forEach((id, i) => {
      const li = el("li", {
        class: "info-option" + (id === selectedId ? " selected" : "") + (i === activeIdx ? " active" : ""),
        role: "option", id: "opt-" + id, "aria-selected": String(id === selectedId),
      }, nameOf(id));
      li.addEventListener("click", () => select(id), { signal: ctx.signal });
      listbox.append(li);
    });
  }
  function applyFilter() {
    const q = norm(input.value);
    filtered = q ? entries.filter((id) => norm(nameOf(id)).indexOf(q) >= 0) : entries.slice();
    activeIdx = filtered.length ? 0 : -1;
    syncActive();
    renderList();
  }
  function syncActive() {
    input.setAttribute("aria-activedescendant", activeIdx >= 0 && filtered[activeIdx] ? "opt-" + filtered[activeIdx] : "");
  }
  input.addEventListener("input", applyFilter, { signal: ctx.signal });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); activeIdx = Math.min(filtered.length - 1, activeIdx + 1); renderList(); syncActive(); scrollActive(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); activeIdx = Math.max(0, activeIdx - 1); renderList(); syncActive(); scrollActive(); }
    else if (e.key === "Enter") { e.preventDefault(); if (filtered[activeIdx]) select(filtered[activeIdx]); }
  }, { signal: ctx.signal });
  function scrollActive() { const a = listbox.querySelector(".info-option.active"); if (a) a.scrollIntoView({ block: "nearest" }); }

  // ---- selection + article ----
  async function select(id, fromUrl) {
    selectedId = id;
    input.value = nameOf(id);
    applyFilterKeepSelection();
    if (!fromUrl) { const p = new URLSearchParams(); p.set("c", id); ctx.router.replace(descriptor.id || "info", p); }
    await showArticle(id);
    panel.focus({ preventScroll: true });
  }
  function applyFilterKeepSelection() { filtered = entries.slice(); activeIdx = entries.indexOf(selectedId); renderList(); }

  async function showArticle(id) {
    clear(panel);
    panel.append(el("p", { class: "muted" }, t("state.loading")));
    let art = cache[id];
    if (!art) {
      try { art = await (await fetch(base + "articles/" + id + ".json", { signal: ctx.signal })).json(); cache[id] = art; }
      catch (e) { clear(panel); panel.append(el("p", { class: "muted" }, s("noArticle"))); return; }
    }
    if (ctx.signal.aborted) return;
    renderArticle(art, id);
  }

  function renderArticle(art, id) {
    clear(panel);
    const a = el("article", { class: "info-article" });
    a.append(el("h2", {}, loc(art.title) || nameOf(id)));
    if (art.updated) a.append(el("p", { class: "info-updated muted" }, String(art.updated)));
    (art.sections || []).forEach((sec) => {
      if (sec.heading) a.append(el("h3", {}, loc(sec.heading)));
      const body = loc(sec.body);
      String(body).split(/\n{2,}/).forEach((para) => { if (para.trim()) a.append(el("p", {}, para.trim())); });
    });
    if (art.sources && art.sources.length) {
      const ul = el("ul", { class: "info-sources" });
      art.sources.forEach((src) => {
        const label = loc(src.label) || src.url || "";
        const safe = typeof src.url === "string" && /^https?:\/\//i.test(src.url);
        ul.append(el("li", {}, safe ? el("a", { href: src.url, target: "_blank", rel: "noopener noreferrer" }, label) : label));
      });
      a.append(el("h3", {}, s("sources")), ul);
    }
    panel.append(a);
  }

  function showPlaceholder() { clear(panel); panel.append(el("p", { class: "info-choose muted" }, s("choose"))); }

  // ---- init + deep link ----
  function selectFrom(params) {
    const id = params && params.get("c");
    if (id && byId[id] && entries.indexOf(id) >= 0) select(id, true);
  }
  renderList();
  showPlaceholder();
  selectFrom(ctx.params);

  function relang() {
    input.placeholder = s("search"); input.setAttribute("aria-label", s("search"));
    entries = (manifest.countries || []).filter((id) => byId[id]).sort((x, y) => nameOf(x).localeCompare(nameOf(y)));
    applyFilter();
    if (selectedId) { input.value = nameOf(selectedId); showArticle(selectedId); } else showPlaceholder();
  }

  return { relang, selectFrom };
}
