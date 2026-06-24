// @ts-check
// World map: real zoomable globe via MapLibre GL + OpenFreeMap (free, no key), recoloured to match
// the app's dark atlas palette (blue ocean, dark land, light labels) while keeping cities/detail on
// zoom. A complete overlay (data/worldmap-units.geojson) makes every landmass clickable. Clicking a
// country, or its name label, colours the whole unit grey and shows its capital. When a unit is
// selected, its small far-flung territories (e.g. Martinique for France) get a locator box that fades
// out as you zoom in. Controls: regions multi-select, include observers / de-facto, show / hide names.
import { el, clear, injectCss } from "../../core/dom.js";
import { getLang } from "../../core/i18n.js";
import { loadAnswers } from "../../core/data.js";

const MAPLIBRE_JS = "https://cdn.jsdelivr.net/npm/maplibre-gl@5/dist/maplibre-gl.js";
const MAPLIBRE_CSS = "https://cdn.jsdelivr.net/npm/maplibre-gl@5/dist/maplibre-gl.css";
const STYLE = "https://tiles.openfreemap.org/styles/liberty";
const UNITS = "data/worldmap-units.geojson?v=4";

// dark atlas palette (matches app.css map tokens)
const C = {
  ocean: "#16384c", land: "#3a4856", building: "#47545f",
  border: "#647686", road: "#4b5965", text: "#e9eef3", halo: "#0a0e14",
  sel: "#FE6A33", selLine: "#B3430F", defacto: "#000000", loc: "#FFAB40",
};

const DEFACTO = {
  TWN: { name: "Taiwan", name_fr: "Taïwan", cap: "Taipei", cap_fr: "Taipei", sov195: "CHN" },
  KOS: { name: "Kosovo", name_fr: "Kosovo", cap: "Pristina", cap_fr: "Pristina", sov195: "SRB" },
  SOL: { name: "Somaliland", name_fr: "Somaliland", cap: "Hargeisa", cap_fr: "Hargeisa", sov195: "SOM" },
  SAH: { name: "Western Sahara", name_fr: "Sahara occidental", cap: "El Aaiun", cap_fr: "Laayoune", sov195: "MAR" },
  RTCN: { name: "Northern Cyprus", name_fr: "Chypre du Nord", cap: "North Nicosia", cap_fr: "Nicosie-Nord", sov195: "CYP" },
  PMR: { name: "Transnistria", name_fr: "Transnistrie", cap: "Tiraspol", cap_fr: "Tiraspol", sov195: "MDA" },
  ABK: { name: "Abkhazia", name_fr: "Abkhazie", cap: "Sukhumi", cap_fr: "Soukhoumi", sov195: "GEO" },
  SOS: { name: "South Ossetia", name_fr: "Ossétie du Sud", cap: "Tskhinvali", cap_fr: "Tskhinvali", sov195: "GEO" },
};
const DEFACTO_LIST_FR = "Taïwan, le Kosovo, le Somaliland, le Sahara occidental, la République turque de Chypre du Nord, la Transnistrie, l'Abkhazie et l'Ossétie du Sud";
const DEFACTO_LIST_EN = "Taiwan, Kosovo, Somaliland, Western Sahara, the Turkish Republic of Northern Cyprus, Transnistria, Abkhazia and South Ossetia";

const REGION_GROUPS = [
  { key: "africa", subs: [] },
  { key: "americas", subs: ["north_america", "south_america"] },
  { key: "asia", subs: ["asia_east", "asia_southeast", "asia_south", "asia_central", "middle_east"] },
  { key: "europe", subs: ["europe_west", "europe_east"] },
  { key: "oceania", subs: [] },
];

const T = {
  en: {
    capital: "Capital", reset: "Reset view", regions: "Regions", allRegions: "Whole world",
    names_on: "Hide names", names_off: "Show names",
    obs: "Include observer states", defacto: "Include de-facto states",
    obs_help: "Observer states are not full UN members but sit at the UN as permanent observers. There are two of them: the Holy See (Vatican) and Palestine.",
    defacto_help: "A de-facto state governs itself and works like a real country, with its own government and borders, but few or no other countries recognise it and it has no seat at the UN. There are eight here: " + DEFACTO_LIST_EN + ".",
    help: "What is this?",
    cls_un: "UN member", cls_observer: "UN observer", cls_defacto: "De-facto state", cls_dependency: "Territory", cls_intl: "International / disputed",
    hint: "Click a country, scroll to zoom, drag to spin",
    loading: "Loading the map...", loadErr: "Could not load the map (needs an internet connection).",
    reg_africa: "Africa", reg_americas: "Americas", reg_north_america: "North America", reg_south_america: "South America",
    reg_asia: "Asia", reg_asia_east: "East Asia", reg_asia_southeast: "Southeast Asia", reg_asia_south: "South Asia",
    reg_asia_central: "Central Asia", reg_middle_east: "Middle East", reg_europe: "Europe", reg_europe_west: "Western Europe",
    reg_europe_east: "Eastern Europe", reg_oceania: "Oceania",
  },
  fr: {
    capital: "Capitale", reset: "Recentrer", regions: "Régions", allRegions: "Monde entier",
    names_on: "Masquer les noms", names_off: "Afficher les noms",
    obs: "Inclure les états observateurs", defacto: "Inclure les états de facto",
    obs_help: "Les états observateurs ne sont pas membres de plein droit de l'ONU, mais y siègent comme observateurs permanents. Il y en a deux : le Saint-Siège (le Vatican) et la Palestine.",
    defacto_help: "Un état de facto se gouverne lui-même et fonctionne comme un vrai pays, avec son gouvernement et ses frontières, mais peu d'états ou aucun ne le reconnaissent et il ne siège pas à l'ONU. Il y en a huit ici : " + DEFACTO_LIST_FR + ".",
    help: "Qu'est-ce que c'est ?",
    cls_un: "Membre de l'ONU", cls_observer: "Observateur ONU", cls_defacto: "État de facto", cls_dependency: "Territoire", cls_intl: "International / contesté",
    hint: "Clique un pays, molette pour zoomer, glisse pour tourner",
    loading: "Chargement de la carte...", loadErr: "Impossible de charger la carte (connexion internet requise).",
    reg_africa: "Afrique", reg_americas: "Amériques", reg_north_america: "Amérique du Nord", reg_south_america: "Amérique du Sud",
    reg_asia: "Asie", reg_asia_east: "Asie de l'Est", reg_asia_southeast: "Asie du Sud-Est", reg_asia_south: "Asie du Sud",
    reg_asia_central: "Asie centrale", reg_middle_east: "Moyen-Orient", reg_europe: "Europe", reg_europe_west: "Europe de l'Ouest",
    reg_europe_east: "Europe de l'Est", reg_oceania: "Océanie",
  },
};

const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

let mlPromise = null;
function ensureMaplibre() {
  if (window.maplibregl) return Promise.resolve();
  if (mlPromise) return mlPromise;
  injectCss("maplibre-css", MAPLIBRE_CSS);
  mlPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script"); s.src = MAPLIBRE_JS; s.async = true;
    s.onload = () => resolve(); s.onerror = () => { mlPromise = null; reject(new Error("maplibre load failed")); };
    document.head.appendChild(s);
  });
  return mlPromise;
}

let session = null;
/** @type {import('../../core/types.js').Mode} */
export default {
  id: "worldmap",
  async mount(ctx) { const s = await build(ctx); if (ctx.signal.aborted) { s.destroy(); return; } session = s; },
  unmount() { if (session) { session.destroy(); session = null; } },
  onLangChange() { if (session) session.relang(); },
};

async function build(ctx) {
  const tt = (k) => (T[getLang()] || T.en)[k];
  injectCss("worldmap-css", "modes/worldmap/worldmap.css?v=7");

  const host = el("div", { class: "wm-host" });
  ctx.root.append(host);

  let maplibregl;
  try { await ensureMaplibre(); maplibregl = window.maplibregl; }
  catch (e) { host.append(el("p", { class: "wm-error muted" }, tt("loadErr"))); return { destroy() {}, relang() {} }; }
  const { byId } = await loadAnswers();
  if (ctx.signal.aborted || !maplibregl) return { destroy() {}, relang() {} };

  // name -> unit id, to resolve a clicked country LABEL to a unit
  const nameIndex = {};
  Object.values(byId).forEach((a) => { [a.name, a.name_fr].concat(a.aliases || [], a.aliases_fr || []).forEach((n) => { if (n) nameIndex[norm(n)] = a.iso3; }); });
  Object.entries(DEFACTO).forEach(([id, d]) => { [d.name, d.name_fr].forEach((n) => { if (n) nameIndex[norm(n)] = id; }); });

  function unitInfo(id) {
    if (id === "INTL") return { name: "International territory", name_fr: "Territoire international", cap: "", cap_fr: "", cls: "intl", regions: [] };
    if (DEFACTO[id]) { const d = DEFACTO[id], parent = byId[d.sov195]; return { name: d.name, name_fr: d.name_fr, cap: d.cap, cap_fr: d.cap_fr, cls: "defacto", regions: (parent && parent.regions) || [] }; }
    const a = byId[id];
    if (a) return { name: a.name, name_fr: a.name_fr, cap: a.cap, cap_fr: a.cap_fr, cls: (id === "VAT" || id === "PSE") ? "observer" : "un", regions: a.regions || [] };
    return null;
  }
  const nameOf = (id) => { const u = unitInfo(id); return u ? ((getLang() === "fr" ? u.name_fr : u.name) || u.name) : id; };
  const capOf = (id) => { const u = unitInfo(id); return u ? ((getLang() === "fr" ? u.cap_fr : u.cap) || u.cap) : ""; };

  let incObs = ctx.settings.modeGet("worldmap", "incObs", true);
  let incDefacto = ctx.settings.modeGet("worldmap", "incDefacto", false);
  let labelsOn = ctx.settings.modeGet("worldmap", "labels", true);
  let selRegions = new Set(ctx.settings.modeGet("worldmap", "regions", []) || []);
  let selectedGroup = null;
  const groupKey = () => (incDefacto ? "sov" : "sov195");
  const resolveGroup = (unitId) => (incDefacto ? unitId : (DEFACTO[unitId] ? DEFACTO[unitId].sov195 : unitId));

  function inScope(unitId) {
    const u = unitInfo(unitId); if (!u) return false;
    if (u.cls === "observer" && !incObs) return false;
    if (u.cls === "defacto" && !incDefacto) return false;
    if (!selRegions.size) return true;
    return (u.regions || []).some((r) => selRegions.has(r));
  }

  const info = el("div", { class: "wm-info", hidden: true, role: "region", "aria-live": "polite" });
  const loading = el("div", { class: "wm-loading" }, tt("loading"));
  host.append(info, loading);

  function showInfo(unitId) {
    const u = unitInfo(unitId); if (!u) { info.hidden = true; return; }
    clear(info);
    info.append(
      el("button", { class: "wm-info-close icon-btn", type: "button", "aria-label": ctx.t("nav.close"), onClick: deselect }, "×"),
      el("div", { class: "wm-info-badge wm-cls-" + u.cls }, tt("cls_" + u.cls)),
      el("h3", { class: "wm-info-name" }, nameOf(unitId)),
      capOf(unitId) ? el("p", { class: "wm-info-cap" }, [el("span", { class: "muted" }, tt("capital") + " : "), capOf(unitId)]) : null,
    );
    info.hidden = false;
  }

  // ---- toolbar ----
  function helpBubble(textKey) {
    const tip = el("span", { class: "wm-tip" });
    const b = el("span", { class: "wm-help", tabindex: "0", role: "button", "aria-label": tt("help") }, ["?", tip]);
    const fill = () => { tip.textContent = tt(textKey); };
    b.addEventListener("mouseenter", fill, { signal: ctx.signal });
    b.addEventListener("focus", fill, { signal: ctx.signal });
    return b;
  }
  function checkbox(checked, labelKey, helpKey, onChange) {
    const input = el("input", { type: "checkbox", checked });
    input.addEventListener("change", () => onChange(input.checked), { signal: ctx.signal });
    return el("label", { class: "wm-check" }, [input, el("span", {}, tt(labelKey)), helpBubble(helpKey)]);
  }
  const regionBtn = el("button", { class: "btn", type: "button", "aria-haspopup": "true", "aria-expanded": "false" });
  const obsCheck = checkbox(incObs, "obs", "obs_help", (v) => { incObs = v; ctx.settings.modeSet("worldmap", "incObs", v); afterScopeChange(); });
  const defactoCheck = checkbox(incDefacto, "defacto", "defacto_help", (v) => { incDefacto = v; ctx.settings.modeSet("worldmap", "incDefacto", v); afterScopeChange(); });
  const labelsBtn = el("button", { class: "btn", type: "button" });
  const resetBtn = el("button", { class: "btn", type: "button" });
  const hint = el("span", { class: "wm-hint" });
  ctx.toolbar.append(regionBtn, obsCheck, defactoCheck, labelsBtn, resetBtn, hint);

  function syncToolbar() {
    labelsBtn.textContent = labelsOn ? tt("names_on") : tt("names_off");
    regionBtn.textContent = selRegions.size ? tt("regions") + " (" + selRegions.size + ")" : tt("allRegions");
    resetBtn.textContent = tt("reset");
    hint.textContent = tt("hint");
  }
  syncToolbar();

  const regionPanel = el("div", { class: "wm-region-panel", hidden: true });
  host.append(regionPanel);
  function buildRegionPanel() {
    clear(regionPanel);
    regionPanel.append(el("label", { class: "wm-reg-all" }, [
      el("input", { type: "checkbox", checked: selRegions.size === 0, onChange: (e) => { if (e.target.checked) { selRegions.clear(); applyScope(); buildRegionPanel(); } } }),
      el("span", {}, tt("allRegions")),
    ]));
    REGION_GROUPS.forEach((g) => {
      const grp = el("div", { class: "wm-reg-group" });
      [g.key, ...g.subs].forEach((k, i) => {
        grp.append(el("label", { class: i === 0 ? "wm-reg-head" : "wm-reg-sub" }, [
          el("input", { type: "checkbox", checked: selRegions.has(k), onChange: (e) => { e.target.checked ? selRegions.add(k) : selRegions.delete(k); applyScope(); } }),
          el("span", {}, tt("reg_" + k)),
        ]));
      });
      regionPanel.append(grp);
    });
  }
  function toggleRegionPanel(open) { const show = open == null ? regionPanel.hidden : open; if (show) buildRegionPanel(); regionPanel.hidden = !show; regionBtn.setAttribute("aria-expanded", String(show)); }
  regionBtn.addEventListener("click", () => toggleRegionPanel(), { signal: ctx.signal });

  // ---- map ----
  const START = { center: [0, 24], zoom: 1.4 };
  const map = new maplibregl.Map({
    container: host, style: STYLE, center: START.center, zoom: START.zoom,
    minZoom: 0, maxZoom: 18, attributionControl: true, dragRotate: false,
    renderWorldCopies: true, // keep east-west panning possible (world wraps seamlessly)
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  if (maplibregl.GlobeControl) map.addControl(new maplibregl.GlobeControl(), "top-right");
  map.on("error", (e) => console.error("[worldmap]", e && e.error ? e.error : e));

  // Max dezoom (in 2D / Mercator) = the world fits the viewport width EXACTLY: the 180 meridian sits
  // pile on the left and right edges, no overflow. You can zoom in but never out past this. The world
  // is 512*2^zoom px wide, so the fit zoom is log2(W/512). Recomputed on every resize -> fully responsive.
  let fitT = 0;
  function fitMinZoom(snap) {
    const W = host.clientWidth; if (!W) return;
    const mz = Math.log2(W / 512);
    map.setMinZoom(mz);
    if (snap || map.getZoom() < mz) map.setZoom(mz);
  }
  map.on("load", () => fitMinZoom(false));
  map.on("resize", () => { clearTimeout(fitT); fitT = setTimeout(() => fitMinZoom(false), 30); });

  let unitsData = null;

  // recolour the OpenFreeMap basemap to the dark atlas palette (keeps all detail + cities)
  function recolorDark() {
    map.getStyle().layers.forEach((l) => {
      const sl = l["source-layer"] || "", id = l.id || "", src = l.source || "";
      const k = sl + " " + id + " " + src;
      try {
        // hide the noise: shaded relief, and landcover/landuse (forests, parks, residential) + their green outlines
        if (l.type === "raster" || l.type === "hillshade" || /shaded|hillshade|relief|terrain|ne2|landcover|landuse|\bpark\b|wood|forest|grass|wetland|scrub|sand|glacier|farmland|cemetery|aeroway/.test(k)) {
          map.setLayoutProperty(id, "visibility", "none"); return;
        }
        if (l.type === "background") map.setPaintProperty(id, "background-color", C.land); // base = land; water painted on top
        else if (l.type === "fill") {
          const water = /water|ocean|sea|bay|\briver\b/.test(sl) || /water/.test(id);
          const col = water ? C.ocean : (/building/.test(sl) ? C.building : C.land);
          map.setPaintProperty(id, "fill-color", col);
          try { map.setPaintProperty(id, "fill-outline-color", col); } catch (e) {} // kill stray green outlines
        } else if (l.type === "line") {
          if (/water|waterway/.test(sl)) map.setPaintProperty(id, "line-color", C.ocean);
          else if (/boundary|admin/.test(k)) map.setPaintProperty(id, "line-color", C.border);
          else map.setPaintProperty(id, "line-color", C.road);
        } else if (l.type === "fill-extrusion") { map.setPaintProperty(id, "fill-extrusion-color", C.building); }
        else if (l.type === "symbol") {
          map.setPaintProperty(id, "text-color", C.text);
          map.setPaintProperty(id, "text-halo-color", C.halo);
          map.setPaintProperty(id, "text-halo-width", 1.4);
        }
      } catch (e) {}
    });
  }
  function applyLabelLang() {
    const expr = ["coalesce", ["get", "name:" + getLang()], ["get", "name:latin"], ["get", "name"]];
    map.getStyle().layers.forEach((l) => { if (l.type === "symbol" && l.layout && l.layout["text-field"]) { try { map.setLayoutProperty(l.id, "text-field", expr); } catch (e) {} } });
  }
  function applyLabelVisibility() {
    map.getStyle().layers.forEach((l) => { if (l.type === "symbol") { try { map.setLayoutProperty(l.id, "visibility", labelsOn ? "visible" : "none"); } catch (e) {} } });
  }
  function applySelectionFilter() {
    const f = ["==", ["get", groupKey()], selectedGroup || "__none__"];
    ["wm-sel-fill", "wm-sel-line"].forEach((id) => { if (map.getLayer(id)) map.setFilter(id, f); });
  }
  function applyDefactoLayer() { if (map.getLayer("wm-defacto-line")) map.setLayoutProperty("wm-defacto-line", "visibility", incDefacto ? "visible" : "none"); }
  function applyScope() {
    ctx.settings.modeSet("worldmap", "regions", [...selRegions]);
    syncToolbar();
    if (map.getLayer("wm-dim")) {
      const inIds = [];
      (unitsData ? unitsData.features : []).forEach((ft) => { const g = ft.properties[groupKey()]; if (inScope(g) && inIds.indexOf(g) < 0) inIds.push(g); });
      map.setFilter("wm-dim", ["!", ["in", ["get", groupKey()], ["literal", inIds]]]);
    }
    if (selRegions.size) frameScope();
  }
  function frameScope() {
    if (!unitsData || !selRegions.size) return;
    let b = [180, 90, -180, -90];
    unitsData.features.forEach((ft) => { if (!inScope(ft.properties[groupKey()])) return; const walk = (c) => { if (typeof c[0] === "number") { if (c[0] < b[0]) b[0] = c[0]; if (c[1] < b[1]) b[1] = c[1]; if (c[0] > b[2]) b[2] = c[0]; if (c[1] > b[3]) b[3] = c[1]; } else c.forEach(walk); }; walk(ft.geometry.coordinates); });
    if (b[0] < b[2]) { try { map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 50, duration: 600, maxZoom: 6 }); } catch (e) {} }
  }
  function afterScopeChange() { applyDefactoLayer(); deselect(); applyScope(); }

  // locator boxes for the SMALL pieces of the SELECTED unit (e.g. Martinique when France is picked)
  function buildLocators(group) {
    let feats = [];
    if (group && unitsData) {
      // bbox of every polygon piece of this unit
      const boxes = [];
      unitsData.features.forEach((ft) => {
        if (ft.properties[groupKey()] !== group) return;
        const polys = ft.geometry.type === "Polygon" ? [ft.geometry.coordinates] : ft.geometry.coordinates;
        polys.forEach((poly) => {
          const ring = poly[0]; const b = [180, 90, -180, -90];
          for (const p of ring) { if (p[0] < b[0]) b[0] = p[0]; if (p[1] < b[1]) b[1] = p[1]; if (p[0] > b[2]) b[2] = p[0]; if (p[1] > b[3]) b[3] = p[1]; }
          boxes.push(b);
        });
      });
      // union-find: merge pieces that sit close together so a cluster of nearby islands = ONE box
      const GAP = 2.5, SMALL = 5, parent = boxes.map((_, i) => i);
      const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
      const near = (a, b) => a[0] - GAP <= b[2] && b[0] - GAP <= a[2] && a[1] - GAP <= b[3] && b[1] - GAP <= a[3];
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (near(boxes[i], boxes[j])) { const ri = find(i), rj = find(j); if (ri !== rj) parent[ri] = rj; }
      const clusters = {};
      boxes.forEach((bx, i) => { const r = find(i), c = clusters[r] || (clusters[r] = [180, 90, -180, -90]); if (bx[0] < c[0]) c[0] = bx[0]; if (bx[1] < c[1]) c[1] = bx[1]; if (bx[2] > c[2]) c[2] = bx[2]; if (bx[3] > c[3]) c[3] = bx[3]; });
      const arr = Object.values(clusters);
      let mainIdx = 0, mainArea = -1; // the unit's main landmass = biggest cluster, never boxed
      arr.forEach((c, i) => { const a = (c[2] - c[0]) * (c[3] - c[1]); if (a > mainArea) { mainArea = a; mainIdx = i; } });
      // box every SMALL, separated piece (skip the main landmass and huge dependencies like Greenland);
      // a tiny unitary state (Vatican, Monaco) still gets one box so you can find it
      feats = arr.filter((c, i) => { const span = Math.max(c[2] - c[0], c[3] - c[1]); return span < SMALL && (i !== mainIdx || span < 0.6); }).map((c) => {
        const pad = Math.max(Math.max(c[2] - c[0], c[3] - c[1]) * 0.25, 0.35);
        const x0 = c[0] - pad, y0 = c[1] - pad, x1 = c[2] + pad, y1 = c[3] + pad;
        return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] } };
      });
    }
    const src = map.getSource("wm-loc"); if (src) src.setData({ type: "FeatureCollection", features: feats });
  }

  function selectGroup(group) { selectedGroup = group; applySelectionFilter(); buildLocators(group); showInfo(group); const p = new URLSearchParams(); p.set("u", group); ctx.router.replace("worldmap", p); }
  function deselect() { selectedGroup = null; applySelectionFilter(); buildLocators(null); info.hidden = true; ctx.router.replace("worldmap", new URLSearchParams()); }

  function matchLabel(props) {
    if (!props) return null;
    for (const k of ["name:" + getLang(), "name:fr", "name:en", "name", "name:latin"]) { const v = props[k]; if (v && nameIndex[norm(v)]) return nameIndex[norm(v)]; }
    return null;
  }
  // nearest unit to a clicked point (safety net for islets too small even for 10m data)
  function nearestUnitGroup(point, maxDeg) {
    if (!unitsData) return null;
    const ll = map.unproject(point), px = ll.lng, py = ll.lat;
    let best = null, bestD = Infinity;
    for (const f of unitsData.features) {
      let d = Infinity;
      const walk = (c) => { if (typeof c[0] === "number") { const dx = c[0] - px, dy = c[1] - py, dd = dx * dx + dy * dy; if (dd < d) d = dd; } else c.forEach(walk); };
      walk(f.geometry.coordinates);
      if (d < bestD) { bestD = d; best = f.properties[groupKey()]; }
    }
    return Math.sqrt(bestD) <= maxDeg ? best : null;
  }
  function selectAt(point) {
    const box = [[point.x - 7, point.y - 7], [point.x + 7, point.y + 7]];
    const places = map.queryRenderedFeatures(box).filter((f) => f.sourceLayer === "place" && f.properties);
    // 1) clicking a COUNTRY NAME label selects that country (works for tiny ones like Andorra)
    for (const lf of places) { if (/country|sovereign/i.test(lf.properties.class || "")) { const id = matchLabel(lf.properties); if (id) { selectGroup(resolveGroup(id)); return; } } }
    // 2) the country/territory polygon under the click (every landmass in the 10m data is tagged to its state)
    let feats = map.queryRenderedFeatures(point, { layers: ["wm-fill"] });
    if (!feats.length && map.getLayer("wm-loc-fill")) feats = map.queryRenderedFeatures(point, { layers: ["wm-loc-fill"] });
    if (feats.length) { selectGroup(feats[0].properties[groupKey()]); return; }
    // 3) safety net: a labelled island/atoll (even clicking its lagoon), or any land, attaches to the nearest
    // country (an island's nearest land is its sovereign); open sea with no island nearby stays unselected.
    const isLand = places.some((f) => /island|islet|atoll|archipel|rock|reef|cay|peninsula/i.test(f.properties.class || ""));
    const onWater = map.queryRenderedFeatures(point).some((f) => f.sourceLayer === "water");
    const g = nearestUnitGroup(point, (isLand || !onWater) ? 999 : 2.5); // a labelled island or any land ALWAYS attaches to its nearest state
    if (g) { selectGroup(g); return; }
    deselect();
  }

  map.on("style.load", async () => {
    try { map.setProjection({ type: "globe" }); } catch (e) {}
    recolorDark();
    applyLabelLang();
    if (map.getSource("wm-units")) return;
    if (!unitsData) {
      try { unitsData = await (await fetch(UNITS, { signal: ctx.signal })).json(); }
      catch (e) { console.error("[worldmap] units load failed", e); loading.textContent = tt("loadErr"); return; }
    }
    if (ctx.signal.aborted) return;
    map.addSource("wm-units", { type: "geojson", data: unitsData });
    map.addSource("wm-loc", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
    const layers0 = map.getStyle().layers;
    const firstSymbol = (layers0.find((l) => l.type === "symbol") || {}).id;
    // the basemap water fill: we draw the selection UNDER it so the sea clips the orange to the real
    // coastline (no orange spilling into the ocean or sitting beside a mis-positioned tiny island)
    const waterId = (layers0.find((l) => l.type === "fill" && (/water|ocean|sea/.test((l["source-layer"] || "") + l.id))) || {}).id || firstSymbol;
    map.addLayer({ id: "wm-fill", type: "fill", source: "wm-units", paint: { "fill-color": "#000", "fill-opacity": 0 } }, firstSymbol);
    // selection fill + outline, drawn ABOVE water so every island of the unit is coloured (even where our
    // Natural-Earth outline doesn't exactly overlap the OSM basemap island). Below the labels.
    map.addLayer({ id: "wm-sel-fill", type: "fill", source: "wm-units", filter: ["==", ["get", "sov195"], "__none__"], paint: { "fill-color": C.sel, "fill-opacity": 0.85 } }, firstSymbol);
    map.addLayer({ id: "wm-sel-line", type: "line", source: "wm-units", filter: ["==", ["get", "sov195"], "__none__"], paint: { "line-color": C.selLine, "line-width": 1.4 } }, firstSymbol);
    map.addLayer({ id: "wm-dim", type: "fill", source: "wm-units", paint: { "fill-color": "#0a0f14", "fill-opacity": 0.5 }, filter: ["==", ["get", "sov"], "__none__"] }, waterId);
    // de-facto borders + locator boxes stay above the water so they remain visible as markers
    map.addLayer({ id: "wm-defacto-line", type: "line", source: "wm-units", filter: ["==", ["get", "cls"], "defacto"], layout: { visibility: incDefacto ? "visible" : "none" }, paint: { "line-color": C.defacto, "line-width": 1.8, "line-dasharray": [2, 1.5] } }, firstSymbol);
    const fade = ["interpolate", ["linear"], ["zoom"], 4.2, 1, 6, 0];
    // fill-opacity must be a top-level interpolate (zoom can't be nested under "*"): 0.16 -> 0 across z 4.2..6
    map.addLayer({ id: "wm-loc-fill", type: "fill", source: "wm-loc", paint: { "fill-color": C.loc, "fill-opacity": ["interpolate", ["linear"], ["zoom"], 4.2, 0.16, 6, 0] } }, firstSymbol);
    map.addLayer({ id: "wm-loc-line", type: "line", source: "wm-loc", paint: { "line-color": C.loc, "line-width": 1.6, "line-opacity": fade } }, firstSymbol);

    applyLabelVisibility();
    loading.remove();

    map.on("click", (e) => selectAt(e.point));
    const ptr = (on) => () => { map.getCanvas().style.cursor = on ? "pointer" : ""; };
    map.on("mousemove", "wm-fill", ptr(true)); map.on("mouseleave", "wm-fill", ptr(false));

    const u = ctx.params && ctx.params.get("u");
    if (u) selectGroup(u);
    applyScope();
  });

  labelsBtn.addEventListener("click", () => { labelsOn = !labelsOn; ctx.settings.modeSet("worldmap", "labels", labelsOn); syncToolbar(); applyLabelVisibility(); }, { signal: ctx.signal });
  resetBtn.addEventListener("click", () => { selRegions.clear(); toggleRegionPanel(false); applyScope(); map.easeTo({ center: START.center, zoom: START.zoom, duration: 600 }); }, { signal: ctx.signal });

  function relang() { syncToolbar(); if (!regionPanel.hidden) buildRegionPanel(); if (selectedGroup) showInfo(selectedGroup); try { applyLabelLang(); } catch (e) {} }
  function destroy() { try { map.remove(); } catch (e) {} }
  return { destroy, relang };
}
