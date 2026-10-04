import { expect, type Page } from '@playwright/test';

// Reusable visible-control helpers derived from current UI contracts.
// Readiness answers are explicit (no engine injection, no seeded storage):
// - Bridge 65-67: retirementAge 65 with default GRV start 67 (timelineBoundary).
// - Fund-only: single accumulating-equity-fund with synthetic-equity proxy,
//   avoiding unsupported bank draws by construction (not by seed selection).
// - Estimator: explicit 0 cost + both scope confirmations (portfolioEstimatorReadiness).
// - Insurance: voluntary/voluntary + standard coverage (none/none) + explicit
//   DRV subsidy + explicit "Keine anerkannten Kinder" (insuranceSetupIssues).
// Source zones: model/capitalIncome/setup.ts, model/capitalIncome/portfolioEstimator.ts,
// model/retirementInsurance.ts, model/insuranceCoverage.ts, model/childrenAnswer.ts.

export async function freshLoad(page: Page) {
  await page.goto('/rentenlueckenrechner/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('heading', { name: /Wann m/i }).waitFor({ timeout: 20000 });
}

export async function setupTimelineBridge(page: Page) {
  // Timeline inputs live on the plan tab; issue-link navigation may leave
  // another tab active, which would hide #retirementAge.
  await page.getByRole('tab', { name: /Pers.nlicher Plan/ }).click();
  await page.locator('#retirementAge').fill('65');
}

export async function setupFundOnlyPortfolio(page: Page) {
  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  await page.getByRole('button', { name: 'Anleihen entfernen' }).click();
  await page.getByRole('button', { name: 'Cash entfernen' }).click();
  await page.locator('#portfolio-holding-equity').selectOption('accumulating-equity-fund');
  await page.locator('#portfolio-source-equity').selectOption('synthetic-equity-assumption-v1');
}

export async function setupInsuranceStatuses(page: Page) {
  await page.getByRole('tab', { name: /Versicherung/ }).click();
  await page.locator('#insurance-bridge-status').selectOption('voluntary');
  await page.locator('#insurance-pension-status').selectOption('voluntary');
  await page
    .getByRole('group', { name: 'Besondere Umstände – Brücke', exact: true })
    .getByLabel('Alle Standardregeln genügen (automatische Berechnung)')
    .check();
  await page
    .getByRole('group', { name: 'Besondere Umstände – Rentenphase', exact: true })
    .getByLabel('Alle Standardregeln genügen (automatische Berechnung)')
    .check();
}

export async function setupEstimator(page: Page) {
  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  await page.locator('#estimator-fundAcquisitionCost').fill('0');
  await page.locator('#estimator-scopeConfirmed').check();
  await page.locator('#estimator-lossScopeConfirmed').check();
  await expect(page.locator('#estimator-readiness')).toHaveText(/Bereit f.r detaillierte Sch.tzung/);
}

export async function setupSharedInsurance(page: Page) {
  await page.getByRole('tab', { name: /Versicherung/ }).click();
  await page.locator('#insurance-pension-drvSubsidy').selectOption('not-received');
  await page.getByRole('button', { name: 'Keine anerkannten Kinder', exact: true }).click();
}

export async function openEstimatorDetails(page: Page) {
  if (!(await page.locator('#estimator-fundAcquisitionCost').isVisible())) {
    await page.locator('#estimator-details > summary').click();
  }
  await expect(page.locator('#estimator-fundAcquisitionCost')).toBeVisible();
}

export async function setupEstimatorWithCost(page: Page, cost: string) {
  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  await openEstimatorDetails(page);
  await page.locator('#estimator-fundAcquisitionCost').fill(cost);
  await page.locator('#estimator-scopeConfirmed').check();
  await page.locator('#estimator-lossScopeConfirmed').check();
  await expect(page.locator('#estimator-readiness')).toHaveText(/Bereit f.r detaillierte Sch.tzung/);
}

// Fresh both-phase whole totals via the explicit manual radios (not via an
// unsupported status): auto-only answers stay unanswered — the suggested
// additional rate is cleared while an automatic phase still shows it, children
// and DRV subsidy are never answered. Valid only when every phase is manual;
// block 2 (rate/children) is hidden then, so no auto-only input can block.
export async function setupBothPhaseManualTotals(
  page: Page,
  bridge: { kv: string; pv: string },
  pension: { kv: string; pv: string },
) {
  await page.getByRole('tab', { name: /Versicherung/ }).click();
  await page.locator('#insurance-insurerAdditionalRate').fill('');
  await page.getByLabel('Eigene KV/PV-Beiträge einsetzen – Brücke', { exact: true }).check();
  await page.locator('#insurance-bridge-kvMonthlyToday').fill(bridge.kv);
  await page.locator('#insurance-bridge-pvMonthlyToday').fill(bridge.pv);
  await page.getByLabel('Eigene KV/PV-Beiträge einsetzen – Rentenphase', { exact: true }).check();
  await page.locator('#insurance-pension-kvMonthlyToday').fill(pension.kv);
  await page.locator('#insurance-pension-pvMonthlyToday').fill(pension.pv);
}

export async function openTaxNotes(page: Page) {
  const summary = page.getByText('Hinweise zur Renten- und Kapitalertragsteuer', { exact: true });
  const open = await summary.evaluate((el) => (el.parentElement as HTMLDetailsElement).open);
  if (!open) await summary.click();
}

export async function expectPensionTaxLimitation(page: Page) {
  await openTaxNotes(page);
  // Scope to the results tax-notes container: the same joint-funding phrase also
  // appears in the CapitalEstimatorSetup input paragraph, so a page-wide locator
  // is a strict-mode violation.
  const taxNotes = page.locator('details:has(summary:text("Hinweise zur Renten- und Kapitalertragsteuer"))');
  await expect(taxNotes.getByText(/im selben Finanzierungs-Fixpunkt/)).toBeVisible();
  await expect(taxNotes.getByText(/zur.ckgekauft/)).toBeVisible();
  await expect(taxNotes.getByText(/keine Freigabe von Anschaffungskosten, Vorabpauschalen oder Verlusttopf/)).toHaveCount(0);
}

export async function setupFundOnlyBridge(page: Page) {
  await setupTimelineBridge(page);
  await setupFundOnlyPortfolio(page);
  await setupInsuranceStatuses(page);
  await setupEstimator(page);
  await setupSharedInsurance(page);
  await expectForecast(page);
}

export async function expectForecast(page: Page) {
  await page.getByText('KV/PV-Abrechnung im Detail', { exact: true }).waitFor({ timeout: 30000 });
  await expect(page.getByText('Dein Kapitalbedarf', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Kapitalverlauf und Überlebenswahrscheinlichkeit' }),
  ).toBeVisible();
}

export async function expectNoForecast(page: Page) {
  await expect(page.getByText(/Deine Prognose ist noch offen/)).toBeVisible();
  await expect(page.getByText('KV/PV-Abrechnung im Detail', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Dein Kapitalbedarf', { exact: true })).toHaveCount(0);
}

export async function openInsuranceBreakdown(page: Page) {
  const summary = page.getByText('KV/PV-Abrechnung im Detail', { exact: true });
  const open = await summary.evaluate((el) => (el.parentElement as HTMLDetailsElement).open);
  if (!open) await summary.click();
  await expect(page.getByRole('heading', { name: 'Monatliche KV/PV-Aufschlüsselung' })).toBeVisible();
}

export async function openYearlyTable(page: Page) {
  await page.getByText('Jährliche Abrechnung anzeigen', { exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Jahrestabelle' })).toBeVisible();
}
