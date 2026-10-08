import { expect, test, type Locator } from '@playwright/test';
import {
  expectForecast,
  freshLoad,
  openInsuranceBreakdown,
  openYearlyTable,
} from './fixtures';

function parseGermanCurrency(text: string): number {
  const trimmed = text.trim();
  const numeric = trimmed.replace(/[^0-9,.-]/g, '');
  if (numeric === '' || numeric === '-') throw new Error(`Unparseable German currency: ${text}`);
  const normalized = numeric.replace(/\./g, '').replace(',', '.');
  const value = Number(normalized);
  if (!Number.isFinite(value)) throw new Error(`Unparseable German currency: ${text}`);
  return value;
}

async function readStrongCurrency(card: Locator): Promise<number> {
  const text = await card.locator('strong').textContent();
  if (text === null) throw new Error('Missing strong numeric element');
  return parseGermanCurrency(text);
}

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

  // Full forecast: KV/PV breakdown, median/reference result, neutral frequency, year table, no search cards.
  await expectForecast(page);
  await openInsuranceBreakdown(page);
  await expect(page.getByText('Median-Kapital zum Rentenbeginn', { exact: false })).toBeVisible();
  await expect(page.getByText(/P50 ist ein Stichtagswert je Alter/, { exact: false })).toBeVisible();
  await expect(page.getByText(/der simulierten Verl.ufe reichte/, { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/Referenz-Planwert/, { exact: false }).first()).toBeVisible();
  await expect(page.getByText('Benötigtes Kapital zum Rentenbeginn', { exact: false })).toHaveCount(0);
  await expect(page.getByText('Kapital-Lücke zum Rentenbeginn', { exact: false })).toHaveCount(0);
  await expect(page.getByText('Median-Überschuss zum Rentenbeginn', { exact: false })).toHaveCount(0);
  // Neutral risk: outcome cards carry the neutral outcome-risk-card class only;
  // no threshold success/warning coloring is applied anywhere in results.
  const riskCards = page.locator('.outcome-risk-card');
  await expect(riskCards.first()).toBeVisible();
  await expect(await riskCards.count()).toBeGreaterThan(0);
  for (const className of await riskCards.evaluateAll((elements) => elements.map((element) => element.className))) {
    expect(className).toContain('outcome-risk-card');
    expect(className).not.toContain('warning-card');
    expect(className).not.toContain('success-card');
  }
  await expect(page.locator('article.warning-card, article.success-card, .warning-card, .success-card')).toHaveCount(0);
  const medianCardNeutral = page.locator('article.result-card:has-text("Median-Kapital zum Rentenbeginn")');
  const gapCardNeutral = page.locator('article.result-card:has-text("Monatliche Netto-Rentenlücke")');
  await expect(medianCardNeutral).toHaveClass(/result-card/);
  await expect(gapCardNeutral).toHaveClass(/result-card/);
  await expect(medianCardNeutral).not.toHaveClass(/warning-card/);
  await expect(medianCardNeutral).not.toHaveClass(/success-card/);
  await expect(gapCardNeutral).not.toHaveClass(/warning-card/);
  await expect(gapCardNeutral).not.toHaveClass(/success-card/);
  await expect(page.getByRole('heading', { name: 'Kapitalverlauf und Überlebenswahrscheinlichkeit' })).toBeVisible();
  await openYearlyTable(page);
  const rows = page.locator('table tbody tr');
  await expect(rows.first()).toBeVisible();
  await expect(await rows.count()).toBeGreaterThan(5);
  await expect(page.getByText(/Planwert-Ledger mit Erwartungswert/, { exact: false })).toBeVisible();

  // Edit savings and spending through visible controls: actual numeric recalculation.
  // Defaults are 500 savings and 3000 spending; parse the real strong numerics.
  const medianCard = page.locator('article.result-card:has-text("Median-Kapital zum Rentenbeginn")');
  const gapCard = page.locator('article.result-card:has-text("Monatliche Netto-Rentenlücke")');
  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  await expect(page.locator('#monthlyContributionToday')).toHaveValue('500');
  await page.getByRole('tab', { name: /Pers.nlicher Plan/ }).click();
  await expect(page.locator('#monthlyDesiredSpendingToday')).toHaveValue('3000');
  const medianBefore = await readStrongCurrency(medianCard);
  const gapBefore = await readStrongCurrency(gapCard);
  expect(Number.isFinite(medianBefore)).toBe(true);
  expect(Number.isFinite(gapBefore)).toBe(true);

  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  await page.locator('#monthlyContributionToday').fill('800');
  await expect.poll(async () => readStrongCurrency(medianCard), { timeout: 30000 }).toBeGreaterThan(medianBefore);
  const medianAfterSavings = await readStrongCurrency(medianCard);
  expect(Number.isFinite(medianAfterSavings)).toBe(true);
  expect(medianAfterSavings).toBeGreaterThan(medianBefore);

  await page.getByRole('tab', { name: /Pers.nlicher Plan/ }).click();
  await page.locator('#monthlyDesiredSpendingToday').fill('3500');
  await expect.poll(async () => readStrongCurrency(gapCard), { timeout: 30000 }).toBeGreaterThan(gapBefore);
  const gapAfterSpending = await readStrongCurrency(gapCard);
  expect(Number.isFinite(gapAfterSpending)).toBe(true);
  expect(gapAfterSpending).toBeGreaterThan(gapBefore);

  // Edit an input and reload: forecast recomputes and persists.
  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  if (!(await page.locator('#estimator-fundAcquisitionCost').isVisible())) {
    await page.locator('#estimator-details > summary').click();
  }
  await page.locator('#estimator-fundAcquisitionCost').fill('1000');
  await expectForecast(page);
  const medianBeforeReload = await readStrongCurrency(medianCard);
  const gapBeforeReload = await readStrongCurrency(gapCard);
  const medianTextBeforeReload = await medianCard.locator('strong').textContent();
  const gapTextBeforeReload = await gapCard.locator('strong').textContent();
  expect(Number.isFinite(medianBeforeReload)).toBe(true);
  expect(Number.isFinite(gapBeforeReload)).toBe(true);
  await page.reload();
  await expectForecast(page);
  await expect.poll(async () => readStrongCurrency(medianCard), { timeout: 30000 }).toBe(medianBeforeReload);
  await expect.poll(async () => readStrongCurrency(gapCard), { timeout: 30000 }).toBe(gapBeforeReload);
  const medianAfterReload = await readStrongCurrency(medianCard);
  const gapAfterReload = await readStrongCurrency(gapCard);
  expect(medianAfterReload).toBe(medianBeforeReload);
  expect(gapAfterReload).toBe(gapBeforeReload);
  expect(await medianCard.locator('strong').textContent()).toBe(medianTextBeforeReload);
  expect(await gapCard.locator('strong').textContent()).toBe(gapTextBeforeReload);
  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  await expect(page.locator('#monthlyContributionToday')).toHaveValue('800');
  await expect(page.locator('#estimator-fundAcquisitionCost')).toHaveValue('1000');
  await page.getByRole('tab', { name: /Pers.nlicher Plan/ }).click();
  await expect(page.locator('#monthlyDesiredSpendingToday')).toHaveValue('3500');
  await page.getByRole('tab', { name: /Rechenannahmen/ }).click();
  await expect(page.locator('#cash-planning-rate-confirmed')).toBeChecked();
  await expect(page.locator('#simulations-count')).toHaveValue('1000');
});
