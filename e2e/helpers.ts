import { Page, expect } from '@playwright/test';

/** Console errors, uncaught exceptions and CSP violations seen while a test
 *  runs. Every walkthrough ends by asserting this is empty: a page that
 *  "works" while the console fills with errors is not working. */
export function watchProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`exception: ${e.message}`));
  page.on('response', (r) => {
    // Same-origin requests that fail are broken links or missing files.
    const u = new URL(r.url());
    if (u.origin === new URL(page.url() || r.url()).origin && r.status() >= 400 && !u.pathname.startsWith('/does-not-exist')) {
      problems.push(`HTTP ${r.status()}: ${u.pathname}`);
    }
  });
  page.on('requestfailed', (r) => {
    const failure = r.failure()?.errorText ?? '';
    // A navigation away aborts in-flight lazy images; that is not a fault.
    if (!/ABORTED|cancelled|NS_BINDING_ABORTED/i.test(failure)) problems.push(`failed: ${r.url()} ${failure}`);
  });
  return problems;
}

/** Scroll the whole page in steps, so lazy pictures load and reveals fire,
 *  then return to the top. */
export async function scrollThrough(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const step = Math.max(200, Math.floor(window.innerHeight * 0.7));
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, document.documentElement.scrollHeight);
    await new Promise((r) => setTimeout(r, 120));
  });
}

/** Every <img> on the page has arrived and decoded: none broken, none still
 *  waiting.
 *
 *  WebKit starts a lazy picture only while it is near the viewport, and a
 *  quick scroll past (scrollThrough) can leave it unrequested once the view
 *  has moved on; a reader who stops at it gets it. So each poll brings the
 *  first picture still missing into view, as that reader would, and only a
 *  picture that never arrives there fails. */
export async function expectAllPicturesLoaded(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const missing = Array.from(document.images).filter((img) => !img.complete || img.naturalWidth === 0);
          missing[0]?.scrollIntoView({ block: 'center' });
          return missing.map((img) => img.currentSrc || img.src);
        }),
      { timeout: 20_000, message: 'pictures that did not load' },
    )
    .toEqual([]);
}
