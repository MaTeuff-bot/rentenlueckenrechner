import { expect, test } from '@playwright/test';
import {
  expectForecast,
  freshLoad,
  openInsuranceBreakdown,
  openYearlyTable,
  setupFundOnlyBridge,
} from './fixtures';

test('fund-only bridge setup populates summary, chart and year table', async ({ page }) => {
  await freshLoad(page);
  await setupFundOnlyBridge(page);
  await expectForecast(page);
  await expect(page.getByText('Benötigtes Kapital zum Rentenbeginn', { exact: false })).toBeVisible();
  await expect(page.getByText(/Br.cke.*65 bis unter 67/, { exact: false }).first()).toBeVisible();
  await openInsuranceBreakdown(page);
  await expect(page.getByRole('heading', { name: 'Monatliche KV/PV-Aufschlüsselung' })).toBeVisible();
  await openYearlyTable(page);
  const rows = page.locator('table tbody tr');
  await expect(rows.first()).toBeVisible();
  await expect(await rows.count()).toBeGreaterThan(5);
  await expect(page.locator('table').getByRole('columnheader', { name: 'Alter' })).toBeVisible();
});
