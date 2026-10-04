import { expect, test } from '@playwright/test';
import {
  expectForecast,
  freshLoad,
  openInsuranceBreakdown,
  openYearlyTable,
} from './fixtures';

// 3A gate: mixed fund + Tagesgeld planning-rate journey with visible controls only.
// Equity fund (synthetic equity) + Cash bucket (ordinary-bank-deposit, common rate),
// fund cost 0 + both scopes, KVdR pension + voluntary bridge, standard coverage,
// explicit Keine Kinder, DEFAULT simulations (1000, untouched), no seeding.
test('mixed fund plus Tagesgeld planning rate forecasts, edits and reloads', async ({ page }) => {
  await freshLoad(page);

  // Timeline: bridge 65-67.
  await page.getByRole('tab', { name: /Pers.nlicher Plan/ }).click();
  await page.locator('#retirementAge').fill('65');

  // Portfolio: keep equity + cash, remove Anleihen only. Banks share the
  // confirmed common rate: explicit holding classification only, no per-bank
  // source pick (redundant bank source dropdown removed).
  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  await page.getByRole('button', { name: 'Anleihen entfernen' }).click();
  await page.locator('#portfolio-holding-equity').selectOption('accumulating-equity-fund');
  await page.locator('#portfolio-source-equity').selectOption('synthetic-equity-assumption-v1');
  await page.locator('#portfolio-holding-fixed').selectOption('ordinary-bank-deposit');
  await expect(page.locator('#portfolio-source-common-fixed')).toBeVisible();
  await expect(page.locator('#portfolio-source-fixed')).toHaveCount(0);

  // Estimator: explicit 0 cost + both scopes.
  if (!(await page.locator('#estimator-fundAcquisitionCost').isVisible())) {
    await page.locator('#estimator-details > summary').click();
  }
  await page.locator('#estimator-fundAcquisitionCost').fill('0');
  await page.locator('#estimator-scopeConfirmed').check();
  await page.locator('#estimator-lossScopeConfirmed').check();
  await expect(page.locator('#estimator-readiness')).toHaveText(/Bereit f.r detaillierte Sch.tzung/);

  // Insurance: KVdR pension + voluntary bridge, standard coverage.
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

  // Rechenannahmen: explicit 2 percent planning rate + confirmation, default simulations untouched.
  await page.getByRole('tab', { name: /Rechenannahmen/ }).click();
  await expect(page.locator('#cash-planning-rate')).toBeVisible();
  await page.locator('#cash-planning-rate').fill('2');
  await page.locator('#cash-planning-rate-confirmed').check();
  await expect(page.locator('#simulations-count')).toHaveValue('1000');

  // Full forecast: KV/PV breakdown, Kapitalbedarf, chart heading, year table.
  await expectForecast(page);
  await openInsuranceBreakdown(page);
  await expect(page.getByText('Benötigtes Kapital zum Rentenbeginn', { exact: false })).toBeVisible();
  await openYearlyTable(page);
  const rows = page.locator('table tbody tr');
  await expect(rows.first()).toBeVisible();
  await expect(await rows.count()).toBeGreaterThan(5);

  // Edit an input and reload: forecast recomputes and persists.
  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  if (!(await page.locator('#estimator-fundAcquisitionCost').isVisible())) {
    await page.locator('#estimator-details > summary').click();
  }
  await page.locator('#estimator-fundAcquisitionCost').fill('1000');
  await expectForecast(page);
  const before = await page.locator('article.result-card-primary').textContent();
  await page.reload();
  await expectForecast(page);
  const after = await page.locator('article.result-card-primary').textContent();
  expect(after).toBe(before);
  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  await expect(page.locator('#estimator-fundAcquisitionCost')).toHaveValue('1000');
  await page.getByRole('tab', { name: /Rechenannahmen/ }).click();
  await expect(page.locator('#cash-planning-rate-confirmed')).toBeChecked();
  await expect(page.locator('#simulations-count')).toHaveValue('1000');
});
