import { expect, test } from '@playwright/test';
import { expectForecast, freshLoad, setupFundOnlyBridge } from './fixtures';

test('missing answers block forecast, issue links focus controls, correcting enables results', async ({
  page,
}) => {
  await freshLoad(page);
  // Default portfolio holds a cash bucket without a confirmed planning rate:
  // no forecast, and the Tagesgeld issue routes to Rechenannahmen.
  await expect(page.getByText('KV/PV-Abrechnung im Detail', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Kapital zum Rentenbeginn', { exact: true })).toHaveCount(0);
  await expect(page.locator('.validation-summary a[href="#cash-planning-rate"]').first()).toBeVisible();
  await page.locator('#retirementAge').fill('65');
  await expect(page.getByText('KV/PV-Abrechnung im Detail', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Kapital zum Rentenbeginn', { exact: true })).toHaveCount(0);
  const bridgeLink = page.locator('.validation-summary a[href="#insurance-bridge-status"]').first();
  await expect(bridgeLink).toBeVisible();
  await bridgeLink.click();
  await expect(page.locator('#insurance-bridge-status')).toBeFocused();
  await expect(page.locator('#insurance-bridge-status')).toBeVisible();
  const pensionLink = page.locator('.validation-summary a[href="#insurance-pension-circumstances"]').first();
  await pensionLink.click();
  await expect(page.locator('#insurance-pension-circumstances')).toBeFocused();
  await setupFundOnlyBridge(page);
  await expectForecast(page);
  await expect(page.locator('.validation-summary')).toHaveCount(0);
});
