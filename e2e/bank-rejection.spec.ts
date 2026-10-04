import { expect, test } from '@playwright/test';
import { freshLoad } from './fixtures';

// Corrected readiness gate: ordinary bank deposits share the explicit common
// Tagesgeld planning rate. There is no per-bank source dropdown; the common
// rate is adopted for all declared bank buckets only on explicit valid
// confirmation. Before that consent the forecast stays truthfully blocked
// with a diagnostic pointing at Rechenannahmen (no hidden fallback, no
// holding inferred from source).
test('bank deposit without confirmed common rate stays blocked with cash issue', async ({ page }) => {
  await freshLoad(page);

  await page.getByRole('tab', { name: /Pers.nlicher Plan/ }).click();
  await page.locator('#retirementAge').fill('65');

  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  await page.getByRole('button', { name: 'Anleihen entfernen' }).click();
  await page.locator('#portfolio-holding-equity').selectOption('accumulating-equity-fund');
  await page.locator('#portfolio-source-equity').selectOption('synthetic-equity-assumption-v1');
  await page.locator('#portfolio-holding-fixed').selectOption('ordinary-bank-deposit');
  await expect(page.locator('#portfolio-source-common-fixed')).toBeVisible();
  await expect(page.locator('#portfolio-source-fixed')).toHaveCount(0);

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

  // Rechenannahmen deliberately left unconfirmed: no explicit consent, no forecast.
  await page.getByRole('tab', { name: /Rechenannahmen/ }).click();
  await expect(page.locator('#cash-planning-rate')).toBeVisible();
  await expect(page.locator('#cash-planning-rate-confirmed')).not.toBeChecked();

  await expect(page.locator('.validation-summary a[href="#cash-planning-rate"]').first()).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/Tagesgeld-Planungszins unter Rechenannahmen/).first()).toBeVisible({ timeout: 30000 });
  // Truthfully blocked with the cash diagnostic (no hidden fallback): the
  // result panel surfaces the same cash issue instead of the generic
  // open-forecast text, and no forecast artefacts appear.
  await expect(page.getByText('KV/PV-Abrechnung im Detail', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Dein Kapitalbedarf', { exact: true })).toHaveCount(0);
  await expect(page.locator('#ergebnis').getByText(/Tagesgeld-Planungszins unter Rechenannahmen/)).toBeVisible({ timeout: 30000 });
});
