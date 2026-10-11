import { expect, test, type Page } from '@playwright/test';
import { expectForecast, freshLoad, setupFundOnlyBridge, setupTimelineBridge } from './fixtures';

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

async function waitSettledTab(page: Page, tabId: string) {
  await page.waitForFunction(
    (id) => {
      const bar = document.querySelector('.input-tabs') as HTMLElement | null;
      const panel = document.getElementById(`input-tabpanel-${id}`);
      const tab = document.getElementById(`input-tab-${id}`);
      if (!bar || !panel || !tab || document.activeElement !== tab) return false;
      const barRect = bar.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const key = `${barRect.bottom.toFixed(1)}|${panelRect.top.toFixed(1)}`;
      const store = window as unknown as { __tabPrev?: string; __tabCount?: number };
      if (store.__tabPrev === key) {
        store.__tabCount = (store.__tabCount ?? 0) + 1;
        return (store.__tabCount ?? 0) >= 3;
      }
      store.__tabPrev = key;
      store.__tabCount = 0;
      return false;
    },
    tabId,
    { polling: 100, timeout: 8000 },
  );
}

async function stickyGeometry(page: Page, targetId: string) {
  return page.evaluate((id) => {
    const bar = document.querySelector('.input-tabs') as HTMLElement;
    const target = document.getElementById(id) as HTMLElement;
    const anchor = (target.closest('.field') ?? target) as HTMLElement;
    const barRect = bar.getBoundingClientRect();
    const rect = target.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const clearance = getComputedStyle(document.documentElement).getPropertyValue('--input-tabs-clearance').trim();
    return {
      barBottom: barRect.bottom,
      barHeight: barRect.height,
      targetTop: rect.top,
      targetBottom: rect.bottom,
      anchorTop: anchorRect.top,
      anchorBottom: anchorRect.bottom,
      viewportHeight: window.innerHeight,
      clearance,
      focused: document.activeElement?.id ?? '',
    };
  }, targetId);
}

test('settled sticky clearance keeps the explicit target fully visible (desktop)', async ({ page }, testInfo) => {
  await freshLoad(page);
  await page.locator('.validation-summary a[href="#cash-planning-rate"]').first().click();
  await waitSettledFocus(page, 'cash-planning-rate');
  const geom = await stickyGeometry(page, 'cash-planning-rate');
  expect(geom.focused).toBe('cash-planning-rate');
  expect(geom.targetTop).toBeGreaterThanOrEqual(geom.barBottom + 8 - 1);
  expect(geom.targetBottom).toBeLessThanOrEqual(geom.viewportHeight + 1);
  expect(geom.anchorTop).toBeGreaterThanOrEqual(geom.barBottom + 8 - 1);
  expect(geom.anchorBottom).toBeLessThanOrEqual(geom.viewportHeight + 1);
  expect(geom.clearance).not.toBe('');
  const barHeight = await page.locator('.input-tabs').evaluate((el) => el.getBoundingClientRect().height);
  const clearancePx = Number.parseFloat(geom.clearance);
  expect(clearancePx).toBeGreaterThanOrEqual(barHeight + 8);
  const position = await page.locator('.input-tabs').evaluate((el) => getComputedStyle(el).position);
  expect(position).toBe('sticky');
  await page.screenshot({ path: testInfo.outputPath('repair-settled-clearance.png') });
});

test('ordinary tab switch starts the panel below the bar with settled geometry (desktop)', async ({ page }, testInfo) => {
  await freshLoad(page);
  await page.getByRole('tab', { name: /Rechenannahmen/ }).click();
  await waitSettledTab(page, 'annahmen');
  await expect(page.getByRole('tab', { name: /Rechenannahmen/ })).toBeFocused();
  await expect(page.locator('#cash-planning-rate')).not.toBeFocused();
  await expect(page.locator('#currentAge')).not.toBeFocused();
  const geom = await page.evaluate(() => {
    const bar = document.querySelector('.input-tabs') as HTMLElement;
    const panel = document.getElementById('input-tabpanel-annahmen') as HTMLElement;
    const firstSection = panel.querySelector('.flow-section') as HTMLElement;
    const heading = firstSection.querySelector('header, h3') as HTMLElement | null;
    return {
      barBottom: bar.getBoundingClientRect().bottom,
      panelTop: panel.getBoundingClientRect().top,
      sectionTop: firstSection.getBoundingClientRect().top,
      headingTop: heading ? heading.getBoundingClientRect().top : firstSection.getBoundingClientRect().top,
      headingBottom: heading ? heading.getBoundingClientRect().bottom : firstSection.getBoundingClientRect().bottom,
      viewportHeight: window.innerHeight,
    };
  });
  expect(geom.panelTop).toBeGreaterThanOrEqual(geom.barBottom - 4);
  expect(geom.sectionTop).toBeGreaterThanOrEqual(geom.barBottom - 4);
  expect(geom.sectionTop).toBeLessThanOrEqual(geom.viewportHeight);
  expect(geom.headingTop).toBeGreaterThanOrEqual(geom.barBottom + 8 - 1);
  expect(geom.headingBottom).toBeLessThanOrEqual(geom.viewportHeight + 1);
  await page.screenshot({ path: testInfo.outputPath('repair-ordinary-panel-start.png') });
});

test('missing Offen and invalid Prüfen stay distinguished on real inputs (desktop)', async ({ page }, testInfo) => {
  await freshLoad(page);
  await expect(page.locator('.validation-summary a[href="#cash-planning-rate"]').filter({ hasText: /^Offen:/ }).first()).toBeVisible();
  await page.getByRole('tab', { name: /Pers.nlicher Plan/ }).click();
  await page.locator('#retirementAge').fill('30');
  const pruefenLink = page.locator('.validation-summary a[href="#retirementAge"]').filter({ hasText: /^Prüfen:/ }).first();
  await expect(pruefenLink).toBeVisible();
  const offenText = await page.locator('.validation-summary a[href="#cash-planning-rate"]').first().textContent();
  const pruefenText = await pruefenLink.textContent();
  expect(offenText).toMatch(/^Offen:/);
  expect(pruefenText).toMatch(/^Prüfen:/);
  expect('#cash-planning-rate').not.toBe('#retirementAge');
  await page.locator('.validation-summary a[href="#cash-planning-rate"]').first().click();
  await waitSettledFocus(page, 'cash-planning-rate');
  expect(await page.evaluate(() => document.activeElement?.id ?? '')).toBe('cash-planning-rate');
  const offenGeom = await stickyGeometry(page, 'cash-planning-rate');
  expect(offenGeom.anchorTop).toBeGreaterThanOrEqual(offenGeom.barBottom + 8 - 1);
  expect(offenGeom.anchorBottom).toBeLessThanOrEqual(offenGeom.viewportHeight + 1);
  await page.getByRole('tab', { name: /Pers.nlicher Plan/ }).click();
  await pruefenLink.click();
  await waitSettledFocus(page, 'retirementAge');
  expect(await page.evaluate(() => document.activeElement?.id ?? '')).toBe('retirementAge');
  const pruefenGeom = await stickyGeometry(page, 'retirementAge');
  expect(pruefenGeom.anchorTop).toBeGreaterThanOrEqual(pruefenGeom.barBottom + 8 - 1);
  expect(pruefenGeom.anchorBottom).toBeLessThanOrEqual(pruefenGeom.viewportHeight + 1);
  await page.screenshot({ path: testInfo.outputPath('repair-missing-invalid.png') });
});

test('cross-tab estimator disclosure and conditional bridgeOnly reveal from fresh controls (desktop)', async ({ page }, testInfo) => {
  await freshLoad(page);
  await setupTimelineBridge(page);
  await page.getByRole('tab', { name: /Versicherung/ }).click();
  await expect(page.locator('#insurance-bridge-status')).toBeVisible();
  await page.locator('#insurance-bridge-status').selectOption('voluntary');
  if (await page.locator('#insurance-pension-status').count()) {
    await page.locator('#insurance-pension-status').selectOption('voluntary');
  }
  await expect(page.locator('.validation-summary a[href="#insurance-bridge-bridgeOnly"]').first()).toBeVisible();
  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  const estimatorOpen = await page.locator('#estimator-details').evaluate((el) => (el as HTMLDetailsElement).open);
  if (estimatorOpen) {
    await page.locator('#estimator-details > summary').click();
  }
  await expect(page.locator('#estimator-fundAcquisitionCost')).toBeHidden();
  await page.getByRole('tab', { name: /Pers.nlicher Plan/ }).click();
  const bridgeLink = page.locator('.validation-summary a[href="#insurance-bridge-bridgeOnly"]').first();
  await expect(bridgeLink).toBeVisible();
  await bridgeLink.click();
  await waitSettledFocus(page, 'insurance-bridge-bridgeOnly');
  await expect(page.locator('#input-tabpanel-versicherung')).toBeVisible();
  await expect(page.locator('#insurance-bridge-bridgeOnly')).toBeVisible();
  await expect(page.locator('.insurance-block')).toHaveCount(4);
  const bridgeGeom = await stickyGeometry(page, 'insurance-bridge-bridgeOnly');
  expect(bridgeGeom.targetTop).toBeGreaterThanOrEqual(bridgeGeom.barBottom + 8 - 1);
  expect(bridgeGeom.targetBottom).toBeLessThanOrEqual(bridgeGeom.viewportHeight + 1);
  expect(bridgeGeom.anchorTop).toBeGreaterThanOrEqual(bridgeGeom.barBottom + 8 - 1);
  expect(bridgeGeom.anchorBottom).toBeLessThanOrEqual(bridgeGeom.viewportHeight + 1);
  await page.screenshot({ path: testInfo.outputPath('repair-bridge-reveal.png') });
  await page.getByRole('tab', { name: /Versicherung/ }).click();
  await page.locator('#insurance-block-4-jump-to-vermoegen').click();
  const estimatorFocusedId = await page.waitForFunction(
    () => {
      const id = document.activeElement?.id ?? '';
      return id.startsWith('estimator-') || id.startsWith('portfolio-') ? id : false;
    },
    undefined,
    { polling: 100, timeout: 8000 },
  ).then(handle => handle.jsonValue());
  const estimatorId = String(estimatorFocusedId);
  await waitSettledFocus(page, estimatorId);
  await expect(page.locator('#input-tabpanel-vermoegen')).toBeVisible();
  await expect(page.locator(`#${estimatorId}`)).toBeVisible();
  const estimatorGeom = await stickyGeometry(page, estimatorId);
  expect(estimatorGeom.targetTop).toBeGreaterThanOrEqual(estimatorGeom.barBottom + 8 - 1);
  expect(estimatorGeom.targetBottom).toBeLessThanOrEqual(estimatorGeom.viewportHeight + 1);
  expect(estimatorGeom.anchorTop).toBeGreaterThanOrEqual(estimatorGeom.barBottom + 8 - 1);
  expect(estimatorGeom.anchorBottom).toBeLessThanOrEqual(estimatorGeom.viewportHeight + 1);
  await page.screenshot({ path: testInfo.outputPath('repair-estimator-reveal.png') });
});

test('stale disabled-target probe shows truthful status without fallback focus (desktop)', async ({ page }, testInfo) => {
  await freshLoad(page);
  // Regression probe only: explicitly disable the real target in the DOM.
  // This is not a guided forecast; it verifies stale handling truthfully.
  await page.evaluate(() => {
    document.getElementById('cash-planning-rate')?.setAttribute('disabled', '');
  });
  await page.locator('.validation-summary a[href="#cash-planning-rate"]').first().click();
  await expect(page.locator('.navigation-status')).toContainText(/nicht bedienbar|nicht verfügbar/);
  await expect(page.locator('#cash-planning-rate')).not.toBeFocused();
  await expect(page.locator('#currentAge')).not.toBeFocused();
  const focused = await page.evaluate(() => document.activeElement?.id ?? '');
  expect(focused).not.toBe('currentAge');
  expect(focused).not.toBe('cash-planning-rate');
  await page.screenshot({ path: testInfo.outputPath('repair-stale-disabled.png') });
});

test('next skips a removed stale target and focuses the current actionable issue (desktop)', async ({ page }, testInfo) => {
  await freshLoad(page);
  await page.getByRole('tab', { name: /Rechenannahmen/ }).click();
  const links = page.locator('#input-tabpanel-annahmen .tab-open-points a');
  const count = await links.count();
  expect(count).toBeGreaterThanOrEqual(1);
  const firstHref = await links.first().getAttribute('href');
  expect(firstHref).not.toBeNull();
  const firstId = firstHref!.slice(1);
  // Regression probe only: remove the first target so Next must skip it.
  await page.evaluate((id) => {
    document.getElementById(id)?.remove();
  }, firstId);
  await page.locator('#input-tabpanel-annahmen .tab-open-points').getByRole('button', { name: /N.chster offener Punkt/ }).click();
  await page.waitForTimeout(400);
  const focused = await page.evaluate(() => document.activeElement?.id ?? '');
  expect(focused).not.toBe(firstId);
  expect(focused).not.toBe('currentAge');
  if (count >= 2) {
    const secondHref = await links.nth(1).getAttribute('href');
    expect(`#${focused}`).toBe(secondHref);
    await waitSettledFocus(page, focused);
    const geom = await stickyGeometry(page, focused);
    expect(geom.targetTop).toBeGreaterThanOrEqual(geom.barBottom + 8 - 1);
    expect(geom.anchorTop).toBeGreaterThanOrEqual(geom.barBottom + 8 - 1);
    expect(geom.anchorBottom).toBeLessThanOrEqual(geom.viewportHeight + 1);
  } else {
    await expect(page.locator('.navigation-status')).toContainText(/nicht verfügbar/);
  }
  await page.screenshot({ path: testInfo.outputPath('repair-next-skips-stale.png') });
});

test('reduced motion records automatic scroll behavior with settled geometry (desktop)', async ({ page }, testInfo) => {
  await freshLoad(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => {
    (window as unknown as { __scrollCalls?: unknown[] }).__scrollCalls = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (options?: ScrollIntoViewOptions | boolean) {
      (window as unknown as { __scrollCalls: unknown[] }).__scrollCalls.push(options);
      return original.call(this, options);
    };
  });
  await page.locator('.validation-summary a[href="#cash-planning-rate"]').first().click();
  await waitSettledFocus(page, 'cash-planning-rate');
  const calls = await page.evaluate(() => (window as unknown as { __scrollCalls?: Array<ScrollIntoViewOptions> }).__scrollCalls ?? []);
  expect(calls.length).toBeGreaterThan(0);
  expect(calls[calls.length - 1]?.behavior).toBe('auto');
  const geom = await stickyGeometry(page, 'cash-planning-rate');
  expect(geom.targetTop).toBeGreaterThanOrEqual(geom.barBottom + 8 - 1);
  expect(geom.targetBottom).toBeLessThanOrEqual(geom.viewportHeight + 1);
  expect(geom.anchorTop).toBeGreaterThanOrEqual(geom.barBottom + 8 - 1);
  expect(geom.anchorBottom).toBeLessThanOrEqual(geom.viewportHeight + 1);
  await page.screenshot({ path: testInfo.outputPath('repair-reduced-motion.png') });
});

test('empty state after visible-control forecast has no fake links (desktop)', async ({ page }, testInfo) => {
  await freshLoad(page);
  await setupFundOnlyBridge(page);
  await expectForecast(page);
  await expect(page.locator('.validation-summary')).toHaveCount(0);
  await expect(page.locator('.navigation-status')).toHaveCount(0);
  for (const tabName of [/Pers.nlicher Plan/, /Verm.gen/, /Versicherung/, /Rechenannahmen/]) {
    await page.getByRole('tab', { name: tabName }).click();
    const panelId = await page.getByRole('tab', { name: tabName }).getAttribute('aria-controls');
    const panel = page.locator(`#${panelId}`);
    await expect(panel.getByText(/Vollst.ndig – keine offenen Punkte/)).toBeVisible();
    await expect(panel.getByRole('link', { name: /Offen:|Prüfen:/ })).toHaveCount(0);
  }
  await page.screenshot({ path: testInfo.outputPath('repair-empty-state.png') });
});
