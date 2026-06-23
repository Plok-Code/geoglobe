# GeoGlobe

A geography quiz on a 3D globe or a 2D world map. Playable in English or French.

## The games

Pick any combination from the side menu:

- **Subject**: Countries or Capitals.
- **Mode**: Type (write the answer) or Click (click the right country on the map).
- **Region**: World, Africa, Americas (and North / South), Asia (and East / Southeast / South / Central / Middle East), Europe (and West / East), Oceania.
- **View**: Globe (3D) or 2D map. A button switches between them at any time, even mid-game.
- **Language**: English or French (names, capitals and interface). Your choice is remembered.

Each round you get 3 tries. Miss all three and the answer is revealed (0 points for that one). Wrong typed guesses show a Wordle-style hint: correctly placed letters stay, the rest become underscores.

## Play

Open `index.html` in a browser (double-click works, all data is bundled as JS, no server needed). Or serve it:

```
python -m http.server 5599
```

Then open `http://localhost:5599`.

- Drag to rotate the globe (or pan the 2D map), scroll to zoom.
- In Type mode the view moves to the country in question; in Click mode you click it yourself.

## Project layout

```
index.html        markup, side menu, HUD, end screen
style.css         styling
app.js            game logic + D3 globe/map rendering
data/
  countries.js    window.WORLD_GEOJSON, simplified country polygons (id only)
  answers.js      window.COUNTRY_ANSWERS, one record per country
vendor/
  d3.v7.min.js    bundled locally
build/            data pipeline (not needed at runtime)
  countries.json  English names + aliases
  fr.json         French names + aliases
  capitals.json   capitals (EN / FR + alternates)
  regions.json    continent / sub-region tags
```

Each `answers.js` record holds: `name`, `name_fr`, `aliases`, `aliases_fr`, `cap`, `cap_fr`,
`cap_alt`, `regions`, `center` (lng,lat for the globe) and `focus`.

The globe uses D3's orthographic projection (a true sphere, realistic country sizes). The 2D
map uses D3's Natural Earth projection, the conventional world-map look. Small countries also
get a bright rectangle around each of their zones so they are easy to spot.

Answers are matched after normalization (lowercase, strip accents and punctuation, drop "the",
collapse spaces), so casing, accents and punctuation never matter. English and French answers
are both accepted.

## Rebuilding the data

Only needed to change the country set, names, capitals, regions or geometry detail.

```
npm install
node build/process.js
npx mapshaper build/filtered.geojson -simplify 10% keep-shapes -o precision=0.001 format=geojson build/simplified.geojson
node build/finalize.js
```

`process.js` needs the Natural Earth 1:10m Admin 0 countries file at `build/ne_10m.geojson`
(download it from the Natural Earth vector repository). To only refresh capitals and regions on
an existing `data/answers.js` without the full pipeline, run `node build/patch_answers.js`.

Note: the script tags in `index.html` carry a `?v=N` version. Bump `N` whenever you change
`data/*.js` or `app.js` so browsers do not serve a cached copy.
