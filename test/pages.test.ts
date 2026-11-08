import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildPages, rebase } from '../scripts/build-pages';

const BASE = '/christina.art';
let dir: string;
let home: string;
let notFound: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'christina-pages-'));
  buildPages(dir, BASE, new Date('2026-11-08T12:00:00Z'));
  home = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  notFound = fs.readFileSync(path.join(dir, '404.html'), 'utf8');
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

/** Every URL the markup names: href, src and each srcset candidate. */
function urls(html: string): string[] {
  const out = [...html.matchAll(/\b(?:href|src)="([^"]*)"/g)].map((m) => m[1]);
  for (const m of html.matchAll(/\bsrcset="([^"]*)"/g)) {
    out.push(...m[1].split(',').map((c) => c.trim().split(/\s+/)[0]));
  }
  return out;
}

describe('the GitHub Pages copy', () => {
  it('names only files that are in it, under the base path', () => {
    for (const html of [home, notFound]) {
      for (const u of urls(html)) {
        if (/^(https?:|mailto:|#)/.test(u)) continue;
        expect(u.startsWith(`${BASE}/`), `${u} is not under ${BASE}/`).toBe(true);
        const file = u.slice(BASE.length).split('?')[0];
        if (file === '/') continue;
        expect(fs.existsSync(path.join(dir, file)), `${u} is not in the copy`).toBe(true);
      }
    }
  });

  it('carries the CSP as a meta, minus frame-ancestors, before anything loads', () => {
    const csp = home.match(/<meta http-equiv="Content-Security-Policy" content="([^"]*)">/);
    expect(csp?.[1]).toContain("script-src 'self'");
    expect(csp?.[1]).not.toContain('frame-ancestors');
    expect(home.indexOf('Content-Security-Policy')).toBeLessThan(home.indexOf('<link rel="stylesheet"'));
    // Every script is a file (no inline code), whatever the tag's case.
    const scripts = home.match(/<script\b[^>]*>/gi) ?? [];
    expect(scripts.length).toBeGreaterThan(0);
    for (const tag of scripts) expect(tag).toMatch(/\bsrc="/i);
    expect(home).not.toMatch(/\sstyle\s*=/i);
  });

  it('is not indexed, and points search engines at the real site', () => {
    expect(home).toContain('<meta name="robots" content="noindex">');
    expect(home).toContain('<link rel="canonical" href="https://christinaschwarz.art/">');
    expect(notFound.match(/name="robots"/g)).toHaveLength(1);
  });

  it('is the same page: heading, every work, the way home from the 404', () => {
    expect(home).toContain('<h1>Christina Schwarz</h1>');
    expect(home.match(/<figure class="work /g)!.length).toBeGreaterThan(0);
    expect(notFound).toContain(`<a href="${BASE}/">Home</a>`);
    expect(fs.existsSync(path.join(dir, '.nojekyll'))).toBe(true);
  });

  it('rebases only site-relative URLs', () => {
    expect(rebase('<a href="/x"><a href="https://a/b"><a href="//cdn/x"><a href="#y">', '/b')).toBe(
      '<a href="/b/x"><a href="https://a/b"><a href="//cdn/x"><a href="#y">',
    );
    expect(rebase('<img srcset="/img/a 1w, /img/b 2w">', '/b')).toBe('<img srcset="/b/img/a 1w, /b/img/b 2w">');
  });
});
