// Validates the simplified geometry against answers, then writes data/countries.js if clean.
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

const geoTxt = fs.readFileSync(path.join(__dirname, "simplified.geojson"), "utf8");
const g = JSON.parse(geoTxt);
const answers = JSON.parse(
  fs.readFileSync(path.join(ROOT, "data", "answers.js"), "utf8")
    .replace(/^window\.COUNTRY_ANSWERS\s*=\s*/, "")
    .replace(/;\s*$/, "")
);
const filtered = JSON.parse(fs.readFileSync(path.join(__dirname, "filtered.geojson"), "utf8"));
const preCounts = new Map(filtered.features.map((f) => [f.properties.id, f.geometry.coordinates.length]));

function ringsOf(geom) {
  // returns array of rings (each ring = array of [lng,lat]); handles Polygon + MultiPolygon
  if (geom.type === "Polygon") return geom.coordinates;
  if (geom.type === "MultiPolygon") return geom.coordinates.flat();
  return [];
}
function polyCount(geom) {
  if (geom.type === "Polygon") return 1;
  if (geom.type === "MultiPolygon") return geom.coordinates.length;
  return 0;
}

const ansIds = new Set(answers.map((a) => a.iso3));
const geoIds = new Set(g.features.map((f) => f.properties.id));
const missGeo = [...ansIds].filter((x) => !geoIds.has(x));
const missAns = [...geoIds].filter((x) => !ansIds.has(x));

const probs = [];
const dropped = []; // lost most polygons during simplification
for (const f of g.features) {
  const id = f.properties.id;
  const rings = ringsOf(f.geometry);
  let pts = 0, bad = 0, shortRings = 0;
  let mnx = Infinity, mxx = -Infinity, mny = Infinity, mxy = -Infinity;
  for (const ring of rings) {
    if (ring.length < 4) shortRings++;
    for (const pt of ring) {
      pts++;
      const x = pt[0], y = pt[1];
      if (!Number.isFinite(x) || !Number.isFinite(y)) { bad++; continue; }
      if (x < mnx) mnx = x; if (x > mxx) mxx = x;
      if (y < mny) mny = y; if (y > mxy) mxy = y;
    }
  }
  if (!rings.length || pts === 0) probs.push(`${id}: empty geometry`);
  else if (bad > 0) probs.push(`${id}: ${bad} non-finite points`);
  else if (!Number.isFinite(mnx)) probs.push(`${id}: no valid coords`);
  else if (mxy > 85 || mny < -60) probs.push(`${id}: lat out of range ${mny.toFixed(1)}..${mxy.toFixed(1)}`);

  const pre = preCounts.get(id) || 0;
  const post = polyCount(f.geometry);
  if (pre >= 5 && post < pre * 0.5) dropped.push(`${id}: ${pre}->${post} polys`);
}

console.log("countries:", g.features.length);
console.log("missing in geo:", missGeo.join(",") || "none");
console.log("missing in answers:", missAns.join(",") || "none");
console.log("geometry problems:", probs.join(" | ") || "NONE");
console.log("polygon-loss warnings:", dropped.join(" | ") || "none");

if (!missGeo.length && !missAns.length && !probs.length) {
  fs.writeFileSync(path.join(ROOT, "data", "countries.js"), "window.WORLD_GEOJSON=" + geoTxt + ";\n");
  console.log("VALIDATION PASSED -> wrote data/countries.js (" + (geoTxt.length / 1024 | 0) + " KB)");
} else {
  console.log("VALIDATION FAILED - not written");
  process.exit(1);
}
