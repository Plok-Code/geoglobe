// @ts-check
// Minimal observable store. Everything stateful in core is built on this.
export function createStore(init) {
  let state = init;
  const subs = new Set();
  return {
    get: () => state,
    set(patch) {
      state = typeof patch === "function" ? patch(state) : Object.assign({}, state, patch);
      subs.forEach((fn) => fn(state));
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
}
