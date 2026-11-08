import { CANONICAL_ORIGIN } from '../site';
import { Exhibition, ImageEntry, Site, splitExhibitions } from '../content';
import { appVersion } from '../version';

export type Assets = { css: string; js: string };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
  'September', 'October', 'November', 'December'];

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** "12 March – 25 April 2027", "8 May – 14 June 2026", "3 – 9 Nov…" kept
 *  simple: the year is shown once when both ends share it. Parsed by hand so
 *  no timezone can move a date. */
export function dateRange(from: string, to: string): string {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const end = `${td} ${MONTHS[tm - 1]} ${ty}`;
  if (fy !== ty) return `${fd} ${MONTHS[fm - 1]} ${fy} – ${end}`;
  if (fm === tm) return `${fd} – ${end}`;
  return `${fd} ${MONTHS[fm - 1]} – ${end}`;
}

function srcset(slug: string, img: ImageEntry, ext: string): string {
  return img.widths.map((w) => `/img/${slug}-${w}.${img.hash}.${ext} ${w}w`).join(', ');
}

/** AVIF, then WebP, then JPEG: each browser takes the first it can show, at
 *  the width `sizes` says it will be drawn. width/height reserve the space
 *  before the picture arrives, so nothing jumps while the page loads. */
export function picture(
  slug: string,
  img: ImageEntry,
  alt: string,
  sizes: string,
  opts: { eager?: boolean; cls?: string } = {},
): string {
  const fallback = img.widths.find((w) => w >= 1200) ?? img.widths[img.widths.length - 1];
  return `<picture>
<source type="image/avif" srcset="${srcset(slug, img, 'avif')}" sizes="${sizes}">
<source type="image/webp" srcset="${srcset(slug, img, 'webp')}" sizes="${sizes}">
<img${opts.cls ? ` class="${opts.cls}"` : ''} src="/img/${slug}-${fallback}.${img.hash}.jpg" srcset="${srcset(slug, img, 'jpg')}" sizes="${sizes}" width="${img.width}" height="${img.height}" alt="${esc(alt)}" data-color="${img.color}" ${opts.eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">
</picture>`;
}

function largest(slug: string, img: ImageEntry): string {
  return `/img/${slug}-${img.widths[img.widths.length - 1]}.${img.hash}.jpg`;
}

function exhibitionItem(e: Exhibition): string {
  return `<li class="show reveal">
<p class="when">${esc(dateRange(e.from, e.to))}</p>
<h3>${esc(e.title)}</h3>
<p class="where">${esc(e.kind)} · ${esc(e.venue)}, ${esc(e.city)}</p>
</li>`;
}

/** The release as it is named everywhere else: v2026.11.08.3. A local or
 *  unstamped build says so plainly instead of pretending to be a release. */
export function versionLabel(version: string = appVersion()): string {
  return /^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(version) ? `v${version}` : version;
}

/** The demo sash, after cams.skylar.technology's: amber stripes across the
 *  top right corner, a label rather than a link, never in the way of a tap.
 *  Shown while any content file is still placeholder data. */
function sash(site: Site): string {
  if (!site.demo) return '';
  return `<div class="sash" role="note" aria-label="Demo: the biography, titles and exhibitions on this page are placeholders">
<span>DEMO<small>PLACEHOLDER CONTENT</small></span>
</div>
`;
}

export function renderHome(site: Site, assets: Assets, today: Date = new Date()): string {
  const { upcoming, past } = splitExhibitions(site.exhibitions, today);
  // Each work is drawn at most 1100px wide and never wider than the column.
  const workSizes = '(min-width: 1180px) 1100px, calc(100vw - 32px)';
  const works = site.works
    .map((w, i) => {
      const caption = [w.year, w.medium, w.size].filter(Boolean).map((x) => esc(String(x))).join(' · ');
      return `<figure class="work reveal" id="work-${esc(w.slug)}">
<a class="frame" href="${largest(w.slug, w.image)}" data-index="${i}" aria-label="${esc(w.title)}, view large">
${picture(w.slug, w.image, w.title, workSizes, { eager: i === 0 })}
</a>
<figcaption><span class="title">${esc(w.title)}</span><span class="meta">${caption}</span></figcaption>
</figure>`;
    })
    .join('\n');

  const portrait = site.portrait
    ? `<div class="portrait reveal">${picture('artist', site.portrait, `Portrait of ${site.artist}`, '(min-width: 900px) 360px, (min-width: 600px) 45vw, calc(100vw - 32px)')}</div>`
    : '';

  const year = today.getUTCFullYear();

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(site.artist)}</title>
<meta name="description" content="${esc(site.description)}">
<meta name="theme-color" content="#f3efe9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#1c1a18" media="(prefers-color-scheme: dark)">
<link rel="canonical" href="${CANONICAL_ORIGIN}/">
<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">
<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">
<link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(site.artist)}">
<meta property="og:description" content="${esc(site.description)}">
<meta property="og:url" content="${CANONICAL_ORIGIN}/">
<meta property="og:image" content="${CANONICAL_ORIGIN}/img/${site.works[0].slug}-${site.works[0].image.widths.find((w) => w >= 1200) ?? site.works[0].image.widths[site.works[0].image.widths.length - 1]}.${site.works[0].image.hash}.jpg">
<link rel="stylesheet" href="/site.css?v=${assets.css}">
<script src="/site.js?v=${assets.js}"></script>
</head>
<body${site.demo ? ' class="has-sash"' : ''}>
<a class="skip" href="#works">Skip to the works</a>
${sash(site)}<header class="bar">
<a class="mark" href="#top">${esc(site.artist)}</a>
<nav aria-label="Sections">
<a href="#works">Works</a>
<a href="#exhibitions">Exhibitions</a>
<a href="#about">About</a>
</nav>
</header>

<main>
<section class="intro" id="top">
<h1>${esc(site.artist)}</h1>
<p class="tagline">${esc(site.tagline)}</p>
</section>

<section class="works" id="works" aria-label="Works">
${works}
</section>

<section class="exhibitions" id="exhibitions">
<h2 class="reveal">Exhibitions</h2>
${upcoming.length ? `<h3 class="group reveal">Upcoming</h3>\n<ul class="shows">\n${upcoming.map(exhibitionItem).join('\n')}\n</ul>` : ''}
${past.length ? `<h3 class="group reveal">Past</h3>\n<ul class="shows">\n${past.map(exhibitionItem).join('\n')}\n</ul>` : ''}
</section>

<section class="about" id="about">
<h2 class="reveal">About</h2>
<div class="about-body">
${portrait}
<div class="bio">
${site.about.map((p) => `<p class="reveal">${esc(p)}</p>`).join('\n')}
<div class="contact reveal" id="contact">
<h3>Contact</h3>
<p>For enquiries about works, commissions and studio visits:</p>
<p><a class="email" href="mailto:${esc(site.email)}">${esc(site.email)}</a></p>
</div>
</div>
</div>
</section>
</main>

<footer class="foot">
<p>© ${year} ${esc(site.artist)}<span class="ver">${esc(versionLabel())}</span></p>
</footer>

<dialog class="lightbox" aria-label="Work, enlarged">
<figure>
<div class="stage"></div>
<figcaption><span class="title"></span><span class="meta"></span><span class="count"></span></figcaption>
</figure>
<button class="lb-close" type="button" aria-label="Close">×</button>
<button class="lb-prev" type="button" aria-label="Previous work">‹</button>
<button class="lb-next" type="button" aria-label="Next work">›</button>
</dialog>
</body>
</html>
`;
}

export function renderNotFound(site: Site, assets: Assets): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Not found · ${esc(site.artist)}</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/favicon.ico" sizes="16x16 32x32 48x48">
<link rel="stylesheet" href="/site.css?v=${assets.css}">
</head>
<body class="notfound">
<main>
<h1>${esc(site.artist)}</h1>
<p class="tagline">This page does not exist. <a href="/">Home</a></p>
</main>
</body>
</html>
`;
}
