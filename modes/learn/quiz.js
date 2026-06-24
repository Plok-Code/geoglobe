// @ts-check
// Learn-geography quiz, rebuilt on the shared GeoEngine. Owns its DOM (config / play / end)
// inside ctx.root + ctx.toolbar; map work delegated to the engine.
import { el, clear, injectCss } from "../../core/dom.js";
import { getLang } from "../../core/i18n.js";
import { loadGeo, idsForRegion } from "../../core/data.js";
import { norm, foldChar, isLetterOrDigit } from "../../core/text.js";
import { GeoEngine } from "../../geo/GeoEngine.js?v=19";

const T = {
  en: {
    subject: "What to guess", answerMode: "How to answer", region: "Region",
    subjCountries: "Countries", subjCapitals: "Capitals", modeType: "Type", modeFind: "Click",
    play: "Play", playAgain: "Play again", config: "Settings", recenter: "⌖ Recenter",
    toGlobe: "Globe", toMap: "2D map",
    progress: "Country", score: "Score", guess: "Guess", next: "Next →", results: "See results →",
    tries: "Tries: ", wrongAgain: "Wrong, try again", wrongLast: "Wrong, last try",
    correct: "Correct: ", answer: "Answer: ",
    gameOver: "Game over", scored: "You scored", missed: "Missed", perfect: "Perfect game!",
    phCountry: "Type your answer...", phCapital: "Type your answer...",
    taskTypeCountry: "Which country is highlighted?", taskTypeCapital: "What is this country's capital?",
    taskFindCountry: "Find: ", taskFindCapital: "Which country's capital is ",
    reg_world: "World", reg_africa: "Africa", reg_americas: "Americas (all)",
    reg_north_america: "North America", reg_south_america: "South America", reg_asia: "Asia (all)",
    reg_asia_east: "East Asia", reg_asia_southeast: "Southeast Asia", reg_asia_south: "South Asia",
    reg_asia_central: "Central Asia", reg_middle_east: "Middle East", reg_europe: "Europe (all)",
    reg_europe_west: "Western Europe", reg_europe_east: "Eastern Europe", reg_oceania: "Oceania",
    grpAmericas: "Americas", grpAsia: "Asia", grpEurope: "Europe",
  },
  fr: {
    subject: "À deviner", answerMode: "Comment répondre", region: "Région",
    subjCountries: "Pays", subjCapitals: "Capitales", modeType: "Écrire", modeFind: "Cliquer",
    play: "Jouer", playAgain: "Rejouer", config: "Réglages", recenter: "⌖ Recentrer",
    toGlobe: "Globe", toMap: "Carte 2D",
    progress: "Pays", score: "Score", guess: "Valider", next: "Suivant →", results: "Voir les résultats →",
    tries: "Essais : ", wrongAgain: "Faux, réessaie", wrongLast: "Faux, dernier essai",
    correct: "Correct : ", answer: "Réponse : ",
    gameOver: "Partie terminée", scored: "Score :", missed: "Ratés", perfect: "Sans-faute !",
    phCountry: "Tape ta réponse...", phCapital: "Tape ta réponse...",
    taskTypeCountry: "Quel est ce pays ?", taskTypeCapital: "Quelle est la capitale de ce pays ?",
    taskFindCountry: "Trouve : ", taskFindCapital: "Quel pays a pour capitale ",
    reg_world: "Monde", reg_africa: "Afrique", reg_americas: "Amériques (toutes)",
    reg_north_america: "Amérique du Nord", reg_south_america: "Amérique du Sud", reg_asia: "Asie (toute)",
    reg_asia_east: "Asie de l'Est", reg_asia_southeast: "Asie du Sud-Est", reg_asia_south: "Asie du Sud",
    reg_asia_central: "Asie centrale", reg_middle_east: "Moyen-Orient", reg_europe: "Europe (toute)",
    reg_europe_west: "Europe de l'Ouest", reg_europe_east: "Europe de l'Est", reg_oceania: "Océanie",
    grpAmericas: "Amériques", grpAsia: "Asie", grpEurope: "Europe",
  },
};

const REGION_GROUPS = [
  { opts: ["world", "africa"] },
  { label: "grpAmericas", opts: ["americas", "north_america", "south_america"] },
  { label: "grpAsia", opts: ["asia", "asia_east", "asia_southeast", "asia_south", "asia_central", "middle_east"] },
  { label: "grpEurope", opts: ["europe", "europe_west", "europe_east"] },
  { opts: ["oceania"] },
];

const MAX_ATTEMPTS = 3;
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

export async function createSession(ctx) {
  const tt = (k) => T[getLang()][k];
  const geo = await loadGeo();
  if (ctx.signal.aborted) return { destroy() {}, relang() {} };
  const { byId, answers } = geo;
  const displayName = (id) => (getLang() === "fr" ? byId[id].name_fr : byId[id].name);
  const capName = (id) => (getLang() === "fr" ? byId[id].cap_fr : byId[id].cap);
  const answerLabel = (id) => (cfg.subject === "capitals" ? capName(id) + " (" + displayName(id) + ")" : displayName(id));

  const cfg = {
    subject: ctx.settings.modeGet("learn", "subject", "countries"),
    mode: ctx.settings.modeGet("learn", "mode", "type"),
    region: ctx.settings.modeGet("learn", "region", "world"),
    view: ctx.settings.modeGet("learn", "view", "globe"),
  };

  // ---- DOM scaffold ----
  injectCss("learn-css", "modes/learn/learn.css?v=1");
  const host = el("div", { class: "map-host" });
  ctx.root.append(host);
  const engine = new GeoEngine(host, {
    world: geo.world, byId, featureById: geo.featureById,
    view: cfg.view, palette: ctx.theme.mapPalette(), reducedMotion: ctx.theme.reducedMotion,
  });
  const offTheme = ctx.theme.onChange(() => { engine.setPalette(ctx.theme.mapPalette()); engine.setReducedMotion(ctx.theme.reducedMotion); });
  engine.on("pick", (id) => { if (phase === "play" && cfg.mode === "find" && !resolved && id) handleClick(id); });

  // config panel
  const cfgPanel = el("div", { class: "quiz-config" });
  // play hud
  const hud = el("header", { class: "quiz-hud", hidden: true });
  // end overlay
  const endOv = el("div", { class: "quiz-end", hidden: true });
  ctx.root.append(cfgPanel, hud, endOv);

  // toolbar: view toggle + recenter + config button
  const viewBtn = el("button", { class: "btn", type: "button" });
  const recenterBtn = el("button", { class: "btn", type: "button" });
  const cfgBtn = el("button", { class: "btn", type: "button", hidden: true });
  ctx.toolbar.append(viewBtn, recenterBtn, cfgBtn);
  viewBtn.addEventListener("click", () => setView(cfg.view === "globe" ? "map" : "globe"), { signal: ctx.signal });
  recenterBtn.addEventListener("click", recenter, { signal: ctx.signal });
  cfgBtn.addEventListener("click", () => showConfig(), { signal: ctx.signal });

  // ---- state ----
  let phase = "config";
  let order = [], idx = 0, score = 0, attempts = 0, resolved = false, results = [];
  let answerStr = "", revealed = [], targetId = null;
  // hud refs (filled by buildHud)
  let h = {};

  function setView(v) {
    cfg.view = v; ctx.settings.modeSet("learn", "view", v);
    viewBtn.textContent = v === "globe" ? tt("toMap") : tt("toGlobe");
    engine.setView(v);
  }

  // A new country never recenters the camera on its own; the Recenter button is the only thing
  // that frames. Type/revealed -> frame the target country; find (unsolved) -> frame the region.
  function recenter() {
    if (phase === "play") {
      if (cfg.mode === "type" || resolved) engine.frameCountry(targetId, true);
      else engine.frameRegion(order, true);
    } else {
      engine.frameRegion(idsForRegion(answers, cfg.region), true);
    }
  }

  // ---- config panel ----
  function buildConfig() {
    clear(cfgPanel);
    const seg = (label, key, options) => {
      const row = el("div", { class: "seg" });
      options.forEach((o) => {
        const b = el("button", { type: "button", class: "seg-btn" + (cfg[key] === o.val ? " active" : ""), "aria-pressed": String(cfg[key] === o.val) }, o.label);
        b.addEventListener("click", () => { cfg[key] = o.val; ctx.settings.modeSet("learn", key, o.val); row.querySelectorAll(".seg-btn").forEach((x) => { x.classList.remove("active"); x.setAttribute("aria-pressed", "false"); }); b.classList.add("active"); b.setAttribute("aria-pressed", "true"); }, { signal: ctx.signal });
        row.append(b);
      });
      return el("div", { class: "field" }, [el("span", { class: "field-label" }, label), row]);
    };
    const regionSel = el("select", { class: "region-select" });
    REGION_GROUPS.forEach((grp) => {
      let parent = regionSel;
      if (grp.label) { const og = el("optgroup", { label: tt(grp.label) }); regionSel.append(og); parent = og; }
      grp.opts.forEach((key) => parent.append(el("option", { value: key, selected: key === cfg.region }, tt("reg_" + key))));
    });
    regionSel.addEventListener("change", () => { cfg.region = regionSel.value; ctx.settings.modeSet("learn", "region", cfg.region); engine.frameRegion(idsForRegion(answers, cfg.region), true); }, { signal: ctx.signal });
    const playBtn = el("button", { class: "btn primary", type: "button" }, tt("play"));
    playBtn.addEventListener("click", startGame, { signal: ctx.signal });
    cfgPanel.append(el("div", { class: "quiz-card" }, [
      seg(tt("subject"), "subject", [{ val: "countries", label: tt("subjCountries") }, { val: "capitals", label: tt("subjCapitals") }]),
      seg(tt("answerMode"), "mode", [{ val: "type", label: tt("modeType") }, { val: "find", label: tt("modeFind") }]),
      el("div", { class: "field" }, [el("span", { class: "field-label" }, tt("region")), regionSel]),
      playBtn,
    ]));
  }

  function showConfig() {
    phase = "config";
    hud.hidden = true; endOv.hidden = true; cfgPanel.hidden = false; cfgBtn.hidden = true;
    engine.clearHighlight(); engine.setRegions(null); engine.setCursorPick(false);
    engine.frameRegion(idsForRegion(answers, cfg.region), false);
    buildConfig();
  }

  // ---- play hud ----
  function buildHud() {
    clear(hud);
    h = {};
    h.progress = el("span", { class: "stat-value", id: "q-progress" });
    h.score = el("span", { class: "stat-value", id: "q-score" }, "0");
    h.progressLabel = el("span", { class: "stat-label" }, tt("progress"));
    h.scoreLabel = el("span", { class: "stat-label" }, tt("score"));
    const stats = el("div", { class: "hud-stats" }, [
      el("div", { class: "stat" }, [h.progressLabel, h.progress]),
      el("div", { class: "stat" }, [h.scoreLabel, h.score]),
    ]);
    h.task = el("div", { class: "task" });
    h.input = el("input", {
      class: "q-input", type: "text", name: "geo-answer", autocomplete: "off",
      autocapitalize: "off", autocorrect: "off", spellcheck: "false",
      // stop password managers (NordPass/LastPass/1Password/Bitwarden/Dashlane) hijacking this field
      "data-lpignore": "true", "data-1p-ignore": "true", "data-bwignore": "true",
      "data-form-type": "other", "data-np-autofill": "off",
    });
    h.submit = el("button", { class: "btn primary", type: "submit" }, tt("guess"));
    h.form = el("form", { class: "q-form", autocomplete: "off" }, [h.input, h.submit]);
    h.form.addEventListener("submit", (e) => { e.preventDefault(); submitGuess(); }, { signal: ctx.signal });
    h.hint = el("div", { class: "hint" });
    h.attempts = el("div", { class: "attempts" });
    h.feedback = el("div", { class: "feedback" });
    h.next = el("button", { class: "btn primary next-btn", type: "button", hidden: true });
    h.next.addEventListener("click", nextRound, { signal: ctx.signal });
    hud.append(stats, h.task, h.form, h.hint, el("div", { class: "hud-footer" }, [h.attempts, h.feedback]), h.next);
  }

  function setAttempts(left) { let d = ""; for (let i = 0; i < MAX_ATTEMPTS; i++) d += i < left ? "●" : "○"; h.attempts.textContent = tt("tries") + d; }
  function clearHint() { h.hint.innerHTML = ""; h.hint.classList.remove("show"); }
  function showHint(rawGuess) {
    const g = []; for (let i = 0; i < rawGuess.length; i++) if (isLetterOrDigit(rawGuess[i])) g.push(foldChar(rawGuess[i]));
    let html = "", k = 0;
    for (let j = 0; j < answerStr.length; j++) {
      const ch = answerStr[j];
      if (isLetterOrDigit(ch)) { if (!revealed[k] && k < g.length && g[k] === foldChar(ch)) revealed[k] = true; html += revealed[k] ? '<span class="ok">' + esc(ch) + "</span>" : '<span class="miss">_</span>'; k++; }
      else html += esc(ch);
    }
    h.hint.innerHTML = html; h.hint.classList.add("show");
  }

  // ---- flow ----
  function startGame() {
    order = shuffle(idsForRegion(answers, cfg.region));
    engine.setRegions(order);
    idx = 0; score = 0; results = [];
    phase = "play";
    cfgPanel.hidden = true; endOv.hidden = true; hud.hidden = false; cfgBtn.hidden = false;
    cfgBtn.textContent = "↺ " + tt("config");
    buildHud(); h.score.textContent = "0";
    startRound();
  }

  function startRound() {
    resolved = false; attempts = 0;
    targetId = order[idx];
    h.progress.textContent = (idx + 1) + " / " + order.length;
    h.feedback.textContent = ""; h.feedback.className = "feedback";
    clearHint(); setAttempts(MAX_ATTEMPTS); h.next.hidden = true;

    if (cfg.mode === "type") {
      answerStr = cfg.subject === "capitals" ? capName(targetId) : displayName(targetId);
      revealed = []; for (let c = 0; c < answerStr.length; c++) if (isLetterOrDigit(answerStr[c])) revealed.push(false);
      h.task.className = "task";
      h.task.textContent = cfg.subject === "capitals" ? tt("taskTypeCapital") : tt("taskTypeCountry");
      h.form.hidden = false;
      h.input.value = ""; h.input.disabled = false; h.submit.disabled = false;
      h.input.placeholder = cfg.subject === "capitals" ? tt("phCapital") : tt("phCountry");
      engine.setCursorPick(false);
      engine.highlight(targetId); // mark the country, but do NOT move the camera
      h.input.focus();
    } else {
      h.task.className = "task find";
      const label = cfg.subject === "capitals" ? capName(targetId) : displayName(targetId);
      h.task.innerHTML = (cfg.subject === "capitals" ? tt("taskFindCapital") : tt("taskFindCountry")) +
        "<span class='target'>" + esc(label) + "</span>" + (cfg.subject === "capitals" ? " ?" : "");
      h.form.hidden = true;
      engine.clearHighlight();
      engine.setCursorPick(true);
    }
  }

  function submitGuess() {
    if (resolved || cfg.mode !== "type") return;
    const guess = norm(h.input.value);
    if (!guess) return;
    const set = cfg.subject === "capitals" ? geo.acceptedCap[targetId] : geo.acceptedName[targetId];
    if (set[guess]) finishRound(true);
    else {
      attempts++; const left = MAX_ATTEMPTS - attempts;
      if (left > 0) { setAttempts(left); h.feedback.textContent = left === 1 ? tt("wrongLast") : tt("wrongAgain"); h.feedback.className = "feedback wrong"; showHint(h.input.value); h.input.value = ""; h.input.focus(); }
      else finishRound(false);
    }
  }

  function handleClick(clickedId) {
    if (resolved || cfg.mode !== "find") return;
    if (clickedId === targetId) finishRound(true);
    else {
      attempts++; const left = MAX_ATTEMPTS - attempts;
      if (left > 0) { setAttempts(left); h.feedback.textContent = left === 1 ? tt("wrongLast") : tt("wrongAgain"); h.feedback.className = "feedback wrong"; ctx.announce(tt("wrongAgain")); }
      else finishRound(false);
    }
  }

  function finishRound(correct) {
    resolved = true;
    const label = answerLabel(targetId);
    if (correct) { score++; h.score.textContent = String(score); h.feedback.textContent = "" + tt("correct") + label; h.feedback.className = "feedback correct"; }
    else { h.feedback.textContent = "" + tt("answer") + label; h.feedback.className = "feedback reveal"; }
    ctx.announce((correct ? tt("correct") : tt("answer")) + label, !correct);
    results.push({ id: targetId, correct });
    h.attempts.textContent = ""; clearHint();
    if (cfg.mode === "type") { h.input.disabled = true; h.submit.disabled = true; }
    engine.setCursorPick(false);
    engine.highlight(targetId); // reveal it in place; the camera stays where the player left it
    h.next.textContent = idx + 1 >= order.length ? tt("results") : tt("next");
    h.next.hidden = false; h.next.focus();
  }

  function nextRound() { if (!resolved) return; resolved = false; idx++; if (idx >= order.length) endGame(); else startRound(); }

  function endGame() {
    phase = "end";
    hud.hidden = true; cfgBtn.hidden = true;
    const pct = Math.round((score / order.length) * 100);
    const missed = results.filter((r) => !r.correct);
    clear(endOv);
    endOv.append(el("div", { class: "quiz-card end-card" }, [
      el("h2", {}, tt("gameOver")),
      el("p", { class: "final-line" }, [tt("scored") + " ", el("strong", {}, String(score)), " / " + order.length + " ", el("span", { class: "pct" }, "(" + pct + "%)")]),
      missed.length
        ? el("div", { class: "missed-wrap" }, [el("h3", {}, tt("missed") + " (" + missed.length + ")"), el("div", { class: "missed-list" }, missed.map((r) => el("span", {}, answerLabel(r.id))))])
        : el("p", { class: "perfect" }, tt("perfect")),
      el("div", { class: "end-actions" }, [
        el("button", { class: "btn primary", type: "button", onClick: startGame }, tt("playAgain")),
        el("button", { class: "btn", type: "button", onClick: showConfig }, tt("config")),
      ]),
    ]));
    endOv.hidden = false;
    engine.clearHighlight(); engine.setRegions(null); engine.frameWorld(false);
  }

  // keyboard: Enter advances when resolved
  const onKey = (e) => { if (e.key === "Enter" && phase === "play" && resolved && !h.next.hidden) { e.preventDefault(); nextRound(); } };
  document.addEventListener("keydown", onKey, { signal: ctx.signal });

  // ---- init view + show config ----
  viewBtn.textContent = cfg.view === "globe" ? tt("toMap") : tt("toGlobe");
  recenterBtn.textContent = tt("recenter");
  showConfig();

  // ---- language change: re-render current phase strings, keep state ----
  function relang() {
    viewBtn.textContent = cfg.view === "globe" ? tt("toMap") : tt("toGlobe");
    recenterBtn.textContent = tt("recenter");
    if (phase === "config") buildConfig();
    else if (phase === "end") endGame();
    else if (phase === "play") {
      // Update visible strings in place; keep all game state.
      cfgBtn.textContent = "↺ " + tt("config");
      h.submit.textContent = tt("guess");
      h.progressLabel.textContent = tt("progress");
      h.scoreLabel.textContent = tt("score");
      if (cfg.mode === "type") {
        h.task.textContent = cfg.subject === "capitals" ? tt("taskTypeCapital") : tt("taskTypeCountry");
        h.input.placeholder = cfg.subject === "capitals" ? tt("phCapital") : tt("phCountry");
      } else {
        const label = cfg.subject === "capitals" ? capName(targetId) : displayName(targetId);
        h.task.innerHTML = (cfg.subject === "capitals" ? tt("taskFindCapital") : tt("taskFindCountry")) + "<span class='target'>" + esc(label) + "</span>" + (cfg.subject === "capitals" ? " ?" : "");
      }
      if (resolved) {
        const last = results[results.length - 1], ok = last && last.correct;
        h.feedback.textContent = (ok ? "" + tt("correct") : "" + tt("answer")) + answerLabel(targetId);
        h.next.textContent = idx + 1 >= order.length ? tt("results") : tt("next");
      } else {
        setAttempts(MAX_ATTEMPTS - attempts);
      }
    }
  }

  function destroy() { offTheme(); engine.destroy(); }
  return { destroy, relang };
}
