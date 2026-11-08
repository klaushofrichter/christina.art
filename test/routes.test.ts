import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { loadSite } from '../src/content';

const site = loadSite();
const app = () => createApp(site);

describe('GET /health', () => {
  afterEach(() => {
    delete process.env.APP_VERSION;
  });

  it('reports ok and the version', async () => {
    const res = await request(app()).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok', service: 'christina-art', version: 'dev' });
  });

  it('reports the stamped version', async () => {
    process.env.APP_VERSION = '2026.11.08.1';
    const res = await request(app()).get('/health');
    expect(res.body.version).toBe('2026.11.08.1');
  });

  it('answers HEAD (the uptime monitor uses it)', async () => {
    expect((await request(app()).head('/health')).status).toBe(200);
  });

  it('is never redirected, whatever the host', async () => {
    const res = await request(app()).get('/health').set('Host', 'www.christinaschwarz.art');
    expect(res.status).toBe(200);
  });
});

describe('GET /', () => {
  it('carries the heading the deploy smoke test looks for', async () => {
    const res = await request(app()).get('/').set('Host', 'christinaschwarz.art');
    expect(res.status).toBe(200);
    expect(res.type).toBe('text/html');
    // deploy-production.yml greps for exactly this; keep them in step.
    expect(res.text).toContain('<h1>Christina Schwarz</h1>');
    expect(res.text).toContain('<link rel="canonical" href="https://christinaschwarz.art/">');
  });

  it('shows every work with its title, in every format', async () => {
    const res = await request(app()).get('/');
    for (const w of site.works) {
      expect(res.text).toContain(`id="work-${w.slug}"`);
      expect(res.text).toContain(`<span class="title">${w.title}</span>`);
      for (const ext of ['avif', 'webp', 'jpg']) {
        expect(res.text).toContain(`/img/${w.slug}-${w.image.widths[0]}.${w.image.hash}.${ext}`);
      }
    }
  });

  it('loads the first work eagerly and the rest lazily', async () => {
    const res = await request(app()).get('/');
    expect(res.text.match(/fetchpriority="high"/g)).toHaveLength(1);
    expect(res.text.match(/loading="lazy"/g)!.length).toBeGreaterThanOrEqual(site.works.length - 1);
  });

  it('has the exhibitions, the about text and a contact address', async () => {
    const res = await request(app()).get('/');
    expect(res.text).toContain('id="exhibitions"');
    expect(res.text).toContain('id="about"');
    expect(res.text).toContain(`href="mailto:${site.email}"`);
    for (const e of site.exhibitions) expect(res.text).toContain(e.title);
  });

  it('links stylesheet and script with a content version', async () => {
    const res = await request(app()).get('/');
    expect(res.text).toMatch(/href="\/site\.css\?v=[0-9a-f]{10}"/);
    expect(res.text).toMatch(/src="\/site\.js\?v=[0-9a-f]{10}"/);
  });

  it('runs no inline script, so the CSP can forbid it', async () => {
    const res = await request(app()).get('/');
    const inline = [...res.text.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)];
    for (const m of inline) expect(m[1]).toContain('type="application/json"');
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
    expect(res.headers['content-security-policy']).not.toContain('unsafe-inline');
  });

  it('sends the security headers', async () => {
    const res = await request(app()).get('/');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('escapes content, so a stray < in the content files cannot become markup', async () => {
    const evil = { ...site, works: site.works.map((w, i) => (i ? w : { ...w, title: '<script>x</script>' })) };
    const res = await request(createApp(evil)).get('/');
    expect(res.text).not.toContain('<script>x</script>');
    expect(res.text).toContain('&lt;script&gt;x&lt;/script&gt;');
  });
});

describe('demo sash and version', () => {
  afterEach(() => {
    delete process.env.APP_VERSION;
  });

  it('wears the DEMO sash while the content is placeholder data', async () => {
    const res = await request(app()).get('/');
    expect(res.text).toContain('class="sash"');
    expect(res.text).toContain('<body class="has-sash">');
    // Once on the page, once in the enlarged view (a modal dialog covers the page's).
    expect(res.text.match(/class="sash"/g)).toHaveLength(2);
    expect(res.text).toMatch(/<dialog class="lightbox"[^>]*>\n<div class="sash"/);
  });

  it('drops the sash once the content is real', async () => {
    const res = await request(createApp({ ...site, demo: false })).get('/');
    expect(res.text).not.toContain('class="sash"');
    expect(res.text).toContain('<body>');
  });

  it('shows the release in the footer as the deploy smoke test expects it', async () => {
    process.env.APP_VERSION = '2026.11.08.4';
    const res = await request(app()).get('/');
    // deploy-production.yml greps for exactly this.
    expect(res.text).toContain('<span class="ver">v2026.11.08.4</span>');
  });

  it('says dev for a local build rather than inventing a release', async () => {
    const res = await request(app()).get('/');
    expect(res.text).toContain('<span class="ver">dev</span>');
  });
});

describe('static files', () => {
  it('serves the stylesheet and script', async () => {
    expect((await request(app()).get('/site.css')).type).toBe('text/css');
    expect((await request(app()).get('/site.js')).type).toMatch(/javascript/);
  });

  it('caches pictures for a year, as immutable', async () => {
    const w = site.works[0];
    const res = await request(app()).get(`/img/${w.slug}-${w.image.widths[0]}.${w.image.hash}.avif`);
    expect(res.status).toBe(200);
    expect(res.type).toBe('image/avif');
    expect(res.headers['cache-control']).toContain('immutable');
    expect(res.headers['cache-control']).toContain('max-age=31536000');
  });

  it('serves the favicon set', async () => {
    for (const p of ['/favicon.ico', '/favicon-32.png', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png']) {
      expect((await request(app()).get(p)).status, p).toBe(200);
    }
  });
});

describe('www redirect', () => {
  it('sends www to the bare name with a 301, keeping path and query', async () => {
    const res = await request(app()).get('/some/path?x=1&y=2').set('Host', 'www.christinaschwarz.art');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('https://christinaschwarz.art/some/path?x=1&y=2');
  });

  it('reads the original host from X-Forwarded-Host behind the cluster proxies', async () => {
    const res = await request(app())
      .get('/')
      .set('Host', 'christina-art.christina-art.svc.cluster.local')
      .set('X-Forwarded-Host', 'www.christinaschwarz.art');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('https://christinaschwarz.art/');
  });

  it('leaves the canonical name alone', async () => {
    expect((await request(app()).get('/').set('Host', 'christinaschwarz.art')).status).toBe(200);
  });
});

describe('unknown paths', () => {
  it('return 404 with a page, not a stack trace', async () => {
    const res = await request(app()).get('/nope');
    expect(res.status).toBe(404);
    expect(res.type).toBe('text/html');
    expect(res.text).toContain('Christina Schwarz');
  });

  it('cannot read outside public/', async () => {
    expect((await request(app()).get('/..%2fpackage.json')).status).toBe(404);
    expect((await request(app()).get('/img/..%2f..%2fcontent%2fbio.json')).status).toBe(404);
  });
});
