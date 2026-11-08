import express, { Express, NextFunction, Request, Response } from 'express';
import path from 'path';
import { healthRouter } from './routes/health';
import { canonicalHost } from './canonical';
import { renderHome, renderNotFound } from './views/page';

export const PUBLIC_DIR = path.join(__dirname, '..', 'public');

/** Traefik → Kourier → queue-proxy → us. A CIDR list rather than a hop count,
 *  so an added hop fails safe instead of quietly trusting a visitor's header
 *  (the cluster rule; see kube-setup's "Building a New Service"). */
export const TRUSTED_PROXIES = ['loopback', '10.42.0.0/16', '10.43.0.0/16'];

/** Everything the page needs comes from this origin, and nothing runs. */
const CSP = [
  "default-src 'none'",
  "style-src 'self'",
  "img-src 'self'",
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

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', TRUSTED_PROXIES);

  // First, so the readiness probe never meets a redirect or anything else.
  app.use(healthRouter());

  app.use(canonicalHost);
  app.use(securityHeaders);

  app.get('/', (_req: Request, res: Response) => {
    res.type('html').send(renderHome());
  });

  // Browsers ask for this whether the page names one or not. There is no icon
  // yet (nothing to make one from), so say "nothing" rather than log a 404 on
  // every first visit. Replace with a real file in public/ when there is one.
  app.get('/favicon.ico', (_req: Request, res: Response) => {
    res.set('Cache-Control', 'public, max-age=86400').status(204).end();
  });

  // Not fingerprinted, so cached briefly rather than for a year: a deploy
  // must reach returning visitors within the hour.
  app.use(express.static(PUBLIC_DIR, { index: false, maxAge: '1h' }));

  app.use((_req: Request, res: Response) => {
    res.status(404).type('html').send(renderNotFound());
  });

  return app;
}
