/**
 * Everything the page refers to exists and is served correctly, the markup is
 * valid, and the transport details (compression, caching, robots.txt) that
 * Google's PageSpeed test and every visitor depend on are in place.
 */
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { HtmlValidate } from 'html-validate';
import { createApp } from '../src/app';
import { loadSite } from '../src/content';

const site = loadSite();
const app = () => createApp(site);
const ROOT = path.join(__dirname, '..');

/** Every same-origin URL a page names: src, srcset entries and href. */
function referencedUrls(html: string): string[] {
  const urls = new Set<string>();
  for (const m of html.matchAll(/\s(?:src|href)="([^"]+)"/g)) urls.add(m[1]);
  for (const m of html.matchAll(/\ssrcset="([^"]+)"/g)) {
    for (const part of m[1].split(',')) urls.add(part.trim().split(/\s+/)[0]);
  }
  return [...urls].filter((u) => u.startsWith('/') && !u.startsWith('//'));
}

describe('every file the page refers to', () => {
  it('is served, with the right type', async () => {
    const page = await request(app()).get('/');
    const urls = referencedUrls(page.text);
    expect(urls.length).toBeGreaterThan(50);
    for (const u of urls) {
      const res = await request(app()).get(u);
      expect(res.status, u).toBe(200);
      const ext = path.extname(u.split('?')[0]);
      const type = { '.avif': 'image/avif', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.css': 'text/css', '.js': 'javascript', '.svg': 'image/svg', '.ico': 'image/', '.png': 'image/png' }[ext];
      if (type) expect(res.headers['content-type'], u).toContain(type);
    }
  });

  it('includes every picture file there is: no orphans left in public/img', async () => {
    const page = await request(app()).get('/');
    const referenced = new Set(referencedUrls(page.text).filter((u) => u.startsWith('/img/')).map((u) => u.slice(5)));
    const onDisk = fs.readdirSync(path.join(ROOT, 'public', 'img'));
    // Every width/format of every work and the portrait is offered in a srcset.
    expect(onDisk.filter((f) => !referenced.has(f))).toEqual([]);
  });
});

describe('markup', () => {
  const validator = new HtmlValidate({
    extends: ['html-validate:recommended'],
    rules: {
      // The page is generated; these are style preferences, not errors.
      'no-trailing-whitespace': 'off',
      'void-style': 'off',
      'attribute-boolean-style': 'off',
      // "long title" is not a defect for an artist's page.
      'long-title': 'off',
    },
  });

  for (const [name, url, status] of [['home page', '/', 200], ['404 page', '/nope', 404]] as const) {
    it(`the ${name} is valid HTML`, async () => {
      const res = await request(app()).get(url);
      expect(res.status).toBe(status);
      const report = await validator.validateString(res.text);
      const messages = report.results.flatMap((r) => r.messages.map((m) => `${m.line}:${m.column} ${m.ruleId} ${m.message}`));
      expect(messages).toEqual([]);
    });
  }
});

describe('transport', () => {
  it('compresses the page, the stylesheet and the script', async () => {
    for (const u of ['/', '/site.css', '/site.js']) {
      const res = await request(app()).get(u).set('Accept-Encoding', 'gzip, br');
      expect(res.headers['content-encoding'], u).toMatch(/^(gzip|br)$/);
    }
  });

  it('does not recompress pictures', async () => {
    const w = site.works[0];
    const res = await request(app()).get(`/img/${w.slug}-${w.image.widths[0]}.${w.image.hash}.avif`).set('Accept-Encoding', 'gzip, br');
    expect(res.headers['content-encoding']).toBeUndefined();
  });

  it('caches the stylesheet and script for a year when asked for by their current hash', async () => {
    const page = await request(app()).get('/');
    const css = page.text.match(/href="(\/site\.css\?v=[0-9a-f]+)"/)![1];
    const js = page.text.match(/src="(\/site\.js\?v=[0-9a-f]+)"/)![1];
    for (const u of [css, js]) {
      const res = await request(app()).get(u);
      expect(res.headers['cache-control'], u).toBe('public, max-age=31536000, immutable');
    }
    // A stale or missing hash is not promised forever.
    expect((await request(app()).get('/site.css?v=0000000000')).headers['cache-control']).toBe('public, max-age=86400');
    expect((await request(app()).get('/site.css')).headers['cache-control']).toBe('public, max-age=86400');
  });

  it('serves a robots.txt that allows crawling', async () => {
    const res = await request(app()).get('/robots.txt');
    expect(res.status).toBe(200);
    expect(res.type).toBe('text/plain');
    expect(res.text).toMatch(/^User-agent: \*$/m);
    expect(res.text).toMatch(/^Allow: \/$/m);
  });

  it('allows same-origin fetches only, so Lighthouse can read robots.txt', async () => {
    const res = await request(app()).get('/');
    expect(res.headers['content-security-policy']).toContain("connect-src 'self'");
  });
});

describe('footer', () => {
  it('credits Skylar.Technology with a link', async () => {
    const res = await request(app()).get('/');
    expect(res.text).toContain('powered by <a href="https://www.skylar.technology">Skylar.Technology</a>');
  });
});
