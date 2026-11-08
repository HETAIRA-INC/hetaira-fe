# hetaira-fe

The Hetaira website: static HTML/CSS/JS, no build step, deploy the folder as-is (GitHub Pages).

- `config.js`: the only place with repo URLs (db, c1/c2/c3, vtt) and the `?local=1` dev override
- `common.js`: data loading + cache, media fallbacks, layout, favourites, card builders, grid
- `listing.js`: page controllers (lists, filter bars, dossier numbers)
- `stylesheet.css`: the shared stylesheet; `descriptions.js`: fallback tag/trigger text
- pages: `index` (home) · `library` · `detailed` · `artists`/`artist` · `albums`/`album` · `tags`/`tag` · `triggers`/`trigger` · `vttplayer` · `about` · `404`

Preview unpublished data: run `npm start` in hetaira-admin, serve this folder with any static server, open a page with `?local=1`.
Reference: [`../docs/FRONTEND.md`](../docs/FRONTEND.md) (URL parameters, `H.*` API, CSS structure, fallbacks).
