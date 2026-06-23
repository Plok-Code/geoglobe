// Filters Natural Earth 10m to our target countries, merges multi-feature countries,
// computes a sensible "focus" bounding box per country (dominant landmass, antimeridian-aware),
// strips properties down to {id, name, focus}, and writes build/filtered.geojson + data/answers.js.
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const targets = JSON.parse(fs.readFileSync(path.join(__dirname, "countries.json"), "utf8"));
const FR = JSON.parse(fs.readFileSync(path.join(__dirname, "fr.json"), "utf8"));
const CAP = JSON.parse(fs.readFileSync(path.join(__dirname, "capitals.json"), "utf8"));
const REG = JSON.parse(fs.readFileSync(path.join(__dirname, "regions.json"), "utf8"));
const gj = JSON.parse(fs.readFileSync(path.join(__dirname, "ne_10m.geojson"), "utf8"));

// Manual focus overrides for tricky countries [minLng, minLat, maxLng, maxLat].
// Most are handled automatically; these are curated for archipelagos / dateline cases.
const FOCUS_OVERRIDES = {
  USA: [-126, 24, -66, 50],     // contiguous US
  FRA: [-6, 41, 10, 51.5],      // metropolitan France
  NLD: [3, 50.5, 7.5, 54],      // European Netherlands
  GBR: [-8.7, 49.8, 2, 59],     // include Northern Ireland
  RUS: [19, 41, 179, 78],       // main landmass
  KIR: [169, -12, 210, 8],      // spread across the Pacific (shifted past dateline)
  FJI: [176.5, -19.8, 182, -15.5], // grouped across dateline (shifted)
  NZL: [165, -48, 179.5, -33],  // main islands
  ECU: [-81.5, -5.5, -75, 1.8], // mainland (excl. Galapagos)
  CHL: [-76, -56, -66, -17],    // mainland strip
  ESP: [-9.5, 35.5, 4.5, 44],   // mainland (excl. Canaries)
  PRT: [-9.8, 36.8, -6, 42.3],  // mainland (excl. Azores/Madeira)
  NOR: [4, 57.5, 31.5, 71.5],   // mainland (excl. Svalbard)
  ZAF: [16, -35, 33, -22]       // exclude Prince Edward Is.
};

// Only these genuinely need their geometry shifted past the antimeridian so their
// scattered islands group together. Everything else stays at real coords.
const SHIFT_SET = new Set(["FJI", "KIR"]);

// ---- helpers ---------------------------------------------------------------
function ringArea(ring) {
  // planar shoelace on lng/lat (relative measure only)
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(a / 2);
}

function outerRings(geom) {
  if (geom.type === "Polygon") return [geom.coordinates[0]];
  if (geom.type === "MultiPolygon") return geom.coordinates.map((p) => p[0]);
  return [];
}

function allCoords(geom) {
  const out = [];
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys) for (const ring of poly) for (const pt of ring) out.push(pt);
  return out;
}

function shiftNegativeLng(geom) {
  // mutate: add 360 to any lng < 0 (to make dateline-crossing geometry contiguous)
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys) for (const ring of poly) for (const pt of ring) if (pt[0] < 0) pt[0] += 360;
}

function bboxOf(coords) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of coords) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

function computeFocus(geom) {
  // Non-mutating. Picks the dominant landmass, or the full extent for compact archipelagos.
  const rings = outerRings(geom);
  if (!rings.length) return null;
  const areas = rings.map(ringArea);
  const total = areas.reduce((s, a) => s + a, 0);
  let li = 0;
  for (let i = 1; i < areas.length; i++) if (areas[i] > areas[li]) li = i;
  const dominant = total > 0 && areas[li] / total >= 0.7;
  const largeBox = bboxOf(rings[li]);
  const fullBox = bboxOf(allCoords(geom));
  const fullW = fullBox[2] - fullBox[0];
  const fullH = fullBox[3] - fullBox[1];
  // compact multi-island country (Indonesia, Philippines, Japan, Malta...) -> show every part
  if (!dominant && fullW <= 160 && fullH <= 120) return fullBox;
  // dominant landmass, or a spread-out country (overrides cover the special cases) -> main piece
  return largeBox;
}

// Centroid of the largest-area ring -> a good [lng,lat] point to rotate the globe to.
// Manual overrides for spread/dateline countries where the largest ring isn't representative.
const CENTER_OVERRIDES = {
  USA: [-98, 39], FRA: [2.3, 47], NLD: [5.5, 52.2], RUS: [95, 62], KIR: [-157, 1.9],
  NZL: [172, -42], ECU: [-78.5, -1.5], CHL: [-71, -35], ESP: [-3.7, 40], PRT: [-8, 39.6],
  NOR: [9, 61], ZAF: [25, -29], CAN: [-106, 56], FJI: [178, -17.8]
};
function largestRingCentroid(geom) {
  const rings = outerRings(geom);
  if (!rings.length) return [0, 0];
  let li = 0, best = ringArea(rings[0]);
  for (let i = 1; i < rings.length; i++) { const a = ringArea(rings[i]); if (a > best) { best = a; li = i; } }
  const ring = rings[li];
  let x = 0, y = 0, a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const f = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    a += f; x += (ring[j][0] + ring[i][0]) * f; y += (ring[j][1] + ring[i][1]) * f;
  }
  a *= 0.5;
  if (!a) { const b = bboxOf(ring); return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]; }
  let lng = x / (6 * a), lat = y / (6 * a);
  while (lng > 180) lng -= 360; while (lng < -180) lng += 360;
  return [lng, lat];
}

// ---- resolve features to ISO3 ---------------------------------------------
const byIso = new Map(); // iso3 -> [features]
for (const f of gj.features) {
  const p = f.properties;
  let iso = p.ISO_A3_EH && p.ISO_A3_EH !== "-99" ? p.ISO_A3_EH : (p.ISO_A3 && p.ISO_A3 !== "-99" ? p.ISO_A3 : null);
  if (!iso) continue;
  if (!byIso.has(iso)) byIso.set(iso, []);
  byIso.get(iso).push(f);
}

const outFeatures = [];
const missing = [];
for (const t of targets) {
  const feats = byIso.get(t.iso3);
  if (!feats || !feats.length) {
    missing.push(`${t.iso3} (${t.name})`);
    continue;
  }
  // merge all polygons of all matching features into one MultiPolygon
  const polys = [];
  for (const f of feats) {
    const g = f.geometry;
    if (g.type === "Polygon") polys.push(g.coordinates);
    else if (g.type === "MultiPolygon") for (const pp of g.coordinates) polys.push(pp);
  }
  const geom = { type: "MultiPolygon", coordinates: polys };
  // Globe uses native spherical coords (no antimeridian shift). Compute a rotate-to center.
  let center = largestRingCentroid(geom);
  if (CENTER_OVERRIDES[t.iso3]) center = CENTER_OVERRIDES[t.iso3];
  center = center.map((v) => Math.round(v * 100) / 100);
  t.center = center;
  const fr = FR[t.iso3];
  if (!fr) { console.error("Missing FR name for " + t.iso3); process.exit(1); }
  t.name_fr = fr.name;
  t.aliases_fr = fr.aliases || [];
  const cap = CAP[t.iso3];
  if (!cap) { console.error("Missing capital for " + t.iso3); process.exit(1); }
  t.cap = cap.en;
  t.cap_fr = cap.fr || cap.en;
  t.cap_alt = cap.alt || [];
  const reg = REG[t.iso3];
  if (!reg) { console.error("Missing regions for " + t.iso3); process.exit(1); }
  t.regions = reg;
  let focus = computeFocus(geom);
  focus = focus.map((v) => Math.round(v * 1000) / 1000);
  t.focus = focus; // kept for reference; globe uses center
  outFeatures.push({
    type: "Feature",
    properties: { id: t.iso3 },
    geometry: geom
  });
}

if (missing.length) {
  console.error("MISSING COUNTRIES (" + missing.length + "):\n" + missing.join("\n"));
  process.exit(1);
}

const outGeo = { type: "FeatureCollection", features: outFeatures };
fs.writeFileSync(path.join(__dirname, "filtered.geojson"), JSON.stringify(outGeo));
console.log("Wrote filtered.geojson with", outFeatures.length, "countries.");

// answers.js consumed by the app
const answersJs = "window.COUNTRY_ANSWERS = " + JSON.stringify(targets) + ";\n";
fs.writeFileSync(path.join(ROOT, "data", "answers.js"), answersJs);
console.log("Wrote data/answers.js");
