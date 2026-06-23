# Rédiger les articles "Taxe cigarette"

Aucun code à toucher. Tout se passe dans ce dossier.

## Ajouter un pays
1. Copie `TEMPLATE.json` dans `articles/` et renomme-le avec le code **ISO3** du pays
   (ex. `FRA.json` pour la France, `USA.json`, `JPN.json`, `DEU.json`...).
   La liste des codes correspond aux `iso3` du jeu (voir `data/answers.js`).
2. Remplis les champs (voir ci-dessous).
3. Ajoute le code ISO3 dans `index.json`, dans la liste `"countries"`.
4. Commit + push. C'est en ligne après ~1 minute.

## Format d'un article
- `title` : titre, en deux langues `{ "en": "...", "fr": "..." }`.
- `updated` : texte libre (ex. "2026-06"), affiché en petit sous le titre.
- `sections` : liste de blocs. Chaque bloc a un `heading` et un `body` (chacun `{en, fr}`).
  - Dans `body`, sépare les paragraphes par une **ligne vide** (`\n\n` dans le JSON).
- `sources` : liste de `{ "label": {en,fr}, "url": "https://..." }`.
  - Un lien n'est cliquable que si l'URL commence par `http://` ou `https://`.

## Notes
- Si une traduction manque, l'app affiche l'autre langue (repli EN puis FR).
- Le texte est inséré tel quel (pas de HTML) : tu ne peux pas casser la page.
- Un pays absent de `index.json` n'apparaît tout simplement pas dans la liste.
