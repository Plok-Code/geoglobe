// Coverage test: does every bit of land on Earth resolve to a unit on our world map?
// Method: take world-atlas land-10m (all land), sample a global grid, keep points that fall ON land,
// and for each check whether it lands inside one of our overlay units (a direct click hit) or, if not,
// how far the nearest unit is (what the click safety-net would snap to). Land points whose nearest
// unit is far = real coverage gaps. Antarctica (lat < -60) is excluded on purpose (no unit for it).
//   curl -o _land10m.json https://cdn.jsdelivr.net/npm/world-atlas@2/land-10m.json
//   node build/coverage_test.js
const fs = require("fs");
const path = require("path");
const tj = require("topojson-client");
const ROOT = path.resolve(__dirname, "..");

const landTopo = JSON.parse(fs.readFileSync(path.join(ROOT, "_land10m.json"), "utf8"));
const land = tj.feature(landTopo, landTopo.objects.land);
const units = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "worldmap-units.geojson"), "utf8"));

// Drop the handful of antimeridian-crossing land polygons: their point-in-polygon test is unreliable
// and produces false "land" out in the ocean. They sit right on the dateline (a tiny under-test there).
function ringCrossesAM(r) { for (let k = 0; k < r.length; k++) if (Math.abs(r[k][0] - r[(k + 1) % r.length][0]) > 180) return true; return false; }
const landClean = [];
land.features.forEach((f) => { const ps = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates; ps.forEach((poly) => { if (!ringCrossesAM(poly[0])) landClean.push({ geometry: { type: "Polygon", coordinates: poly }, properties: {} }); }); });
land.features = landClean;

// ---- build polygon lists with bbox for fast point-in-polygon ----
function polysWithBbox(features, tag) {
  const list = [];
  features.forEach((f) => {
    const ps = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    ps.forEach((poly) => {
      const b = [180, 90, -180, -90];
      poly[0].forEach((p) => { if (p[0] < b[0]) b[0] = p[0]; if (p[1] < b[1]) b[1] = p[1]; if (p[0] > b[2]) b[2] = p[0]; if (p[1] > b[3]) b[3] = p[1]; });
      list.push({ poly, b, id: tag ? f.properties[tag] : null });
    });
  });
  return list;
}
const landPolys = polysWithBbox(land.features, null);
const unitPolys = polysWithBbox(units.features, "sov");

function inRing(x, y, r) { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const xi = r[i][0], yi = r[i][1], xj = r[j][0], yj = r[j][1]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) c = !c; } return c; }
function inPoly(x, y, poly) { if (!inRing(x, y, poly[0])) return false; for (let k = 1; k < poly.length; k++) if (inRing(x, y, poly[k])) return false; return true; }
function hit(x, y, list) { for (const p of list) { if (x < p.b[0] || x > p.b[2] || y < p.b[1] || y > p.b[3]) continue; if (inPoly(x, y, p.poly)) return p.id || true; } return null; }

// nearest unit by vertex distance (only for land points with no direct hit)
function nearestUnit(x, y) {
  let best = null, bestD = Infinity;
  for (const f of units.features) {
    const ps = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    let d = Infinity;
    for (const poly of ps) for (const r of poly) for (const p of r) { const dx = p[0] - x, dy = p[1] - y, dd = dx * dx + dy * dy; if (dd < d) d = dd; }
    if (d < bestD) { bestD = d; best = f.properties.sov; }
  }
  return { id: best, d: Math.sqrt(bestD) };
}

const STEP = 0.5;
let landPts = 0, direct = 0, near = 0, gaps = [];
for (let y = -56; y <= 83; y += STEP) {
  // latitude sweep: only polygons whose bbox spans this row (huge speedup)
  const aLand = landPolys.filter((p) => y >= p.b[1] && y <= p.b[3]);
  const aUnit = unitPolys.filter((p) => y >= p.b[1] && y <= p.b[3]);
  for (let x = -180; x < 180; x += STEP) {
    if (!hit(x, y, aLand)) continue;            // only test points that are ON land
    landPts++;
    if (hit(x, y, aUnit)) { direct++; continue; }  // direct click hit on a unit
    const n = nearestUnit(x, y);
    if (n.d <= 1) near++;                        // covered by the safety-net (adjacent country)
    else gaps.push({ x: +x.toFixed(2), y: +y.toFixed(2), nearest: n.id, d: +n.d.toFixed(2) });
  }
}

console.log("=== WORLD MAP LAND COVERAGE TEST (grid " + STEP + " deg, Antarctica excluded) ===");
console.log("land sample points:", landPts);
console.log("direct unit hit:    " + direct + "  (" + (100 * direct / landPts).toFixed(2) + "%)");
console.log("safety-net <=1deg:  " + near + "  (" + (100 * near / landPts).toFixed(2) + "%)");
console.log("GAPS (>1deg):        " + gaps.length + "  (" + (100 * gaps.length / landPts).toFixed(3) + "%)");
console.log("=> land that resolves to a country: " + (100 * (direct + near) / landPts).toFixed(3) + "%");
if (gaps.length) {
  const b = { "1-2": 0, "2-5": 0, "5-10": 0, ">10": 0 };
  gaps.forEach((g) => { b[g.d < 2 ? "1-2" : g.d < 5 ? "2-5" : g.d < 10 ? "5-10" : ">10"]++; });
  console.log("\ngap distance histogram:", JSON.stringify(b));
  gaps.sort((a, b) => a.d - b.d);
  console.log("closest gaps (most likely real missing land):");
  gaps.slice(0, 25).forEach((g) => console.log("  [" + g.x + ", " + g.y + "]  nearest " + g.nearest + " @ " + g.d + " deg"));
}
