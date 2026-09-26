import { expect, test } from '@playwright/test';
import { expectForecast, freshLoad, setupFundOnlyBridge } from './fixtures';

test('automatic and manual capital assessment switching updates inputs, readiness and disclosures', async ({
  page,
}) => {
  await freshLoad(page);
  await setupFundOnlyBridge(page);
  await expectForecast(page);
  await page.getByRole('tab', { name: /Versicherung/ }).click();
  await expect(page.locator('#insurance-bridge-capitalMode')).toHaveValue('automatic');
  await expect(page.locator('#insurance-pension-capitalMode')).toHaveValue('automatic');
  await page.locator('#insurance-bridge-capitalMode').selectOption('manual');
  await expect(page.locator('#insurance-bridge-capitalMonthlyToday')).toBeVisible();
  await page.locator('#insurance-bridge-capitalMonthlyToday').fill('0');
  await expectForecast(page);
  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  await expect(page.locator('#estimator-readiness')).toHaveText(/Bereit f.r automatische Sch.tzung/);
  await page.getByRole('tab', { name: /Versicherung/ }).click();
  await page.locator('#insurance-pension-capitalMode').selectOption('manual');
  await page.locator('#insurance-pension-capitalMonthlyToday').fill('0');
  await expectForecast(page);
  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  await expect(page.locator('#estimator-readiness')).toHaveText(/optional.*ungenutzt/);
  await page.getByRole('tab', { name: /Versicherung/ }).click();
  await page.locator('#insurance-bridge-capitalMode').selectOption('automatic');
  await expect(page.locator('#insurance-bridge-capitalMonthlyToday')).toHaveCount(0);
  await expectForecast(page);
  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  await expect(page.locator('#estimator-readiness')).toHaveText(/Bereit f.r automatische Sch.tzung/);
});
