import { expect, test } from '@playwright/test';
import { expectForecast, freshLoad, setupFundOnlyBridge } from './fixtures';

test('reload retains portfolio and insurance settings and recomputes results', async ({ page }) => {
  await freshLoad(page);
  await setupFundOnlyBridge(page);
  await expectForecast(page);
  const summaryBefore = await page.getByText('Dein Kapitalbedarf', { exact: true }).textContent();
  void summaryBefore;
  const capitalBefore = await page.locator('#insurance-pension-drvSubsidy').inputValue();
  const costBefore = await page.getByRole('tab', { name: /Verm.gen/ }).click().then(() => page.locator('#estimator-fundAcquisitionCost').inputValue());
  const holdingBefore = await page.locator('#portfolio-holding-equity').inputValue();
  await page.reload();
  await expectForecast(page);
  await page.getByRole('tab', { name: /Versicherung/ }).click();
  await expect(page.locator('#insurance-pension-drvSubsidy')).toHaveValue(capitalBefore);
  await expect(page.locator('#insurance-bridge-status')).toHaveValue('voluntary');
  await expect(page.locator('#insurance-pension-status')).toHaveValue('voluntary');
  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  await expect(page.locator('#estimator-fundAcquisitionCost')).toHaveValue(costBefore);
  await expect(page.locator('#portfolio-holding-equity')).toHaveValue(holdingBefore);
  await expect(page.locator('#retirementAge')).toHaveValue('65');
});
