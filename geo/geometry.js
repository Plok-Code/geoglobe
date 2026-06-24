// @ts-check
// Pure geometry helpers used by the map engine. Depends on the global d3 (loaded by core/data).

export const AREA_THRESHOLD = 9; // deg^2 (equal-area-ish) below which a country gets locator rects
const ZONE_GAP = 3;

/** Natural Earth rings are GIS/clockwise; d3 spherical fill needs the right-hand rule. Run once. */
export function rewind(world) {
  if (world.__rewound) return;
  world.features.forEach(function (f) {
    var g = f.geometry, polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    for (var i = 0; i < polys.length; i++)
      if (window.d3.geoArea({ type: "Polygon", coordinates: [polys[i][0]] }) > 2 * Math.PI)
        for (var r = 0; r < polys[i].length; r++) polys[i][r].reverse();
  });
  world.__rewound = true;
}

export function outerRings(geom) {
  if (geom.type === "Polygon") return [geom.coordinates[0]];
  if (geom.type === "MultiPolygon") return geom.coordinates.map(function (p) { return p[0]; });
  return [];
}
export function ringBbox(ring) {
  var a = [Infinity, Infinity, -Infinity, -Infinity];
  for (var i = 0; i < ring.length; i++) {
    var x = ring[i][0], y = ring[i][1];
    if (x < a[0]) a[0] = x; if (x > a[2]) a[2] = x; if (y < a[1]) a[1] = y; if (y > a[3]) a[3] = y;
  }
  return a;
}
export function ringAreaEq(ring) {
  var s = 0, latSum = 0;
  for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    s += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]); latSum += ring[i][1];
  }
  return Math.abs(s / 2) * Math.cos((ring.length ? latSum / ring.length : 0) * Math.PI / 180);
}
export function totalAreaEq(geom) { var r = outerRings(geom), s = 0; for (var i = 0; i < r.length; i++) s += ringAreaEq(r[i]); return s; }
export function countrySpan(geom) {
  var r = outerRings(geom); if (!r.length) return 10;
  var li = 0, best = ringAreaEq(r[0]);
  for (var i = 1; i < r.length; i++) { var a = ringAreaEq(r[i]); if (a > best) { best = a; li = i; } }
  var b = ringBbox(r[li]); return Math.max(b[2] - b[0], b[3] - b[1]);
}

// ---- locator rectangles for tiny countries ----
function lngNear(a, b, gap) { var o = [0, 360, -360]; for (var i = 0; i < o.length; i++) if (a[0] - gap <= b[2] + o[i] && b[0] + o[i] - gap <= a[2]) return true; return false; }
function boxesNear(a, b, gap) { return a[1] - gap <= b[3] && b[1] - gap <= a[3] && lngNear(a, b, gap); }
function clusterBbox(members) {
  var n = members[0].slice();
  for (var i = 1; i < members.length; i++) { n[0] = Math.min(n[0], members[i][0]); n[1] = Math.min(n[1], members[i][1]); n[2] = Math.max(n[2], members[i][2]); n[3] = Math.max(n[3], members[i][3]); }
  if (n[2] - n[0] <= 180) return n;
  var w = Infinity, s = Infinity, e = -Infinity, nn = -Infinity;
  members.forEach(function (m) { var mw = m[0], me = m[2]; if (me < 0) { mw += 360; me += 360; } w = Math.min(w, mw); e = Math.max(e, me); s = Math.min(s, m[1]); nn = Math.max(nn, m[3]); });
  return [w, s, e, nn];
}
function computeZones(geom) {
  var boxes = outerRings(geom).map(ringBbox), n = boxes.length, parent = [];
  for (var i = 0; i < n; i++) parent[i] = i;
  function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  for (i = 0; i < n; i++) for (var j = i + 1; j < n; j++) if (boxesNear(boxes[i], boxes[j], ZONE_GAP)) { var ri = find(i), rj = find(j); if (ri !== rj) parent[ri] = rj; }
  var g = {}; for (i = 0; i < n; i++) { var r = find(i); (g[r] || (g[r] = [])).push(boxes[i]); }
  return Object.keys(g).map(function (k) { return clusterBbox(g[k]); });
}
function rectGeom(b) {
  var mx = Math.max((b[2] - b[0]) * 0.35, 3), my = Math.max((b[3] - b[1]) * 0.35, 3);
  var w = b[0] - mx, s = b[1] - my, e = b[2] + mx, n = b[3] + my, STEPS = 18, pts = [], i;
  for (i = 0; i <= STEPS; i++) pts.push([w + (e - w) * i / STEPS, s]);
  for (i = 0; i <= STEPS; i++) pts.push([e, s + (n - s) * i / STEPS]);
  for (i = 0; i <= STEPS; i++) pts.push([e + (w - e) * i / STEPS, n]);
  for (i = 0; i <= STEPS; i++) pts.push([w, n + (s - n) * i / STEPS]);
  return { type: "LineString", coordinates: pts };
}
/** Geographic bboxes [w,s,e,n] of a small country's zones; [] for large countries.
    The engine turns each into a fixed screen-size locator box. */
export function locatorZones(geom) {
  if (!geom || totalAreaEq(geom) >= AREA_THRESHOLD) return [];
  var zones = computeZones(geom);
  if (zones.length > 8) zones = [clusterBbox(zones)];
  return zones;
}

/** Spherical mean of [lng,lat] centers (handles antimeridian/world). */
export function sphericalMean(centers) {
  var x = 0, y = 0, z = 0;
  centers.forEach(function (c) {
    var l = c[0] * Math.PI / 180, p = c[1] * Math.PI / 180, cp = Math.cos(p);
    x += cp * Math.cos(l); y += cp * Math.sin(l); z += Math.sin(p);
  });
  return [Math.atan2(y, x) * 180 / Math.PI, Math.atan2(z, Math.sqrt(x * x + y * y)) * 180 / Math.PI];
}
