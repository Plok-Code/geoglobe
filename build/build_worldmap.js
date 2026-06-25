// Build data/worldmap-units.geojson: a COMPLETE clickable overlay for the MapLibre world map.
// Every landmass on Earth becomes a polygon tagged with the "unit" it belongs to, so nothing is
// unclickable. Source geometry: world-atlas countries-50m (241 features = all land + dependencies).
//
// Each output feature carries:
//   sov     – grouping id in the 203-states view (de-facto states are their own unit)
//   sov195  – grouping id in the 195-official view (de-facto fold into the claimant state)
//   cls     – 'un' | 'observer' | 'defacto' | 'dependency'
//   nm      – English name of the polygon (for reference/labels)
//
// Run from repo root after `npm install` and after fetching the two sources:
//   curl -o _world50m.json https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json
//   curl -o _ne_10m_admin_0_disputed_areas.geojson https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_disputed_areas.geojson
//   node build/build_worldmap.js   (the _*.json/_*.geojson inputs are gitignored)
const fs = require("fs");
const path = require("path");
const tj = require("topojson-client");

const ROOT = path.resolve(__dirname, "..");
global.window = {};
new Function("window", fs.readFileSync(path.join(ROOT, "data", "answers.js"), "utf8"))(window);
const answers = window.COUNTRY_ANSWERS;
const topo = JSON.parse(fs.readFileSync(path.join(ROOT, "_world10m.json"), "utf8")); // world-atlas 10m (full); large coastlines are simplified in-build, small islands kept intact
const fc = tj.feature(topo, topo.objects.countries);

const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, " ").replace(/\b(the|of|and|saint|st)\b/g, "").trim().replace(/\s+/g, " ");
const byName = {};
answers.forEach((a) => { [a.name, a.name_fr].concat(a.aliases || [], a.aliases_fr || []).forEach((n) => { if (n) byName[norm(n)] = a; }); });

// world-atlas abbreviated names that ARE sovereign UN members (fix the name mismatch)
const ABBR = {
  "S. Sudan": "SSD", "Bosnia and Herz.": "BIH", "Central African Rep.": "CAF", "Dominican Rep.": "DOM",
  "Eq. Guinea": "GNQ", "Solomon Is.": "SLB", "Marshall Is.": "MHL", "Antigua and Barb.": "ATG", "St. Vin. and Gren.": "VCT",
};
// the 8 de-facto states: own unit in 203 mode, fold into the claimant in 195 mode
const DEFACTO = {
  "Taiwan":      { id: "TWN",  u195: "CHN" },
  "Kosovo":      { id: "KOS",  u195: "SRB" },
  "Somaliland":  { id: "SOL",  u195: "SOM" },
  "W. Sahara":   { id: "SAH",  u195: "MAR" },
  "N. Cyprus":   { id: "RTCN", u195: "CYP" },
  // Transnistria / Abkhazia / South Ossetia are not in world-atlas 50m — added from a separate source.
};
// dependencies -> their sovereign (clicking them highlights the sovereign + shows its capital)
const DEP = {
  "Greenland": "DNK", "Faeroe Is.": "DNK",
  "New Caledonia": "FRA", "Fr. Polynesia": "FRA", "St. Pierre and Miquelon": "FRA", "Wallis and Futuna Is.": "FRA",
  "St-Martin": "FRA", "St-Barthélemy": "FRA", "Fr. S. Antarctic Lands": "FRA",
  "Falkland Is.": "GBR", "Cayman Is.": "GBR", "Turks and Caicos Is.": "GBR", "British Virgin Is.": "GBR",
  "Anguilla": "GBR", "Montserrat": "GBR", "Bermuda": "GBR", "Isle of Man": "GBR", "Jersey": "GBR",
  "Guernsey": "GBR", "Saint Helena": "GBR", "Pitcairn Is.": "GBR", "S. Geo. and the Is.": "GBR", "Br. Indian Ocean Ter.": "GBR",
  "Puerto Rico": "USA", "Guam": "USA", "N. Mariana Is.": "USA", "U.S. Virgin Is.": "USA", "American Samoa": "USA",
  "Curaçao": "NLD", "Aruba": "NLD", "Sint Maarten": "NLD",
  "Cook Is.": "NZL", "Niue": "NZL",
  "Hong Kong": "CHN", "Macao": "CHN",
  "Norfolk Island": "AUS", "Indian Ocean Ter.": "AUS", "Ashmore and Cartier Is.": "AUS", "Heard I. and McDonald Is.": "AUS",
  "Åland": "FIN",
  "Siachen Glacier": "IND",
  // territories world-atlas 10m adds (kept clickable under their sovereign)
  "Gibraltar": "GBR", "Dhekelia": "GBR", "Akrotiri": "GBR",
  "Clipperton I.": "FRA", "Coral Sea Is.": "AUS", "U.S. Minor Outlying Is.": "USA",
  "Cyprus U.N. Buffer Zone": "CYP", "Baikonur": "KAZ", "USNB Guantanamo Bay": "CUB",
};
const OBSERVERS = new Set(["VAT", "PSE"]);

const r3 = (v) => Math.round(v * 1000) / 1000;
function perpDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2; t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
function dpSimplify(pts, eps) { // Douglas-Peucker, keeps endpoints
  if (pts.length < 3) return pts;
  const keep = new Array(pts.length).fill(false); keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop(); let maxD = 0, idx = -1;
    for (let i = s + 1; i < e; i++) { const d = perpDist(pts[i], pts[s], pts[e]); if (d > maxD) { maxD = d; idx = i; } }
    if (maxD > eps && idx > -1) { keep[idx] = true; stack.push([s, idx], [idx, e]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function roundPoly(poly) {
  const out = [];
  for (const ring of poly) {
    // only simplify LARGE rings (big coastlines); keep any landmass under ~1 degree wide at full detail so no island is ever lost
    let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
    for (const p of ring) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    const r = Math.max(x1 - x0, y1 - y0) > 1 ? dpSimplify(ring, 0.02) : ring;
    const rr = [];
    for (const pt of r) { const p = [r3(pt[0]), r3(pt[1])]; const last = rr[rr.length - 1]; if (!last || last[0] !== p[0] || last[1] !== p[1]) rr.push(p); }
    if (rr.length >= 4) out.push(rr);
  }
  return out.length ? out : null;
}
function roundGeom(g) {
  if (!g || !g.coordinates) return null;
  if (g.type === "Polygon") { const p = roundPoly(g.coordinates); return p ? { type: "Polygon", coordinates: p } : null; }
  const ps = g.coordinates.map(roundPoly).filter(Boolean);
  return ps.length ? { type: "MultiPolygon", coordinates: ps } : null;
}

// Split any polygon ring that crosses the antimeridian (a +179->-179 jump) into a west part (<=180)
// and an east part (>=180, shifted back by -360). Without this, MapLibre's globe fills such a polygon
// "the long way" across the sphere (the red arcs over the Arctic for Russia/Fiji).
function ringCrosses(ring) { for (let k = 0; k < ring.length; k++) if (Math.abs(ring[k][0] - ring[(k + 1) % ring.length][0]) > 180) return true; return false; }
function clipHalf(ring, cx, keepLeft) {
  const pts = ring.slice(0, (ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1]) ? ring.length - 1 : ring.length);
  const o = [];
  for (let i = 0; i < pts.length; i++) {
    const A = pts[i], B = pts[(i + 1) % pts.length];
    const Ain = keepLeft ? A[0] <= cx : A[0] >= cx, Bin = keepLeft ? B[0] <= cx : B[0] >= cx;
    if (Ain) o.push(A);
    if (Ain !== Bin) { const t = (cx - A[0]) / (B[0] - A[0]); o.push([cx, A[1] + t * (B[1] - A[1])]); }
  }
  if (o.length < 3) return null; o.push(o[0].slice()); return o;
}
function splitPolyAM(poly) {
  if (!ringCrosses(poly[0])) return [poly];
  const unwrapped = poly.map((ring) => ring.map((p) => [p[0] < 0 ? p[0] + 360 : p[0], p[1]]));
  const west = [], east = [];
  unwrapped.forEach((ring) => { const w = clipHalf(ring, 180, true); if (w) west.push(w); const e = clipHalf(ring, 180, false); if (e) east.push(e.map((p) => [r3(p[0] - 360), p[1]])); });
  const res = []; if (west.length) res.push(west); if (east.length) res.push(east);
  return res.length ? res : [poly];
}
function fixAntimeridian(geom) {
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  const outPolys = [];
  polys.forEach((p) => splitPolyAM(p).forEach((q) => outPolys.push(q)));
  return outPolys.length === 1 ? { type: "Polygon", coordinates: outPolys[0] } : { type: "MultiPolygon", coordinates: outPolys };
}

const out = [];
const unmapped = [];
for (const f of fc.features) {
  const nm = f.properties && f.properties.name;
  if (!nm || nm === "Antarctica") continue;
  let sov, sov195, cls;
  if (DEFACTO[nm]) { sov = DEFACTO[nm].id; sov195 = DEFACTO[nm].u195; cls = "defacto"; }
  else if (ABBR[nm]) { sov = sov195 = ABBR[nm]; cls = "un"; }
  else if (byName[norm(nm)]) {
    const a = byName[norm(nm)];
    sov = sov195 = a.iso3;
    cls = a.iso3 === "TWN" ? "defacto" : (OBSERVERS.has(a.iso3) ? "observer" : "un");
    if (a.iso3 === "TWN") sov195 = "CHN"; // safety (Taiwan also caught here)
  } else if (DEP[nm]) { sov = sov195 = DEP[nm]; cls = "dependency"; }
  else { sov = sov195 = "INTL"; cls = "intl"; unmapped.push(nm); } // no agreed sovereign -> "international territory", never dropped
  const geom = roundGeom(f.geometry);
  if (!geom) continue;
  out.push({ type: "Feature", properties: { sov, sov195, cls, nm }, geometry: geom });
}

// supplement: official sovereigns world-atlas drops at 50m (e.g. tiny Tuvalu) -> pull from our countries.js
new Function("window", fs.readFileSync(path.join(ROOT, "data", "countries.js"), "utf8"))(window);
const world = window.WORLD_GEOJSON;
const haveSov = new Set(out.map((f) => f.properties.sov));
for (const a of answers) {
  if (a.iso3 === "TWN" || haveSov.has(a.iso3)) continue;
  const feat = world.features.find((f) => f.properties.id === a.iso3);
  if (!feat) { console.log("STILL missing geometry for", a.iso3, a.name); continue; }
  const g = roundGeom(feat.geometry);
  if (g) { const cls = (a.iso3 === "VAT" || a.iso3 === "PSE") ? "observer" : "un"; out.push({ type: "Feature", properties: { sov: a.iso3, sov195: a.iso3, cls, nm: a.name }, geometry: g }); }
}
// the 3 remaining de-facto states from Natural Earth disputed areas (not in world-atlas)
const TRIO = { "Transnistria": { id: "PMR", u195: "MDA" }, "Abkhazia": { id: "ABK", u195: "GEO" }, "South Ossetia": { id: "SOS", u195: "GEO" } };
const ne = JSON.parse(fs.readFileSync(path.join(ROOT, "_ne_10m_admin_0_disputed_areas.geojson"), "utf8"));
for (const f of ne.features) {
  const b = f.properties.BRK_NAME;
  if (TRIO[b]) { const g = roundGeom(f.geometry); if (g) out.push({ type: "Feature", properties: { sov: TRIO[b].id, sov195: TRIO[b].u195, cls: "defacto", nm: b }, geometry: g }); }
}

// hollow each de-facto state out of its claimant's polygon. The 5 world-atlas de-facto states (Taiwan,
// Kosovo, ...) are already separate polygons so this is a no-op for them; Abkhazia / South Ossetia /
// Transnistria are overlaid on top of a claimant that still covers them, so subtract them out -> in the
// 203-states view selecting Georgia no longer colours the breakaways, and clicking one resolves to it.
const { hollowDefacto } = require("./hollow_defacto.js");
const hollowed = hollowDefacto(out);
console.log("hollowed de-facto out of claimants:", hollowed.changed.length ? hollowed.changed.sort().join(", ") : "(none)");

// split antimeridian-crossing polygons so the globe fill never wraps across the sphere
let splitCount = 0;
out.forEach((f) => { const before = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates.length : 1; f.geometry = fixAntimeridian(f.geometry); const after = f.geometry.type === "MultiPolygon" ? f.geometry.coordinates.length : 1; if (after > before) splitCount++; });
console.log("antimeridian-split features:", splitCount);

const gj = { type: "FeatureCollection", features: out };
const outPath = path.join(ROOT, "data", "worldmap-units.geojson");
fs.writeFileSync(outPath, JSON.stringify(gj), "utf8");

const sovs = new Set(out.map((f) => f.properties.sov));
const byCls = {};
out.forEach((f) => { byCls[f.properties.cls] = (byCls[f.properties.cls] || 0) + 1; });
console.log("wrote", outPath);
console.log("features:", out.length, "| distinct units (203-view sov):", sovs.size);
console.log("by class:", JSON.stringify(byCls));
console.log("de-facto units present:", [...sovs].filter((s) => ["TWN", "KOS", "SOL", "SAH", "RTCN", "PMR", "ABK", "SOS"].includes(s)).sort().join(", "));
if (unmapped.length) console.log("UNMAPPED (no unit assigned, dropped):", unmapped.join(" | "));
