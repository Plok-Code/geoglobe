// Lightweight patch: adds capitals + regions to the existing data/answers.js without the
// full geometry pipeline (used when the source NE geojson isn't present / disk is tight).
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");

const A = JSON.parse(
  fs.readFileSync(path.join(ROOT, "data", "answers.js"), "utf8")
    .replace(/^window\.COUNTRY_ANSWERS\s*=\s*/, "").replace(/;\s*$/, "")
);
const CAP = JSON.parse(fs.readFileSync(path.join(__dirname, "capitals.json"), "utf8"));
const REG = JSON.parse(fs.readFileSync(path.join(__dirname, "regions.json"), "utf8"));

const miss = [];
for (const a of A) {
  const c = CAP[a.iso3], r = REG[a.iso3];
  if (!c || !r) { miss.push(a.iso3); continue; }
  a.cap = c.en;
  a.cap_fr = c.fr || c.en;
  a.cap_alt = c.alt || [];
  a.regions = r;
}
if (miss.length) { console.error("missing capital/region:", miss.join(",")); process.exit(1); }

fs.writeFileSync(path.join(ROOT, "data", "answers.js"), "window.COUNTRY_ANSWERS=" + JSON.stringify(A) + ";\n");
console.log("patched", A.length, "countries with capitals + regions");
