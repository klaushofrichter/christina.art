/**
 * Qualities that are easy to lose without noticing: the page works without
 * JavaScript, honours reduced motion, does not jump while loading, stays
 * light on a phone, and the demo sash never gets in the way.
 */
import { test, expect } from '@playwright/test';
import { watchProblems, scrollThrough, expectAllPicturesLoaded } from './helpers';

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('the whole page is still there and every work opens as a picture', async ({ page, request }) => {
    // No page.evaluate here: with scripting off it has nothing to run in.
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // Nothing is left hidden waiting for a script that never runs.
    for (const el of await page.locator('.reveal').all()) {
      await el.scrollIntoViewIfNeeded();
      await expect(el).toBeVisible();
    }
    for (const img of await page.locator('figure.work img, .portrait img').all()) {
      await img.scrollIntoViewIfNeeded();
      await expect(img).toBeVisible();
      const src = (await img.getAttribute('src'))!;
      expect((await request.get(src)).status(), src).toBe(200);
    }
    // Each work links straight to its largest JPEG.
    const links = await page.locator('figure.work a.frame').evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
    expect(links.length).toBeGreaterThan(0);
    for (const href of links) {
      expect(href).toMatch(/^\/img\/.+\.jpg$/);
      expect((await request.get(href)).status(), href).toBe(200);
    }
  });
});

test.describe('with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('everything is visible at once, with no slow fades', async ({ page }) => {
    await page.goto('/');
    await page.locator('#about').scrollIntoViewIfNeeded();
    const hidden = await page.locator('.reveal').evaluateAll((els) =>
      els.filter((e) => Number(getComputedStyle(e).opacity) < 1).length,
    );
    expect(hidden).toBe(0);
  });
});

test('nothing jumps while the page loads (layout shift)', async ({ page }) => {
  await page.addInitScript(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
        if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await page.goto('/');
  await scrollThrough(page);
  await expectAllPicturesLoaded(page);
  const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
  // Google's "good" threshold is 0.1; reserved picture sizes keep this near 0.
  expect(cls).toBeLessThan(0.02);
});

test('every work holds its place before its picture arrives', async ({ page }) => {
  // Hold back every picture, as a slow network would. Each work must already
  // take the box its picture will fill: in Firefox and Safari an unsized lazy
  // picture took none, the page grew as they arrived, and a section link
  // stopped short of its section.
  await page.route('**/img/**', () => {});
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const boxes = await page.locator('figure.work .frame img').evaluateAll((imgs) =>
    imgs.map((img) => {
      const r = img.getBoundingClientRect();
      return { w: r.width, h: r.height, aspect: Number(img.getAttribute('width')) / Number(img.getAttribute('height')) };
    }),
  );
  expect(boxes.length).toBeGreaterThan(0);
  for (const b of boxes) {
    expect(b.h, 'a picture with no height before it loads').toBeGreaterThan(100);
    expect(b.w / b.h).toBeCloseTo(b.aspect, 1);
  }
});

test('a phone fetches small text and pictures sized for its screen', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone projects only');
  await page.goto('/', { waitUntil: 'load' });
  await scrollThrough(page);
  await expectAllPicturesLoaded(page);
  const entries = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .concat(performance.getEntriesByType('navigation'))
      .map((e) => ({ url: e.name.replace(location.origin, ''), bytes: (e as PerformanceResourceTiming).encodedBodySize })),
  );
  // The page, stylesheet and script, compressed: about 10 KB today.
  const text = entries.filter((e) => !e.url.startsWith('/img/') && !/\.(svg|ico|png)$/.test(e.url));
  expect(text.reduce((n, e) => n + e.bytes, 0)).toBeLessThan(40_000);

  // Each picture at the width the screen needs, never larger: drawn width
  // times the pixel ratio, rounded up to the next file the pipeline made.
  const drawn = await page.evaluate(() =>
    Array.from(document.querySelectorAll('figure.work img, .portrait img')).map((img) => ({
      url: (img as HTMLImageElement).currentSrc.replace(location.origin, ''),
      need: (img as HTMLImageElement).getBoundingClientRect().width * devicePixelRatio,
    })),
  );
  for (const d of drawn) {
    const w = Number(d.url.match(/-(\d+)\.[0-9a-f]{10}\./)![1]);
    expect(w, `${d.url} for ${Math.round(d.need)}px`).toBeLessThanOrEqual(Math.max(d.need * 1.6, 480));
  }
  // All of it together: about 750 KB today, for six works and a portrait.
  const pictures = entries.filter((e) => e.url.startsWith('/img/'));
  expect(pictures.reduce((n, e) => n + e.bytes, 0)).toBeLessThan(1_500_000);
});

test('no console errors or CSP violations through a full visit', async ({ page, isMobile }) => {
  const problems = watchProblems(page);
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP: ${e.violatedDirective} ${e.blockedURI}`));
  });
  await page.goto('/');
  await scrollThrough(page);
  const opener = page.locator('figure.work .frame').first();
  if (isMobile) await opener.tap();
  else await opener.click();
  await page.locator('dialog.lightbox .lb-next').click();
  await page.keyboard.press('Escape');
  expect(problems).toEqual([]);
});

test.describe('the demo sash', () => {
  test('never covers a section link', async ({ page }) => {
    await page.goto('/');
    const sash = page.locator('body > .sash span');
    test.skip((await sash.count()) === 0, 'content is not placeholder data: no sash');
    await expect(sash).toBeVisible();
    // The links stay tappable: the element at each link's centre is the link.
    for (const name of ['Works', 'Exhibitions', 'About']) {
      const link = page.locator('.bar nav').getByRole('link', { name });
      const b = (await link.boundingBox())!;
      const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x, y)?.textContent, [b.x + b.width / 2, b.y + b.height / 2]);
      expect(hit).toBe(name);
    }
    // And the rotated band starts clear of the last link.
    const about = (await page.locator('.bar nav a').last().boundingBox())!;
    const box = (await page.locator('body > .sash').boundingBox())!;
    expect(about.x + about.width).toBeLessThanOrEqual(box.x + box.width * 0.25 + 1);
  });

  test('shows in the enlarged view too, clear of Close', async ({ page, isMobile }) => {
    await page.goto('/');
    test.skip((await page.locator('.sash').count()) === 0, 'content is not placeholder data: no sash');
    const opener = page.locator('figure.work .frame').first();
    if (isMobile) await opener.tap();
    else await opener.click();
    const dialog = page.locator('dialog.lightbox');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.sash span')).toBeVisible();
    // Close and the sash's corner do not overlap.
    const close = (await dialog.locator('.lb-close').boundingBox())!;
    const box = (await dialog.locator('.sash').boundingBox())!;
    const apart =
      close.x + close.width <= box.x || box.x + box.width <= close.x || close.y + close.height <= box.y || box.y + box.height <= close.y;
    expect(apart).toBe(true);
    await dialog.locator('.lb-close').click();
    await expect(dialog).toBeHidden();
  });
});
