import { Router, Request, Response } from 'express';
import { appVersion } from '../version';

/** Readiness probe, deploy smoke test and version-exporter all read this.
 *  The version field is what makes it more than a liveness check: the deploy
 *  waits until it reports the version that run stamped. */
export function healthRouter(): Router {
  const router = Router();
  router.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({
      status: 'ok',
      service: 'christina-art',
      version: appVersion(),
    });
  });
  return router;
}
