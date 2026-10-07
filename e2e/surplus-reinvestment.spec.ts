import { expect, test } from '@playwright/test';
import { expectForecast, freshLoad, openYearlyTable, setupFundOnlyBridge } from './fixtures';

function parseGermanCurrency(text: string): number {
  const trimmed = text.trim();
  if (trimmed === '' || trimmed === '—' || trimmed === '–' || trimmed === '-') return 0;
  const numeric = trimmed.replace(/[^0-9,.-]/g, '');
  if (numeric === '' || numeric === '-') return 0;
  const normalized = numeric.replace(/\./g, '').replace(',', '.');
  const value = Number(normalized);
  if (!Number.isFinite(value)) throw new Error(`Unparseable German currency: ${text}`);
  return value;
}

async function headerIndex(table: import('@playwright/test').Locator, predicate: (text: string) => boolean): Promise<number> {
  const texts = await table.locator('thead th').allTextContents();
  return texts.findIndex((entry) => predicate(entry));
}

// Visible-control surplus journey: fresh fund-only bridge with low spending / high
// pension forces a year-end surplus. Asserts real numeric after-charges surplus
// cells, row conservation (Start + Rendite + Überschuss = Ende when the gap is 0)
// and reload retention of the same rendered numerics. No localStorage seeding:
// all state is driven through the visible UI.
test('surplus reinvestment journey shows reinvested surplus and persists on reload', async ({ page }) => {
  await freshLoad(page);
  await setupFundOnlyBridge(page);

  // Force surplus through visible controls only: low desired spending, high GRV pension.
  await page.getByRole('tab', { name: /Pers.nlicher Plan/ }).click();
  await page.locator('#monthlyDesiredSpendingToday').fill('100');
  await page.locator('#retirement-income-amount-statutory-pension').fill('5000');
  await expectForecast(page);

  await openYearlyTable(page);
  await page.getByRole('checkbox', { name: 'Details anzeigen' }).check();
  // Truthful header with tooltip that Endkapital includes the reinvested surplus.
  const header = page.getByRole('columnheader', { name: 'Überschuss (reinvestiert)' });
  await expect(header).toBeVisible();
  await expect(header).toHaveAttribute('title', /Endkapital enthalten/);
  await expect(page.getByRole('columnheader', { name: 'Konsumierter Überschuss' })).toHaveCount(0);

  await expect(page.getByRole('columnheader', { name: 'Endkapital', exact: true })).toBeVisible();
  const yearlyTable = page.locator('section[aria-labelledby="table-title"] table');
  const surplusHeaderIndex = await headerIndex(yearlyTable, (entry) => entry.includes('Überschuss (reinvestiert)'));
  const startHeaderIndex = await headerIndex(yearlyTable, (entry) => entry.trim() === 'Startkapital');
  const returnHeaderIndex = await headerIndex(yearlyTable, (entry) => entry.trim() === 'Rendite');
  const endHeaderIndex = await headerIndex(yearlyTable, (entry) => entry.trim() === 'Endkapital');
  const gapHeaderIndex = await headerIndex(yearlyTable, (entry) => entry.trim() === 'Entnahme für Nettolücke');
  expect(surplusHeaderIndex).toBeGreaterThan(0);
  expect(startHeaderIndex).toBeGreaterThanOrEqual(0);
  expect(returnHeaderIndex).toBeGreaterThanOrEqual(0);
  expect(endHeaderIndex).toBeGreaterThan(0);
  expect(gapHeaderIndex).toBeGreaterThan(0);

  // First retirement row with a genuinely positive after-charges surplus cell.
  const bodyRows = yearlyTable.locator('tbody tr');
  await expect(bodyRows.first()).toBeVisible();
  const rowCount = await bodyRows.count();
  expect(rowCount).toBeGreaterThan(0);
  let foundSurplusRow = false;
  let surplusBefore = 0;
  let closingBefore = 0;
  let surplusTextBefore = '';
  let endTextBefore = '';
  for (let index = 0; index < rowCount; index += 1) {
    const cells = await bodyRows.nth(index).locator('td').allTextContents();
    if ((cells[1] ?? '').trim() !== 'Ruhestand') continue;
    const surplus = parseGermanCurrency(cells[surplusHeaderIndex] ?? '');
    if (surplus > 0) {
      const opening = parseGermanCurrency(cells[startHeaderIndex] ?? '');
      const yearlyReturn = parseGermanCurrency(cells[returnHeaderIndex] ?? '');
      surplusBefore = surplus;
      closingBefore = parseGermanCurrency(cells[endHeaderIndex] ?? '');
      const gap = parseGermanCurrency(cells[gapHeaderIndex] ?? '');
      surplusTextBefore = (cells[surplusHeaderIndex] ?? '').trim();
      endTextBefore = (cells[endHeaderIndex] ?? '').trim();
      // Surplus rows fund nothing from the portfolio: the gap withdrawal is zero
      // and the reinvested surplus is already contained in the end capital.
      expect(gap).toBe(0);
      expect(Math.abs(closingBefore - (opening + yearlyReturn + surplusBefore))).toBeLessThanOrEqual(300);
      foundSurplusRow = true;
      break;
    }
  }
  expect(foundSurplusRow).toBe(true);
  expect(surplusBefore).toBeGreaterThan(0);
  expect(surplusTextBefore).not.toBe('');
  expect(endTextBefore).not.toBe('');

  const requiredCapitalBefore = await page.locator('article.result-card-primary').textContent();
  expect(requiredCapitalBefore).toContain('Benötigtes Kapital zum Rentenbeginn');

  // Entered values are retained via the visible controls themselves.
  await page.getByRole('tab', { name: /Pers.nlicher Plan/ }).click();
  expect(await page.locator('#monthlyDesiredSpendingToday').inputValue()).toBe('100');
  expect(await page.locator('#retirement-income-amount-statutory-pension').inputValue()).toBe('5000');

  // Reload persistence without seeding: same rendered numerics and result text.
  await page.reload();
  await expectForecast(page);
  await page.getByRole('tab', { name: /Pers.nlicher Plan/ }).click();
  await expect(page.locator('#monthlyDesiredSpendingToday')).toHaveValue('100');
  await expect(page.locator('#retirement-income-amount-statutory-pension')).toHaveValue('5000');
  const requiredCapitalAfter = await page.locator('article.result-card-primary').textContent();
  expect(requiredCapitalAfter).toBe(requiredCapitalBefore);

  await openYearlyTable(page);
  await page.getByRole('checkbox', { name: 'Details anzeigen' }).check();
  await expect(page.getByRole('columnheader', { name: 'Überschuss (reinvestiert)' })).toBeVisible();
  const reloadedTable = page.locator('section[aria-labelledby="table-title"] table');
  const reloadedSurplusIndex = await headerIndex(reloadedTable, (entry) => entry.includes('Überschuss (reinvestiert)'));
  const reloadedStartIndex = await headerIndex(reloadedTable, (entry) => entry.trim() === 'Startkapital');
  const reloadedReturnIndex = await headerIndex(reloadedTable, (entry) => entry.trim() === 'Rendite');
  const reloadedEndIndex = await headerIndex(reloadedTable, (entry) => entry.trim() === 'Endkapital');
  const reloadedGapIndex = await headerIndex(reloadedTable, (entry) => entry.trim() === 'Entnahme für Nettolücke');
  expect(reloadedSurplusIndex).toBe(surplusHeaderIndex);
  const reloadedRows = reloadedTable.locator('tbody tr');
  const reloadedCount = await reloadedRows.count();
  expect(reloadedCount).toBe(rowCount);
  let foundReloadedSurplusRow = false;
  for (let index = 0; index < reloadedCount; index += 1) {
    const cells = await reloadedRows.nth(index).locator('td').allTextContents();
    if ((cells[1] ?? '').trim() !== 'Ruhestand') continue;
    const surplus = parseGermanCurrency(cells[reloadedSurplusIndex] ?? '');
    if (surplus > 0) {
      const opening = parseGermanCurrency(cells[reloadedStartIndex] ?? '');
      const yearlyReturn = parseGermanCurrency(cells[reloadedReturnIndex] ?? '');
      const closing = parseGermanCurrency(cells[reloadedEndIndex] ?? '');
      const gap = parseGermanCurrency(cells[reloadedGapIndex] ?? '');
      expect(surplus).toBe(surplusBefore);
      expect(closing).toBe(closingBefore);
      expect((cells[reloadedSurplusIndex] ?? '').trim()).toBe(surplusTextBefore);
      expect((cells[reloadedEndIndex] ?? '').trim()).toBe(endTextBefore);
      expect(gap).toBe(0);
      expect(Math.abs(closing - (opening + yearlyReturn + surplus))).toBeLessThanOrEqual(300);
      foundReloadedSurplusRow = true;
      break;
    }
  }
  expect(foundReloadedSurplusRow).toBe(true);
});
