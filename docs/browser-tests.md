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
3. `e2e/persistence.spec.ts` — reload retains portfolio and insurance
   settings and recomputes results.
4. `e2e/capital-mode.spec.ts` — automatic/manual capital-assessment switching
   updates inputs, readiness and disclosures.
5. `e2e/bank-rejection.spec.ts` — existing unsupported negative-gross-bank-return
   rejection via real controls (bank + synthetic cash). Asserts the
   `Negative bank return` error and absent forecast; no bank success is claimed.
6. `e2e/narrow-smoke.spec.ts` — narrow-viewport smoke of journey 1 (project `narrow`).

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
npm run build
npm run test:e2e
```

This builds the app, serves `dist/` with `vite preview` on
`http://127.0.0.1:4173/rentenlueckenrechner/` (see `playwright.config.ts`
`webServer`), and runs Chromium plus the narrow smoke. Retries are `0`;
screenshots and traces are kept on failure (`test-results/`,
`playwright-report/`).

Single-file or single-project runs:

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

Local runs may reuse an already-serving static `dist/` server on port 4173
(`reuseExistingServer`); CI always starts a fresh `vite preview`.

## CI

`.github/workflows/pr.yml` (`validate` job, exact PR head) runs
`npm ci`, `npm run lint`, `npm test -- --run`, `npm run build`, installs
Chromium with system dependencies, then `npx playwright test`. Browser
failure fails the same job (no separate required check to miss), with
screenshot/trace artifacts uploaded on failure.
