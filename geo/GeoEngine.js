// @ts-check
// Reusable map engine: D3 orthographic globe + Natural Earth 2D map on canvas.
// Drag-rotate / pan, pinch + wheel zoom, tap picking (snap-to-nearest micro-state),
// animated framing, highlight + locator overlays. Mode-agnostic; emits events.
import { totalAreaEq, countrySpan, locatorZones, sphericalMean, AREA_THRESHOLD } from "./geometry.js?v=21";

const RAD = Math.PI / 180, DEG = 180 / Math.PI;
// Effectively unlimited zoom-in (vector map, no tiles needed) so you can dive into micro-states.
const MAX_GLOBE_ZOOM = 12000, MAX_MAP_ZOOM = 50000;

function versor(e) { var l = e[0] / 2 * RAD, sl = Math.sin(l), cl = Math.cos(l), p = e[1] / 2 * RAD, sp = Math.sin(p), cp = Math.cos(p), g = e[2] / 2 * RAD, sg = Math.sin(g), cg = Math.cos(g); return [cl * cp * cg + sl * sp * sg, sl * cp * cg - cl * sp * sg, cl * sp * cg + sl * cp * sg, cl * cp * sg - sl * sp * cg]; }
versor.cartesian = function (e) { var l = e[0] * RAD, p = e[1] * RAD, cp = Math.cos(p); return [cp * Math.cos(l), cp * Math.sin(l), Math.sin(p)]; };
versor.rotation = function (q) { return [Math.atan2(2 * (q[0] * q[1] + q[2] * q[3]), 1 - 2 * (q[1] * q[1] + q[2] * q[2])) * DEG, Math.asin(Math.max(-1, Math.min(1, 2 * (q[0] * q[2] - q[3] * q[1])))) * DEG, Math.atan2(2 * (q[0] * q[3] + q[1] * q[2]), 1 - 2 * (q[2] * q[2] + q[3] * q[3])) * DEG]; };
versor.delta = function (v0, v1) { var w = [v0[1] * v1[2] - v0[2] * v1[1], v0[2] * v1[0] - v0[0] * v1[2], v0[0] * v1[1] - v0[1] * v1[0]], l = Math.sqrt(w[0] * w[0] + w[1] * w[1] + w[2] * w[2]); if (!l) return [1, 0, 0, 0]; var tt = Math.acos(Math.max(-1, Math.min(1, v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2]))) / 2, s = Math.sin(tt); return [Math.cos(tt), w[2] / l * s, -w[1] / l * s, w[0] / l * s]; };
versor.multiply = function (q0, q1) { return [q0[0] * q1[0] - q0[1] * q1[1] - q0[2] * q1[2] - q0[3] * q1[3], q0[0] * q1[1] + q0[1] * q1[0] + q0[2] * q1[3] - q0[3] * q1[2], q0[0] * q1[2] - q0[1] * q1[3] + q0[2] * q1[0] + q0[3] * q1[1], q0[0] * q1[3] + q0[1] * q1[2] - q0[2] * q1[1] + q0[3] * q1[0]]; };

function normLng(l) { while (l > 180) l -= 360; while (l < -180) l += 360; return l; }

export class GeoEngine {
  constructor(container, opts) {
    const d3 = window.d3;
    this.d3 = d3;
    this.container = container;
    this.world = opts.world;
    this.byId = opts.byId;
    this.featureById = opts.featureById;
    this.allIds = this.world.features.map((f) => f.properties.id);
    // one-time lng/lat bbox per country, for fast off-screen culling on the 2D map
    this._fbox = {};
    this.world.features.forEach((f) => {
      let w = 180, s = 90, e = -180, n = -90;
      const walk = (c) => { if (typeof c[0] === "number") { if (c[0] < w) w = c[0]; if (c[0] > e) e = c[0]; if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1]; } else c.forEach(walk); };
      walk(f.geometry.coordinates);
      this._fbox[f.properties.id] = [w, s, e, n];
    });
    this.view = opts.view || "globe";
    this.palette = opts.palette || {};
    this.reducedMotion = !!opts.reducedMotion;
    this.monochrome = !!opts.monochrome;
    this.hlKey = opts.highlightColor === "select" ? "select" : "highlight";

    this.regionSet = null;       // {id:true} drawn-normal + pickable; null = all
    this.highlightId = null;
    this._locZones = [];
    this.framing = { kind: "region", ids: this.allIds };
    this.zoomFactor = 1; this.baseScale = 1; this.worldFitScale = 1;
    this.W = 0; this.H = 0; this.dpr = 1;

    this._handlers = {};
    this._anim = null; this._animFb = null;
    this._ptrs = new Map();
    this._tapStart = null; this._tapMoved = 0;
    this._pinch = null; this._panLast = null;
    this._dv0 = null; this._dq0 = null; this._dr0 = null;

    this.graticule = d3.geoGraticule10();
    this.canvas = document.createElement("canvas");
    this.canvas.className = "geo-canvas";
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext("2d");

    this._buildProjection();
    this._bindInput();
    this._onResize = () => this.resize();
    this._ro = new ResizeObserver(this._onResize);
    this._ro.observe(container);
    window.addEventListener("resize", this._onResize);
    this.resize();
    // The container may not have its final size on the first frame (mode just mounted).
    requestAnimationFrame(this._onResize);
    this._resizeT = setTimeout(this._onResize, 200);
  }

  // ---- events ----
  on(evt, fn) { (this._handlers[evt] || (this._handlers[evt] = new Set())).add(fn); return () => this._handlers[evt].delete(fn); }
  _emit(evt, payload) { if (this._handlers[evt]) this._handlers[evt].forEach((fn) => fn(payload)); }

  // ---- projection ----
  _buildProjection() {
    const d3 = this.d3;
    if (this.view === "globe") this.projection = d3.geoOrthographic().clipAngle(90).precision(0.4).rotate([-10, -18, 0]);
    else this.projection = d3.geoNaturalEarth1().precision(0.4);
    this.path = d3.geoPath(this.projection, this.ctx);
  }
  setView(view) {
    if (view === this.view) return;
    this.view = view;
    this.zoomFactor = 1;
    this._buildProjection();
    this.resize();
  }
  setPalette(palette) { this.palette = palette || this.palette; this.redraw(); }
  setReducedMotion(v) { this.reducedMotion = !!v; }
  setRegions(ids) {
    if (!ids) { this.regionSet = null; return; }
    this.regionSet = {}; ids.forEach((id) => { this.regionSet[id] = true; });
  }

  // ---- sizing + framing ----
  resize() {
    const c = this.container;
    this.W = c.clientWidth; this.H = c.clientHeight;
    if (!this.W || !this.H) return;
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(this.W * this.dpr);
    this.canvas.height = Math.round(this.H * this.dpr);
    this.canvas.style.width = this.W + "px";
    this.canvas.style.height = this.H + "px";
    if (this.view === "globe") {
      this.baseScale = Math.max(1, Math.min(this.W, this.H) / 2 - 8); // never <=0 (tiny/transient layouts) -> avoids a negative projection scale
      this.projection.translate([this.W / 2, this.H / 2]).scale(this.baseScale * this.zoomFactor);
    }
    this.worldFitScale = this.d3.geoNaturalEarth1().fitExtent([[6, 6], [this.W - 6, this.H - 6]], { type: "Sphere" }).scale();
    this._applyFraming(false);
  }

  _fc(ids) { return { type: "FeatureCollection", features: ids.map((id) => this.featureById[id]) }; }

  frameWorld(animate) { this.framing = { kind: "region", ids: this.allIds }; this._applyFraming(animate); }
  frameRegion(ids, animate) { this.framing = { kind: "region", ids: ids && ids.length ? ids : this.allIds }; this._applyFraming(animate); }
  frameCountry(id, animate) { this.framing = { kind: "country", id }; this._applyFraming(animate); }
  _applyFraming(animate) {
    if (this.framing.kind === "country") this._frameCountry(this.framing.id, animate);
    else this._frameRegion(this.framing.ids, animate);
  }
  _frameRegion(ids, animate) {
    if (!ids || !ids.length) ids = this.allIds;
    if (this.view === "map") {
      this.projection.fitExtent([[20, 20], [this.W - 20, this.H - 20]], this._fc(ids));
      this.redraw(); this._emit("frameend"); return;
    }
    const center = sphericalMean(ids.map((id) => this.byId[id].center));
    let maxA = 0;
    ids.forEach((id) => { const d = this.d3.geoDistance(center, this.byId[id].center) * DEG; if (d > maxA) maxA = d; });
    this.zoomFactor = Math.max(1, Math.min(4, 62 / Math.max(maxA, 16)));
    this.projection.scale(this.baseScale * this.zoomFactor);
    this._rotateTo(center, animate);
  }
  _frameCountry(id, animate) {
    if (this.view === "map") {
      this.projection.fitExtent([[40, 40], [this.W - 40, this.H - 40]], this.featureById[id]);
      if (this.projection.scale() > this.worldFitScale * 60) this.projection.scale(this.worldFitScale * 60);
      const sp = this.projection(this.byId[id].center), tr = this.projection.translate();
      if (sp && isFinite(sp[0])) this.projection.translate([tr[0] + (this.W / 2 - sp[0]), tr[1] + (this.H / 2 - sp[1])]);
      this.redraw(); this._emit("frameend"); return;
    }
    const span = countrySpan(this.featureById[id].geometry);
    this.zoomFactor = Math.max(1.1, Math.min(30, 26 / Math.max(span, 0.6)));
    this.projection.scale(this.baseScale * this.zoomFactor);
    this._rotateTo(this.byId[id].center, animate);
  }

  _stopAnim() { if (this._anim) { this._anim.stop(); this._anim = null; } if (this._animFb) { clearTimeout(this._animFb); this._animFb = null; } }
  _rotateTo(center, animate) {
    this._stopAnim();
    if (this.view !== "globe") { this.redraw(); return; }
    const r0 = this.projection.rotate();
    let t0 = -center[0]; const t1 = -center[1];
    while (t0 - r0[0] > 180) t0 -= 360; while (t0 - r0[0] < -180) t0 += 360;
    const p0 = r0[0], p1 = t0, q0 = r0[1], q1 = t1, g0 = r0[2] || 0, dur = 850;
    const finish = () => { this._stopAnim(); this.projection.rotate([normLng(p1), q1, 0]); this.redraw(); this._emit("frameend"); };
    if (!animate || this.reducedMotion) { finish(); return; }
    this._anim = this.d3.timer((el) => {
      const tt = Math.min(1, el / dur), e = tt < 0.5 ? 2 * tt * tt : -1 + (4 - 2 * tt) * tt;
      this.projection.rotate([p0 + (p1 - p0) * e, q0 + (q1 - q0) * e, g0 * (1 - e)]); this.redraw();
      if (tt >= 1) finish();
    });
    this._animFb = setTimeout(finish, dur + 80);
  }

  // ---- highlight / locators ----
  highlight(id) { this.highlightId = id; this._locZones = id ? locatorZones(this.featureById[id].geometry) : []; this.redraw(); }
  clearHighlight() { this.highlightId = null; this._locZones = []; this.redraw(); }
  setCursorPick(on) { this.canvas.classList.toggle("clickable", !!on); }

  // ---- geo queries ----
  size() { return { W: this.W, H: this.H }; }
  // How magnified vs a whole-world view (~1 = world, larger = zoomed in). Used to scale labels.
  zoomK() { return this.view === "globe" ? this.zoomFactor : (this.worldFitScale ? this.projection.scale() / this.worldFitScale : 1); }
  globeRadius() { return this.view === "globe" ? this.projection.scale() : Infinity; }
  project(lnglat) { return this.projection(lnglat); }
  invert(xy) { return this.projection.invert(xy); }
  isFrontFacing(lnglat) {
    if (this.view !== "globe") return true;
    const vc = this.projection.invert([this.W / 2, this.H / 2]);
    return vc && this.d3.geoDistance(vc, lnglat) < Math.PI / 2;
  }
  // On the 2D map, the lng/lat box currently on screen (null = draw everything: globe, or world view).
  _visibleSet() {
    if (this.view !== "map") return null;
    const inv = (p) => { const ll = this.projection.invert(p); return ll && isFinite(ll[0]) ? ll : null; };
    const cs = [inv([0, 0]), inv([this.W, 0]), inv([this.W, this.H]), inv([0, this.H]), inv([this.W / 2, this.H / 2])].filter(Boolean);
    if (cs.length < 3) return null;
    let w = 180, s = 90, e = -180, n = -90;
    cs.forEach((p) => { if (p[0] < w) w = p[0]; if (p[0] > e) e = p[0]; if (p[1] < s) s = p[1]; if (p[1] > n) n = p[1]; });
    if (e - w >= 300) return null; // most of the world visible -> culling pointless
    const mx = (e - w) * 0.25 + 1, my = (n - s) * 0.25 + 1;
    return [w - mx, s - my, e + mx, n + my];
  }
  _isVisible(id, vb) { if (!vb) return true; const b = this._fbox[id]; return !(b[2] < vb[0] || b[0] > vb[2] || b[3] < vb[1] || b[1] > vb[3]); }

  // ---- rendering ----
  redraw() {
    if (!this.W || !this.H) return;
    if (this.view === "globe") {
      // Clip to just beyond the visible cap so deep zoom only renders a tiny spherical patch
      // (not the whole hemisphere). This is what makes near-unlimited zoom fast.
      const s = this.projection.scale(), r = Math.min(this.W, this.H) / 2 + 40;
      this.projection.clipAngle(r >= s ? 90 : Math.min(90, Math.asin(r / s) * DEG * 1.3 + 0.4));
    }
    // Bound geoPath's adaptive resampling so the point count stays ~constant at any zoom.
    this.projection.precision(Math.max(0.3, this.projection.scale() * 0.0012));
    const ctx = this.ctx, path = this.path, P = this.palette, d3 = this.d3;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    ctx.fillStyle = P.space; ctx.fillRect(0, 0, this.W, this.H);

    ctx.beginPath(); path({ type: "Sphere" });
    if (this.view === "globe" && this.projection.scale() <= Math.max(this.W, this.H) * 3) {
      const rr = this.projection.scale(), cx = this.W / 2, cy = this.H / 2;
      const grad = ctx.createRadialGradient(cx - rr * 0.35, cy - rr * 0.4, rr * 0.1, cx, cy, rr * 1.05);
      grad.addColorStop(0, P.oceanLight || P.ocean); grad.addColorStop(1, P.ocean);
      ctx.fillStyle = grad;
    } else ctx.fillStyle = P.ocean; // flat ocean when zoomed in (avoids a multi-million-px gradient)
    ctx.fill();

    ctx.beginPath(); path(this.graticule); ctx.lineWidth = 0.5; ctx.strokeStyle = P.graticule; ctx.stroke();

    const vb = this._visibleSet(); // off-screen countries are skipped when zoomed into the 2D map
    if (this.regionSet) {
      const inF = [], outF = [];
      this.world.features.forEach((f) => { if (!this._isVisible(f.properties.id, vb)) return; (this.regionSet[f.properties.id] ? inF : outF).push(f); });
      ctx.beginPath(); path({ type: "FeatureCollection", features: outF }); ctx.fillStyle = P.landDim; ctx.fill();
      ctx.beginPath(); path({ type: "FeatureCollection", features: inF }); ctx.fillStyle = P.land; ctx.fill();
      ctx.lineWidth = 0.4; ctx.strokeStyle = P.border; ctx.stroke();
    } else {
      const feats = vb ? this.world.features.filter((f) => this._isVisible(f.properties.id, vb)) : this.world.features;
      ctx.beginPath(); path(vb ? { type: "FeatureCollection", features: feats } : this.world); ctx.fillStyle = P.land; ctx.fill();
      ctx.lineWidth = 0.4; ctx.strokeStyle = P.border; ctx.stroke();
    }

    if (this.highlightId && this.featureById[this.highlightId]) {
      ctx.beginPath(); path(this.featureById[this.highlightId]);
      ctx.fillStyle = P[this.hlKey] || P.highlight; ctx.fill();
      ctx.lineWidth = 1.6; ctx.strokeStyle = P[this.hlKey + "Edge"] || P.selectEdge || "#fff"; ctx.stroke();
    }
    // Locator: a FIXED screen-size box centered on a tiny country + an orange dot at its exact spot.
    // It does NOT scale with zoom (so it never blows up). As you zoom in, the country grows to fill
    // the box; once it occupies the box (LOC_FRACTION of the screen) the box is dropped and you see
    // the dot/country directly. The smaller the country, the more you must zoom before it vanishes.
    if (this._locZones.length) {
      const minWH = Math.min(this.W, this.H);
      const SIDE = Math.max(26, 0.05 * minWH), half = SIDE / 2; // smallest box that's still clearly visible
      const col = P.locator || P.highlight;
      for (let i = 0; i < this._locZones.length; i++) {
        const b = this._locZones[i], cLng = (b[0] + b[2]) / 2, cLat = (b[1] + b[3]) / 2;
        if (this.view === "globe" && !this.isFrontFacing([cLng, cLat])) continue;
        let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity, ok = true;
        const corners = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]];
        for (let c = 0; c < 4; c++) { const sp = this.projection(corners[c]); if (!sp || !isFinite(sp[0])) { ok = false; break; } if (sp[0] < minx) minx = sp[0]; if (sp[0] > maxx) maxx = sp[0]; if (sp[1] < miny) miny = sp[1]; if (sp[1] > maxy) maxy = sp[1]; }
        if (!ok) continue;
        const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, spanPx = Math.max(maxx - minx, maxy - miny);
        ctx.beginPath(); ctx.arc(cx, cy, 3, 0, 2 * Math.PI); ctx.fillStyle = col; ctx.fill(); // the orange spot
        if (spanPx >= SIDE) continue; // zoomed in enough: country fills the box -> no rectangle
        ctx.lineWidth = 2; ctx.strokeStyle = col; ctx.setLineDash([7, 5]);
        ctx.strokeRect(cx - half, cy - half, SIDE, SIDE);
        ctx.setLineDash([]);
      }
    }
    ctx.beginPath(); path({ type: "Sphere" }); ctx.lineWidth = 1; ctx.strokeStyle = P.sphereEdge; ctx.stroke();
  }

  // ---- input ----
  _pickList() { return this.regionSet ? Object.keys(this.regionSet) : this.allIds; }
  // Exact pick: you must click INSIDE the country's polygon (no centroid snap). Zoom in to click
  // tiny states precisely. A tiny 3px tolerance only covers sub-pixel rounding right on a border.
  _pickCountry(sx, sy) {
    const ids = this._pickList();
    const tries = [[sx, sy], [sx - 3, sy], [sx + 3, sy], [sx, sy - 3], [sx, sy + 3]];
    for (let t = 0; t < tries.length; t++) {
      const ll = this.projection.invert(tries[t]);
      if (!ll || !isFinite(ll[0])) continue;
      for (let j = 0; j < ids.length; j++) if (this.d3.geoContains(this.featureById[ids[j]], ll)) return ids[j];
    }
    return null;
  }
  _ptArr() { const a = []; this._ptrs.forEach((v) => a.push(v)); return a; }
  _beginSingle(x, y) {
    if (this.view === "globe") {
      const p = this.projection.invert([x, y]);
      this._dv0 = p && isFinite(p[0]) ? versor.cartesian(p) : null;
      this._dr0 = this.projection.rotate(); this._dq0 = versor(this._dr0);
    } else this._panLast = [x, y];
  }
  _singleMove(x, y) {
    if (this.view === "globe") {
      if (!this._dv0) return;
      const inv = this.projection.rotate(this._dr0).invert([x, y]);
      if (!inv || !isFinite(inv[0])) { this.projection.rotate(this._dr0); return; }
      this.projection.rotate(versor.rotation(versor.multiply(this._dq0, versor.delta(this._dv0, versor.cartesian(inv)))));
    } else {
      const tr = this.projection.translate();
      this.projection.translate([tr[0] + (x - this._panLast[0]), tr[1] + (y - this._panLast[1])]); this._panLast = [x, y];
    }
    this.redraw();
  }
  _beginPinch() {
    const p = this._ptArr();
    this._pinch = { dist: Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]) || 1, mid: [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2] };
    if (this.view === "globe") this._pinch.zoom0 = this.zoomFactor;
    else { this._pinch.scale0 = this.projection.scale(); this._pinch.geoMid = this.projection.invert(this._pinch.mid); }
  }
  _pinchMove() {
    const p = this._ptArr(); if (p.length < 2 || !this._pinch) return;
    const d = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]) || 1, ratio = d / this._pinch.dist;
    const m = [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2];
    if (this.view === "globe") {
      this.zoomFactor = Math.max(1, Math.min(MAX_GLOBE_ZOOM, this._pinch.zoom0 * ratio)); this.projection.scale(this.baseScale * this.zoomFactor);
    } else {
      const ns = Math.max(this.worldFitScale * 0.85, Math.min(this.worldFitScale * MAX_MAP_ZOOM, this._pinch.scale0 * ratio)); this.projection.scale(ns);
      if (this._pinch.geoMid && isFinite(this._pinch.geoMid[0])) { const p2 = this.projection(this._pinch.geoMid), tr = this.projection.translate(); this.projection.translate([tr[0] + (m[0] - p2[0]), tr[1] + (m[1] - p2[1])]); }
    }
    this.redraw();
  }
  _bindInput() {
    const cv = this.canvas;
    this._onWheel = (e) => {
      e.preventDefault();
      this._emit("viewstart");
      clearTimeout(this._wheelT); this._wheelT = setTimeout(() => this._emit("viewend"), 200);
      const k = e.deltaY < 0 ? 1.15 : 0.87;
      if (this.view === "globe") {
        this.zoomFactor = Math.max(1, Math.min(MAX_GLOBE_ZOOM, this.zoomFactor * k)); this.projection.scale(this.baseScale * this.zoomFactor); this.redraw();
      } else {
        const p = [e.offsetX, e.offsetY], ll = this.projection.invert(p);
        const ns = Math.max(this.worldFitScale * 0.85, Math.min(this.worldFitScale * MAX_MAP_ZOOM, this.projection.scale() * k));
        this.projection.scale(ns);
        if (ll && isFinite(ll[0])) { const p2 = this.projection(ll), tr = this.projection.translate(); this.projection.translate([tr[0] + (p[0] - p2[0]), tr[1] + (p[1] - p2[1])]); }
        this.redraw();
      }
    };
    this._onDown = (e) => {
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
      this._ptrs.set(e.pointerId, [e.offsetX, e.offsetY]);
      this._stopAnim(); cv.classList.add("grabbing");
      if (this._ptrs.size === 1) this._emit("viewstart");
      if (this._ptrs.size === 1) { this._tapStart = [e.offsetX, e.offsetY]; this._tapMoved = 0; this._beginSingle(e.offsetX, e.offsetY); }
      else if (this._ptrs.size === 2) { this._tapStart = null; this._beginPinch(); }
    };
    this._onMove = (e) => {
      if (!this._ptrs.has(e.pointerId)) return;
      const prev = this._ptrs.get(e.pointerId); this._ptrs.set(e.pointerId, [e.offsetX, e.offsetY]);
      if (this._ptrs.size >= 2) this._pinchMove();
      else { if (this._tapStart) this._tapMoved += Math.hypot(e.offsetX - prev[0], e.offsetY - prev[1]); this._singleMove(e.offsetX, e.offsetY); }
    };
    this._onUp = (e) => {
      if (!this._ptrs.has(e.pointerId)) return;
      const wasSingle = this._ptrs.size === 1;
      this._ptrs.delete(e.pointerId);
      try { cv.releasePointerCapture(e.pointerId); } catch (err) {}
      if (wasSingle && this._tapStart && this._tapMoved < 8) this._emit("pick", this._pickCountry(this._tapStart[0], this._tapStart[1]));
      this._tapStart = null;
      if (this._ptrs.size === 1) { const r = this._ptArr()[0]; this._beginSingle(r[0], r[1]); }
      else if (this._ptrs.size === 0) { this._pinch = null; cv.classList.remove("grabbing"); this._emit("viewend"); }
    };
    cv.addEventListener("wheel", this._onWheel, { passive: false });
    cv.addEventListener("pointerdown", this._onDown);
    cv.addEventListener("pointermove", this._onMove);
    cv.addEventListener("pointerup", this._onUp);
    cv.addEventListener("pointercancel", this._onUp);
  }

  destroy() {
    this._stopAnim();
    if (this._resizeT) clearTimeout(this._resizeT);
    if (this._wheelT) clearTimeout(this._wheelT);
    if (this._ro) this._ro.disconnect();
    window.removeEventListener("resize", this._onResize);
    const cv = this.canvas;
    cv.removeEventListener("wheel", this._onWheel);
    cv.removeEventListener("pointerdown", this._onDown);
    cv.removeEventListener("pointermove", this._onMove);
    cv.removeEventListener("pointerup", this._onUp);
    cv.removeEventListener("pointercancel", this._onUp);
    if (cv.parentNode) cv.parentNode.removeChild(cv);
    this._handlers = {};
  }
}
