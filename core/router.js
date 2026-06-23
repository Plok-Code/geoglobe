// @ts-check
// Hash router:  #/<modeId>?<params>
export function createRouter(onRoute) {
  function parse() {
    const h = location.hash.replace(/^#\/?/, "");
    const qi = h.indexOf("?");
    const id = (qi === -1 ? h : h.slice(0, qi)) || "home";
    const params = new URLSearchParams(qi === -1 ? "" : h.slice(qi + 1));
    return { id, params };
  }
  function build(id, params) {
    const q = params && [...params.keys()].length ? "?" + params.toString() : "";
    return "#/" + id + q;
  }
  function handle() { const r = parse(); onRoute(r.id, r.params); }
  return {
    get current() { return parse(); },
    navigate(id, params) { location.hash = build(id, params); },
    // Update state without a new history entry (for filter tweaks).
    replace(id, params) { history.replaceState(null, "", build(id, params)); handle(); },
    start() { window.addEventListener("hashchange", handle); handle(); },
  };
}
