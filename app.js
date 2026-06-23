(function () {
  "use strict";

  // ---------------------------------------------------------------- data
  var ANSWERS = window.COUNTRY_ANSWERS || [];
  var GEO = window.WORLD_GEOJSON;
  if (!GEO || !ANSWERS.length || typeof d3 === "undefined") {
    document.body.innerHTML = "<p style='color:#fff;padding:24px;font-family:sans-serif'>" +
      "Failed to load. Make sure vendor/d3.v7.min.js, data/countries.js and data/answers.js are present.</p>";
    return;
  }

  var byId = {};
  ANSWERS.forEach(function (a) { byId[a.iso3] = a; });

  function norm(s) {
    return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/&/g, " and ").replace(/[._'’`\-]/g, " ").replace(/[^a-z0-9 ]/g, " ")
      .replace(/\bthe\b/g, " ").replace(/\s+/g, " ").trim();
  }
  function foldChar(c) { return c.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
  function isLetterOrDigit(c) { return /[a-z0-9]/.test(foldChar(c)); }

  // accepted normalized strings: country names (EN+FR) and capitals (EN+FR+alt)
  var acceptedName = {}, acceptedCap = {};
  ANSWERS.forEach(function (a) {
    var n = Object.create(null);
    [a.name, a.name_fr].concat(a.aliases || [], a.aliases_fr || []).forEach(function (s) { if (s) n[norm(s)] = true; });
    acceptedName[a.iso3] = n;
    var c = Object.create(null);
    [a.cap, a.cap_fr].concat(a.cap_alt || []).forEach(function (s) { if (s) c[norm(s)] = true; });
    acceptedCap[a.iso3] = c;
  });

  // ---------------------------------------------------------------- i18n
  var T = {
    en: {
      tagline: "Learn the world", langLabel: "Language", subjectLabel: "What to guess",
      modeLabel: "How to answer", viewLabel: "View", regionLabel: "Region",
      subjCountries: "Countries", subjCapitals: "Capitals", modeType: "Type", modeFind: "Click",
      viewGlobe: "Globe", viewMap: "2D map", play: "Play", progressLabel: "Country", score: "Score",
      guess: "Guess", next: "Next →", results: "See results →", tries: "Tries: ",
      wrongAgain: "Wrong, try again", wrongLast: "Wrong, last try", correct: "Correct: ", answer: "Answer: ",
      gameOver: "Game over", scored: "You scored", missed: "Missed", perfect: "Perfect game! 🎉",
      playAgain: "Play again", backToMenu: "Menu",
      phCountry: "Type the country...", phCapital: "Type the capital...",
      taskTypeCountry: "Which country is highlighted?", taskTypeCapital: "What is this country's capital?",
      taskFindCountry: "Find: ", taskFindCapital: "Which country's capital is ",
      toGlobe: "🌐 Globe", toMap: "🗺 2D map",
      reg_world: "World 🌍", reg_africa: "Africa", reg_americas: "Americas (all)",
      reg_north_america: "North America", reg_south_america: "South America", reg_asia: "Asia (all)",
      reg_asia_east: "East Asia", reg_asia_southeast: "Southeast Asia", reg_asia_south: "South Asia",
      reg_asia_central: "Central Asia", reg_middle_east: "Middle East", reg_europe: "Europe (all)",
      reg_europe_west: "Western Europe", reg_europe_east: "Eastern Europe", reg_oceania: "Oceania",
      grpAmericas: "Americas", grpAsia: "Asia", grpEurope: "Europe"
    },
    fr: {
      tagline: "Apprends le monde", langLabel: "Langue", subjectLabel: "À deviner",
      modeLabel: "Comment répondre", viewLabel: "Affichage", regionLabel: "Région",
      subjCountries: "Pays", subjCapitals: "Capitales", modeType: "Écrire", modeFind: "Cliquer",
      viewGlobe: "Globe", viewMap: "Carte 2D", play: "Jouer", progressLabel: "Pays", score: "Score",
      guess: "Valider", next: "Suivant →", results: "Voir les résultats →", tries: "Essais : ",
      wrongAgain: "Faux, réessaie", wrongLast: "Faux, dernier essai", correct: "Correct : ", answer: "Réponse : ",
      gameOver: "Partie terminée", scored: "Score :", missed: "Ratés", perfect: "Sans-faute ! 🎉",
      playAgain: "Rejouer", backToMenu: "Menu",
      phCountry: "Tape le pays...", phCapital: "Tape la capitale...",
      taskTypeCountry: "Quel est ce pays ?", taskTypeCapital: "Quelle est la capitale de ce pays ?",
      taskFindCountry: "Trouve : ", taskFindCapital: "Quel pays a pour capitale ",
      toGlobe: "🌐 Globe", toMap: "🗺 Carte 2D",
      reg_world: "Monde 🌍", reg_africa: "Afrique", reg_americas: "Amériques (toutes)",
      reg_north_america: "Amérique du Nord", reg_south_america: "Amérique du Sud", reg_asia: "Asie (toute)",
      reg_asia_east: "Asie de l'Est", reg_asia_southeast: "Asie du Sud-Est", reg_asia_south: "Asie du Sud",
      reg_asia_central: "Asie centrale", reg_middle_east: "Moyen-Orient", reg_europe: "Europe (toute)",
      reg_europe_west: "Europe de l'Ouest", reg_europe_east: "Europe de l'Est", reg_oceania: "Océanie",
      grpAmericas: "Amériques", grpAsia: "Asie", grpEurope: "Europe"
    }
  };

  var config = { lang: "en", subject: "countries", mode: "type", view: "globe", region: "world" };
  try {
    var saved = JSON.parse(localStorage.getItem("geoglobe-config") || "{}");
    ["lang", "subject", "mode", "view", "region"].forEach(function (k) { if (saved[k]) config[k] = saved[k]; });
  } catch (e) {}
  function saveConfig() { try { localStorage.setItem("geoglobe-config", JSON.stringify(config)); } catch (e) {} }
  function t(k) { return T[config.lang][k]; }
  function displayName(id) { return config.lang === "fr" ? byId[id].name_fr : byId[id].name; }
  function capName(id) { return config.lang === "fr" ? byId[id].cap_fr : byId[id].cap; }

  // ---------------------------------------------------------------- geometry helpers
  var featureById = {};
  GEO.features.forEach(function (f) { featureById[f.properties.id] = f; });
  var ALL_FC = { type: "FeatureCollection", features: GEO.features };

  // Natural Earth rings are GIS/clockwise; d3 spherical fill needs right-hand rule.
  (function rewind() {
    GEO.features.forEach(function (f) {
      var g = f.geometry, polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
      for (var i = 0; i < polys.length; i++)
        if (d3.geoArea({ type: "Polygon", coordinates: [polys[i][0]] }) > 2 * Math.PI)
          for (var r = 0; r < polys[i].length; r++) polys[i][r].reverse();
    });
  })();

  function outerRings(geom) {
    if (geom.type === "Polygon") return [geom.coordinates[0]];
    if (geom.type === "MultiPolygon") return geom.coordinates.map(function (p) { return p[0]; });
    return [];
  }
  function ringBbox(ring) {
    var a = [Infinity, Infinity, -Infinity, -Infinity];
    for (var i = 0; i < ring.length; i++) {
      var x = ring[i][0], y = ring[i][1];
      if (x < a[0]) a[0] = x; if (x > a[2]) a[2] = x; if (y < a[1]) a[1] = y; if (y > a[3]) a[3] = y;
    }
    return a;
  }
  function ringAreaEq(ring) {
    var s = 0, latSum = 0;
    for (var i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      s += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]); latSum += ring[i][1];
    }
    return Math.abs(s / 2) * Math.cos((ring.length ? latSum / ring.length : 0) * Math.PI / 180);
  }
  function totalAreaEq(geom) { var r = outerRings(geom), s = 0; for (var i = 0; i < r.length; i++) s += ringAreaEq(r[i]); return s; }
  function countrySpan(geom) {
    var r = outerRings(geom); if (!r.length) return 10;
    var li = 0, best = ringAreaEq(r[0]);
    for (var i = 1; i < r.length; i++) { var a = ringAreaEq(r[i]); if (a > best) { best = a; li = i; } }
    var b = ringBbox(r[li]); return Math.max(b[2] - b[0], b[3] - b[1]);
  }

  // ---- locator rectangles (small countries) ----
  var AREA_THRESHOLD = 9, ZONE_GAP = 3;
  function lngNear(a, b, gap) { var o = [0, 360, -360]; for (var i = 0; i < o.length; i++) if (a[0] - gap <= b[2] + o[i] && b[0] + o[i] - gap <= a[2]) return true; return false; }
  function boxesNear(a, b, gap) { return a[1] - gap <= b[3] && b[1] - gap <= a[3] && lngNear(a, b, gap); }
  function clusterBbox(members) {
    var n = members[0].slice(); for (var i = 1; i < members.length; i++) { n[0] = Math.min(n[0], members[i][0]); n[1] = Math.min(n[1], members[i][1]); n[2] = Math.max(n[2], members[i][2]); n[3] = Math.max(n[3], members[i][3]); }
    if (n[2] - n[0] <= 180) return n;
    var w = Infinity, s = Infinity, e = -Infinity, nn = -Infinity;
    members.forEach(function (m) { var mw = m[0], me = m[2]; if (me < 0) { mw += 360; me += 360; } w = Math.min(w, mw); e = Math.max(e, me); s = Math.min(s, m[1]); nn = Math.max(nn, m[3]); });
    return [w, s, e, nn];
  }
  function computeZones(geom) {
    var boxes = outerRings(geom).map(ringBbox), n = boxes.length, parent = [];
    for (var i = 0; i < n; i++) parent[i] = i;
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    for (i = 0; i < n; i++) for (var j = i + 1; j < n; j++) if (boxesNear(boxes[i], boxes[j], ZONE_GAP)) { var ri = find(i), rj = find(j); if (ri !== rj) parent[ri] = rj; }
    var g = {}; for (i = 0; i < n; i++) { var r = find(i); (g[r] || (g[r] = [])).push(boxes[i]); }
    return Object.keys(g).map(function (k) { return clusterBbox(g[k]); });
  }
  function rectGeom(b) {
    var mx = Math.max((b[2] - b[0]) * 0.35, 3), my = Math.max((b[3] - b[1]) * 0.35, 3);
    var w = b[0] - mx, s = b[1] - my, e = b[2] + mx, n = b[3] + my, STEPS = 18, pts = [], i;
    for (i = 0; i <= STEPS; i++) pts.push([w + (e - w) * i / STEPS, s]);
    for (i = 0; i <= STEPS; i++) pts.push([e, s + (n - s) * i / STEPS]);
    for (i = 0; i <= STEPS; i++) pts.push([e + (w - e) * i / STEPS, n]);
    for (i = 0; i <= STEPS; i++) pts.push([w, n + (s - n) * i / STEPS]);
    return { type: "LineString", coordinates: pts };
  }
  function computeLocators(id) {
    var f = featureById[id], out = [];
    if (!f || totalAreaEq(f.geometry) >= AREA_THRESHOLD) return out;
    var zones = computeZones(f.geometry);
    if (zones.length > 8) zones = [clusterBbox(zones)];
    for (var i = 0; i < zones.length; i++) out.push(rectGeom(zones[i]));
    return out;
  }

  // ---------------------------------------------------------------- rendering
  var COL = {
    space: "#0a0e14", ocean: "#16384c", oceanLight: "#23586f",
    land: "#46586a", landDim: "#2c3742", border: "#2b3a48",
    amber: "#ffb703", amberEdge: "#ffe7a8", gold: "#ffd24a",
    grat: "rgba(255,255,255,0.07)", sphereEdge: "rgba(165,205,235,0.28)"
  };
  var mapEl = document.getElementById("map");
  var canvas = document.createElement("canvas");
  canvas.className = "globe-canvas";
  mapEl.appendChild(canvas);
  var ctx = canvas.getContext("2d");
  var graticule = d3.geoGraticule10();

  var projection, path, W = 0, H = 0, dpr = 1, baseScale = 1, zoomFactor = 1;
  var highlightId = null, locators = [], regionSet = null, worldFitScale = 1;

  function buildProjection() {
    if (config.view === "globe") projection = d3.geoOrthographic().clipAngle(90).precision(0.4).rotate([-10, -18, 0]);
    else projection = d3.geoNaturalEarth1().precision(0.4);
    path = d3.geoPath(projection, ctx);
  }
  buildProjection();

  function resize() {
    W = mapEl.clientWidth; H = mapEl.clientHeight;
    if (!W || !H) return;
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    if (config.view === "globe") { baseScale = Math.min(W, H) / 2 - 8; projection.translate([W / 2, H / 2]).scale(baseScale * zoomFactor); }
    var fit = d3.geoNaturalEarth1().fitExtent([[6, 6], [W - 6, H - 6]], { type: "Sphere" });
    worldFitScale = fit.scale();
    applyFraming(false);
  }

  function render() {
    if (!W || !H) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = COL.space; ctx.fillRect(0, 0, W, H);
    // sphere / ocean
    ctx.beginPath(); path({ type: "Sphere" });
    if (config.view === "globe") {
      var rr = projection.scale(), cx = W / 2, cy = H / 2;
      var grad = ctx.createRadialGradient(cx - rr * 0.35, cy - rr * 0.4, rr * 0.1, cx, cy, rr * 1.05);
      grad.addColorStop(0, COL.oceanLight); grad.addColorStop(1, COL.ocean);
      ctx.fillStyle = grad;
    } else ctx.fillStyle = COL.ocean;
    ctx.fill();
    // graticule
    ctx.beginPath(); path(graticule); ctx.lineWidth = 0.5; ctx.strokeStyle = COL.grat; ctx.stroke();
    // countries: dim out-of-region, normal in-region
    if (regionSet) {
      var inFC = { type: "FeatureCollection", features: [] }, outFC = { type: "FeatureCollection", features: [] };
      GEO.features.forEach(function (f) { (regionSet[f.properties.id] ? inFC : outFC).features.push(f); });
      ctx.beginPath(); path(outFC); ctx.fillStyle = COL.landDim; ctx.fill();
      ctx.beginPath(); path(inFC); ctx.fillStyle = COL.land; ctx.fill(); ctx.lineWidth = 0.4; ctx.strokeStyle = COL.border; ctx.stroke();
    } else {
      ctx.beginPath(); path(ALL_FC); ctx.fillStyle = COL.land; ctx.fill(); ctx.lineWidth = 0.4; ctx.strokeStyle = COL.border; ctx.stroke();
    }
    // highlight
    if (highlightId && featureById[highlightId]) {
      ctx.beginPath(); path(featureById[highlightId]); ctx.fillStyle = COL.amber; ctx.fill();
      ctx.lineWidth = 1.2; ctx.strokeStyle = COL.amberEdge; ctx.stroke();
    }
    // locators
    if (locators.length) {
      ctx.lineWidth = 2.5; ctx.strokeStyle = COL.gold; ctx.setLineDash([8, 6]);
      for (var i = 0; i < locators.length; i++) { ctx.beginPath(); path(locators[i]); ctx.stroke(); }
      ctx.setLineDash([]);
    }
    // sphere outline
    ctx.beginPath(); path({ type: "Sphere" }); ctx.lineWidth = 1; ctx.strokeStyle = COL.sphereEdge; ctx.stroke();
  }

  // ---- framing (region / country) ----
  var framing = { kind: "region" };
  var animTimer = null, animFallback = null;
  function stopAnim() { if (animTimer) { animTimer.stop(); animTimer = null; } if (animFallback) { clearTimeout(animFallback); animFallback = null; } }
  function normLng(l) { while (l > 180) l -= 360; while (l < -180) l += 360; return l; }

  function sphericalMean(ids) {
    var x = 0, y = 0, z = 0;
    ids.forEach(function (id) {
      var c = byId[id].center, l = c[0] * Math.PI / 180, p = c[1] * Math.PI / 180, cp = Math.cos(p);
      x += cp * Math.cos(l); y += cp * Math.sin(l); z += Math.sin(p);
    });
    var lng = Math.atan2(y, x) * 180 / Math.PI, lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * 180 / Math.PI;
    return [lng, lat];
  }
  function regionFeatureCollection(ids) { return { type: "FeatureCollection", features: ids.map(function (id) { return featureById[id]; }) }; }

  function frameRegion(ids, animate) {
    if (!ids || !ids.length) ids = idsForRegion("world");
    if (config.view === "map") {
      projection.fitExtent([[20, 20], [W - 20, H - 20]], regionFeatureCollection(ids));
      render(); return;
    }
    var c = sphericalMean(ids);
    var maxA = 0;
    ids.forEach(function (id) {
      var cc = byId[id].center;
      var d = d3.geoDistance([c[0], c[1]], cc) * 180 / Math.PI; if (d > maxA) maxA = d;
    });
    zoomFactor = Math.max(1, Math.min(4, 62 / Math.max(maxA, 16)));
    projection.scale(baseScale * zoomFactor);
    rotateTo(c, animate);
  }
  function frameCountry(id, animate) {
    if (config.view === "map") {
      projection.fitExtent([[40, 40], [W - 40, H - 40]], featureById[id]);
      if (projection.scale() > worldFitScale * 22) projection.scale(worldFitScale * 22);
      // recenter on the country (fitExtent's translate is stale after clamping the scale)
      var sp = projection(byId[id].center), tr = projection.translate();
      if (sp && isFinite(sp[0])) projection.translate([tr[0] + (W / 2 - sp[0]), tr[1] + (H / 2 - sp[1])]);
      render(); return;
    }
    var span = countrySpan(featureById[id].geometry);
    zoomFactor = Math.max(1.1, Math.min(6, 26 / Math.max(span, 4)));
    projection.scale(baseScale * zoomFactor);
    rotateTo(byId[id].center, animate);
  }
  function applyFraming(animate) {
    if (framing.kind === "country") frameCountry(framing.id, animate);
    else frameRegion(framing.ids || currentOrder, animate);
  }

  function rotateTo(center, animate) {
    stopAnim();
    if (config.view !== "globe") { render(); return; }
    var r0 = projection.rotate(), t0 = -center[0], t1 = -center[1];
    while (t0 - r0[0] > 180) t0 -= 360; while (t0 - r0[0] < -180) t0 += 360;
    var p0 = r0[0], p1 = t0, q0 = r0[1], q1 = t1, g0 = r0[2] || 0, dur = 850;
    function finish() { stopAnim(); projection.rotate([normLng(p1), q1, 0]); render(); }
    if (!animate) { finish(); return; }
    animTimer = d3.timer(function (el) {
      var tt = Math.min(1, el / dur), e = tt < 0.5 ? 2 * tt * tt : -1 + (4 - 2 * tt) * tt;
      projection.rotate([p0 + (p1 - p0) * e, q0 + (q1 - q0) * e, g0 * (1 - e)]); render();
      if (tt >= 1) finish();
    });
    animFallback = setTimeout(finish, dur + 80);
  }

  // ---- versor drag (globe) ----
  var RAD = Math.PI / 180, DEG = 180 / Math.PI;
  function versor(e) { var l = e[0] / 2 * RAD, sl = Math.sin(l), cl = Math.cos(l), p = e[1] / 2 * RAD, sp = Math.sin(p), cp = Math.cos(p), g = e[2] / 2 * RAD, sg = Math.sin(g), cg = Math.cos(g); return [cl * cp * cg + sl * sp * sg, sl * cp * cg - cl * sp * sg, cl * sp * cg + sl * cp * sg, cl * cp * sg - sl * sp * cg]; }
  versor.cartesian = function (e) { var l = e[0] * RAD, p = e[1] * RAD, cp = Math.cos(p); return [cp * Math.cos(l), cp * Math.sin(l), Math.sin(p)]; };
  versor.rotation = function (q) { return [Math.atan2(2 * (q[0] * q[1] + q[2] * q[3]), 1 - 2 * (q[1] * q[1] + q[2] * q[2])) * DEG, Math.asin(Math.max(-1, Math.min(1, 2 * (q[0] * q[2] - q[3] * q[1])))) * DEG, Math.atan2(2 * (q[0] * q[3] + q[1] * q[2]), 1 - 2 * (q[2] * q[2] + q[3] * q[3])) * DEG]; };
  versor.delta = function (v0, v1) { var w = [v0[1] * v1[2] - v0[2] * v1[1], v0[2] * v1[0] - v0[0] * v1[2], v0[0] * v1[1] - v0[1] * v1[0]], l = Math.sqrt(w[0] * w[0] + w[1] * w[1] + w[2] * w[2]); if (!l) return [1, 0, 0, 0]; var tt = Math.acos(Math.max(-1, Math.min(1, v0[0] * v1[0] + v0[1] * v1[1] + v0[2] * v1[2]))) / 2, s = Math.sin(tt); return [Math.cos(tt), w[2] / l * s, -w[1] / l * s, w[0] / l * s]; };
  versor.multiply = function (q0, q1) { return [q0[0] * q1[0] - q0[1] * q1[1] - q0[2] * q1[2] - q0[3] * q1[3], q0[0] * q1[1] + q0[1] * q1[0] + q0[2] * q1[3] - q0[3] * q1[2], q0[0] * q1[2] - q0[1] * q1[3] + q0[2] * q1[0] + q0[3] * q1[1], q0[0] * q1[3] + q0[1] * q1[2] - q0[2] * q1[1] + q0[3] * q1[0]]; };

  var dv0, dq0, dr0;
  d3.select(canvas).call(d3.drag()
    .on("start", function (event) {
      stopAnim(); canvas.classList.add("grabbing");
      if (config.view === "globe") { var p = projection.invert([event.x, event.y]); dv0 = p && isFinite(p[0]) ? versor.cartesian(p) : null; dr0 = projection.rotate(); dq0 = versor(dr0); }
    })
    .on("drag", function (event) {
      if (config.view === "globe") {
        if (!dv0) return;
        var inv = projection.rotate(dr0).invert([event.x, event.y]);
        if (!inv || !isFinite(inv[0])) { projection.rotate(dr0); return; }
        projection.rotate(versor.rotation(versor.multiply(dq0, versor.delta(dv0, versor.cartesian(inv))))); render();
      } else {
        var tr = projection.translate(); projection.translate([tr[0] + event.dx, tr[1] + event.dy]); render();
      }
    })
    .on("end", function () { canvas.classList.remove("grabbing"); }));

  canvas.addEventListener("wheel", function (e) {
    e.preventDefault();
    var k = e.deltaY < 0 ? 1.15 : 0.87;
    if (config.view === "globe") {
      zoomFactor = Math.max(1, Math.min(12, zoomFactor * k)); projection.scale(baseScale * zoomFactor); render();
    } else {
      var p = [e.offsetX, e.offsetY], ll = projection.invert(p);
      var ns = Math.max(worldFitScale * 0.85, Math.min(worldFitScale * 40, projection.scale() * k));
      projection.scale(ns);
      if (ll && isFinite(ll[0])) { var p2 = projection(ll), tr = projection.translate(); projection.translate([tr[0] + (p[0] - p2[0]), tr[1] + (p[1] - p2[1])]); }
      render();
    }
  }, { passive: false });

  // ---- click detection (find mode) ----
  var downPt = null;
  canvas.addEventListener("pointerdown", function (e) { downPt = [e.offsetX, e.offsetY]; });
  canvas.addEventListener("pointerup", function (e) {
    if (!downPt) return;
    var moved = Math.hypot(e.offsetX - downPt[0], e.offsetY - downPt[1]); downPt = null;
    if (moved > 6) return;
    if (config.mode !== "find" || resolved) return;
    var ll = projection.invert([e.offsetX, e.offsetY]);
    if (!ll || !isFinite(ll[0])) return;
    var hit = null;
    for (var i = 0; i < currentOrder.length; i++) { var id = currentOrder[i]; if (d3.geoContains(featureById[id], ll)) { hit = id; break; } }
    if (hit) handleClick(hit);
  });

  // ---------------------------------------------------------------- regions
  var REGION_GROUPS = [
    { opts: ["world", "africa"] },
    { label: "grpAmericas", opts: ["americas", "north_america", "south_america"] },
    { label: "grpAsia", opts: ["asia", "asia_east", "asia_southeast", "asia_south", "asia_central", "middle_east"] },
    { label: "grpEurope", opts: ["europe", "europe_west", "europe_east"] },
    { opts: ["oceania"] }
  ];
  function idsForRegion(region) {
    return ANSWERS.filter(function (a) { return region === "world" || (a.regions && a.regions.indexOf(region) >= 0); }).map(function (a) { return a.iso3; });
  }

  // ---------------------------------------------------------------- DOM
  var el = {
    hud: document.getElementById("hud"), controls: document.getElementById("controls"),
    viewToggle: document.getElementById("view-toggle"), menuBtn: document.getElementById("menu-btn"),
    progress: document.getElementById("progress"), score: document.getElementById("score"),
    task: document.getElementById("task"), form: document.getElementById("guess-form"),
    input: document.getElementById("guess-input"), submit: document.getElementById("submit-btn"),
    attempts: document.getElementById("attempts"), feedback: document.getElementById("feedback"),
    hint: document.getElementById("hint"), next: document.getElementById("next-btn"),
    menu: document.getElementById("menu"), regionSelect: document.getElementById("region-select"),
    playBtn: document.getElementById("play-btn"),
    endScreen: document.getElementById("end-screen"), finalScore: document.getElementById("final-score"),
    finalTotal: document.getElementById("final-total"), finalPct: document.getElementById("final-pct"),
    missedWrap: document.getElementById("missed-wrap"), replayBtn: document.getElementById("replay-btn"),
    endMenuBtn: document.getElementById("endmenu-btn")
  };
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }

  function applyI18n() {
    document.documentElement.lang = config.lang;
    document.querySelectorAll("[data-i18n]").forEach(function (n) { n.textContent = t(n.getAttribute("data-i18n")); });
    el.viewToggle.textContent = config.view === "globe" ? t("toMap") : t("toGlobe");
    // segmented controls reflect config
    [["seg-lang", "lang"], ["seg-subject", "subject"], ["seg-mode", "mode"], ["seg-view", "view"]].forEach(function (pair) {
      document.querySelectorAll("#" + pair[0] + " button").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-val") === config[pair[1]]); });
    });
    // region select
    el.regionSelect.innerHTML = "";
    REGION_GROUPS.forEach(function (grp) {
      var parent = el.regionSelect;
      if (grp.label) { var og = document.createElement("optgroup"); og.label = t(grp.label); el.regionSelect.appendChild(og); parent = og; }
      grp.opts.forEach(function (key) { var o = document.createElement("option"); o.value = key; o.textContent = t("reg_" + key); if (key === config.region) o.selected = true; parent.appendChild(o); });
    });
  }

  // ---------------------------------------------------------------- game state
  var MAX_ATTEMPTS = 3;
  var currentOrder = [], idx = 0, score = 0, attempts = 0, resolved = false, results = [];
  var answerStr = "", revealed = [], targetId = null;

  function shuffle(arr) { for (var i = arr.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var x = arr[i]; arr[i] = arr[j]; arr[j] = x; } return arr; }
  function setAttempts(left) { var d = ""; for (var i = 0; i < MAX_ATTEMPTS; i++) d += i < left ? "●" : "○"; el.attempts.textContent = t("tries") + d; }
  function clearHint() { el.hint.innerHTML = ""; el.hint.classList.remove("show"); }
  function showHint(rawGuess) {
    var g = []; for (var i = 0; i < rawGuess.length; i++) if (isLetterOrDigit(rawGuess[i])) g.push(foldChar(rawGuess[i]));
    var html = "", k = 0;
    for (var j = 0; j < answerStr.length; j++) {
      var ch = answerStr[j];
      if (isLetterOrDigit(ch)) { if (!revealed[k] && k < g.length && g[k] === foldChar(ch)) revealed[k] = true; html += revealed[k] ? '<span class="ok">' + escapeHtml(ch) + "</span>" : '<span class="miss">_</span>'; k++; }
      else html += escapeHtml(ch);
    }
    el.hint.innerHTML = html; el.hint.classList.add("show");
  }
  function answerLabel(id) { return config.subject === "capitals" ? capName(id) + " (" + displayName(id) + ")" : displayName(id); }

  function startGame() {
    saveConfig();
    currentOrder = shuffle(idsForRegion(config.region));
    regionSet = {}; currentOrder.forEach(function (id) { regionSet[id] = true; });
    idx = 0; score = 0; results = [];
    el.menu.classList.add("closed");
    el.endScreen.classList.add("hidden");
    el.hud.classList.remove("hidden");
    el.controls.classList.remove("hidden");
    el.score.textContent = "0";
    resize();
    startRound();
  }

  function startRound() {
    resolved = false; attempts = 0;
    targetId = currentOrder[idx];
    el.progress.textContent = (idx + 1) + " / " + currentOrder.length;
    el.feedback.textContent = ""; el.feedback.className = "feedback";
    clearHint(); setAttempts(MAX_ATTEMPTS);
    el.next.classList.add("hidden");
    locators = [];

    if (config.mode === "type") {
      // answer string for the hint = what the player must type
      answerStr = config.subject === "capitals" ? capName(targetId) : displayName(targetId);
      revealed = []; for (var c = 0; c < answerStr.length; c++) if (isLetterOrDigit(answerStr[c])) revealed.push(false);
      highlightId = targetId;
      locators = computeLocators(targetId);
      el.task.className = "task";
      el.task.textContent = config.subject === "capitals" ? t("taskTypeCapital") : t("taskTypeCountry");
      el.form.classList.remove("hidden");
      el.input.value = ""; el.input.disabled = false; el.submit.disabled = false;
      el.input.placeholder = config.subject === "capitals" ? t("phCapital") : t("phCountry");
      canvas.classList.remove("clickable");
      framing = { kind: "country", id: targetId };
      applyFraming(true);
      el.input.focus();
    } else {
      highlightId = null;
      el.task.className = "task find";
      var label = config.subject === "capitals" ? capName(targetId) : displayName(targetId);
      el.task.innerHTML = (config.subject === "capitals" ? t("taskFindCapital") : t("taskFindCountry")) +
        "<span class='target'>" + escapeHtml(label) + "</span>" + (config.subject === "capitals" ? " ?" : "");
      el.form.classList.add("hidden");
      canvas.classList.add("clickable");
      framing = { kind: "region", ids: currentOrder };
      applyFraming(true);
    }
  }

  function submitGuess() {
    if (resolved || config.mode !== "type") return;
    var raw = el.input.value, guess = norm(raw);
    if (!guess) return;
    var set = config.subject === "capitals" ? acceptedCap[targetId] : acceptedName[targetId];
    if (set[guess]) finishRound(true);
    else {
      attempts++; var left = MAX_ATTEMPTS - attempts;
      if (left > 0) { setAttempts(left); el.feedback.textContent = left === 1 ? t("wrongLast") : t("wrongAgain"); el.feedback.className = "feedback wrong"; showHint(raw); el.input.value = ""; el.input.focus(); }
      else finishRound(false);
    }
  }

  function handleClick(clickedId) {
    if (resolved || config.mode !== "find") return;
    if (clickedId === targetId) finishRound(true);
    else {
      attempts++; var left = MAX_ATTEMPTS - attempts;
      if (left > 0) { setAttempts(left); el.feedback.textContent = left === 1 ? t("wrongLast") : t("wrongAgain"); el.feedback.className = "feedback wrong"; }
      else finishRound(false);
    }
  }

  function finishRound(correct) {
    resolved = true;
    if (correct) { score++; el.score.textContent = String(score); el.feedback.textContent = t("correct") + answerLabel(targetId); el.feedback.className = "feedback correct"; }
    else { el.feedback.textContent = t("answer") + answerLabel(targetId); el.feedback.className = "feedback reveal"; }
    results.push({ id: targetId, correct: correct });
    el.attempts.textContent = ""; clearHint();
    if (config.mode === "type") { el.input.disabled = true; el.submit.disabled = true; }
    // reveal the country on the map
    highlightId = targetId; locators = computeLocators(targetId);
    if (config.mode === "find") { framing = { kind: "country", id: targetId }; applyFraming(true); } else render();
    el.next.textContent = idx + 1 >= currentOrder.length ? t("results") : t("next");
    el.next.classList.remove("hidden"); el.next.focus();
  }

  function nextRound() { if (!resolved) return; resolved = false; idx++; if (idx >= currentOrder.length) endGame(); else startRound(); }

  function endGame() {
    el.hud.classList.add("hidden"); el.controls.classList.add("hidden");
    var pct = Math.round((score / currentOrder.length) * 100);
    el.finalScore.textContent = String(score); el.finalTotal.textContent = String(currentOrder.length); el.finalPct.textContent = "(" + pct + "%)";
    var missed = results.filter(function (r) { return !r.correct; });
    if (missed.length) el.missedWrap.innerHTML = "<h3>" + t("missed") + " (" + missed.length + ")</h3><div class='missed-list'>" + missed.map(function (r) { return "<span>" + escapeHtml(answerLabel(r.id)) + "</span>"; }).join("") + "</div>";
    else el.missedWrap.innerHTML = "<p class='perfect'>" + t("perfect") + "</p>";
    el.endScreen.classList.remove("hidden");
    highlightId = null; locators = []; regionSet = null;
    framing = { kind: "region", ids: idsForRegion("world") }; zoomFactor = 1; applyFraming(false);
  }

  function openMenu() {
    el.hud.classList.add("hidden"); el.controls.classList.add("hidden"); el.endScreen.classList.add("hidden");
    el.menu.classList.remove("closed");
    highlightId = null; locators = []; regionSet = null;
    framing = { kind: "region", ids: idsForRegion("world") }; zoomFactor = 1; applyFraming(false);
  }

  function setView(v) {
    if (config.view === v) return;
    config.view = v; saveConfig();
    buildProjection(); el.viewToggle.textContent = config.view === "globe" ? t("toMap") : t("toGlobe");
    document.querySelectorAll("#seg-view button").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-val") === v); });
    resize();
  }

  // ---------------------------------------------------------------- events
  el.form.addEventListener("submit", function (e) { e.preventDefault(); submitGuess(); });
  el.next.addEventListener("click", nextRound);
  el.playBtn.addEventListener("click", startGame);
  el.replayBtn.addEventListener("click", startGame);
  el.endMenuBtn.addEventListener("click", openMenu);
  el.menuBtn.addEventListener("click", openMenu);
  el.viewToggle.addEventListener("click", function () { setView(config.view === "globe" ? "map" : "globe"); });
  el.regionSelect.addEventListener("change", function () { config.region = this.value; saveConfig(); });
  window.addEventListener("resize", resize);

  function wireSeg(segId, key, onChange) {
    document.querySelectorAll("#" + segId + " button").forEach(function (b) {
      b.addEventListener("click", function () {
        config[key] = b.getAttribute("data-val"); saveConfig();
        document.querySelectorAll("#" + segId + " button").forEach(function (x) { x.classList.toggle("active", x === b); });
        if (onChange) onChange();
      });
    });
  }
  wireSeg("seg-lang", "lang", applyI18n);
  wireSeg("seg-subject", "subject");
  wireSeg("seg-mode", "mode");
  wireSeg("seg-view", "view", function () { buildProjection(); });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && resolved && !el.next.classList.contains("hidden")) { e.preventDefault(); nextRound(); }
  });

  // init
  applyI18n();
  framing = { kind: "region", ids: idsForRegion("world") };
  resize();
  requestAnimationFrame(resize);
  window.addEventListener("load", resize);
  setTimeout(resize, 200);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(mapEl);
})();
