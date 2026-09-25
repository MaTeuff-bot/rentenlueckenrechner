import { expect, test } from '@playwright/test';
import { expectForecast, expectNoForecast, freshLoad, setupFundOnlyBridge } from './fixtures';

test('missing answers block forecast, issue links focus controls, correcting enables results', async ({
  page,
}) => {
  await freshLoad(page);
  await expectNoForecast(page);
  await page.locator('#retirementAge').fill('65');
  await expectNoForecast(page);
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
