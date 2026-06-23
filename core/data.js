// @ts-check
// Lazy dataset loader. Injects the existing globals (d3 + geojson + answers) on first use,
// prepares indexes and accepted answer sets, and caches the result.
import { rewind } from "../geo/geometry.js";
import { norm } from "./text.js";

const V = "11"; // data cache-buster (matches data/*.js?v=)
let geoCache = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Failed to load " + src));
    document.head.appendChild(s);
  });
}

export async function ensureD3() {
  if (!window.d3) await loadScript("vendor/d3.v7.min.js");
}

/** Load + prepare the geography dataset once. */
export async function loadGeo() {
  if (geoCache) return geoCache;
  await ensureD3();
  if (!window.WORLD_GEOJSON) await loadScript("data/countries.js?v=" + V);
  if (!window.COUNTRY_ANSWERS) await loadScript("data/answers.js?v=" + V);

  const world = window.WORLD_GEOJSON;
  const answers = window.COUNTRY_ANSWERS;
  if (!world || !answers) throw new Error("Geo data missing");
  rewind(world);

  const byId = {}, featureById = {}, acceptedName = {}, acceptedCap = {};
  answers.forEach((a) => {
    byId[a.iso3] = a;
    const n = Object.create(null);
    [a.name, a.name_fr].concat(a.aliases || [], a.aliases_fr || []).forEach((s) => { if (s) n[norm(s)] = true; });
    acceptedName[a.iso3] = n;
    const c = Object.create(null);
    [a.cap, a.cap_fr].concat(a.cap_alt || []).forEach((s) => { if (s) c[norm(s)] = true; });
    acceptedCap[a.iso3] = c;
  });
  world.features.forEach((f) => { featureById[f.properties.id] = f; });

  geoCache = { world, answers, byId, featureById, acceptedName, acceptedCap };
  return geoCache;
}

/** ISO3 ids belonging to a region key ('world' = all). */
export function idsForRegion(answers, region) {
  return answers
    .filter((a) => region === "world" || (a.regions && a.regions.indexOf(region) >= 0))
    .map((a) => a.iso3);
}
