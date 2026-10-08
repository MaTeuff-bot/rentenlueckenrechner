# Browser tests

Maintainable `@playwright/test` suite against the production build served by
`vite preview`. No ad-hoc scripts, no engine injection, no seeded storage
passed off as fresh E2E. Inputs go through accessible UI controls only.

## Scope

- Chromium desktop (1440x1000) plus one narrow-screen smoke (390x844).
- Narrow viewport is not Safari or mobile-device equivalence.
- Bundled sources only; no external hosted app or network data.
- Fixed natural RNG is accepted; seeds are never cherry-picked to hide
  unsupported bank draws.

Journeys (all on Chromium unless noted):

1. `e2e/fund-bridge.spec.ts` — clean supported fund-only setup with a bridge
   between work end (65) and GRV start (67); asserts populated summary,
   chart and year table.
2. `e2e/readiness-links.spec.ts` — missing answers block the forecast, issue
   links focus the relevant controls, correcting enables results.
3. `e2e/persistence.spec.ts` — reload retains the nonzero cost basis,
   holdings, insurance answers and the deterministic median-capital result
   text (stable text compared before/after, not discarded).
4. `e2e/capital-mode.spec.ts` — mandatory detailed-portfolio gating across
   insurance modes: no per-phase capital selects, mode switching preserves
   portfolio settings, whole-phase manual totals never bypass the portfolio,
   breaking portfolio setup blocks the forecast again; KVdR pension keeps the
   same gating, shows the KVdR label, preserves the nonzero basis across
   mode switches and asserts the precise pension-tax funding limitation in
   the visible tax notes.
5. `e2e/insurance-manual.spec.ts` — fresh both-phase whole totals via the
   explicit manual radios with automatic-only family/subsidy answers
   UNANSWERED (suggested additional rate cleared, no children answer, no DRV
   subsidy branch): missing portfolio cost/scope blocks the forecast,
   completing the estimator with a nonzero basis enables detailed results
   with the manual totals as the selected contributions; basis, holdings and
   manual totals survive insurance switches and reload. All visible-control
   journeys use fresh UI input only (no seeded storage, no engine injection,
   no force clicks).
6. `e2e/bank-rejection.spec.ts` — existing unsupported negative-gross-bank-return
   rejection via real controls (bank + synthetic cash). Asserts the
   `Negative bank return` error and absent forecast; no bank success is claimed.
7. `e2e/narrow-smoke.spec.ts` — narrow-viewport smoke of journey 1 (project `narrow`).

Shared helpers live in `e2e/fixtures.ts` with explicit readiness answers
derived from `model/capitalIncome/setup.ts`,
`model/capitalIncome/portfolioEstimator.ts`, `model/retirementInsurance.ts`,
`model/insuranceCoverage.ts` and `model/childrenAnswer.ts`.

## Installation

```sh
npm ci
npx playwright install --with-deps chromium
# or: npm run test:e2e:install
```

Playwright browsers are test-only and not part of the production bundle.

## Local execution

```sh
npm run test:e2e
```

Every invocation (including direct `npx playwright test`) builds fresh assets
before its owned preview server: `playwright.config.ts` `webServer` runs
`npm run build && npm run preview` on
`http://127.0.0.1:4173/rentenlueckenrechner/`, then runs Chromium plus the
narrow smoke. An explicit `npm run build` beforehand is optional. Retries are
`0`; screenshots and traces are kept on failure (`test-results/`,
`playwright-report/`).

Single-file or single-project runs (each also builds fresh first):

```sh
npx playwright test --project=chromium e2e/fund-bridge.spec.ts
npx playwright test --project=narrow
```

In pid- and shm-constrained containers the suite passes
`--disable-dev-shm-usage --no-sandbox --disable-gpu` to Chromium (see
`playwright.config.ts`). Multi-process mode is kept because
`--single-process` proved unstable there (browser died between test files).
This is an infra accommodation and does not change
product behavior or assertions.

`reuseExistingServer` stays `false`: Playwright never reuses a stale preview
server and never kills a foreign server on port 4173. A port conflict fails
fast via `--strictPort`; stop the foreign server manually.

## CI

`.github/workflows/pr.yml` (`validate` job, exact PR head) runs
`npm ci`, `npm run lint`, `npm test -- --run`, `npm run build`, installs
Chromium with system dependencies, then `npx playwright test`. The prior
`npm run build` is the single build: `webServer` skips its local auto-build
when `CI` is set. Browser failure fails the same job (no separate required
check to miss), with screenshot/trace artifacts uploaded on failure.

## Review contract

Authoritative reviews follow [docs/review-contract.md](review-contract.md):
commit/push repair before review, exact-head CI, dirty reviews advisory,
flake claims need >=3 reruns plus a server/build environment check,
read-only reviews never stash or change files, piped output keeps the true
exit code.
