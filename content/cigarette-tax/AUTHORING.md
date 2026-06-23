# Rédiger les fiches "Comment taper une clope"

Aucun code à toucher. Tout se passe dans ce dossier.

## Ajouter un pays
1. Copie `TEMPLATE.json` dans `articles/` et renomme-le avec le code **ISO3** du pays
   (ex. `FRA.json`, `DEU.json`, `JPN.json`...). Les codes correspondent aux `iso3` du jeu (voir `data/answers.js`).
2. Remplis les champs (voir ci-dessous).
3. Ajoute le code ISO3 dans `index.json`, dans la liste `"countries"`.
4. Commit + push. C'est en ligne après environ une minute.

## Format d'une fiche
- `title` : titre (ex. "France 🇫🇷").
- `updated` : texte libre (ex. "juin 2026"), affiché en petit sous le titre.
- `sections` : liste de blocs `{ "heading": "...", "body": "..." }`.
  - Dans `body`, un retour à la ligne simple (`\n`) crée une nouvelle ligne ; une ligne vide (`\n\n`) crée un nouveau paragraphe.
- `sources` (optionnel) : liste de `{ "label": "...", "url": "https://..." }`. Un lien n'est cliquable que si l'URL commence par `http://` ou `https://`.

Les textes peuvent être soit une simple chaîne (ex. `"France 🇫🇷"`), soit un objet bilingue
`{ "en": "...", "fr": "..." }`. Si une traduction manque, l'app affiche l'autre langue.

## Page d'accueil de la rubrique
Le champ `intro` dans `index.json` (titre + sections) s'affiche tant qu'aucun pays n'est sélectionné. Sers-t'en pour le résumé général.

## Notes
- Le texte est inséré tel quel (pas de HTML) : impossible de casser la page.
- Un pays absent de `index.json` n'apparaît pas dans la liste.
