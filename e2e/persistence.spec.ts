import { expect, test } from '@playwright/test';
import { expectForecast, freshLoad, setupEstimatorWithCost, setupFundOnlyBridge } from './fixtures';

test('reload retains nonzero basis, holdings, insurance and stable result text', async ({ page }) => {
  await freshLoad(page);
  await setupFundOnlyBridge(page);
  await expectForecast(page);
  await setupEstimatorWithCost(page, '25000');
  await expectForecast(page);
  const requiredCapitalBefore = await page.locator('article.result-card-primary').textContent();
  expect(requiredCapitalBefore).toContain('Benötigtes Kapital zum Rentenbeginn');
  const costBefore = await page.locator('#estimator-fundAcquisitionCost').inputValue();
  expect(costBefore).toBe('25000');
  const holdingBefore = await page.locator('#portfolio-holding-equity').inputValue();
  const holdingValueBefore = await page.locator('#portfolio-value-equity').inputValue();
  await page.reload();
  await expectForecast(page);
  const requiredCapitalAfter = await page.locator('article.result-card-primary').textContent();
  expect(requiredCapitalAfter).toBe(requiredCapitalBefore);
  await page.getByRole('tab', { name: /Versicherung/ }).click();
  await expect(page.locator('#insurance-pension-drvSubsidy')).toHaveValue('not-received');
  await expect(page.locator('#insurance-bridge-status')).toHaveValue('voluntary');
  await expect(page.locator('#insurance-pension-status')).toHaveValue('voluntary');
  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  await expect(page.locator('#estimator-fundAcquisitionCost')).toHaveValue(costBefore);
  await expect(page.locator('#portfolio-holding-equity')).toHaveValue(holdingBefore);
  await expect(page.locator('#portfolio-value-equity')).toHaveValue(holdingValueBefore);
  await expect(page.locator('#retirementAge')).toHaveValue('65');
});
