import { expect, test } from '@playwright/test';
import {
  expectForecast,
  freshLoad,
  openYearlyTable,
  setupEstimatorWithCost,
} from './fixtures';

async function setupMixedFundCash(page: import('@playwright/test').Page) {
  await page.getByRole('tab', { name: /Pers.nlicher Plan/ }).click();
  await page.locator('#retirementAge').fill('65');

  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  await page.getByRole('button', { name: 'Anleihen entfernen' }).click();
  await page.locator('#portfolio-holding-equity').selectOption('accumulating-equity-fund');
  await page.locator('#portfolio-source-equity').selectOption('synthetic-equity-assumption-v1');
  await page.locator('#portfolio-holding-fixed').selectOption('ordinary-bank-deposit');
  await expect(page.locator('#portfolio-source-common-fixed')).toBeVisible();
  await expect(page.locator('#portfolio-source-fixed')).toHaveCount(0);

  await setupEstimatorWithCost(page, '1000');

  await page.getByRole('tab', { name: /Versicherung/ }).click();
  await page.locator('#insurance-bridge-status').selectOption('voluntary');
  await page.locator('#insurance-pension-status').selectOption('kvdr');
  await page
    .getByRole('group', { name: 'Besondere Umstände – Brücke', exact: true })
    .getByLabel('Alle Standardregeln genügen (automatische Berechnung)')
    .check();
  await page
    .getByRole('group', { name: 'Besondere Umstände – Rentenphase', exact: true })
    .getByLabel('Alle Standardregeln genügen (automatische Berechnung)')
    .check();
  await page.getByRole('button', { name: 'Keine anerkannten Kinder', exact: true }).click();
}

test('historical deposit strategy forecasts with floor disclosure and reloads', async ({ page }) => {
  await freshLoad(page);
  await setupMixedFundCash(page);

  await page.getByRole('tab', { name: /Rechenannahmen/ }).click();
  await page.locator('#cash-mode-historical').check();
  await expect(page.getByTestId('cash-historical-disclosure')).toBeVisible();
  await expect(page.getByTestId('cash-historical-disclosure')).toContainText(/0 %-Untergrenze/);
  await page.locator('#cash-planning-rate-confirmed').check();

  await expectForecast(page);
  await openYearlyTable(page);
  const rows = page.locator('table tbody tr');
  await expect(rows.first()).toBeVisible();
  await expect(await rows.count()).toBeGreaterThan(5);

  const before = await page.locator('article.result-card-primary').textContent();
  await page.reload();
  await page.getByRole('tab', { name: /Rechenannahmen/ }).click();
  await expect(page.locator('#cash-mode-historical')).toBeChecked();
  await expect(page.locator('#cash-planning-rate-confirmed')).toBeChecked();
  await expect(page.getByTestId('cash-historical-disclosure')).toBeVisible();
  await expectForecast(page);
  const after = await page.locator('article.result-card-primary').textContent();
  expect(after).toBe(before);
});

test('real-rate assumption forecasts with floor disclosure and reloads', async ({ page }) => {
  await freshLoad(page);
  await setupMixedFundCash(page);

  await page.getByRole('tab', { name: /Rechenannahmen/ }).click();
  await page.locator('#cash-mode-real').check();
  await expect(page.getByTestId('cash-real-disclosure')).toBeVisible();
  await expect(page.getByTestId('cash-real-disclosure')).toContainText(/0 %-Untergrenze/);
  await page.locator('#cash-real-rate').fill('-0.28');
  await page.locator('#cash-planning-rate-confirmed').check();

  await expectForecast(page);
  await openYearlyTable(page);
  const rows = page.locator('table tbody tr');
  await expect(rows.first()).toBeVisible();
  await expect(await rows.count()).toBeGreaterThan(5);

  const before = await page.locator('article.result-card-primary').textContent();
  await page.reload();
  await page.getByRole('tab', { name: /Rechenannahmen/ }).click();
  await expect(page.locator('#cash-mode-real')).toBeChecked();
  await expect(page.locator('#cash-planning-rate-confirmed')).toBeChecked();
  await expect(page.getByTestId('cash-real-disclosure')).toBeVisible();
  await expectForecast(page);
  const after = await page.locator('article.result-card-primary').textContent();
  expect(after).toBe(before);
});
