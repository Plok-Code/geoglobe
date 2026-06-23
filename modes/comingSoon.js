// @ts-check
// Shared placeholder used by modes not yet implemented. Stateless, so safe to reuse.
import { el } from "../core/dom.js";

/** @type {import('../core/types.js').Mode} */
export default {
  id: "coming-soon",
  mount(ctx) {
    ctx.root.append(el("section", { class: "state-panel", tabindex: "-1" }, [
      el("p", { class: "muted" }, ctx.t("state.comingSoon")),
      el("a", { class: "btn primary", href: "#/" }, ctx.t("nav.home")),
    ]));
  },
};
