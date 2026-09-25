import { expect, test } from '@playwright/test';
import { expectForecast, freshLoad, setupFundOnlyBridge } from './fixtures';

// Narrow-screen smoke only: same fund-only bridge journey, minimal assertions.
// Chromium 390px viewport is not Safari or mobile-device equivalence.
test('narrow smoke retains fund-only bridge forecast without overflow', async ({ page }) => {
  await freshLoad(page);
  await setupFundOnlyBridge(page);
  await expectForecast(page);
  await expect(page.getByText('Benötigtes Kapital zum Rentenbeginn', { exact: false })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflow).toBe(false);
});
