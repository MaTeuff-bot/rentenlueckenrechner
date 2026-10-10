import { expect, test, type Page } from '@playwright/test';
import { freshLoad } from './fixtures';

async function waitSettledFocus(page: Page, targetId: string) {
  await page.waitForFunction(
    (id) => {
      const bar = document.querySelector('.input-tabs') as HTMLElement | null;
      const target = document.getElementById(id) as HTMLElement | null;
      if (!bar || !target || document.activeElement !== target) return false;
      const barRect = bar.getBoundingClientRect();
      const rect = target.getBoundingClientRect();
      const key = `${barRect.bottom.toFixed(1)}|${rect.top.toFixed(1)}|${rect.bottom.toFixed(1)}`;
      const store = window as unknown as { __narrowPrev?: string; __narrowCount?: number };
      if (store.__narrowPrev === key) {
        store.__narrowCount = (store.__narrowCount ?? 0) + 1;
        return (store.__narrowCount ?? 0) >= 3;
      }
      store.__narrowPrev = key;
      store.__narrowCount = 0;
      return false;
    },
    targetId,
    { polling: 100, timeout: 8000 },
  );
}

test('narrow compact tabs keep settled clearance and support keyboard plus next (narrow-smoke)', async ({ page }, testInfo) => {
  await freshLoad(page);
  const layout = await page.evaluate(() => {
    const bar = document.querySelector('.input-tabs') as HTMLElement;
    const summary = document.querySelector('.tab-summary') as HTMLElement;
    const barRect = bar.getBoundingClientRect();
    return {
      columns: getComputedStyle(bar).gridTemplateColumns,
      display: getComputedStyle(bar).display,
      barHeight: barRect.height,
      summaryPosition: getComputedStyle(summary).position,
      summaryWidth: getComputedStyle(summary).width,
      overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      viewportWidth: window.innerWidth,
    };
  });
  expect(layout.display).toBe('grid');
  expect(layout.columns.trim().split(' ').length).toBe(2);
  expect(layout.summaryPosition).toBe('absolute');
  expect(layout.summaryWidth).toBe('1px');
  expect(layout.barHeight).toBeLessThan(260);
  expect(layout.overflow).toBe(false);
  expect(layout.viewportWidth).toBeLessThanOrEqual(390);

  const planTab = page.getByRole('tab', { name: /Pers.nlicher Plan/ });
  await planTab.click();
  await planTab.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /Verm.gen/ })).toBeFocused();
  await expect(page.locator('#input-tabpanel-vermoegen')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /Versicherung/ })).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: /Rechenannahmen/ })).toBeFocused();
  await expect(page.locator('#cash-planning-rate')).not.toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tab', { name: /Rechenannahmen/ })).toBeFocused();
  await page.keyboard.press('Home');
  await expect(planTab).toBeFocused();

  await page.locator('.validation-summary a[href="#cash-planning-rate"]').first().click();
  await waitSettledFocus(page, 'cash-planning-rate');
  const geom = await page.evaluate(() => {
    const bar = document.querySelector('.input-tabs') as HTMLElement;
    const target = document.getElementById('cash-planning-rate') as HTMLElement;
    return {
      barBottom: bar.getBoundingClientRect().bottom,
      targetTop: target.getBoundingClientRect().top,
      targetBottom: target.getBoundingClientRect().bottom,
      viewportHeight: window.innerHeight,
      focused: document.activeElement?.id ?? '',
    };
  });
  expect(geom.focused).toBe('cash-planning-rate');
  expect(geom.targetTop).toBeGreaterThanOrEqual(geom.barBottom + 8 - 1);
  expect(geom.targetBottom).toBeLessThanOrEqual(geom.viewportHeight + 1);

  await page.getByRole('tab', { name: /Rechenannahmen/ }).click();
  const nextButton = page.locator('#input-tabpanel-annahmen .tab-open-points').getByRole('button', { name: /N.chster offener Punkt/ });
  if (await nextButton.count()) {
    const firstHref = await page.locator('#input-tabpanel-annahmen .tab-open-points a').first().getAttribute('href');
    await nextButton.click();
    await page.waitForTimeout(500);
    const focused = await page.evaluate(() => document.activeElement?.id ?? '');
    expect(`#${focused}`).toBe(firstHref);
    await waitSettledFocus(page, focused);
  }
  const overflowAfter = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflowAfter).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('narrow-repair-compact.png') });
});
