import { NextFunction, Request, Response } from 'express';
import { CANONICAL_ORIGIN } from './site';

/** `www.christinaschwarz.art/<anything>` → 301 to the bare name, path and
 *  query kept.
 *
 *  The primary redirect is expected to live in the cluster (a Traefik
 *  redirectRegex in front of Knative, the pattern kube-setup uses for
 *  insta's legacy name), because a Knative DomainMapping may rewrite the Host
 *  header before the request reaches this process. This is the fallback for
 *  when the original host does arrive, either as Host or, with `trust proxy`
 *  set, as X-Forwarded-Host — both of which `req.hostname` reads. */
export function canonicalHost(req: Request, res: Response, next: NextFunction): void {
  if (req.hostname.toLowerCase().startsWith('www.')) {
    res.redirect(301, CANONICAL_ORIGIN + req.originalUrl);
    return;
  }
  next();
}
