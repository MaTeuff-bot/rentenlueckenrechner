import { expect, test } from '@playwright/test';
import {
  expectForecast,
  expectNoForecast,
  expectPensionTaxLimitation,
  freshLoad,
  setupEstimatorWithCost,
  setupFundOnlyBridge,
} from './fixtures';

// Mandatory detailed portfolio: no per-phase manual capital estimates exist in
// any insurance mode. The detailed portfolio gates every forecast; whole-phase
// manual KV/PV totals (unsupported circumstances) replace only the insurance
// contributions, never the portfolio setup.
test('mandatory detailed portfolio gates every insurance mode; switching preserves settings', async ({
  page,
}) => {
  await freshLoad(page);
  await setupFundOnlyBridge(page);
  await page.getByRole('tab', { name: /Versicherung/ }).click();
  await expect(page.locator('#insurance-bridge-capitalMode')).toHaveCount(0);
  await expect(page.locator('#insurance-pension-capitalMode')).toHaveCount(0);
  await expect(page.locator('#insurance-block-4-jump-to-vermoegen')).toBeVisible();
  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  await expect(page.locator('#estimator-readiness')).toHaveText(/Bereit f.r detaillierte Sch.tzung/);

  // Switching pension to unknown keeps the forecast once the subsidy is answered;
  // portfolio settings are preserved independently of insurance answers.
  await page.getByRole('tab', { name: /Versicherung/ }).click();
  await page.locator('#insurance-pension-status').selectOption('unknown');
  await expectForecast(page);
  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  await expect(page.locator('#estimator-fundAcquisitionCost')).toHaveValue('0');
  await expect(page.locator('#estimator-readiness')).toHaveText(/Bereit f.r detaillierte Sch.tzung/);

  // Whole-phase manual totals (unsupported bridge) keep the forecast on the same
  // detailed portfolio; breaking the portfolio setup blocks it again.
  await page.getByRole('tab', { name: /Versicherung/ }).click();
  await page.locator('#insurance-bridge-status').selectOption('unsupported');
  await page.locator('#insurance-bridge-kvMonthlyToday').fill('100');
  await page.locator('#insurance-bridge-pvMonthlyToday').fill('0');
  await expectForecast(page);
  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  if (!(await page.locator('#estimator-scopeConfirmed').isVisible())) {
    await page.locator('#estimator-details > summary').click();
  }
  await expect(page.locator('#estimator-scopeConfirmed')).toBeVisible();
  await page.locator('#estimator-scopeConfirmed').uncheck();
  await expect(page.locator('#estimator-readiness')).toHaveText(/Unvollst.ndig/);
  await expectNoForecast(page);
  await page.locator('#estimator-scopeConfirmed').check();
  await expectForecast(page);
});

// KVdR pension mode: the detailed portfolio still gates the forecast, the KVdR
// label is shown, and switching pension modes preserves the nonzero cost basis
// and holdings. The precise pension-tax funding limitation is visible in the
// tax notes (income shortfall, not asset exhaustion).
test('KVdR pension keeps mandatory portfolio gating and discloses the tax limitation', async ({
  page,
}) => {
  await freshLoad(page);
  await setupFundOnlyBridge(page);
  await setupEstimatorWithCost(page, '20000');
  await expectForecast(page);
  await page.getByRole('tab', { name: /Versicherung/ }).click();
  await page.locator('#insurance-pension-status').selectOption('kvdr');
  await expectForecast(page);
  await expect(page.getByTestId('insurance-pension-summary')).toHaveText(/KVdR/);
  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  await expect(page.locator('#estimator-fundAcquisitionCost')).toHaveValue('20000');
  await expect(page.locator('#portfolio-holding-equity')).toHaveValue('accumulating-equity-fund');
  await expectPensionTaxLimitation(page);
  await page.getByRole('tab', { name: /Versicherung/ }).click();
  await page.locator('#insurance-pension-status').selectOption('voluntary');
  await expectForecast(page);
  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  await expect(page.locator('#estimator-fundAcquisitionCost')).toHaveValue('20000');
  await expect(page.locator('#portfolio-holding-equity')).toHaveValue('accumulating-equity-fund');
});
