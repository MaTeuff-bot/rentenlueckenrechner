# PR2 implementation verification

Implementation card: t_6fc73216. Independent review/release owner: t_91bb87f0.
Base: 58b96fd9eb80f4e8aacd21cb4fcfb76ec6ebe38b (merged PR1 #40).
Branch: feat/insurance-estimator-integration.

## Acceptance mapping

- Automatic-first setup, actual holding classification independent of proxies, required explicit fund-only cost and coverage declarations: CapitalEstimatorSetup, PortfolioBucketSection, capitalIncome/setup.ts and schema.ts.
- Independent bridge/pension manual estimates with unchanged unsupported portfolio and otherwise automatic insurance: RetirementInsuranceSection and retirementInsurance.ts. Missing is not zero; prior explicit manual estimates retained.
- Shared yearly accounting for deterministic, search and bootstrap: capitalIncome/ledger.ts, returns.ts, simulateScenario.ts, stochasticReturns.ts and historicalReturns/bootstrapSimulation.ts.
- Fund-only pooled cost, separate gross bank interest/cost-net wealth return, proportional funding and recognized allocation sales: insuranceEstimator.ts. Assessment-only income is not spendable and total insurance is funded once.
- Constant nominal 2026 3.20% Basiszins independent of inflation, Advanced editing, zero opening VP history and planning limitations: setup UI and insurance-capital-estimator.md. No investment-tax engine or tax-release reset.
- Additive v13 persistence retains unrelated state and manual estimates: insurancePersistence.test.ts.
- Assessment reconciliation, insufficiency and incomplete numerical paths: InsuranceBreakdown and useScenarioState.

## Reproduced by Hermes on 2026-09-12

After the final Codex fixes:
- npm ci: passed; two existing moderate development dependency advisories remain.
- npm test -- --run --maxWorkers=1: 397 tests in 21 files passed (87.31 seconds).
- npm run lint: passed.
- npm run build: TypeScript and production Vite build passed.
- git diff --check: passed.
- Real Chromium script scripts/verifyInsuranceEstimatorBrowser.mjs: desktop 1440 and mobile 390 passed again after fixes. JSON and screenshots in this directory. No page errors, horizontal overflow or unrelated-storage deletion.
- Hermes reviewed ledger, return paths, setup/persistence and source-rule interaction; re-fetched official InvStG sections 18/19. Focused Codex review fixed zero-capital completeness, malformed explicit paths and zero-NAV allocation purchase diagnostics, adding regressions. Hermes then independently reran the full gates above.

## Remaining review focus and limitations

This is an annual planning approximation, not exact insurer billing or fully after-tax spending power. Historical VP is omitted at opening; required-capital search scales projected per-euro basis/adjustment history. Income surplus remains outside the portfolio as before. A portfolio with no positive starting allocation needs explicit manual capital estimation. Negative gross bank-interest paths and zero-NAV purchases are rejected rather than fabricated; a failed stochastic path blocks the combined forecast. In particular synthetic cash draws may become negative, making manual capital estimation necessary for such scenarios. Positive gross interest with negative cost-net wealth return is supported and tested.

Independent reviewer must inspect the exact published head and reproduce gates before merge, then verify deployment and live integrated behavior. This implementation card does not merge/deploy or claim final delivery.
