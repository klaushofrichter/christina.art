import { defineConfig } from '@playwright/test';

const BASE_URL = process.env.BASE_URL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: BASE_URL || 'http://localhost:8080',
    // For machines with a browser installed outside Playwright's cache (cloud
    // sessions ship one at /opt/pw-browsers/chromium). Unset in CI, which
    // installs its own.
    launchOptions: process.env.PW_CHROMIUM_PATH
      ? { executablePath: process.env.PW_CHROMIUM_PATH }
      : {},
  },
  // Playwright builds, starts the server, waits for /health and stops it
  // afterwards, in CI and on a laptop alike. Left out when BASE_URL points the
  // suite at a server somebody else runs (e.g. the live site).
  webServer: BASE_URL ? undefined : {
    command: 'npm run build && node dist/server.js',
    url: 'http://localhost:8080/health',
    env: { PORT: '8080' },
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
