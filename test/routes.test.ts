import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';

const app = () => createApp();

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
    const res = await request(app()).head('/health');
    expect(res.status).toBe(200);
  });

  it('is never redirected, whatever the host', async () => {
    const res = await request(app()).get('/health').set('Host', 'www.christinaschwarz.art');
    expect(res.status).toBe(200);
  });
});

describe('GET /', () => {
  it('serves the placeholder', async () => {
    const res = await request(app()).get('/').set('Host', 'christinaschwarz.art');
    expect(res.status).toBe(200);
    expect(res.type).toBe('text/html');
    expect(res.text).toContain('<h1>Christina Schwarz</h1>');
    expect(res.text).toContain('Website coming soon');
    expect(res.text).toContain('<link rel="canonical" href="https://christinaschwarz.art/">');
  });

  it('sends the security headers', async () => {
    const res = await request(app()).get('/');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('serves the stylesheet it links', async () => {
    const res = await request(app()).get('/site.css');
    expect(res.status).toBe(200);
    expect(res.type).toBe('text/css');
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
    const res = await request(app()).get('/').set('Host', 'christinaschwarz.art');
    expect(res.status).toBe(200);
  });
});

describe('GET /favicon.ico', () => {
  it('answers with no content rather than a 404', async () => {
    const res = await request(app()).get('/favicon.ico');
    expect(res.status).toBe(204);
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
    const res = await request(app()).get('/..%2fpackage.json');
    expect(res.status).toBe(404);
  });
});
