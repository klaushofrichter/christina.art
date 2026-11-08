import { ARTIST, CANONICAL_ORIGIN } from '../site';

/** The placeholder. Deliberately only what is known to be true: her name and
 *  that the site is coming. No biography, works or contact details until
 *  they are supplied. */
export function renderHome(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${ARTIST}</title>
<meta name="description" content="${ARTIST}. Website coming soon.">
<link rel="canonical" href="${CANONICAL_ORIGIN}/">
<link rel="stylesheet" href="/site.css">
</head>
<body>
<main>
  <h1>${ARTIST}</h1>
  <p class="soon">Website coming soon</p>
</main>
</body>
</html>
`;
}

export function renderNotFound(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Not found · ${ARTIST}</title>
<meta name="robots" content="noindex">
<link rel="stylesheet" href="/site.css">
</head>
<body>
<main>
  <h1>${ARTIST}</h1>
  <p class="soon">This page does not exist. <a href="/">Home</a></p>
</main>
</body>
</html>
`;
}
