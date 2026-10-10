import { expect, test } from '@playwright/test';
import { freshLoad } from './fixtures';

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
  const overlap = await page.evaluate(() => {
    const bar = document.querySelector('.input-tabs') as HTMLElement;
    const target = document.getElementById('cash-planning-rate') as HTMLElement;
    const barRect = bar.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    return targetRect.top < barRect.bottom - 1;
  });
  expect(overlap).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('narrow-tabs-navigation.png') });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
});
