# Favicon v1 (backup)

The site's first favicon, Nov 2026: an ochre disc over a horizon line on
stone, drawn as SVG to match the site's palette. Replaced on 2026-11-08 by a
detail of Christina's "Pink Poppies" (Klaus's choice); kept here as a backup.
`icon-512.png` is how it looked.

To bring it back:

1. `git mv design/favicon-v1/favicon.svg public/favicon.svg`
2. In `scripts/images.ts`, set `FAVICON_CROP` to `null`.
3. `npm run images`, then commit `public/`.

The pipeline renders the favicon set from `public/favicon.svg` whenever no
crop is configured.
