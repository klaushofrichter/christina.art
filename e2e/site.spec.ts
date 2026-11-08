/**
 * The site, walked as a visitor walks it. Tagged @live tests are read-only
 * and run twice: before a release against the Docker image the release will
 * ship (production-checks.yml), and after it against https://christinaschwarz.art
 * (live-check.yml). Untagged tests run before release only.
 */
import { test, expect, Page } from '@playwright/test';
import { watchProblems, scrollThrough, expectAllPicturesLoaded } from './helpers';

/** Set by live-check.yml to the release just deployed. */
const EXPECT_VERSION = process.env.EXPECT_VERSION;
/** Only against the real hostname do www and plain http mean anything. */
const PRODUCTION = process.env.BASE_URL === 'https://christinaschwarz.art';

async function press(page: Page, isMobile: boolean, locator: ReturnType<Page['locator']>) {
  if (isMobile) await locator.tap();
  else await locator.click();
}

test('@live /health is ok and names the release the footer shows', async ({ page, request }) => {
  const res = await request.get('/health');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.status).toBe('ok');
  expect(body.service).toBe('christina-art');
  if (EXPECT_VERSION) expect(body.version).toBe(EXPECT_VERSION);

  await page.goto('/');
  const footer = page.locator('footer .ver');
  const label = /^\d{4}\.\d{2}\.\d{2}\.\d+$/.test(body.version) ? `v${body.version}` : body.version;
  await expect(footer).toHaveText(label);
});

test('@live the home page loads completely, every picture included', async ({ page }) => {
  const problems = watchProblems(page);
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle('Christina Schwarz');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Christina Schwarz');

  const works = page.locator('figure.work');
  expect(await works.count()).toBeGreaterThan(0);
  for (const fig of await works.all()) {
    await expect(fig.locator('figcaption .title')).not.toBeEmpty();
  }
  await expect(page.locator('#exhibitions h2')).toHaveText('Exhibitions');
  expect(await page.locator('#exhibitions .show').count()).toBeGreaterThan(0);
  await expect(page.locator('#about h2')).toHaveText('About');
  await expect(page.locator('#about .bio p').first()).not.toBeEmpty();
  await expect(page.locator('a.email')).toHaveAttribute('href', /^mailto:[^@\s]+@[^@\s]+\.[a-z]+$/);
  await expect(page.locator('.portrait img')).toHaveCount(1);

  await scrollThrough(page);
  await expectAllPicturesLoaded(page);
  // A modern format was chosen, not the JPEG fallback.
  const src = await works.first().locator('img').evaluate((img: HTMLImageElement) => img.currentSrc);
  expect(src).toMatch(/\.(avif|webp)$/);
  expect(problems).toEqual([]);
});

test('@live every section link lands on its section', async ({ page, isMobile }) => {
  const problems = watchProblems(page);
  await page.goto('/');
  for (const [name, id] of [['Exhibitions', 'exhibitions'], ['About', 'about'], ['Works', 'works']]) {
    await press(page, isMobile, page.locator('.bar nav').getByRole('link', { name }));
    await expect(page).toHaveURL(new RegExp(`#${id}$`));
    // Smooth scrolling over a long page can take a few seconds.
    await expect(page.locator(`#${id}`)).toBeInViewport({ timeout: 10_000 });
  }
  expect(problems).toEqual([]);
});

test('@live every link on the page goes somewhere that works', async ({ page, request, baseURL }) => {
  // Walks whatever the page links to, so a sub-page added later is covered
  // without touching this test: in-page anchors must have a target, other
  // same-site pages must load with the site's heading and no errors, files
  // must be served with a sensible type, and mail links must be addresses.
  await page.goto('/');
  const hrefs = await page.locator('a[href]').evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href')!))]);
  expect(hrefs.length).toBeGreaterThan(0);
  const origin = new URL(baseURL!).origin;

  for (const href of hrefs) {
    if (href.startsWith('mailto:')) {
      expect(href, href).toMatch(/^mailto:[^@\s]+@[^@\s]+$/);
      continue;
    }
    if (href.startsWith('#')) {
      await expect(page.locator(href), `anchor ${href}`).toHaveCount(1);
      continue;
    }
    const url = new URL(href, origin);
    if (url.origin !== origin) continue; // none today; external links are not ours to test
    if (url.pathname.startsWith('/img/')) {
      const res = await request.get(url.href);
      expect(res.status(), url.pathname).toBe(200);
      expect(res.headers()['content-type'], url.pathname).toMatch(/^image\//);
      continue;
    }
    // A sub-page: visit it like a person would.
    const sub = await page.context().newPage();
    const problems = watchProblems(sub);
    const res = await sub.goto(url.href);
    expect(res?.status(), url.pathname).toBe(200);
    await expect(sub.getByRole('heading', { level: 1 }), url.pathname).toBeVisible();
    await scrollThrough(sub);
    await expectAllPicturesLoaded(sub);
    expect(problems, url.pathname).toEqual([]);
    await sub.close();
  }
});

test('@live the enlarged view pages through every work and closes again', async ({ page, isMobile }) => {
  const problems = watchProblems(page);
  await page.goto('/');
  const figures = page.locator('figure.work');
  const count = await figures.count();
  const titles = await figures.locator('figcaption .title').allInnerTexts();

  const opener = figures.first().locator('.frame');
  await press(page, isMobile, opener);
  const box = page.locator('dialog.lightbox');
  await expect(box).toBeVisible();

  for (let i = 0; i < count; i++) {
    await expect(box.locator('.count')).toHaveText(`${i + 1} / ${count}`);
    await expect(box.locator('.title')).toHaveText(titles[i]);
    const big = box.locator('.stage img');
    await expect(big).not.toHaveClass(/pending/, { timeout: 15_000 });
    const loaded = await big.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0);
    expect(loaded, `work ${i + 1} picture`).toBe(true);
    // Drawn full-width, so a large file was chosen, not a thumbnail.
    const w = await big.evaluate((img: HTMLImageElement) => Number(img.currentSrc.match(/-(\d+)\.[0-9a-f]{10}\./)?.[1] ?? 0));
    expect(w, `work ${i + 1} file width`).toBeGreaterThanOrEqual(isMobile ? 800 : 1200);
    await press(page, isMobile, box.locator('.lb-next'));
  }
  // After the last, Next wraps to the first.
  await expect(box.locator('.count')).toHaveText(`1 / ${count}`);
  await press(page, isMobile, box.locator('.lb-prev'));
  await expect(box.locator('.count')).toHaveText(`${count} / ${count}`);

  await press(page, isMobile, box.locator('.lb-close'));
  await expect(box).toBeHidden();
  await expect(page).toHaveURL(/\/$|\/#?$/);
  expect(problems).toEqual([]);
});

test('@live in the enlarged view the words sit at the bottom: title, then ‹ n / N ›', async ({ page, isMobile }) => {
  await page.goto('/');
  await press(page, isMobile, page.locator('figure.work .frame').first());
  const box = page.locator('dialog.lightbox');
  await expect(box).toBeVisible();
  for (const step of [0, 1]) {
    if (step) await press(page, isMobile, box.locator('.lb-next'));
    await expect(box.locator('.stage img')).toBeVisible();
    const r = async (sel: string) => (await box.locator(sel).first().boundingBox())!;
    const [img, title, prev, count, next] = await Promise.all(
      ['.stage img', 'figcaption .title', '.lb-prev', '.count', '.lb-next'].map(r),
    );
    const mid = (b: { y: number; height: number }) => b.y + b.height / 2;
    const vh = page.viewportSize()!.height;
    // ‹ n / N › on one line, the count between the arrows.
    expect(Math.abs(mid(prev) - mid(count))).toBeLessThan(4);
    expect(Math.abs(mid(next) - mid(count))).toBeLessThan(4);
    expect(prev.x + prev.width).toBeLessThanOrEqual(count.x + 1);
    expect(count.x + count.width).toBeLessThanOrEqual(next.x + 1);
    // Bound to the bottom of the screen.
    expect(vh - (next.y + next.height)).toBeLessThan(48);
    // The title directly above the count, the picture above both.
    expect(title.y + title.height).toBeLessThanOrEqual(count.y + 1);
    expect(count.y - (title.y + title.height)).toBeLessThan(24);
    expect(img.y + img.height).toBeLessThanOrEqual(title.y + 1);
  }
});

test('@live a click beside the enlarged picture closes it', async ({ page, isMobile }) => {
  test.skip(isMobile, 'a mouse gesture');
  await page.goto('/');
  await page.locator('figure.work .frame').first().click();
  const box = page.locator('dialog.lightbox');
  await expect(box.locator('.stage img')).toBeVisible();
  const img = (await box.locator('.stage img').boundingBox())!;
  // Halfway between the screen's left edge and the picture's, level with it.
  expect(img.x).toBeGreaterThan(40);
  await page.mouse.click(img.x / 2, img.y + img.height / 2);
  await expect(box).toBeHidden();
});

test('@live the phone Back button closes the enlarged view, not the site', async ({ page, isMobile }) => {
  await page.goto('/');
  await press(page, isMobile, page.locator('figure.work .frame').first());
  await expect(page.locator('dialog.lightbox')).toBeVisible();
  await page.goBack();
  await expect(page.locator('dialog.lightbox')).toBeHidden();
  expect(new URL(page.url()).pathname).toBe('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});

test('@live an unknown page is a 404 with a way home', async ({ page, isMobile }) => {
  const response = await page.goto('/does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Christina Schwarz');
  await press(page, isMobile, page.getByRole('link', { name: 'Home' }));
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('figure.work').first()).toBeVisible();
});

test('@live security and caching headers are in place', async ({ request }) => {
  const home = await request.get('/');
  const h = home.headers();
  expect(h['content-security-policy']).toContain("default-src 'none'");
  expect(h['content-security-policy']).toContain("script-src 'self'");
  expect(h['content-security-policy']).not.toContain('unsafe-inline');
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['strict-transport-security']).toContain('max-age=');
  expect(h['x-powered-by']).toBeUndefined();

  const html = await home.text();
  const img = html.match(/\/img\/[^"\s]+\.avif/)![0];
  const pic = await request.get(img);
  expect(pic.status()).toBe(200);
  expect(pic.headers()['cache-control']).toContain('immutable');
  expect(pic.headers()['cache-control']).toContain('max-age=31536000');
});

test('@live www and plain http go to https://christinaschwarz.art, path and query kept', async ({ request }) => {
  test.skip(!PRODUCTION, 'only meaningful against the real hostname');
  for (const from of ['https://www.christinaschwarz.art/live-check?x=1', 'http://christinaschwarz.art/live-check?x=1']) {
    const res = await request.get(from, { maxRedirects: 0 });
    expect([301, 308], from).toContain(res.status());
    expect(res.headers()['location'], from).toBe('https://christinaschwarz.art/live-check?x=1');
  }
});

test.describe('keyboard', () => {
  test('arrow keys page and Escape closes; focus returns to the work', async ({ page, isMobile }) => {
    test.skip(isMobile, 'no keyboard on a phone');
    await page.goto('/');
    const count = await page.locator('figure.work').count();
    const opener = page.locator('figure.work .frame').first();
    await opener.focus();
    await page.keyboard.press('Enter');
    const box = page.locator('dialog.lightbox');
    await expect(box).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(box.locator('.count')).toHaveText(`2 / ${count}`);
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(box.locator('.count')).toHaveText(`${count} / ${count}`);
    await page.keyboard.press('Escape');
    await expect(box).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test('Tab reaches the section links and the works in order', async ({ page, isMobile }) => {
    test.skip(isMobile, 'no keyboard on a phone');
    await page.goto('/');
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      seen.push(await page.evaluate(() => (document.activeElement as HTMLElement)?.getAttribute('href') ?? ''));
    }
    // Skip link, then (on desktop) the name, then the three sections, then the first work.
    expect(seen).toContain('#works');
    expect(seen).toContain('#exhibitions');
    expect(seen).toContain('#about');
    expect(seen.some((h) => h.startsWith('/img/'))).toBe(true);
  });
});

test.describe('on a phone', () => {
  test('fits without sideways scrolling, and pictures fit the screen', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'phone projects only');
    await page.goto('/');
    await scrollThrough(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const vp = page.viewportSize()!;
    for (const img of await page.locator('figure.work img').all()) {
      const b = (await img.boundingBox())!;
      expect(b.width).toBeLessThanOrEqual(vp.width);
      expect(b.height).toBeLessThanOrEqual(vp.height * 0.83);
    }
  });

  test('a swipe pages through the enlarged works', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'phone projects only');
    await page.goto('/');
    await page.locator('figure.work .frame').first().tap();
    const stage = page.locator('dialog.lightbox .stage');
    await expect(page.locator('dialog.lightbox .count')).toHaveText(/^1 \//);
    await stage.dispatchEvent('touchstart', { touches: [{ identifier: 1, clientX: 300, clientY: 300 }] });
    await stage.dispatchEvent('touchend', { changedTouches: [{ identifier: 1, clientX: 120, clientY: 310 }] });
    await expect(page.locator('dialog.lightbox .count')).toHaveText(/^2 \//);
    // A mostly vertical drag is a scroll, not a page turn.
    await stage.dispatchEvent('touchstart', { touches: [{ identifier: 2, clientX: 200, clientY: 200 }] });
    await stage.dispatchEvent('touchend', { changedTouches: [{ identifier: 2, clientX: 140, clientY: 420 }] });
    await expect(page.locator('dialog.lightbox .count')).toHaveText(/^2 \//);
  });
});

for (const scheme of ['light', 'dark'] as const) {
  test(`@live the page and the enlarged view follow the ${scheme} theme`, async ({ page, isMobile }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    const lum = (sel: string) =>
      page.locator(sel).evaluate((el) => {
        const [r, g, b] = getComputedStyle(el).backgroundColor.match(/\d+/g)!.map(Number);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      });
    await press(page, isMobile, page.locator('figure.work .frame').first());
    await expect(page.locator('dialog.lightbox')).toBeVisible();
    if (scheme === 'light') {
      expect(await lum('body')).toBeGreaterThan(200);
      expect(await lum('dialog.lightbox')).toBeGreaterThan(200);
    } else {
      expect(await lum('body')).toBeLessThan(40);
      expect(await lum('dialog.lightbox')).toBeLessThan(40);
    }
  });
}
