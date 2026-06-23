// @ts-check
// Explore / atlas: monochrome map with every country labelled (name + capital), leader lines
// for tight spots, continent filter, 2D/3D, click to highlight + info popover.
import { el, clear, injectCss } from "../../core/dom.js";
import { getLang } from "../../core/i18n.js";
import { loadGeo, idsForRegion } from "../../core/data.js";
import { norm } from "../../core/text.js";
import { GeoEngine } from "../../geo/GeoEngine.js";
import { placeLabels } from "../../geo/labels.js";
import { totalAreaEq } from "../../geo/geometry.js";

const T = {
  en: { continent: "Continent", toGlobe: "🌐 Globe", toMap: "🗺 2D map", capital: "Capital", region: "Region", close: "Close",
    reg_world: "World", reg_africa: "Africa", reg_americas: "Americas", reg_asia: "Asia", reg_europe: "Europe", reg_middle_east: "Middle East", reg_oceania: "Oceania",
    reg_north_america: "North America", reg_south_america: "South America", reg_asia_east: "East Asia", reg_asia_southeast: "Southeast Asia", reg_asia_south: "South Asia", reg_asia_central: "Central Asia", reg_europe_west: "Western Europe", reg_europe_east: "Eastern Europe" },
  fr: { continent: "Continent", toGlobe: "🌐 Globe", toMap: "🗺 Carte 2D", capital: "Capitale", region: "Région", close: "Fermer",
    reg_world: "Monde", reg_africa: "Afrique", reg_americas: "Amériques", reg_asia: "Asie", reg_europe: "Europe", reg_middle_east: "Moyen-Orient", reg_oceania: "Océanie",
    reg_north_america: "Amérique du Nord", reg_south_america: "Amérique du Sud", reg_asia_east: "Asie de l'Est", reg_asia_southeast: "Asie du Sud-Est", reg_asia_south: "Asie du Sud", reg_asia_central: "Asie centrale", reg_europe_west: "Europe de l'Ouest", reg_europe_east: "Europe de l'Est" },
};
const FILTER_OPTS = ["world", "africa", "americas", "asia", "europe", "middle_east", "oceania"];

let session = null;
/** @type {import('../../core/types.js').Mode} */
export default {
  id: "explore",
  async mount(ctx) { const s = await build(ctx); if (ctx.signal.aborted) { s.destroy(); return; } session = s; },
  unmount() { if (session) { session.destroy(); session = null; } },
  onLangChange() { if (session) session.relang(); },
};

async function build(ctx) {
  const tt = (k) => T[getLang()][k];
  const geo = await loadGeo();
  if (ctx.signal.aborted) return { destroy() {}, relang() {} };
  const { byId, answers, featureById } = geo;
  const allIds = answers.map((a) => a.iso3);
  const areaCache = {};
  const area = (id) => (areaCache[id] != null ? areaCache[id] : (areaCache[id] = totalAreaEq(featureById[id].geometry)));
  const displayName = (id) => (getLang() === "fr" ? byId[id].name_fr : byId[id].name);
  const capName = (id) => (getLang() === "fr" ? byId[id].cap_fr : byId[id].cap);
  const showCapital = (id) => { const c = capName(id); return c && norm(c) !== norm(displayName(id)); };

  injectCss("explore-css", "modes/explore/explore.css?v=2");
  const host = el("div", { class: "map-host" });
  ctx.root.append(host);

  let continent = ctx.settings.modeGet("explore", "continent", "world");
  let view = ctx.settings.modeGet("explore", "view", "globe");
  let selectedId = null;

  const engine = new GeoEngine(host, {
    world: geo.world, byId, featureById, view,
    palette: ctx.theme.mapPalette(), reducedMotion: ctx.theme.reducedMotion, highlightColor: "select",
  });
  engine.setRegions(null);
  const offTheme = ctx.theme.onChange(() => { engine.setPalette(ctx.theme.mapPalette()); engine.setReducedMotion(ctx.theme.reducedMotion); });

  // label + leader overlays (over the canvas, inside host)
  const leaderSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  leaderSvg.setAttribute("class", "atlas-leaders");
  const labelLayer = el("div", { class: "atlas-labels" });
  host.append(leaderSvg, labelLayer);

  // info popover
  const info = el("div", { class: "atlas-info", hidden: true, role: "region", "aria-live": "polite" });
  host.append(info);

  // toolbar: continent filter + view toggle
  const contSel = el("select", { class: "region-select atlas-filter", "aria-label": tt("continent") });
  const viewBtn = el("button", { class: "btn", type: "button" });
  ctx.toolbar.append(contSel, viewBtn);
  function fillFilter() { clear(contSel); FILTER_OPTS.forEach((k) => contSel.append(el("option", { value: k, selected: k === continent }, tt("reg_" + k)))); }
  fillFilter();
  viewBtn.textContent = view === "globe" ? tt("toMap") : tt("toGlobe");

  contSel.addEventListener("change", () => {
    continent = contSel.value; ctx.settings.modeSet("explore", "continent", continent);
    host.classList.add("labels-hidden");
    if (continent === "world") engine.frameWorld(true); else engine.frameRegion(idsForRegion(answers, continent), true);
  }, { signal: ctx.signal });
  viewBtn.addEventListener("click", () => {
    view = view === "globe" ? "map" : "globe"; ctx.settings.modeSet("explore", "view", view);
    viewBtn.textContent = view === "globe" ? tt("toMap") : tt("toGlobe");
    host.classList.add("labels-hidden"); engine.setView(view);
  }, { signal: ctx.signal });

  // ---- selection ----
  function select(id) {
    selectedId = id; engine.highlight(id);
    const p = new URLSearchParams(); p.set("sel", id); ctx.router.replace("explore", p);
    showInfo(id); placeAll();
  }
  function deselect() { selectedId = null; engine.clearHighlight(); info.hidden = true; ctx.router.replace("explore", new URLSearchParams()); placeAll(); }
  engine.on("pick", (id) => { if (id) select(id); else deselect(); });

  function showInfo(id) {
    clear(info);
    const chips = (byId[id].regions || []).map((r) => el("span", { class: "info-chip" }, tt("reg_" + r) || r));
    info.append(
      el("button", { class: "atlas-info-close icon-btn", type: "button", "aria-label": tt("close"), onClick: deselect }, "✕"),
      el("h3", { class: "atlas-info-name" }, displayName(id)),
      el("p", { class: "atlas-info-cap" }, [el("span", { class: "muted" }, tt("capital") + ": "), capName(id)]),
      chips.length ? el("div", { class: "atlas-info-chips" }, chips) : null,
    );
    info.hidden = false;
  }

  // ---- labels ----
  function makeLabel(id) {
    const name = displayName(id);
    const b = el("button", { class: "atlas-label", type: "button", "data-id": id, "aria-label": name }, [
      el("span", { class: "al-name" }, name),
    ]);
    b.addEventListener("click", (e) => { e.stopPropagation(); select(id); }, { signal: ctx.signal });
    return b;
  }
  function addLeader(ax, ay, bx, by) {
    const ns = "http://www.w3.org/2000/svg";
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", ax); line.setAttribute("y1", ay); line.setAttribute("x2", bx); line.setAttribute("y2", by); line.setAttribute("class", "al-leader");
    const dot = document.createElementNS(ns, "circle");
    dot.setAttribute("cx", ax); dot.setAttribute("cy", ay); dot.setAttribute("r", "2.4"); dot.setAttribute("class", "al-dot");
    leaderSvg.append(line, dot);
  }

  function placeAll() {
    const { W, H } = engine.size(); if (!W || !H) return;
    clear(labelLayer); clear(leaderSvg);
    leaderSvg.setAttribute("viewBox", "0 0 " + W + " " + H); leaderSvg.setAttribute("width", W); leaderSvg.setAttribute("height", H);

    // Scale label size with zoom: small when zoomed out (tidy), larger when zoomed in.
    const k = engine.zoomK();
    const fs = Math.max(7.5, Math.min(13.5, 6.6 + 2 * Math.log2(k + 1)));
    host.style.setProperty("--atlas-font", fs.toFixed(1) + "px");
    const R = engine.globeRadius(), cx = W / 2, cy = H / 2, limb = 0.84 * R;

    let ids = continent === "world" ? allIds : idsForRegion(answers, continent);
    const vis = [];
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i], c = byId[id].center;
      if (view === "globe" && !engine.isFrontFacing(c)) continue;
      const a = engine.project(c); if (!a || !isFinite(a[0])) continue;
      if (a[0] < -40 || a[0] > W + 40 || a[1] < -40 || a[1] > H + 40) continue;
      if (view === "globe" && Math.hypot(a[0] - cx, a[1] - cy) > limb) continue; // drop labels near the globe edge
      vis.push({ id, ax: a[0], ay: a[1] });
    }
    if (selectedId && vis.every((v) => v.id !== selectedId)) {
      const c = byId[selectedId].center;
      if (!(view === "globe" && !engine.isFrontFacing(c))) { const a = engine.project(c); if (a && isFinite(a[0])) vis.push({ id: selectedId, ax: a[0], ay: a[1] }); }
    }

    const elById = {};
    for (let i = 0; i < vis.length; i++) { const lab = makeLabel(vis[i].id); lab.style.left = "-9999px"; lab.style.visibility = "hidden"; labelLayer.append(lab); elById[vis[i].id] = lab; }
    const items = vis.map((v) => ({ id: v.id, ax: v.ax, ay: v.ay, w: elById[v.id].offsetWidth, h: elById[v.id].offsetHeight, area: area(v.id), forced: v.id === selectedId }));
    const maxR = Math.max(45, Math.min(140, 30 + 24 * k)); // shorter leaders when zoomed out -> fewer crossing lines
    const placements = placeLabels(items, W, H, { maxR });
    const keep = {};
    for (let i = 0; i < placements.length; i++) {
      const p = placements[i], lab = elById[p.id]; keep[p.id] = 1;
      lab.style.left = p.x + "px"; lab.style.top = p.y + "px"; lab.style.visibility = "visible";
      if (p.id === selectedId) lab.classList.add("selected");
      if (p.leader) addLeader(p.leader[0], p.leader[1], p.x + lab.offsetWidth / 2, p.y + lab.offsetHeight / 2);
    }
    for (const id in elById) if (!keep[id]) elById[id].remove();
  }

  // ---- view lifecycle: hide labels while moving, re-place on settle ----
  let placeT = 0;
  function schedule() { clearTimeout(placeT); placeT = setTimeout(() => { host.classList.remove("labels-hidden"); placeAll(); }, 40); }
  engine.on("viewstart", () => { clearTimeout(placeT); host.classList.add("labels-hidden"); });
  engine.on("viewend", schedule);
  engine.on("frameend", schedule);

  // ---- init ----
  if (continent === "world") engine.frameWorld(false); else engine.frameRegion(idsForRegion(answers, continent), false);
  const sel0 = ctx.params && ctx.params.get("sel");
  if (sel0 && byId[sel0]) select(sel0);
  schedule();

  function relang() {
    fillFilter(); viewBtn.textContent = view === "globe" ? tt("toMap") : tt("toGlobe");
    if (selectedId) showInfo(selectedId);
    placeAll();
  }

  function destroy() { clearTimeout(placeT); offTheme(); engine.destroy(); }
  return { destroy, relang };
}
