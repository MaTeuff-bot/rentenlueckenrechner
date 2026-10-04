import { expect, test } from '@playwright/test';
import { expectNoForecast, expectForecast, freshLoad } from './fixtures';

// Tightened readiness gate: ordinary bank deposits require the explicit
// Tagesgeld planning-rate source. Legacy cash families (Bills proxy,
// synthetic cash assumption) are no longer accepted for bank deposits and
// must be re-decided explicitly — never silently reinterpreted as Tagesgeld.
// Same visible journey as the success spec, then switching the cash bucket
// to a legacy source yields the readiness issue and NO forecast.
test('legacy cash source on a bank deposit is blocked with redecision issue', async ({ page }) => {
  await freshLoad(page);

  await page.getByRole('tab', { name: /Pers.nlicher Plan/ }).click();
  await page.locator('#retirementAge').fill('65');

  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  await page.getByRole('button', { name: 'Anleihen entfernen' }).click();
  await page.locator('#portfolio-holding-equity').selectOption('accumulating-equity-fund');
  await page.locator('#portfolio-source-equity').selectOption('synthetic-equity-assumption-v1');
  await page.locator('#portfolio-holding-fixed').selectOption('ordinary-bank-deposit');
  await page.locator('#portfolio-source-fixed').selectOption('tagesgeld-planzins-v1');

  if (!(await page.locator('#estimator-fundAcquisitionCost').isVisible())) {
    await page.locator('#estimator-details > summary').click();
  }
  await page.locator('#estimator-fundAcquisitionCost').fill('0');
  await page.locator('#estimator-scopeConfirmed').check();
  await page.locator('#estimator-lossScopeConfirmed').check();

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

  await page.getByRole('tab', { name: /Rechenannahmen/ }).click();
  await page.locator('#cash-planning-rate').fill('2');
  await page.locator('#cash-planning-rate-confirmed').check();

  await expectForecast(page);

  // Switch the bank holding to a legacy cash source: explicit re-decision, no hidden fallback.
  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  await page.locator('#portfolio-source-fixed').selectOption('synthetic-cash-assumption-v1');

  await expect(page.locator('.validation-summary a[href="#portfolio-source-fixed"]').first()).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/Tagesgeld-Planungszinsquelle/).first()).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#estimator-readiness')).toHaveText(/Unvollst.ndig/);
  await expectNoForecast(page);
});
