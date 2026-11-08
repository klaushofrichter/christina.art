// Baked in by the Docker build (ARG APP_VERSION); "dev" when running locally.
// Read per call rather than at module load, so tests can observe a change.
export function appVersion(): string {
  return process.env.APP_VERSION || 'dev';
}
