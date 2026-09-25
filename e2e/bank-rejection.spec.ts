import { expect, test } from '@playwright/test';
import { expectForecast, freshLoad, setupFundOnlyBridge } from './fixtures';

// Existing unsupported path: negative gross bank returns are not automatically
// covered (insuranceEstimator throws "Negative bank return"). This is a real
// visible-control journey asserting the rejection UI, not a bank success claim.
// Natural deterministic RNG (2% mean / 1% vol cash over 50y x 1000 paths)
// reliably hits a negative gross draw for this fixture; no seed was selected
// to force or avoid it. No model clamp or suppression was added.
test('unsupported negative gross bank return is rejected without forecast', async ({ page }) => {
  await freshLoad(page);
  await setupFundOnlyBridge(page);
  await expectForecast(page);
  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  await page.locator('#portfolio-holding-equity').selectOption('ordinary-bank-deposit');
  await page.locator('#portfolio-source-equity').selectOption('synthetic-cash-assumption-v1');
  await expect(page.getByText(/Negative bank return/, { exact: false })).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('KV/PV-Abrechnung im Detail', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Dein Kapitalbedarf', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Berechnung unvollst.ndig/, { exact: false })).toBeVisible();
});
