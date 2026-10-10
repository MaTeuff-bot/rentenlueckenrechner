import { expect, test, type Page } from '@playwright/test';
import { freshLoad } from './fixtures';

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
    const title = document.querySelector('.tab-title') as HTMLElement;
    const status = document.querySelector('.input-tabs .section-status') as HTMLElement;
    const tabs = Array.from(document.querySelectorAll('.input-tabs [role="tab"]')) as HTMLElement[];
    const barRect = bar.getBoundingClientRect();
    return {
      columns: getComputedStyle(bar).gridTemplateColumns,
      display: getComputedStyle(bar).display,
      barHeight: barRect.height,
      summaryPosition: getComputedStyle(summary).position,
      summaryWidth: getComputedStyle(summary).width,
      tabWrap: tabs.map((tab) => getComputedStyle(tab).overflowWrap),
      tabBreak: tabs.map((tab) => getComputedStyle(tab).wordBreak),
      titleDirection: getComputedStyle(title).flexDirection,
      titleWrap: getComputedStyle(title).flexWrap,
      statusWhiteSpace: status ? getComputedStyle(status).whiteSpace : '',
      statusShrink: status ? getComputedStyle(status).flexShrink : '',
      tabOverflow: tabs.map((tab) => tab.scrollWidth > tab.clientWidth + 1),
      tabLabels: tabs.map((tab) => tab.textContent ?? ''),
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
  for (const wrap of layout.tabWrap) expect(wrap).not.toBe('anywhere');
  for (const wordBreak of layout.tabBreak) expect(wordBreak).not.toBe('break-all');
  expect(layout.statusWhiteSpace).toBe('nowrap');
  expect(layout.statusShrink).toBe('0');
  expect(layout.tabOverflow).toEqual([false, false, false, false]);
  expect(layout.tabLabels.join(' ')).toMatch(/Persönlicher Plan/);
  expect(layout.tabLabels.join(' ')).toMatch(/Vermögen/);
  expect(layout.tabLabels.join(' ')).toMatch(/Versicherung/);
  expect(layout.tabLabels.join(' ')).toMatch(/Rechenannahmen/);

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
    const anchor = (target.closest('.field') ?? target) as HTMLElement;
    return {
      barBottom: bar.getBoundingClientRect().bottom,
      targetTop: target.getBoundingClientRect().top,
      targetBottom: target.getBoundingClientRect().bottom,
      anchorTop: anchor.getBoundingClientRect().top,
      anchorBottom: anchor.getBoundingClientRect().bottom,
      viewportHeight: window.innerHeight,
      focused: document.activeElement?.id ?? '',
    };
  });
  expect(geom.focused).toBe('cash-planning-rate');
  expect(geom.targetTop).toBeGreaterThanOrEqual(geom.barBottom + 8 - 1);
  expect(geom.targetBottom).toBeLessThanOrEqual(geom.viewportHeight + 1);
  expect(geom.anchorTop).toBeGreaterThanOrEqual(geom.barBottom + 8 - 1);
  expect(geom.anchorBottom).toBeLessThanOrEqual(geom.viewportHeight + 1);

  await page.getByRole('tab', { name: /Rechenannahmen/ }).click();
  const labelsAfter = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.input-tabs [role="tab"]')).map((tab) => tab.textContent ?? ''),
  );
  expect(labelsAfter.join(' ')).toMatch(/Persönlicher Plan/);
  expect(labelsAfter.join(' ')).toMatch(/Vermögen/);
  expect(labelsAfter.join(' ')).toMatch(/Versicherung/);
  expect(labelsAfter.join(' ')).toMatch(/Rechenannahmen/);
  const nextButton = page.locator('#input-tabpanel-annahmen .tab-open-points').getByRole('button', { name: /N.chster offener Punkt/ });
  if (await nextButton.count()) {
    const firstHref = await page.locator('#input-tabpanel-annahmen .tab-open-points a').first().getAttribute('href');
    await nextButton.click();
    await page.waitForTimeout(500);
    const focused = await page.evaluate(() => document.activeElement?.id ?? '');
    expect(`#${focused}`).toBe(firstHref);
    await waitSettledFocus(page, focused);
    const nextGeom = await page.evaluate((id) => {
      const bar = document.querySelector('.input-tabs') as HTMLElement;
      const target = document.getElementById(id) as HTMLElement;
      const anchor = (target.closest('.field') ?? target) as HTMLElement;
      return {
        barBottom: bar.getBoundingClientRect().bottom,
        targetTop: target.getBoundingClientRect().top,
        anchorTop: anchor.getBoundingClientRect().top,
        anchorBottom: anchor.getBoundingClientRect().bottom,
        viewportHeight: window.innerHeight,
      };
    }, focused);
    expect(nextGeom.anchorTop).toBeGreaterThanOrEqual(nextGeom.barBottom + 8 - 1);
    expect(nextGeom.anchorBottom).toBeLessThanOrEqual(nextGeom.viewportHeight + 1);
  }
  const overflowAfter = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  expect(overflowAfter).toBe(false);
  await page.screenshot({ path: testInfo.outputPath('narrow-repair-compact.png') });
});

test('narrow compact tabs stay whole-word at 320 without overflow (narrow-smoke)', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await freshLoad(page);
  const layout = await page.evaluate(() => {
    const bar = document.querySelector('.input-tabs') as HTMLElement;
    const summary = document.querySelector('.tab-summary') as HTMLElement;
    const status = document.querySelector('.input-tabs .section-status') as HTMLElement;
    const tabs = Array.from(document.querySelectorAll('.input-tabs [role="tab"]')) as HTMLElement[];
    const barRect = bar.getBoundingClientRect();
    return {
      columns: getComputedStyle(bar).gridTemplateColumns,
      display: getComputedStyle(bar).display,
      barHeight: barRect.height,
      summaryPosition: getComputedStyle(summary).position,
      summaryWidth: getComputedStyle(summary).width,
      tabWrap: tabs.map((tab) => getComputedStyle(tab).overflowWrap),
      statusWhiteSpace: status ? getComputedStyle(status).whiteSpace : '',
      tabOverflow: tabs.map((tab) => tab.scrollWidth > tab.clientWidth + 1),
      tabLabels: tabs.map((tab) => tab.textContent ?? ''),
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
  expect(layout.viewportWidth).toBeLessThanOrEqual(320);
  for (const wrap of layout.tabWrap) expect(wrap).not.toBe('anywhere');
  expect(layout.statusWhiteSpace).toBe('nowrap');
  expect(layout.tabOverflow).toEqual([false, false, false, false]);
  expect(layout.tabLabels.join(' ')).toMatch(/Vermögen/);
  expect(layout.tabLabels.join(' ')).toMatch(/Versicherung/);
  expect(layout.tabLabels.join(' ')).toMatch(/Rechenannahmen/);
  await page.locator('.validation-summary a[href="#cash-planning-rate"]').first().click();
  await waitSettledFocus(page, 'cash-planning-rate');
  const geom = await page.evaluate(() => {
    const bar = document.querySelector('.input-tabs') as HTMLElement;
    const target = document.getElementById('cash-planning-rate') as HTMLElement;
    const anchor = (target.closest('.field') ?? target) as HTMLElement;
    return {
      barBottom: bar.getBoundingClientRect().bottom,
      targetTop: target.getBoundingClientRect().top,
      targetBottom: target.getBoundingClientRect().bottom,
      anchorTop: anchor.getBoundingClientRect().top,
      anchorBottom: anchor.getBoundingClientRect().bottom,
      viewportHeight: window.innerHeight,
      focused: document.activeElement?.id ?? '',
    };
  });
  expect(geom.focused).toBe('cash-planning-rate');
  expect(geom.targetTop).toBeGreaterThanOrEqual(geom.barBottom + 8 - 1);
  expect(geom.anchorTop).toBeGreaterThanOrEqual(geom.barBottom + 8 - 1);
  expect(geom.anchorBottom).toBeLessThanOrEqual(geom.viewportHeight + 1);
  const tabsAfter = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.input-tabs [role="tab"]')).map((tab) => ({
      overflow: (tab as HTMLElement).scrollWidth > (tab as HTMLElement).clientWidth + 1,
      label: tab.textContent ?? '',
    })),
  );
  expect(tabsAfter.map((entry) => entry.overflow)).toEqual([false, false, false, false]);
  expect(tabsAfter.map((entry) => entry.label).join(' ')).toMatch(/Rechenannahmen/);
  await page.screenshot({ path: testInfo.outputPath('narrow-repair-320.png') });
});
