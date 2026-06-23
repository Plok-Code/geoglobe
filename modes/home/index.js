// @ts-check
// The hub: a searchable, grouped gallery of modes. The hub is itself a mode.
import { el, clear, injectCss } from "../../core/dom.js";
import { modes } from "../../core/modeRegistry.js";
import { findMode } from "../../core/modeRegistry.js";

function norm(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

/** @type {import('../../core/types.js').Mode} */
export default {
  id: "home",
  mount(ctx) {
    injectCss("home-css", "modes/home/home.css?v=1");
    const t = ctx.t;
    const hubModes = modes.filter((m) => m.hub);

    const root = el("div", { class: "home" });

    // Continue strip (restore last non-home route)
    const last = ctx.settings.get("lastRoute");
    const lastId = last && last.replace(/^#\/?/, "").split("?")[0];
    if (lastId && lastId !== "home" && findMode(lastId)) {
      root.append(el("a", { class: "continue", href: last }, [
        el("span", { class: "continue-label" }, t("home.continue")),
        el("span", { class: "continue-mode" }, t(findMode(lastId).labelKey)),
        el("span", { class: "continue-arrow", "aria-hidden": "true" }, "→"),
      ]));
    }

    root.append(el("h2", { class: "home-title" }, t("home.title")));

    // Search
    const search = el("input", {
      class: "home-search", type: "search", id: "home-search",
      placeholder: t("home.search"), "aria-label": t("home.search"),
      autocomplete: "off", spellcheck: "false",
    });
    root.append(el("div", { class: "home-search-wrap" }, [search]));

    const gallery = el("div", { class: "home-gallery" });
    root.append(gallery);
    const empty = el("p", { class: "home-empty", hidden: true }, t("home.noResult"));
    root.append(empty);

    // Group order follows first appearance in the registry.
    function render(query) {
      clear(gallery);
      const q = norm(query || "");
      const groups = new Map();
      let count = 0;
      hubModes.forEach((m) => {
        const label = t(m.labelKey), desc = m.descKey ? t(m.descKey) : "";
        if (q && norm(label + " " + desc).indexOf(q) === -1) return;
        count++;
        const g = m.group || "group.data";
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(m);
      });
      groups.forEach((list, g) => {
        const section = el("section", { class: "home-group" }, [
          el("h3", { class: "home-group-title" }, t(g)),
        ]);
        const grid = el("div", { class: "card-grid" });
        list.forEach((m) => {
          grid.append(el("a", { class: "mode-card", href: "#/" + m.id }, [
            el("span", { class: "card-icon", "aria-hidden": "true" }, iconFor(m.id)),
            el("span", { class: "card-text" }, [
              el("span", { class: "card-title" }, t(m.labelKey)),
              m.descKey ? el("span", { class: "card-desc" }, t(m.descKey)) : null,
            ]),
          ]));
        });
        section.append(grid);
        gallery.append(section);
      });
      empty.hidden = count > 0;
    }

    search.addEventListener("input", () => render(search.value), { signal: ctx.signal });
    render("");
    ctx.root.append(root);
  },
};

function iconFor(id) {
  return { learn: "🎓", explore: "🗺", "cigarette-tax": "🚬" }[id] || "▶";
}
