// @ts-check
// Greedy label placement with leader-line fallback for the atlas.
// Input items: { id, ax, ay, w, h, area, forced }. Big countries placed first (inline);
// colliders are pushed to the nearest free slot with a leader line; the rest are dropped
// (they reappear as you zoom in). Returns [{ id, x, y, leader:null|[ax,ay] }].
export function placeLabels(items, W, H, opts) {
  opts = opts || {};
  const pad = opts.pad != null ? opts.pad : 2;
  const margin = opts.margin != null ? opts.margin : 4;
  const maxR = opts.maxR != null ? opts.maxR : 140;
  const placed = [];
  const out = [];

  function hit(r) {
    for (let i = 0; i < placed.length; i++) {
      const p = placed[i];
      if (r.x < p.x + p.w + pad && p.x < r.x + r.w + pad && r.y < p.y + p.h + pad && p.y < r.y + r.h + pad) return true;
    }
    return false;
  }
  function clamp(x, y, w, h) {
    x = Math.max(margin, Math.min(W - margin - w, x));
    y = Math.max(margin, Math.min(H - margin - h, y));
    return [x, y];
  }

  const sorted = items.slice().sort((a, b) => (b.forced ? 1 : 0) - (a.forced ? 1 : 0) || b.area - a.area);

  for (let i = 0; i < sorted.length; i++) {
    const it = sorted[i], w = it.w, h = it.h;
    let inline = clamp(it.ax - w / 2, it.ay - h / 2, w, h);
    let r = { x: inline[0], y: inline[1], w, h };
    if (!hit(r)) { placed.push(r); out.push({ id: it.id, x: r.x, y: r.y, leader: null }); continue; }

    let found = null;
    const dirs = 12, stepR = Math.max(12, h * 0.7);
    for (let rad = Math.max(18, h); rad <= maxR && !found; rad += stepR) {
      for (let d = 0; d < dirs; d++) {
        const ang = (d / dirs) * 2 * Math.PI;
        const c = clamp(it.ax + Math.cos(ang) * rad - w / 2, it.ay + Math.sin(ang) * rad - h / 2, w, h);
        const rr = { x: c[0], y: c[1], w, h };
        if (!hit(rr)) { found = rr; break; }
      }
    }
    if (found) { placed.push(found); out.push({ id: it.id, x: found.x, y: found.y, leader: [it.ax, it.ay] }); }
    else if (it.forced) {
      placed.push(r);
      const moved = Math.hypot(r.x + w / 2 - it.ax, r.y + h / 2 - it.ay) > 6;
      out.push({ id: it.id, x: r.x, y: r.y, leader: moved ? [it.ax, it.ay] : null });
    }
    // otherwise dropped (declutter)
  }
  return out;
}
