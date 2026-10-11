import { expect, test, type Page } from '@playwright/test';
import { freshLoad } from './fixtures';

async function waitSettledFocus(page: Page, targetId: string) {
  await page.waitForFunction(
    (id) => {
      const bar = document.querySelector('.input-tabs') as HTMLElement | null;
      const target = document.getElementById(id) as HTMLElement | null;
      if (!bar || !target || document.activeElement !== target) return false;
      const anchor = (target.closest('.field') ?? target) as HTMLElement;
      const barRect = bar.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      const key = `${barRect.bottom.toFixed(1)}|${rect.top.toFixed(1)}|${rect.bottom.toFixed(1)}|${anchorRect.top.toFixed(1)}|${anchorRect.bottom.toFixed(1)}`;
      const store = window as unknown as { __settlePrev?: string; __settleCount?: number };
      if (store.__settlePrev === key) {
        store.__settleCount = (store.__settleCount ?? 0) + 1;
        return (store.__settleCount ?? 0) >= 3;
      }
      store.__settlePrev = key;
      store.__settleCount = 0;
      return false;
    },
    targetId,
    { polling: 100, timeout: 8000 },
  );
}

test('narrow tabs keep sticky clearance and focus explicit targets without overflow', async ({ page }, testInfo) => {
  await freshLoad(page);
  const position = await page.locator('.input-tabs').evaluate((el) => getComputedStyle(el).position);
  expect(position).toBe('sticky');
  await page.getByRole('tab', { name: /Rechenannahmen/ }).click();
  await expect(page.locator('#input-tabpanel-annahmen')).toBeVisible();
  await expect(page.getByRole('tab', { name: /Rechenannahmen/ })).toBeFocused();
  await expect(page.locator('#cash-planning-rate')).not.toBeFocused();
  await page.locator('.validation-summary a[href="#cash-planning-rate"]').first().click();
  await expect(page.locator('#cash-planning-rate')).toBeFocused();
  await waitSettledFocus(page, 'cash-planning-rate');
  const overlap = await page.evaluate(() => {
    const bar = document.querySelector('.input-tabs') as HTMLElement;
    const target = document.getElementById('cash-planning-rate') as HTMLElement;
    const anchor = (target.closest('.field') ?? target) as HTMLElement;
    const barRect = bar.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    return {
      covered: targetRect.top < barRect.bottom - 1,
      anchorCovered: anchorRect.top < barRect.bottom + 8 - 1,
    };
  });
  expect(overlap.covered).toBe(false);
  expect(overlap.anchorCovered).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('narrow-tabs-navigation.png') });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
});
