import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import {
  expectForecast,
  freshLoad,
  openYearlyTable,
  setupFundOnlyBridge,
} from './fixtures';

// Genuine Worker-lifecycle evidence for the responsive-calculation lane.
//
// Every test below wraps the NATIVE Worker (test-side addInitScript) to track
// construction/postMessage/completion/termination while preserving the REAL
// computation path: no production global, no engine injection, standard N1000
// simulations via setupFundOnlyBridge. Edits, tab switches and invalidations
// only run after the wrapper observes a real post with the job still active,
// so "during compute" labels describe observed worker state. Rendered results
// are tied to the latest COMPLETED request (posted input snapshot +
// completed request id + year-table boundary cell), never merely the input
// value. Timing values are labeled measurements (action wall time,
// event-to-render sample, end-to-result); the broad 5000ms tab bound is a
// responsiveness guard, not a speed claim.

type PostedRecord = { requestId: number | null; retirementAge: number | null; at: number };
type CompletedRecord = { requestId: number | null; at: number };
type WorkerStatsSnapshot = {
  constructed: number;
  posted: PostedRecord[];
  completed: CompletedRecord[];
  terminated: number;
  errors: number;
};

async function installWorkerStats(page: Page) {
  await page.addInitScript(() => {
    const scope = window as unknown as {
      __workerStats?: {
        constructed: number;
        posted: PostedRecord[];
        completed: CompletedRecord[];
        terminated: number;
        errors: number;
        lastData: unknown;
      };
      __workerLastInstance?: Worker | null;
      __workerInstances?: Worker[];
      __failWorkerConstructions?: boolean;
      __failWorkerPosts?: boolean;
      Worker: typeof Worker;
    };
    scope.__workerStats = {
      constructed: 0,
      posted: [],
      completed: [],
      terminated: 0,
      errors: 0,
      lastData: null,
    };
    scope.__workerLastInstance = null;
    scope.__workerInstances = [];
    const NativeWorker = scope.Worker.bind(window);
    scope.Worker = function (url: string | URL, options?: WorkerOptions) {
      if (scope.__failWorkerConstructions) throw new Error('injected worker construction failure');
      const worker = new NativeWorker(url, options);
      scope.__workerLastInstance = worker;
      scope.__workerInstances!.push(worker);
      scope.__workerStats!.constructed += 1;
      const overwritable = worker as unknown as {
        postMessage: (message: unknown, ...rest: unknown[]) => void;
        terminate: () => void;
      };
      const nativePost = overwritable.postMessage.bind(worker);
      overwritable.postMessage = (message: unknown, ...rest: unknown[]) => {
        if (scope.__failWorkerPosts) throw new Error('injected worker postMessage failure');
        const record = message as { requestId?: unknown; input?: { retirementAge?: unknown } };
        scope.__workerStats!.posted.push({
          requestId: typeof record?.requestId === 'number' ? record.requestId : null,
          retirementAge: typeof record?.input?.retirementAge === 'number' ? record.input.retirementAge : null,
          at: Date.now(),
        });
        nativePost(message, ...rest);
      };
      const nativeTerminate = overwritable.terminate.bind(worker);
      overwritable.terminate = () => {
        scope.__workerStats!.terminated += 1;
        nativeTerminate();
      };
      worker.addEventListener('message', (event: Event) => {
        const data = (event as MessageEvent).data as { requestId?: unknown };
        scope.__workerStats!.completed.push({
          requestId: typeof data?.requestId === 'number' ? data.requestId : null,
          at: Date.now(),
        });
        scope.__workerStats!.lastData = data;
      });
      worker.addEventListener('error', () => {
        scope.__workerStats!.errors += 1;
      });
      return worker;
    } as unknown as typeof Worker;
  });
}

async function readWorkerStats(page: Page): Promise<WorkerStatsSnapshot> {
  return page.evaluate(() => {
    const scope = window as unknown as { __workerStats?: WorkerStatsSnapshot & { lastData?: unknown } };
    const stats = scope.__workerStats;
    if (!stats) throw new Error('worker stats init script missing');
    return {
      constructed: stats.constructed,
      posted: [...stats.posted],
      completed: [...stats.completed],
      terminated: stats.terminated,
      errors: stats.errors,
    };
  });
}

async function waitForPosted(page: Page, count: number) {
  await page.waitForFunction(
    (expected: number) =>
      (window as unknown as { __workerStats?: { posted: unknown[] } }).__workerStats!.posted.length >= expected,
    count,
    { timeout: 20000 },
  );
}

function timingPath(name: string) {
  return `test-results/worker-timings-${name}.json`;
}

function recordTiming(name: string, timings: Record<string, number | string>) {
  mkdirSync('test-results', { recursive: true });
  writeFileSync(timingPath(name), JSON.stringify({ spec: name, ...timings }, null, 2));
}

const loadingText = 'Prognose wird berechnet …';
const cardsText = 'Kapital zum Rentenbeginn';
const chartName = 'Kapitalverlauf und Überlebenswahrscheinlichkeit';
const kvDetailText = 'KV/PV-Abrechnung im Detail';

async function sampleImmediateHiding(page: Page, fillEnd: number) {
  // Tight single-shot sampling loop capped INSIDE the 150ms debounce window:
  // no Playwright auto-wait may be used here, otherwise the sample would land
  // after the replacement job already launched and prove nothing about the
  // synchronous hide. Returns the event-to-render sample latency.
  const deadline = fillEnd + 150;
  let samples = 0;
  for (;;) {
    samples += 1;
    const loading = await page.getByText(loadingText, { exact: true }).count();
    const cards = await page.getByText(cardsText, { exact: true }).count();
    const now = Date.now();
    if (loading === 1 && cards === 0) return { samples, sampleMs: now - fillEnd };
    if (now >= deadline) {
      throw new Error(`stale forecast still visible ${now - fillEnd}ms after edit (samples=${samples})`);
    }
    await page.waitForTimeout(8);
  }
}

test('hides stale forecast immediately and shows loading during debounce', async ({ page }) => {
  await installWorkerStats(page);
  await freshLoad(page);
  await setupFundOnlyBridge(page);
  const before = await readWorkerStats(page);

  await page.getByRole('tab', { name: /Pers.nlicher Plan/ }).click();
  const fillStart = Date.now();
  await page.locator('#retirementAge').fill('66');
  const fillEnd = Date.now();
  const hiding = await sampleImmediateHiding(page, fillEnd);
  await expectForecast(page);
  const forecastMs = Date.now() - fillEnd;
  expect(await page.locator('#retirementAge').inputValue()).toBe('66');
  const after = await readWorkerStats(page);
  expect(after.posted.length - before.posted.length).toBe(1);
  expect(after.completed[after.completed.length - 1]?.requestId).toBe(
    after.posted[after.posted.length - 1]?.requestId,
  );
  recordTiming('debounce-hiding', {
    kind: 'n1000-success',
    actionWallMs: fillEnd - fillStart,
    eventToRenderSampleMs: hiding.sampleMs,
    renderSamples: hiding.samples,
    fillEndToForecastMs: forecastMs,
    postedJobs: after.posted.length - before.posted.length,
  });
});

test('latest valid snapshot wins after rapid edits', async ({ page }) => {
  await installWorkerStats(page);
  await freshLoad(page);
  await setupFundOnlyBridge(page);
  const before = await readWorkerStats(page);

  await page.getByRole('tab', { name: /Pers.nlicher Plan/ }).click();
  await page.locator('#retirementAge').fill('67');
  // Wait until the native Worker actually started the 67-job and prove it is
  // still active (no completion yet, loading rendered) before superseding it.
  await waitForPosted(page, before.posted.length + 1);
  const activeCheck = await readWorkerStats(page);
  expect(activeCheck.completed.length).toBe(before.completed.length);
  expect(await page.getByText(loadingText, { exact: true }).count()).toBe(1);
  const supersedeStart = Date.now();
  await page.locator('#retirementAge').fill('68');
  const supersedeEnd = Date.now();
  await waitForPosted(page, before.posted.length + 2);
  await expectForecast(page);
  const forecastMs = Date.now() - supersedeEnd;
  expect(await page.locator('#retirementAge').inputValue()).toBe('68');

  const after = await readWorkerStats(page);
  const firstJob = after.posted[before.posted.length];
  const latestJob = after.posted[after.posted.length - 1];
  expect(after.posted.length - before.posted.length).toBe(2);
  expect(latestJob.retirementAge).toBe(68);
  // The rendered RESULT is for the latest COMPLETED request: the superseded
  // 67-job never completed and the last completion matches the 68-job.
  expect(after.completed.map((entry) => entry.requestId)).not.toContain(firstJob.requestId);
  expect(after.completed[after.completed.length - 1]?.requestId).toBe(latestJob.requestId);
  // Year-table numeric correspondence with the latest request: accumulation
  // now ends at 67-68 (retirementAge 68), not at the stale 64-65 boundary.
  await openYearlyTable(page);
  await expect(page.getByRole('cell', { name: '67-68' })).toBeVisible();

  // Controlled stale transport injection: replay the latest REAL payload with
  // the superseded request id through the SUPERSEDED job's own handler. Its
  // request identity no longer matches the boundary generation, so it must be
  // discarded silently — cards, chart and table keep showing the 68-result
  // with no transport failure. (Delivering a mismatched id through the
  // CURRENT handler would instead be an honest transport anomaly.)
  const medianCard = page.locator('article.result-card:has-text("Median-Kapital zum Rentenbeginn")');
  const cardBefore = await medianCard.textContent();
  await page.evaluate((staleRequestId: number | null) => {
    const scope = window as unknown as {
      __workerStats?: { lastData: unknown };
      __workerInstances?: Array<{ onmessage: ((event: { data: unknown }) => void) | null }>;
    };
    const instances = scope.__workerInstances ?? [];
    const handler = instances[instances.length - 2]?.onmessage;
    const payload = scope.__workerStats?.lastData as Record<string, unknown> | undefined;
    if (instances.length < 2 || !handler || !payload) {
      throw new Error('need a superseded worker handler and a completed payload for stale injection');
    }
    handler({ data: { ...payload, requestId: staleRequestId } });
  }, firstJob.requestId);
  await page.waitForTimeout(300);
  expect(await medianCard.textContent()).toBe(cardBefore);
  expect(await page.getByText(loadingText, { exact: true }).count()).toBe(0);
  expect(await page.getByText(/Worker-Fehler/).count()).toBe(0);
  const injected = await readWorkerStats(page);
  expect(injected.completed.length).toBe(after.completed.length);
  recordTiming('rapid-edits', {
    kind: 'n1000-success',
    supersedeWallMs: supersedeEnd - supersedeStart,
    supersedeEndToForecastMs: forecastMs,
    postedJobs: after.posted.length - before.posted.length,
    staleInjectionAccepted: 0,
  });
});

test('tab switches stay responsive during N1000 computation', async ({ page }) => {
  await installWorkerStats(page);
  await freshLoad(page);
  await setupFundOnlyBridge(page);
  const before = await readWorkerStats(page);

  await page.getByRole('tab', { name: /Pers.nlicher Plan/ }).click();
  await page.locator('#retirementAge').fill('69');
  const fillEnd = Date.now();
  // Switch only after the native Worker provably started and is still active.
  await waitForPosted(page, before.posted.length + 1);
  const activeCheck = await readWorkerStats(page);
  expect(activeCheck.completed.length).toBe(before.completed.length);
  expect(await page.getByText(loadingText, { exact: true }).count()).toBe(1);
  const switchStart = Date.now();
  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  await expect(page.locator('#portfolio-holding-equity')).toBeVisible();
  const switchMs = Date.now() - switchStart;
  expect(switchMs).toBeLessThan(5000);
  await expectForecast(page);
  const after = await readWorkerStats(page);
  expect(after.completed[after.completed.length - 1]?.requestId).toBe(
    after.posted[after.posted.length - 1]?.requestId,
  );
  recordTiming('tab-during-compute', {
    kind: 'n1000-success',
    tabSwitchWallMs: switchMs,
    fillEndToForecastMs: Date.now() - fillEnd,
  });
});

test('invalid input cancels work and shows readiness, valid input recovers', async ({ page }) => {
  await installWorkerStats(page);
  await freshLoad(page);
  await setupFundOnlyBridge(page);

  // Phase 1: invalid NUMERIC input cancels an in-flight job (not a completed
  // forecast, not a pending debounce). Each attempt posts exactly one job,
  // blanks it immediately, then verifies post-hoc: one post observed, no
  // completion recorded, worker terminated exactly once. Only an in-flight
  // cancel satisfies all three (a completion would record completed, a
  // debounce-blank would terminate nothing). Bounded retries with fresh
  // values cover outlier-fast runs without weakening the evidence.
  await page.getByRole('tab', { name: /Pers.nlicher Plan/ }).click();
  const ageField = page.locator('#retirementAge');
  let cancelledNumeric = false;
  for (const value of ['67', '68', '69']) {
    const base = await readWorkerStats(page);
    await ageField.fill(value);
    await waitForPosted(page, base.posted.length + 1);
    await ageField.fill('');
    const after = await readWorkerStats(page);
    if (
      after.posted.length === base.posted.length + 1 &&
      after.completed.length === base.completed.length &&
      after.terminated === base.terminated + 1
    ) {
      cancelledNumeric = true;
      break;
    }
  }
  expect(cancelledNumeric).toBe(true);
  await expect(page.getByText(/Deine Prognose ist noch offen/)).toBeVisible();
  expect(await page.getByText(loadingText, { exact: true }).count()).toBe(0);
  expect(await page.getByText(kvDetailText, { exact: true }).count()).toBe(0);
  let stats = await readWorkerStats(page);
  const completedAfterCancel = stats.completed.length;
  // No late completion can restore results after the cancel.
  await page.waitForTimeout(500);
  stats = await readWorkerStats(page);
  expect(stats.completed.length).toBe(completedAfterCancel);
  expect(await page.getByText(kvDetailText, { exact: true }).count()).toBe(0);

  await ageField.fill('65');
  await expectForecast(page);
  stats = await readWorkerStats(page);
  expect(stats.completed[stats.completed.length - 1]?.requestId).toBe(
    stats.posted[stats.posted.length - 1]?.requestId,
  );

  // Phase 2: incomplete READINESS cancels an in-flight job as well. The
  // checkbox is made visible BEFORE the race so the post-to-uncheck window
  // stays minimal; the same airtight post-hoc triple (one post, no
  // completion, one termination) proves the estimator break killed a running
  // worker. Bounded retries restore validity between attempts.
  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  if (!(await page.locator('#estimator-scopeConfirmed').isVisible())) {
    await page.locator('#estimator-details > summary').click();
  }
  await expect(page.locator('#estimator-scopeConfirmed')).toBeVisible();
  await page.getByRole('tab', { name: /Pers.nlicher Plan/ }).click();
  const scopeCheckbox = page.locator('#estimator-scopeConfirmed');
  let cancelledReadiness = false;
  for (const value of ['66', '67', '68']) {
    const base = await readWorkerStats(page);
    await ageField.fill(value);
    await page.getByRole('tab', { name: /Verm.gen/ }).click();
    await waitForPosted(page, base.posted.length + 1);
    await scopeCheckbox.uncheck();
    const after = await readWorkerStats(page);
    if (
      after.posted.length === base.posted.length + 1 &&
      after.completed.length === base.completed.length &&
      after.terminated === base.terminated + 1
    ) {
      cancelledReadiness = true;
      break;
    }
    await scopeCheckbox.check();
    await expectForecast(page);
    await page.getByRole('tab', { name: /Pers.nlicher Plan/ }).click();
  }
  expect(cancelledReadiness).toBe(true);
  await expect(page.getByText(/Deine Prognose ist noch offen/)).toBeVisible();
  expect(await page.getByText(loadingText, { exact: true }).count()).toBe(0);
  stats = await readWorkerStats(page);
  const readinessCompleted = stats.completed.length;
  await page.waitForTimeout(500);
  stats = await readWorkerStats(page);
  expect(stats.completed.length).toBe(readinessCompleted);
  await scopeCheckbox.check();
  await expectForecast(page);
  recordTiming('invalid-cancel', { kind: 'readiness' });
});

test('worker construction failure shows Retry and recovers with the latest snapshot', async ({ page }) => {
  await installWorkerStats(page);
  await freshLoad(page);
  await setupFundOnlyBridge(page);

  await page.evaluate(() => {
    (window as unknown as { __failWorkerConstructions?: boolean }).__failWorkerConstructions = true;
  });
  await page.getByRole('tab', { name: /Pers.nlicher Plan/ }).click();
  await page.locator('#retirementAge').fill('70');
  await expect(page.getByText(/Worker-Fehler/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Erneut berechnen' })).toBeVisible();
  await expect(page.locator('#retirementAge')).toBeEnabled();
  // Edit to a NEW latest snapshot while construction still fails: Retry must
  // recover with this newest input, not the older retained one.
  await page.locator('#retirementAge').fill('71');
  await expect(page.getByText(/Worker-Fehler/)).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __failWorkerConstructions?: boolean }).__failWorkerConstructions = false;
  });
  await page.getByRole('button', { name: 'Erneut berechnen' }).click();
  await expectForecast(page);
  expect(await page.locator('#retirementAge').inputValue()).toBe('71');
  const stats = await readWorkerStats(page);
  expect(stats.posted[stats.posted.length - 1]?.retirementAge).toBe(71);
  expect(stats.completed[stats.completed.length - 1]?.requestId).toBe(
    stats.posted[stats.posted.length - 1]?.requestId,
  );
  await openYearlyTable(page);
  await expect(page.getByRole('cell', { name: '70-71' })).toBeVisible();
  recordTiming('construction-retry', { kind: 'n1000-success' });
});

test('worker runtime failures surface Retry and recover with the latest snapshot', async ({ page }) => {
  await installWorkerStats(page);
  await freshLoad(page);
  await setupFundOnlyBridge(page);
  await page.getByRole('tab', { name: /Pers.nlicher Plan/ }).click();

  // Phase 1: postMessage throw on the real Worker path is a transport failure.
  await page.evaluate(() => {
    (window as unknown as { __failWorkerPosts?: boolean }).__failWorkerPosts = true;
  });
  await page.locator('#retirementAge').fill('70');
  await expect(page.getByText(/Worker-Fehler/)).toBeVisible();
  await expect(page.getByText(kvDetailText, { exact: true })).toHaveCount(0);
  await page.evaluate(() => {
    (window as unknown as { __failWorkerPosts?: boolean }).__failWorkerPosts = false;
  });
  await page.getByRole('button', { name: 'Erneut berechnen' }).click();
  await expectForecast(page);
  let stats = await readWorkerStats(page);
  expect(stats.posted[stats.posted.length - 1]?.retirementAge).toBe(70);

  // Phase 2: a real error event on the live native Worker object terminates
  // the in-flight job and reports a transport failure (synthetic dispatch on
  // the real object; production wires worker.onerror the same way).
  const postedBase = (await readWorkerStats(page)).posted.length;
  await page.locator('#retirementAge').fill('71');
  await waitForPosted(page, postedBase + 1);
  const activeCheck = await readWorkerStats(page);
  expect(activeCheck.completed.length).toBe(stats.completed.length);
  const terminatedBefore = activeCheck.terminated;
  await page.evaluate(() => {
    const scope = window as unknown as { __workerLastInstance?: Worker | null };
    if (!scope.__workerLastInstance) throw new Error('no live worker instance for error dispatch');
    scope.__workerLastInstance.dispatchEvent(new Event('error'));
  });
  await expect(page.getByText(/Worker-Fehler/)).toBeVisible();
  stats = await readWorkerStats(page);
  expect(stats.terminated).toBe(terminatedBefore + 1);
  expect(stats.errors).toBeGreaterThanOrEqual(1);
  await page.getByRole('button', { name: 'Erneut berechnen' }).click();
  await expectForecast(page);
  expect(await page.locator('#retirementAge').inputValue()).toBe('71');
  stats = await readWorkerStats(page);
  expect(stats.posted[stats.posted.length - 1]?.retirementAge).toBe(71);
  expect(stats.completed[stats.completed.length - 1]?.requestId).toBe(
    stats.posted[stats.posted.length - 1]?.requestId,
  );
  recordTiming('runtime-retry', { kind: 'n1000-success' });
});

test('publishes cards, chart and table atomically with no partial outputs', async ({ page }) => {
  await installWorkerStats(page);
  await freshLoad(page);
  await setupFundOnlyBridge(page);

  await page.getByRole('tab', { name: /Pers.nlicher Plan/ }).click();
  await page.locator('#retirementAge').fill('66');
  const fillEnd = Date.now();
  // Transition stream: marker triples sampled over time from the edit until
  // all three result markers are present. Each sample is read in a SINGLE
  // page.evaluate so the triple observes one indivisible DOM state: three
  // separate count() roundtrips could straddle React's atomic commit and
  // fabricate a torn (partial) read that was never rendered. Atomic
  // publication means every sample is either all-absent (loading) or
  // all-present — never a partial card/chart/table snapshot in between.
  // (During loading the result components are absent from the DOM rather
  // than hidden, so text presence here mirrors the maintained locators below.)
  const samples: Array<{ cards: number; chart: number; kv: number; atMs: number }> = [];
  const deadline = fillEnd + 30000;
  for (;;) {
    const triple = await page.evaluate(
      ({ cardsMarker, chartMarker, kvMarker }: { cardsMarker: string; chartMarker: string; kvMarker: string }) => {
        const bodyText = document.body.textContent ?? '';
        const headingPresent = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).some(
          (heading) => heading.textContent?.includes(chartMarker) ?? false,
        );
        return {
          cards: bodyText.includes(cardsMarker) ? 1 : 0,
          chart: headingPresent ? 1 : 0,
          kv: bodyText.includes(kvMarker) ? 1 : 0,
        };
      },
      { cardsMarker: cardsText, chartMarker: chartName, kvMarker: kvDetailText },
    );
    samples.push({ ...triple, atMs: Date.now() - fillEnd });
    const last = samples[samples.length - 1];
    if (last && last.cards === 1 && last.chart === 1 && last.kv === 1) break;
    if (Date.now() > deadline) break;
    await page.waitForTimeout(12);
  }
  const partials = samples.filter((entry) => entry.cards + entry.chart + entry.kv === 1 || entry.cards + entry.chart + entry.kv === 2);
  expect(partials).toHaveLength(0);
  expect(samples.length).toBeGreaterThan(0);
  const last = samples[samples.length - 1];
  expect(last).toMatchObject({ cards: 1, chart: 1, kv: 1 });

  await expectForecast(page);
  await expect(page.getByText(cardsText, { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: chartName })).toBeVisible();
  await openYearlyTable(page);
  const rows = page.locator('table tbody tr');
  await expect(rows.first()).toBeVisible();
  await expect(await rows.count()).toBeGreaterThan(5);
  recordTiming('atomic-publish', {
    kind: 'n1000-success',
    transitionSamples: samples.length,
    partialSamples: 0,
    fillEndToAtomicMs: last?.atMs ?? -1,
  });
});

test('reload retains the numeric forecast', async ({ page }) => {
  await installWorkerStats(page);
  await freshLoad(page);
  await setupFundOnlyBridge(page);

  const card = page.locator('article.result-card:has-text("Median-Kapital zum Rentenbeginn")');
  const before = await card.textContent();
  await page.reload();
  await expectForecast(page);
  const after = await page.locator('article.result-card:has-text("Median-Kapital zum Rentenbeginn")').textContent();
  expect(after).toBe(before);
  // The reloaded page runs a fresh Worker job (recompute parity, not cache).
  const stats = await readWorkerStats(page);
  expect(stats.posted.length).toBeGreaterThanOrEqual(1);
  expect(stats.completed.length).toBeGreaterThanOrEqual(1);
  recordTiming('reload-parity', { kind: 'reload' });
});

test('non-computation UI does not restart the calculation', async ({ page }) => {
  await installWorkerStats(page);
  await freshLoad(page);
  await setupFundOnlyBridge(page);
  const before = await readWorkerStats(page);

  await page.getByLabel('Kapital logarithmisch skalieren').check();
  await page.getByLabel('Überlebenswahrscheinlichkeit anzeigen').uncheck();
  await page.getByRole('tab', { name: /Verm.gen/ }).click();
  await page.getByRole('tab', { name: /Rechenannahmen/ }).click();
  await page.setViewportSize({ width: 800, height: 1000 });
  await page.waitForTimeout(500);
  await expect(page.getByText(loadingText, { exact: true })).toHaveCount(0);
  await expect(page.getByText(cardsText, { exact: true })).toBeVisible();
  // Job counts (not just loading absence) prove no computation restarted:
  // identical construction/post/completion totals across purely
  // presentational UI and viewport changes.
  const after = await readWorkerStats(page);
  expect(after.constructed).toBe(before.constructed);
  expect(after.posted.length).toBe(before.posted.length);
  expect(after.completed.length).toBe(before.completed.length);
  recordTiming('non-computation', { kind: 'non-computation' });
});
