import { defineConfig, devices } from '@playwright/test';

/**
 * Where the suite points:
 *  - nothing set: Playwright builds and starts the server itself (a laptop);
 *  - BASE_URL=http://localhost:8080: a server somebody else started, which in
 *    production-checks.yml is the Docker image the release will ship;
 *  - BASE_URL=https://christinaschwarz.art with --grep @live: the live site,
 *    after a release (live-check.yml). Only read-only tests carry @live.
 */
const BASE_URL = process.env.BASE_URL;
const LIVE = BASE_URL?.startsWith('https://');

// Sandboxes that reach the internet only through a proxy (cloud sessions)
// need it for Playwright's own HTTP client too; CI has no proxy.
const proxy = LIVE && process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;

// For machines with a Chromium outside Playwright's cache (cloud sessions ship
// one at /opt/pw-browsers). Unset in CI, which installs its own browsers.
const chromiumLaunch = process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Retries hide nothing locally; in CI one retry absorbs a runner hiccup and
  // the report still shows the test as flaky.
  retries: process.env.CI ? 1 : 0,
  forbidOnly: !!process.env.CI,
  timeout: LIVE ? 60_000 : 30_000,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL || 'http://localhost:8080',
    trace: 'retain-on-failure',
    proxy,
    screenshot: 'only-on-failure',
  },
  // A visitor arrives on any of these. The phone projects are the ones that
  // matter most (Klaus: "it must work very well on mobile"); Safari's engine
  // is WebKit, so the iPhone project is the real check for iOS.
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'], launchOptions: chromiumLaunch } },
    { name: 'phone-chromium', use: { ...devices['Pixel 7'], launchOptions: chromiumLaunch } },
    { name: 'phone-webkit', use: { ...devices['iPhone 13'] } },
    { name: 'desktop-firefox', use: { ...devices['Desktop Firefox'] } },
  ],
  webServer: BASE_URL
    ? undefined
    : {
        command: 'npm run build && node dist/server.js',
        url: 'http://localhost:8080/health',
        env: { PORT: '8080' },
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
      },
});
