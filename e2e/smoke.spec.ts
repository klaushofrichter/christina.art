import { test, expect, Page } from '@playwright/test';

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

test('the page loads cleanly with her name, the works and the sections', async ({ page }) => {
  const errors = collectErrors(page);
  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle('Christina Schwarz');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Christina Schwarz');
  await expect(page.locator('figure.work')).not.toHaveCount(0);
  await expect(page.locator('#exhibitions h2')).toHaveText('Exhibitions');
  await expect(page.locator('#about h2')).toHaveText('About');
  await expect(page.locator('a.email')).toHaveAttribute('href', /^mailto:/);
  expect(errors).toEqual([]);
});

test('pictures arrive in a modern format and fade in once loaded', async ({ page }) => {
  await page.goto('/');
  const first = page.locator('figure.work img').first();
  await expect(first).not.toHaveClass(/pending/);
  const src = await first.evaluate((img: HTMLImageElement) => img.currentSrc);
  expect(src).toMatch(/\.(avif|webp)$/);
});

test('sections reveal as they scroll into view', async ({ page }) => {
  await page.goto('/');
  const heading = page.locator('#about h2');
  await heading.scrollIntoViewIfNeeded();
  await expect(heading).toHaveClass(/\bin\b/);
});

test('a work opens large, pages with the keyboard, and closes with Escape', async ({ page }) => {
  await page.goto('/');
  const count = await page.locator('figure.work').count();
  await page.locator('figure.work .frame').first().click();
  const box = page.locator('dialog.lightbox');
  await expect(box).toBeVisible();
  await expect(box.locator('.count')).toHaveText(`1 / ${count}`);
  await expect(box.locator('.title')).toHaveText(await page.locator('figure.work .title').first().innerText());
  // The clone is told it is drawn full-width, so it takes a larger file.
  const big = box.locator('.stage img');
  await expect(big).not.toHaveClass(/pending/);
  const w = await big.evaluate((img: HTMLImageElement) => Number(img.currentSrc.match(/-(\d+)\.[0-9a-f]{10}\./)![1]));
  expect(w).toBeGreaterThanOrEqual(1200);
  await page.keyboard.press('ArrowRight');
  await expect(box.locator('.count')).toHaveText(`2 / ${count}`);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(box.locator('.count')).toHaveText(`${count} / ${count}`);
  await page.keyboard.press('Escape');
  await expect(box).toBeHidden();
});

test('Back closes the enlarged work rather than leaving the site', async ({ page }) => {
  await page.goto('/');
  await page.locator('figure.work .frame').first().click();
  await expect(page.locator('dialog.lightbox')).toBeVisible();
  await page.goBack();
  await expect(page.locator('dialog.lightbox')).toBeHidden();
  expect(new URL(page.url()).pathname).toBe('/');
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 375, height: 740 }, hasTouch: true, isMobile: true });

  test('fits without sideways scrolling and pictures fit the screen', async ({ page }) => {
    await page.goto('/');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const img = page.locator('figure.work img').first();
    const b = (await img.boundingBox())!;
    expect(b.width).toBeLessThanOrEqual(375);
    expect(b.height).toBeLessThanOrEqual(740 * 0.83);
  });

  test('the section links are reachable and jump to their sections', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'About' }).tap();
    await expect(page.locator('#about h2')).toBeInViewport();
  });

  test('a swipe pages through the enlarged works', async ({ page }) => {
    await page.goto('/');
    await page.locator('figure.work .frame').first().tap();
    const stage = page.locator('dialog.lightbox .stage');
    await expect(page.locator('dialog.lightbox .count')).toHaveText(/^1 \//);
    await stage.dispatchEvent('touchstart', { touches: [{ identifier: 1, clientX: 300, clientY: 300 }] });
    await stage.dispatchEvent('touchend', { changedTouches: [{ identifier: 1, clientX: 120, clientY: 310 }] });
    await expect(page.locator('dialog.lightbox .count')).toHaveText(/^2 \//);
  });
});

test('/health reports a version', async ({ request }) => {
  const res = await request.get('/health');
  expect(res.status()).toBe(200);
  expect(typeof (await res.json()).version).toBe('string');
});

test('an unknown page is a 404 with a way home', async ({ page }) => {
  const response = await page.goto('/does-not-exist');
  expect(response?.status()).toBe(404);
  await page.getByRole('link', { name: 'Home' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Christina Schwarz');
});
