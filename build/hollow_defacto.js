// Hollow de-facto states out of their claimant's polygon.
//
// Why: most de-facto states (Taiwan, Kosovo, Western Sahara, N. Cyprus, Somaliland) arrive as their
// OWN polygon in world-atlas, so the claimant's polygon is already "hollow" there. But Abkhazia, South
// Ossetia and Transnistria are overlaid from a separate source ON TOP of a claimant whose polygon still
// covers them (internationally they ARE part of Georgia / Moldova). That overlap made the 203-states
// view wrong: selecting Georgia coloured Abkhazia + South Ossetia, and clicking inside a breakaway
// region could even resolve to the parent. This subtracts every de-facto polygon from its claimant so
// ALL eight behave identically: own clickable unit when de-facto is ON, re-merged via `sov195` when OFF.
//
// Run standalone to fix the committed overlay in place:  node build/hollow_defacto.js
// Or import { hollowDefacto } and call it on the feature array inside build_worldmap.js.
const fs = require("fs");
const path = require("path");
const pc = require("polygon-clipping");

const r3 = (v) => Math.round(v * 1000) / 1000;

function bbox(geom) {
  let b = [180, 90, -180, -90];
  const w = (c) => { if (typeof c[0] === "number") { if (c[0] < b[0]) b[0] = c[0]; if (c[1] < b[1]) b[1] = c[1]; if (c[0] > b[2]) b[2] = c[0]; if (c[1] > b[3]) b[3] = c[1]; } else c.forEach(w); };
  w(geom.coordinates); return b;
}
const bboxHit = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];

// GeoJSON geometry <-> polygon-clipping "MultiPolygon" (Polygon[] = Ring[][])
const toMP = (g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates);

// signed-shoelace area of a polygon-clipping MultiPolygon (outer ring minus holes), always >= 0
function mpArea(mp) {
  let total = 0;
  for (const poly of mp) {
    for (let r = 0; r < poly.length; r++) {
      const ring = poly[r]; let s = 0;
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) s += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
      s = Math.abs(s / 2); total += r === 0 ? s : -s;
    }
  }
  return total;
}
// how much of `child` actually lies inside `parent`, as a fraction of the child's area.
// ~1 => the breakaway region sits inside its claimant (must hollow); ~0 => only a shared-border
// sliver from two mis-aligned sources (leave the claimant untouched).
function overlapRatio(parentMP, childMP) {
  const ca = mpArea(childMP); if (ca <= 0) return 0;
  const inter = pc.intersection(parentMP, childMP);
  return inter.length ? mpArea(inter) / ca : 0;
}
const OVERLAP_MIN = 0.5; // real containment scores >0.98 here; border slivers score <0.01
function fromMP(mp) {
  // round to the same 3-decimal grid as the rest of the build, drop degenerate rings
  const polys = [];
  for (const poly of mp) {
    const rings = [];
    for (const ring of poly) {
      const rr = [];
      for (const pt of ring) { const p = [r3(pt[0]), r3(pt[1])]; const last = rr[rr.length - 1]; if (!last || last[0] !== p[0] || last[1] !== p[1]) rr.push(p); }
      if (rr.length >= 4) rings.push(rr);
    }
    if (rings.length) polys.push(rings);
  }
  if (!polys.length) return null;
  return polys.length === 1 ? { type: "Polygon", coordinates: polys[0] } : { type: "MultiPolygon", coordinates: polys };
}

/**
 * Subtract each de-facto feature's polygon from its claimant's feature(s), in place.
 * No-op for de-facto states that already sit outside their claimant (Taiwan, Kosovo, ...).
 * @param {Array<{properties:{sov:string,sov195:string,cls:string,nm?:string}, geometry:object}>} features
 * @returns {{changed:string[]}} the claimant sov ids whose geometry was actually altered
 */
function hollowDefacto(features) {
  // claimant sov  ->  de-facto child features that claim to sit inside it (via sov195)
  const kidsByClaimant = {};
  for (const f of features) {
    if (f.properties.cls === "defacto" && f.properties.sov195 && f.properties.sov195 !== f.properties.sov) {
      (kidsByClaimant[f.properties.sov195] = kidsByClaimant[f.properties.sov195] || []).push(f);
    }
  }
  const changed = new Set();
  for (const f of features) {
    if (f.properties.cls === "defacto") continue;
    const kids = kidsByClaimant[f.properties.sov];
    if (!kids) continue;
    const pBox = bbox(f.geometry);
    let mp = toMP(f.geometry);
    let cut = false;
    for (const k of kids) {
      if (!bboxHit(pBox, bbox(k.geometry))) continue;        // can't overlap -> skip the clip
      const kMP = toMP(k.geometry);
      if (overlapRatio(mp, kMP) < OVERLAP_MIN) continue;     // already a separate polygon -> leave as-is
      mp = pc.difference(mp, kMP); cut = true;
      changed.add(f.properties.sov + "-" + k.properties.sov);
    }
    if (cut) { const g = fromMP(mp); if (g) f.geometry = g; } // only re-round geometry we actually changed
  }
  return { changed: [...changed] };
}

module.exports = { hollowDefacto };

if (require.main === module) {
  const file = process.argv[2] || path.join(__dirname, "..", "data", "worldmap-units.geojson");
  const gj = JSON.parse(fs.readFileSync(file, "utf8"));
  const { changed } = hollowDefacto(gj.features);
  fs.writeFileSync(file, JSON.stringify(gj), "utf8");
  console.log("hollowed", file);
  console.log("claimant-defacto pairs actually clipped:", changed.length ? changed.sort().join(", ") : "(none)");
}
