// @ts-check
// Tiny DOM helpers. No framework.

/**
 * Create an element. props.class, props.dataset, on* listeners, html, attributes.
 * @param {string} tag
 * @param {Object} [props]
 * @param {(Node|string|null|Array<Node|string|null>)} [children]
 */
export function el(tag, props = {}, children = []) {
  const n = document.createElement(tag);
  for (const k in props) {
    const v = props[k];
    if (v == null) continue;
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k === "dataset") Object.assign(n.dataset, v);
    else if (k === "style" && typeof v === "object") Object.assign(n.style, v);
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in n) { try { n[k] = v; } catch (e) { n.setAttribute(k, v); } }
    else n.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    n.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return n;
}

export function clear(node) { while (node && node.firstChild) node.removeChild(node.firstChild); }

/** Inject a mode stylesheet once (idempotent by id). Returns the <link>. */
export function injectCss(id, href) {
  let link = document.getElementById(id);
  if (!link) {
    link = el("link", { id, rel: "stylesheet", href });
    document.head.appendChild(link);
  }
  return link;
}

/** Subscribe to a media query; calls fn(matches) on change. Returns unsubscribe. */
export function onMedia(query, fn) {
  const mq = window.matchMedia(query);
  const handler = () => fn(mq.matches);
  mq.addEventListener("change", handler);
  return () => mq.removeEventListener("change", handler);
}
