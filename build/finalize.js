// Splices full-detail geometry back for small island / micro states (where simplification
// would erase the islands that give the country its identity), validates everything,
// then writes data/countries.js.
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

// Keep full resolution for these: tiny archipelagos & micro-states. Cheap in bytes,
// but essential so e.g. Maldives/Kiribati show their full island chains.
const KEEP_FULL = new Set([
  "MDV", "SYC", "KIR", "MHL", "FSM", "TUV", "PLW", "TON", "BHS", "FJI", "VUT", "SLB",
  "MUS", "COM", "CPV", "STP", "NRU", "KNA", "LCA", "VCT", "ATG", "GRD", "DMA", "BRB",
  "MLT", "SGP", "BHR", "WSM", "VAT", "MCO", "SMR", "LIE", "AND"
]);

const simplified = JSON.parse(fs.readFileSync(path.join(__dirname, "simplified.geojson"), "utf8"));
const filtered = JSON.parse(fs.readFileSync(path.join(__dirname, "filtered.geojson"), "utf8"));
const fullById = new Map(filtered.features.map((f) => [f.properties.id, f.geometry]));

function roundGeom(geom) {
  // round full-detail coords to ~0.001 deg to keep bytes down
  const r = (v) => Math.round(v * 1000) / 1000;
  const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const poly of polys) for (const ring of poly) for (const pt of ring) { pt[0] = r(pt[0]); pt[1] = r(pt[1]); }
  return geom;
}

let spliced = 0;
for (const f of simplified.features) {
  if (KEEP_FULL.has(f.properties.id)) {
    f.geometry = roundGeom(JSON.parse(JSON.stringify(fullById.get(f.properties.id))));
    spliced++;
  }
}
console.log("spliced full-detail geometry for", spliced, "countries");

// ---- validate ----
const answers = JSON.parse(
  fs.readFileSync(path.join(ROOT, "data", "answers.js"), "utf8")
    .replace(/^window\.COUNTRY_ANSWERS\s*=\s*/, "").replace(/;\s*$/, "")
);
function ringsOf(geom) {
  if (geom.type === "Polygon") return geom.coordinates;
  if (geom.type === "MultiPolygon") return geom.coordinates.flat();
  return [];
}
const ansIds = new Set(answers.map((a) => a.iso3));
const geoIds = new Set(simplified.features.map((f) => f.properties.id));
const probs = [];
for (const f of simplified.features) {
  const rings = ringsOf(f.geometry);
  let pts = 0, bad = 0;
  for (const ring of rings) for (const pt of ring) { pts++; if (!Number.isFinite(pt[0]) || !Number.isFinite(pt[1])) bad++; }
  if (!rings.length || pts === 0) probs.push(`${f.properties.id}: empty`);
  else if (bad) probs.push(`${f.properties.id}: ${bad} bad pts`);
}
const missGeo = [...ansIds].filter((x) => !geoIds.has(x));
const missAns = [...geoIds].filter((x) => !ansIds.has(x));
console.log("missing in geo:", missGeo.join(",") || "none");
console.log("missing in answers:", missAns.join(",") || "none");
console.log("geometry problems:", probs.join(" | ") || "NONE");

if (missGeo.length || missAns.length || probs.length) {
  console.log("FAILED - not written"); process.exit(1);
}
const out = JSON.stringify(simplified);
fs.writeFileSync(path.join(ROOT, "data", "countries.js"), "window.WORLD_GEOJSON=" + out + ";\n");
console.log("OK -> data/countries.js (" + (out.length / 1024 | 0) + " KB)");
