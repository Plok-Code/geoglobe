// @ts-check
// Shared "chrome" strings (shell + hub + generic states). Modes ship their own strings.
import { settings } from "./settings.js";

const STRINGS = {
  en: {
    "app.name": "GeoGlobe",
    "app.tagline": "Explore the world",
    "nav.home": "Home",
    "nav.back": "Back",
    "nav.settings": "Settings",
    "nav.close": "Close",
    "settings.title": "Settings",
    "settings.language": "Language",
    "settings.theme": "Theme",
    "settings.motion": "Animations",
    "theme.system": "System",
    "theme.dark": "Dark",
    "theme.light": "Light",
    "theme.hc": "High contrast",
    "motion.system": "System",
    "motion.full": "Full",
    "motion.reduced": "Reduced",
    "mode.home": "Home",
    "mode.learn": "Learn geography",
    "mode.explore": "Explore the map",
    "mode.tax": "Bumming a cigarette",
    "mode.learn.desc": "Quiz yourself on countries and capitals.",
    "mode.explore.desc": "An atlas with every country and capital labelled.",
    "mode.tax.desc": "How to bum a cigarette from a stranger, country by country.",
    "group.learn": "Learn",
    "group.explore": "Explore",
    "group.data": "Data",
    "home.title": "Choose a mode",
    "home.search": "Search modes",
    "home.noResult": "No mode matches your search.",
    "home.continue": "Continue",
    "state.comingSoon": "This mode is coming soon.",
    "state.loading": "Loading...",
    "state.error": "Something went wrong.",
    "common.retry": "Retry",
    "a11y.skip": "Skip to main content",
  },
  fr: {
    "app.name": "GeoGlobe",
    "app.tagline": "Explore le monde",
    "nav.home": "Accueil",
    "nav.back": "Retour",
    "nav.settings": "Réglages",
    "nav.close": "Fermer",
    "settings.title": "Réglages",
    "settings.language": "Langue",
    "settings.theme": "Thème",
    "settings.motion": "Animations",
    "theme.system": "Système",
    "theme.dark": "Sombre",
    "theme.light": "Clair",
    "theme.hc": "Contraste élevé",
    "motion.system": "Système",
    "motion.full": "Complètes",
    "motion.reduced": "Réduites",
    "mode.home": "Accueil",
    "mode.learn": "Apprendre la géographie",
    "mode.explore": "Explorer la carte",
    "mode.tax": "Comment taxer une clope",
    "mode.learn.desc": "Teste-toi sur les pays et les capitales.",
    "mode.explore.desc": "Un atlas avec chaque pays et sa capitale.",
    "mode.tax.desc": "Quémander une cigarette à un inconnu, pays par pays.",
    "group.learn": "Apprendre",
    "group.explore": "Explorer",
    "group.data": "Données",
    "home.title": "Choisis un mode",
    "home.search": "Rechercher un mode",
    "home.noResult": "Aucun mode ne correspond.",
    "home.continue": "Reprendre",
    "state.comingSoon": "Ce mode arrive bientôt.",
    "state.loading": "Chargement...",
    "state.error": "Une erreur est survenue.",
    "common.retry": "Réessayer",
    "a11y.skip": "Aller au contenu principal",
  },
};

let lang = settings.get("lang") || "en";
const subs = new Set();

export function getLang() { return lang; }
export function setLang(l) { if (l === lang) return; lang = l; settings.set("lang", l); document.documentElement.lang = l; subs.forEach((fn) => fn(l)); }
export function onLangChange(fn) { subs.add(fn); return () => subs.delete(fn); }

/** Translate a chrome key, with {var} interpolation and EN fallback. */
export function t(key, vars) {
  const table = STRINGS[lang] || STRINGS.en;
  let s = key in table ? table[key] : (STRINGS.en[key] != null ? STRINGS.en[key] : key);
  if (vars) for (const k in vars) s = s.replace("{" + k + "}", vars[k]);
  return s;
}

/** Resolve a localized value: string, or {en,fr} object with graceful fallback. */
export function loc(val) {
  if (val == null) return "";
  if (typeof val === "string") return val;
  return val[lang] != null ? val[lang] : (val.en != null ? val.en : (val.fr != null ? val.fr : ""));
}
