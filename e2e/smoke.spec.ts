import { test, expect } from '@playwright/test';

test('the placeholder shows her name and nothing broken', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));

  const response = await page.goto('/');
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle('Christina Schwarz');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Christina Schwarz');
  await expect(page.getByText('Website coming soon')).toBeVisible();

  // The stylesheet loaded and applied (the CSP would block anything else).
  const align = await page.locator('main').evaluate((n) => getComputedStyle(n).textAlign);
  expect(align).toBe('center');
  expect(errors).toEqual([]);
});

test('fits a phone without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('/health reports a version', async ({ request }) => {
  const res = await request.get('/health');
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.status).toBe('ok');
  expect(typeof body.version).toBe('string');
});

test('an unknown page is a 404 with a way home', async ({ page }) => {
  const response = await page.goto('/does-not-exist');
  expect(response?.status()).toBe(404);
  await page.getByRole('link', { name: 'Home' }).click();
  await expect(page.getByText('Website coming soon')).toBeVisible();
});
