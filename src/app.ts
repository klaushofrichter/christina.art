import express, { Express, NextFunction, Request, Response } from 'express';
import compression from 'compression';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { healthRouter } from './routes/health';
import { canonicalHost } from './canonical';
import { Site, loadCompiled } from './content';
import { Assets, renderHome, renderNotFound } from './views/page';

export const PUBLIC_DIR = path.join(__dirname, '..', 'public');

/** Traefik → Kourier → queue-proxy → us. A CIDR list rather than a hop count,
 *  so an added hop fails safe instead of quietly trusting a visitor's header
 *  (the cluster rule; see kube-setup's "Building a New Service"). */
export const TRUSTED_PROXIES = ['loopback', '10.42.0.0/16', '10.43.0.0/16'];

/** Everything comes from this origin. The one script is a file, never inline;
 *  the picture colours are set through the CSSOM, which style-src allows. */
const CSP = [
  "default-src 'none'",
  "style-src 'self'",
  "script-src 'self'",
  "img-src 'self'",
  // Same-origin fetches only. Nothing on the page fetches; it is here so
  // Lighthouse (Google's PageSpeed test) can read robots.txt from the page.
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

function securityHeaders(_req: Request, res: Response, next: NextFunction): void {
  res.set({
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Strict-Transport-Security': 'max-age=31536000',
  });
  next();
}

/** A short content hash for each client file, carried as ?v= so a deploy
 *  reaches returning visitors at once even though the files are cached. */
function assetVersions(dir: string): Assets {
  const v = (name: string) =>
    crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, name))).digest('hex').slice(0, 10);
  return { css: v('site.css'), js: v('site.js') };
}

export function createApp(site: Site = loadCompiled()): Express {
  const assets = assetVersions(PUBLIC_DIR);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', TRUSTED_PROXIES);

  // First, so the readiness probe never meets a redirect or anything else.
  app.use(healthRouter());

  app.use(canonicalHost);
  app.use(securityHeaders);
  // The page, stylesheet and script are text; compression cuts them by about
  // three quarters. It skips types that are already compressed, so the
  // pictures go out untouched.
  app.use(compression());

  // Rendered per request: it is a few kilobytes of string, and an exhibition
  // moves from Upcoming to Past on the right day without a restart.
  app.get('/', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.type('html').send(renderHome(site, assets));
  });

  // Picture file names carry a content hash, so they never change in place.
  app.use(
    '/img',
    express.static(path.join(PUBLIC_DIR, 'img'), { index: false, immutable: true, maxAge: '365d', fallthrough: true }),
  );
  // site.css/js are linked as ?v=<content hash>, so a request carrying the
  // current hash can be cached for a year: the next deploy that changes the
  // file changes the URL. Anything else (icons, robots.txt, a bare
  // /site.css) gets a day.
  app.use(
    express.static(PUBLIC_DIR, {
      index: false,
      maxAge: '1d',
      setHeaders: (res, file) => {
        const name = path.basename(file);
        const v = (res.req as Request).query?.v;
        if ((name === 'site.css' && v === assets.css) || (name === 'site.js' && v === assets.js)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    }),
  );

  app.use((_req: Request, res: Response) => {
    res.status(404).type('html').send(renderNotFound(site, assets));
  });

  return app;
}
