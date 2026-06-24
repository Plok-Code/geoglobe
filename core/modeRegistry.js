// @ts-check
// The ONLY file you edit to add a mode: one entry here + one folder under modes/.
// `map:true` modes get the shared GeoEngine in their context (wired in a later phase).
export const modes = [
  { id: "home", labelKey: "mode.home", map: false, hub: false, load: () => import("../modes/home/index.js") },
  { id: "learn", labelKey: "mode.learn", descKey: "mode.learn.desc", group: "group.learn", map: true, hub: true, load: () => import("../modes/learn/index.js?v=12") },
  { id: "explore", labelKey: "mode.explore", descKey: "mode.explore.desc", group: "group.explore", map: true, hub: true, load: () => import("../modes/explore/index.js?v=12") },
  { id: "worldmap", labelKey: "mode.worldmap", descKey: "mode.worldmap.desc", group: "group.explore", map: false, hub: true, load: () => import("../modes/worldmap/index.js?v=9") },
  { id: "cigarette-tax", labelKey: "mode.tax", descKey: "mode.tax.desc", group: "group.data", map: false, hub: true, load: () => import("../modes/cigarette-tax/index.js") },
];

export function findMode(id) { return modes.find((m) => m.id === id); }
