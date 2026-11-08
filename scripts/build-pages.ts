/**
 * A static copy of the site for GitHub Pages, the backup location (Klaus,
 * 2026-11-08): https://klaushofrichter.github.io/christina.art/
 *
 *   APP_VERSION=2026.11.08.5 npx tsx scripts/build-pages.ts _site /christina.art
 *
 * The page is rendered exactly as the server renders it (src/views/page.ts),
 * from the same compiled content, then:
 *  - every site-relative URL ("/img/…", "/site.css", "/") gains the base path,
 *    because a project site lives under /<repo>/;
 *  - the CSP the server sends as a header goes in a <meta> (Pages sets no
 *    headers; frame-ancestors is header-only, so it is left out);
 *  - it is marked noindex, and the canonical link still names
 *    https://christinaschwarz.art, so search engines never prefer the backup.
 * The public/ files are copied beside it, and 404.html is the not-found page.
 *
 * Exhibitions split into Upcoming and Past on the day of the build, so the
 * Pages workflow rebuilds daily as well as after every release.
 */
import fs from 'fs';
import path from 'path';
import { CSP, PUBLIC_DIR, assetVersions } from '../src/app';
import { loadCompiled } from '../src/content';
import { renderHome, renderNotFound } from '../src/views/page';

/** frame-ancestors is ignored (and warned about) in a <meta> CSP. */
export const META_CSP = CSP.split('; ')
  .filter((d) => !d.startsWith('frame-ancestors'))
  .join('; ');

/** Prefix every site-relative URL in the markup with `base` ("/christina.art"). */
export function rebase(html: string, base: string): string {
  return html
    .replace(/\b(href|src)="\/(?!\/)/g, `$1="${base}/`)
    .replace(/\bsrcset="([^"]*)"/g, (_m, list: string) =>
      `srcset="${list.replace(/(^|,\s*)\/(?!\/)/g, `$1${base}/`)}"`,
    );
}

/** The changes a static host needs: CSP as a meta, noindex. */
export function forPages(html: string, base: string): string {
  const head =
    `<meta http-equiv="Content-Security-Policy" content="${META_CSP}">\n` +
    (html.includes('name="robots"') ? '' : '<meta name="robots" content="noindex">\n');
  return rebase(html, base).replace(/(<meta charset="[^"]*">\n?)/i, `$1${head}`);
}

export function buildPages(outDir: string, base: string, today: Date = new Date()): void {
  if (base && (!base.startsWith('/') || base.endsWith('/'))) {
    throw new Error(`base must look like "/christina.art" (or be empty), not "${base}"`);
  }
  const site = loadCompiled();
  const assets = assetVersions(PUBLIC_DIR);
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.cpSync(PUBLIC_DIR, outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), forPages(renderHome(site, assets, today), base));
  fs.writeFileSync(path.join(outDir, '404.html'), forPages(renderNotFound(site, assets), base));
  // Serve files as they are; no Jekyll processing.
  fs.writeFileSync(path.join(outDir, '.nojekyll'), '');
}

if (require.main === module) {
  const [outDir = '_site', base = '/christina.art'] = process.argv.slice(2);
  buildPages(path.resolve(outDir), base);
  console.log(`wrote ${outDir} for ${base || '/'} (version ${process.env.APP_VERSION || 'dev'})`);
}
