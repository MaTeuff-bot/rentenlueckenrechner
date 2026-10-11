import { expect, test, type Page } from '@playwright/test';
import { expectForecast, freshLoad, setupFundOnlyBridge } from './fixtures';

async function waitSettledFocus(page: Page, targetId: string) {
  await page.waitForFunction(
    (id) => {
      const bar = document.querySelector('.input-tabs') as HTMLElement | null;
      const target = document.getElementById(id) as HTMLElement | null;
      if (!bar || !target || document.activeElement !== target) return false;
      const anchor = (target.closest('.field') ?? target) as HTMLElement;
      const barRect = bar.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      const key = `${barRect.bottom.toFixed(1)}|${rect.top.toFixed(1)}|${rect.bottom.toFixed(1)}|${anchorRect.top.toFixed(1)}|${anchorRect.bottom.toFixed(1)}`;
      const store = window as unknown as { __settlePrev?: string; __settleCount?: number };
      if (store.__settlePrev === key) {
        store.__settleCount = (store.__settleCount ?? 0) + 1;
        return (store.__settleCount ?? 0) >= 3;
      }
      store.__settlePrev = key;
      store.__settleCount = 0;
      return false;
    },
    targetId,
    { polling: 100, timeout: 8000 },
  );
}

test('ordinary tab switch keeps focus on the tab and starts the panel without focusing inputs', async ({ page }, testInfo) => {
  await freshLoad(page);
  const planTab = page.getByRole('tab', { name: /Pers.nlicher Plan/ });
  const annahmenTab = page.getByRole('tab', { name: /Rechenannahmen/ });
  await annahmenTab.click();
  await expect(page.locator('#input-tabpanel-annahmen')).toBeVisible();
  await expect(annahmenTab).toBeFocused();
  await expect(page.locator('#insurance-rates-kvGeneralRate')).not.toBeFocused();
  await expect(page.locator('#cash-planning-rate')).not.toBeFocused();
  await expect(page.locator('#input-tabpanel-annahmen .tab-open-points').first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('ordinary-tab-annahmen.png') });
  await planTab.click();
  await expect(planTab).toBeFocused();
  await expect(page.locator('#currentAge')).not.toBeFocused();
});

test('keyboard arrows, Home and End move across tabs without focusing inputs', async ({ page }) => {
  await freshLoad(page);
  const planTab = page.getByRole('tab', { name: /Pers.nlicher Plan/ });
  await planTab.click();
  await planTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /Verm.gen/ })).toBeFocused();
  await expect(page.locator('#input-tabpanel-vermoegen')).toBeVisible();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: /Rechenannahmen/ })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(planTab).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('tab', { name: /Rechenannahmen/ })).toBeFocused();
  await expect(page.locator('#cash-planning-rate')).not.toBeFocused();
});

test('explicit issue link reveals the correct tab and focuses the real control', async ({ page }, testInfo) => {
  await freshLoad(page);
  await expect(page.locator('.validation-summary a[href="#cash-planning-rate"]').first()).toBeVisible();
  await page.locator('.validation-summary a[href="#cash-planning-rate"]').first().click();
  await expect(page.locator('#input-tabpanel-annahmen')).toBeVisible();
  await expect(page.locator('#cash-planning-rate')).toBeFocused();
  await expect(page.locator('#cash-planning-rate')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('explicit-issue-cash-rate.png') });
});

test('per-tab lists distinguish Offen and Prüfen, next action focuses the first open point', async ({ page }, testInfo) => {
  await freshLoad(page);
  await page.getByRole('tab', { name: /Rechenannahmen/ }).click();
  const annahmenPoints = page.locator('#input-tabpanel-annahmen .tab-open-points');
  await expect(annahmenPoints.getByRole('link', { name: /Offen:|Prüfen:/ }).first()).toBeVisible();
  const firstLinkText = await annahmenPoints.getByRole('link', { name: /Offen:|Prüfen:/ }).first().textContent();
  expect(firstLinkText).toMatch(/Offen:|Prüfen:/);
  const globalFirstHref = await page.locator('.validation-summary a[href^="#cash-"]').first().getAttribute('href');
  expect(globalFirstHref).not.toBeNull();
  await annahmenPoints.getByRole('button', { name: /N.chster offener Punkt/ }).click();
  const focusedId = await page.evaluate(() => document.activeElement?.id ?? '');
  const firstHref = await annahmenPoints.getByRole('link', { name: /Offen:|Prüfen:/ }).first().getAttribute('href');
  expect(`#${focusedId}`).toBe(firstHref);
  await page.screenshot({ path: testInfo.outputPath('per-tab-next-action.png') });
});

test('sticky tab bar stays visible and never covers the focused target', async ({ page }, testInfo) => {
  await freshLoad(page);
  const position = await page.locator('.input-tabs').evaluate((el) => getComputedStyle(el).position);
  expect(position).toBe('sticky');
  await page.locator('.validation-summary a[href="#cash-planning-rate"]').first().click();
  await expect(page.locator('#cash-planning-rate')).toBeFocused();
  await waitSettledFocus(page, 'cash-planning-rate');
  const overlap = await page.evaluate(() => {
    const bar = document.querySelector('.input-tabs') as HTMLElement;
    const target = document.getElementById('cash-planning-rate') as HTMLElement;
    if (!bar || !target) return { covered: true, anchorCovered: true, barBottom: 0, targetTop: 0, anchorTop: 0 };
    const anchor = (target.closest('.field') ?? target) as HTMLElement;
    const barRect = bar.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    return {
      covered: targetRect.top < barRect.bottom - 1,
      anchorCovered: anchorRect.top < barRect.bottom + 8 - 1,
      barBottom: barRect.bottom,
      targetTop: targetRect.top,
      anchorTop: anchorRect.top,
    };
  });
  expect(overlap.covered).toBe(false);
  expect(overlap.anchorCovered).toBe(false);
  const barVisible = await page.locator('.input-tabs').evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return rect.top <= 1 && rect.bottom > rect.top;
  });
  expect(barVisible).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('sticky-clearance.png') });
});

test('reduced motion still reveals and focuses explicit targets', async ({ page }) => {
  await freshLoad(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.locator('.validation-summary a[href="#cash-planning-rate"]').first().click();
  await expect(page.locator('#cash-planning-rate')).toBeFocused();
  await expect(page.locator('#cash-planning-rate')).toBeVisible();
});

test('estimator, insurance and timeline cross-tab jumps keep working', async ({ page }, testInfo) => {
  await freshLoad(page);
  await page.getByRole('tab', { name: /Versicherung/ }).click();
  await page.locator('#insurance-block-4-jump-to-vermoegen').click();
  await expect(page.locator('#input-tabpanel-vermoegen')).toBeVisible();
  const estimatorFocused = await page.evaluate(() => document.activeElement?.id ?? '');
  expect(estimatorFocused).toMatch(/^estimator-/);
  await page.locator('#estimator-jump-to-insurance').click();
  await expect(page.locator('#input-tabpanel-versicherung')).toBeVisible();
  await expect(page.locator('#insurance-block-3-heading')).toBeFocused();
  await page.getByRole('button', { name: /Zeitplan erg.nzen \/ korrigieren/ }).first().click();
  await expect(page.locator('#input-tabpanel-plan')).toBeVisible();
  const timelineFocused = await page.evaluate(() => document.activeElement?.id ?? '');
  expect(
    ['currentAge', 'retirementAge', 'planningAge', 'insurance-transition'].includes(timelineFocused) ||
      timelineFocused.startsWith('retirement-income-start-'),
  ).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('cross-tab-jumps.png') });
});

test('completed setup leaves no fake links and keeps the forecast journey unchanged', async ({ page }) => {
  await freshLoad(page);
  await setupFundOnlyBridge(page);
  await expectForecast(page);
  await expect(page.locator('.validation-summary')).toHaveCount(0);
  for (const tabName of [/Pers.nlicher Plan/, /Verm.gen/, /Versicherung/, /Rechenannahmen/]) {
    await page.getByRole('tab', { name: tabName }).click();
    const panelId = await page.getByRole('tab', { name: tabName }).getAttribute('aria-controls');
    const panel = page.locator(`#${panelId}`);
    await expect(panel.getByText(/Vollst.ndig – keine offenen Punkte/)).toBeVisible();
    await expect(panel.getByRole('link', { name: /Offen:|Prüfen:/ })).toHaveCount(0);
  }
});
