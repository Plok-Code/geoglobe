// One-off: merge dependent-territory landmasses (Greenland, Western Sahara, ...) into their
// sovereign parent's feature in data/countries.js, sourced from world-atlas 50m.
// The 196-country set draws only sovereign states, so dependent territories that Natural Earth
// stores as separate features were absent (holes). This attaches each to its sovereign parent,
// drawn in the parent's colour and counting as the parent when clicked.
//
// Prereqs (from repo root):
//   npm install                       # topojson-client + d3-geo (devDependencies)
//   curl -o _world50m.json https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json
//   node build/merge_territories.js   # writes data/countries.js (+ a .bak), then bump V in core/data.js
//
// Each run only adds territories not already drawn (interior-coverage gated), so it is idempotent-ish;
// re-running on already-merged data would double a few polygons -> start from the .bak if re-merging.
const fs = require("fs");
const path = require("path");
const tj = require("topojson-client");

const ROOT = path.resolve(__dirname, "..");
const COUNTRIES = path.join(ROOT, "data", "countries.js");
const ATLAS = path.join(ROOT, "_world50m.json");

// territory (world-atlas `name`) -> sovereign parent ISO3 used by the game
const PARENT = {
  "Greenland": "DNK", "Faeroe Is.": "DNK",
  "W. Sahara": "MAR",
  "Somaliland": "SOM",
  "N. Cyprus": "CYP",
  "Kosovo": "SRB",
  "New Caledonia": "FRA", "Fr. Polynesia": "FRA", "St. Pierre and Miquelon": "FRA",
  "Wallis and Futuna Is.": "FRA", "St-Martin": "FRA", "St-Barthélemy": "FRA",
  "Falkland Is.": "GBR", "Cayman Is.": "GBR", "Turks and Caicos Is.": "GBR",
  "British Virgin Is.": "GBR", "Anguilla": "GBR", "Montserrat": "GBR", "Bermuda": "GBR",
  "Isle of Man": "GBR", "Jersey": "GBR", "Guernsey": "GBR", "Saint Helena": "GBR", "Pitcairn Is.": "GBR",
  "Puerto Rico": "USA", "Guam": "USA", "N. Mariana Is.": "USA", "U.S. Virgin Is.": "USA", "American Samoa": "USA",
  "Curaçao": "NLD", "Aruba": "NLD", "Sint Maarten": "NLD",
  "Cook Is.": "NZL", "Niue": "NZL",
  "Åland": "FIN",
  "Hong Kong": "CHN",
  "Norfolk Island": "AUS", "Indian Ocean Ter.": "AUS",
};

// ---- load game data ----
const raw = fs.readFileSync(COUNTRIES, "utf8");
const m = raw.match(/^window\.WORLD_GEOJSON=([\s\S]*);\s*$/);
if (!m) throw new Error("Unexpected countries.js format");
const world = JSON.parse(m[1]);
const featById = {};
world.features.forEach((f) => { featById[f.properties.id] = f; });

// ---- load world-atlas territories ----
const topo = JSON.parse(fs.readFileSync(ATLAS, "utf8"));
const fc = tj.feature(topo, topo.objects.countries);
const terrByName = {};
fc.features.forEach((f) => { if (f.properties && f.properties.name) terrByName[f.properties.name] = f; });

// ---- coverage test (is this territory already drawn by the game?) ----
const gpoly = [];
function addG(p) { const r = p[0]; const b = [180, 90, -180, -90]; for (const q of r) { if (q[0] < b[0]) b[0] = q[0]; if (q[1] < b[1]) b[1] = q[1]; if (q[0] > b[2]) b[2] = q[0]; if (q[1] > b[3]) b[3] = q[1]; } gpoly.push({ r, b }); }
world.features.forEach((f) => { const g = f.geometry; if (g.type === "Polygon") addG(g.coordinates); else if (g.type === "MultiPolygon") g.coordinates.forEach(addG); });
function inR(x, y, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c; } return c; }
function covered(x, y) { for (const p of gpoly) { if (x < p.b[0] || x > p.b[2] || y < p.b[1] || y > p.b[3]) continue; if (inR(x, y, p.r)) return true; } return false; }
function polysOf(geom) { return geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates; }
function inTerr(x, y, polys) { for (const poly of polys) { if (inR(x, y, poly[0])) { let hole = false; for (let k = 1; k < poly.length; k++) if (inR(x, y, poly[k])) { hole = true; break; } if (!hole) return true; } } return false; }
function coverageFraction(polys) {
  let b = [180, 90, -180, -90];
  polys.forEach((p) => p[0].forEach((q) => { if (q[0] < b[0]) b[0] = q[0]; if (q[1] < b[1]) b[1] = q[1]; if (q[0] > b[2]) b[2] = q[0]; if (q[1] > b[3]) b[3] = q[1]; }));
  const N = 40; let inside = 0, cov = 0;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const x = b[0] + (b[2] - b[0]) * i / N, y = b[1] + (b[3] - b[1]) * j / N;
    if (!inTerr(x, y, polys)) continue; inside++; if (covered(x, y)) cov++;
  }
  return inside ? cov / inside : 1;
}

// ---- round + clean a polygon (array of rings) ----
const r3 = (v) => Math.round(v * 1000) / 1000;
function cleanPoly(poly) {
  const out = [];
  for (const ring of poly) {
    const rr = [];
    for (const pt of ring) { const p = [r3(pt[0]), r3(pt[1])]; const last = rr[rr.length - 1]; if (!last || last[0] !== p[0] || last[1] !== p[1]) rr.push(p); }
    if (rr.length >= 4) out.push(rr);
  }
  return out.length ? out : null;
}

// ---- merge ----
function ensureMulti(feat) {
  if (feat.geometry.type === "Polygon") feat.geometry = { type: "MultiPolygon", coordinates: [feat.geometry.coordinates] };
}
const report = [];
for (const [name, parent] of Object.entries(PARENT)) {
  const terr = terrByName[name];
  if (!terr) { report.push([name, parent, "SKIP: not in atlas"]); continue; }
  const pf = featById[parent];
  if (!pf) { report.push([name, parent, "SKIP: parent not in game"]); continue; }
  const polys = polysOf(terr.geometry);
  const frac = coverageFraction(polys);
  if (frac > 0.4) { report.push([name, parent, `SKIP: already ${Math.round(frac * 100)}% drawn`]); continue; }
  const cleaned = polys.map(cleanPoly).filter(Boolean);
  if (!cleaned.length) { report.push([name, parent, "SKIP: degenerate after rounding"]); continue; }
  ensureMulti(pf);
  cleaned.forEach((p) => pf.geometry.coordinates.push(p));
  report.push([name, parent, `merged ${cleaned.length} polygon(s), ${cleaned.reduce((t, p) => t + p[0].length, 0)} pts`]);
}

// ---- write back (preserve wrapper + CRLF) ----
fs.writeFileSync(COUNTRIES + ".bak", raw, "utf8");
const outStr = "window.WORLD_GEOJSON=" + JSON.stringify(world) + ";\r\n";
fs.writeFileSync(COUNTRIES, outStr, "utf8");

console.log("Merged territories into data/countries.js (backup: data/countries.js.bak)\n");
report.forEach((r) => console.log("  " + r[0].padEnd(26) + " -> " + r[1] + "   " + r[2]));
console.log("\nfeatures:", world.features.length, " size:", outStr.length, "bytes (was", raw.length + ")");
