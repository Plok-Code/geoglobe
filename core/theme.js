// @ts-check
// Theme + reduced-motion. Applies data-theme / data-reduced-motion on <html>,
// exposes canvas/map colors read from CSS tokens so the map matches the theme.
import { settings } from "./settings.js";
import { onMedia } from "./dom.js";

function resolveTheme(pref) {
  if (pref && pref !== "system") return pref;
  if (window.matchMedia("(prefers-contrast: more)").matches) return "hc";
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}
function resolveMotion(pref) {
  if (pref === "reduced") return true;
  if (pref === "full") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const subs = new Set();
function readVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

export const theme = {
  apply() {
    document.documentElement.setAttribute("data-theme", resolveTheme(settings.get("theme")));
    document.documentElement.toggleAttribute("data-reduced-motion", resolveMotion(settings.get("motion")));
    subs.forEach((fn) => fn());
  },
  get name() { return resolveTheme(settings.get("theme")); },
  get reducedMotion() { return resolveMotion(settings.get("motion")); },
  /** Map/canvas colors pulled from the active theme's CSS tokens. */
  mapPalette() {
    return {
      ocean: readVar("--map-ocean"),
      oceanLight: readVar("--map-ocean-light") || readVar("--map-ocean"),
      land: readVar("--map-land"),
      landDim: readVar("--map-land-dim"),
      border: readVar("--map-border"),
      select: readVar("--map-select"),
      selectEdge: readVar("--map-select-edge") || readVar("--map-select"),
      highlight: readVar("--map-highlight"),
      highlightEdge: readVar("--map-highlight-edge") || readVar("--map-select-edge"),
      locator: readVar("--map-locator") || readVar("--map-highlight"),
      graticule: readVar("--map-graticule"),
      sphereEdge: readVar("--map-sphere-edge"),
      space: readVar("--bg"),
    };
  },
  onChange(fn) { subs.add(fn); return () => subs.delete(fn); },
};

// Re-apply when the OS preference changes (only matters while on "system").
onMedia("(prefers-color-scheme: light)", () => theme.apply());
onMedia("(prefers-contrast: more)", () => theme.apply());
onMedia("(prefers-reduced-motion: reduce)", () => theme.apply());
