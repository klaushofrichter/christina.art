/**
 * Accessibility: WCAG 2.2 level A and AA, checked by axe-core in a real
 * browser, in both colour themes, with the enlarged view open, and on the 404
 * page. Zero violations is the bar: a contrast slip like the 4.02:1 grey that
 * shipped in v2026.11.08.4 fails here before release.
 */
import { test, expect, Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { scrollThrough } from './helpers';

// Reduced motion makes every reveal visible at once, so axe judges the page as
// a reader finally sees it rather than mid-fade.
test.use({ reducedMotion: 'reduce' });

async function audit(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const report = result.violations.map(
    (v) => `${v.impact} ${v.id}: ${v.help}\n    ${v.nodes.slice(0, 4).map((n) => `${n.target.join(' ')}  ${n.failureSummary?.split('\n')[1] ?? ''}`).join('\n    ')}`,
  );
  expect(report, 'WCAG 2.2 AA violations').toEqual([]);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`@live the home page meets WCAG 2.2 AA (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto('/');
    await scrollThrough(page);
    await audit(page);
  });

  test(`@live the enlarged view meets WCAG 2.2 AA (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await page.goto('/');
    await page.locator('figure.work .frame').first().click();
    await expect(page.locator('dialog.lightbox')).toBeVisible();
    await audit(page);
  });
}

test('@live the 404 page meets WCAG 2.2 AA', async ({ page }) => {
  await page.goto('/does-not-exist');
  await audit(page);
});

test('@live every picture has a text alternative and every control a name', async ({ page }) => {
  await page.goto('/');
  const missing = await page.evaluate(() => [
    ...Array.from(document.images).filter((i) => !i.alt.trim()).map((i) => `img ${i.currentSrc || i.src}`),
    ...Array.from(document.querySelectorAll('a, button'))
      .filter((el) => !(el.getAttribute('aria-label') || el.textContent || '').trim())
      .map((el) => `${el.tagName.toLowerCase()} ${el.outerHTML.slice(0, 80)}`),
  ]);
  expect(missing).toEqual([]);
});
