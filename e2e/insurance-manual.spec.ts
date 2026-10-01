import { expect, test } from '@playwright/test';
import {
  expectForecast,
  expectNoForecast,
  expectPensionTaxLimitation,
  freshLoad,
  setupBothPhaseManualTotals,
  setupEstimatorWithCost,
  setupFundOnlyPortfolio,
  setupTimelineBridge,
} from './fixtures';

// Fresh both-phase whole totals via the explicit manual radios: automatic-only
// family/subsidy answers stay UNANSWERED (suggested additional rate cleared,
// no children answer, no DRV subsidy branch). Missing portfolio cost/scope
// blocks the forecast; completing the estimator with a nonzero basis enables
// detailed results with the manual totals as the selected contributions.
test('fresh both-phase manual totals isolate auto-only answers and disclose the tax limitation', async ({
  page,
}) => {
  await freshLoad(page);
  await setupTimelineBridge(page);
  await setupFundOnlyPortfolio(page);
  await setupBothPhaseManualTotals(page, { kv: '120', pv: '15' }, { kv: '150', pv: '20' });
  await expect(page.locator('#insurance-insurerAdditionalRate')).toHaveCount(0);
  await expectNoForecast(page);
  await setupEstimatorWithCost(page, '30000');
  await expectForecast(page);
  await page.getByRole('tab', { name: /Versicherung/ }).click();
  await expect(page.getByTestId('insurance-bridge-summary')).toHaveText(/Eigene Beitr.ge.*KV 120 \/ PV 15/);
  await expect(page.getByTestId('insurance-pension-summary')).toHaveText(/Eigene Beitr.ge.*KV 150 \/ PV 20/);
  await expectPensionTaxLimitation(page);
});

// Manual isolation persists across insurance switches and reload: turning one
// phase back to automatic re-blocks on the still-unanswered auto-only inputs
// while the nonzero basis and holdings are preserved; re-selecting manual
// totals and reloading keeps forecast, contributions and portfolio settings.
test('both-phase manual basis and totals survive switches and reload', async ({ page }) => {
  await freshLoad(page);
  await setupTimelineBridge(page);
  await setupFundOnlyPortfolio(page);
  await setupBothPhaseManualTotals(page, { kv: '120', pv: '15' }, { kv: '150', pv: '20' });
  await setupEstimatorWithCost(page, '30000');
  await expectForecast(page);
  const holdingValueBefore = await page.locator('#portfolio-value-equity').inputValue();
  await page.getByRole('tab', { name: /Versicherung/ }).click();
  await page
    .getByRole('group', { name: 'Besondere Umstände – Brücke', exact: true })
    .getByLabel('Alle Standardregeln genügen (automatische Berechnung)')
    .check();
  await expectNoForecast(page);
  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  await expect(page.locator('#estimator-fundAcquisitionCost')).toHaveValue('30000');
  await expect(page.locator('#portfolio-holding-equity')).toHaveValue('accumulating-equity-fund');
  await expect(page.locator('#portfolio-value-equity')).toHaveValue(holdingValueBefore);
  await page.getByRole('tab', { name: /Versicherung/ }).click();
  await page.getByLabel('Eigene KV/PV-Beiträge einsetzen – Brücke', { exact: true }).check();
  await expectForecast(page);
  await expect(page.getByTestId('insurance-bridge-summary')).toHaveText(/Eigene Beitr.ge.*KV 120 \/ PV 15/);
  await page.reload();
  await expectForecast(page);
  await page.getByRole('tab', { name: /Versicherung/ }).click();
  await expect(page.getByTestId('insurance-bridge-summary')).toHaveText(/Eigene Beitr.ge.*KV 120 \/ PV 15/);
  await expect(page.getByTestId('insurance-pension-summary')).toHaveText(/Eigene Beitr.ge.*KV 150 \/ PV 20/);
  await expect(page.locator('#insurance-bridge-kvMonthlyToday')).toHaveValue('120');
  await expect(page.locator('#insurance-pension-kvMonthlyToday')).toHaveValue('150');
  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  await expect(page.locator('#estimator-fundAcquisitionCost')).toHaveValue('30000');
  await expect(page.locator('#portfolio-holding-equity')).toHaveValue('accumulating-equity-fund');
  await expect(page.locator('#portfolio-value-equity')).toHaveValue(holdingValueBefore);
});
