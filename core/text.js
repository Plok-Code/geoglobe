// @ts-check
// Text normalization for answer matching and search. Accent/punctuation/case insensitive.
export function norm(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/[._'’`\-]/g, " ").replace(/[^a-z0-9 ]/g, " ")
    .replace(/\bthe\b/g, " ").replace(/\s+/g, " ").trim();
}
export function foldChar(c) { return c.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""); }
export function isLetterOrDigit(c) { return /[a-z0-9]/.test(foldChar(c)); }
