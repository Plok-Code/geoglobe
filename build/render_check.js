// Headless SVG render of the world map using the same projection the app uses (geoNaturalEarth1),
// to visually verify geometry. Usage: node build/render_check.js <countries.js> <out.svg> [highlightISO,...]
const fs = require("fs");
const d3 = require("d3-geo");

const [, , src, out, hl] = process.argv;
const highlight = new Set((hl || "").split(",").filter(Boolean));

global.window = {};
new Function("window", fs.readFileSync(src, "utf8"))(window);
const world = window.WORLD_GEOJSON;

// same rewind the app applies at load (geo/geometry.js): NE rings are GIS/clockwise; d3 needs RHR
world.features.forEach((f) => {
  const g = f.geometry, polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  for (let i = 0; i < polys.length; i++)
    if (d3.geoArea({ type: "Polygon", coordinates: [polys[i][0]] }) > 2 * Math.PI)
      for (let r = 0; r < polys[i].length; r++) polys[i][r].reverse();
});

const W = 1000, H = 520;
const proj = d3.geoNaturalEarth1().fitExtent([[6, 6], [W - 6, H - 6]], { type: "Sphere" });
const path = d3.geoPath(proj);

const round = (d) => d.replace(/-?\d+\.\d+/g, (n) => (Math.round(n * 10) / 10).toString());
let body = `<rect width="${W}" height="${H}" fill="#0f1822"/>`;
body += `<path d="${round(path({ type: "Sphere" }))}" fill="#12222f"/>`;
for (const f of world.features) {
  const d = path(f.geometry);
  if (!d) continue;
  const on = highlight.has(f.properties.id);
  body += `<path d="${round(d)}" fill="${on ? "#e8b04b" : "#43617a"}" stroke="#0f1822" stroke-width="0.4"/>`;
}
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${body}</svg>`;
fs.writeFileSync(out, svg, "utf8");
console.log("wrote", out, "(" + world.features.length, "features)");
