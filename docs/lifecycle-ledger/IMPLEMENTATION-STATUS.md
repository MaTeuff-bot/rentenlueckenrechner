# Lifecycle Ledger — Implementation Status

Implementation of `docs/lifecycle-ledger/PLAN.md` (normative), branch
`feat/inactive-lifecycle-ledger`, base head `e408bbc`,
implementation commit `7677900` (not pushed, no PR — coordinator publishes).
`PLAN.md` itself is unmodified.

## Scope delivered (§2, §12 steps 1–7)

New inactive module only: `src/features/rentenluecke/model/lifecycleLedger/`

- `types.ts` — ledger input/report/adapter types; reuses `LifecycleConfig`,
  `InvestmentState`, `ContributionResult` by import, never redefines them.
- `annualCashflow.ts` — single shared yearly close (§3 order, §6 priority);
  calls the `investmentTax` / `lifecycleAllocation` barrels plus
  `contributionEngine`; owns no tax/allowance/VP/contribution formulas.
- `arrears.ts` — `settleArrears` on `taxYears[]` snapshots (§4); payment only
  increments `paid` capped at `liability`; ids
  `lifecycle:<year>:arrears:<taxYear>`.
- `insuranceAssessment.ts` — per-bucket `contributionIncome` → monthly
  capital mapping, €51 × F expense once per person, KVdR exclusion
  (`capitalAssessmentMonthly` omitted), manual pass-through (§5).
- `terminalInsurance.ts` — incremental with-minus-without terminal KV/PV
  wrapper (§7); KVdR legs are identical by construction (no new charge).
- `adapters.ts` — deterministic / bootstrap / required-capital-search
  adapters on the common yearly close (§8.1) with fixed-reserve,
  nonmonotone-`F` and zero-start `unsupported` gates.
- `index.ts` — barrel re-exports only.
- Tests: `lifecycleLedger.test.ts` (24),
  `lifecycleLedger.conservation.test.ts` (11),
  `lifecycleLedger.adapters.test.ts` (21).

No live-path changes, no UI/persistence, no FIFO, no new user settings.
No live code imports the new module.

## Gate results (exact commands, final state)

- New suites:
  `vitest run src/features/rentenluecke/model/lifecycleLedger` —
  3 files, 56 tests, all pass.
- Existing gates (unedited):
  `vitest run src/features/rentenluecke/model/investmentTax src/features/rentenluecke/model/lifecycleAllocation` —
  4 files, 78 tests, all pass (covers `investmentTax`,
  `lifecycleAllocation`, `lifecycleSensitivity`, `hermesAudit`).
  `vitest run src/features/rentenluecke/model/__tests__` —
  15 files, 407 tests, all pass (covers insurance, model, required-capital,
  stochastic, bootstrap suites).
- Full: `vitest run` (= `npm test -- --run`, default parallel, maxWorkers 2) —
  32 files, 640 tests, all pass, exit 0. Run twice on the final tree, both
  green. No serial/constrained rerun was needed: no jsdom/timeout contention
  occurred (node environment, no 10s timeout hits). No assertions weakened,
  no snapshots re-baselined, no global timeouts changed.
- `eslint .` (= `npm run lint`) — exit 0.
- `tsc -b --force` — exit 0. `vite build` — exit 0
  (`npm run build` equivalent, run as its two steps).
- `git diff --check` — clean.

## Limitations and deviations

1. Allocation-execution wiring (§3 step 5, §5 step 2): the
   `lifecycleAllocation` barrel does not export its internal unified-execution
   / rebalance-plan helpers, and the import-lint rule (§2) forbids deep
   imports, so `annualCashflow.ts` contains a local execution mirror with the
   same documented semantics (draw preference for non-pending-buy buckets,
   netted draw-and-buy last resort, `DUST_EUR = 0.01` leg cutoff,
   priority-ordered legs). No financial formula is duplicated: targets come
   from `resolveYearlyTargetsEuro`, all tax/VP/allowance math from the
   `investmentTax` barrel, all contribution math from `calculateContributions`.
2. `RequiredCapitalCalculationError` (§8.2) is defined locally in `types.ts`
   with the same name/message contract because `../requiredCapital` is
   outside the allowed import surface; behavior (bounding failure throws,
   100 bounding + 200 binary iterations, €1 epsilon, €1e12 cap) is preserved.
3. Insolvency cash order (§6): the withdrawal is funded during unified
   execution while tax/arrears/insurance settle from the residual. When the
   anchor floors at or below zero, withdrawal funding is additionally capped
   at settlement-cash-minus-measured-reserve so dated claims keep priority;
   in solvent converged years the cap never binds (proven by the conservation
   tests). Pure tax-arrears insolvency (dated tax exceeding total wealth) is
   unreachable through legitimate flows at a ~26% marginal rate and is
   covered by market-crash partial-payment tests instead.
4. Search proof hooks (§8.1): fixed-reserve, nonmonotone-`F` and zero-start
   searches return `unsupported` by default; caller-asserted
   `allowFixedReserve` / `allowNonmonotoneF` / `allowZeroStart` options admit
   bounded proof fixtures (each exercised by a named test).
5. The insurance funding callback (§8.2) is an exact, side-effect-free
   per-trial evaluation; the bounded fixed-point iteration (8 × €0.005) lives
   in the yearly close, mirroring the lifecycle solver. Nonconvergence throws
   `LedgerInsuranceError` before anything commits, so no next state exists.

## Review fix round 1 (independent-review findings on `a3cb8d5`)

Fix commit `ce80b09` (not pushed, no PR — coordinator publishes).
`PLAN.md` normative contracts intact and unmodified: no live-path changes,
no UI/persistence, no new user settings, engines reused, no assertion
weakening.

### Blocking finding 1 — bootstrap conflated depletion with nonconvergence

`adapters.ts` depletion condition contained `|| exhausted`, so
solver-exhausted paths reported `depleted` and never engaged
`failureCount`/`summaryBlocked` (PLAN §8.2,
bootstrap-failed-path-blocks-summary). Fix: `exhausted` now returns
`{status:"failed", kind:"nonconvergence", ...}` first; the depletion branch
requires only unfunded/stranded/insuranceGap above dust. Depletion and
nonconvergence stay distinct statuses.

### Blocking finding 2 — insurance gap collapsed to zero on depletion

The `depleted` variant carried no insurance amounts. Fix: `types.ts`
extends it with `unfundedInsuranceKv`/`unfundedInsurancePv` (summed over
reports), populated in `adapters.ts`, so `insuranceGap` stays visible and
never collapses to zero. Asserted in tests.

### Coordinator ruling — `survives()` includes terminal-settlement semantics

Implements PLAN §8.1: `ledgerSurvives` now, after `liquidateLifecycle` on
the trial clone (and the outstanding-liability check), computes
`assessTerminalInsurance` for the horizon year and fails the candidate
(returns false) when the incremental terminal insurance cannot be covered
by the terminal proceeds/cash within dust tolerance. Regression test uses a
mocked `assessTerminalInsurance` because a natural
incremental-greater-than-nominal outcome is unreachable (rates < 100%,
ceiling/minimum bound it) — the mock verifies the wiring, i.e. a candidate
that survives withdrawals but cannot cover terminal insurance fails.

### Accepted non-blocking fail-closed fixes

(a) `adapters.ts` `ledgerSurvives` catch rethrows non-`LedgerInsuranceError`
input/validation errors instead of the catch-all `return false`, which had
surfaced as a misleading `RequiredCapitalCalculationError`; genuine
candidate failures (`LedgerInsuranceError`) still return false.
(b) `annualCashflow.ts` validates `insurance.calendarYear === year` and
throws fail-closed `LedgerInsuranceError` on mismatch.
(c) `terminalInsurance.ts` gates `ceilingBinding` off for manual specs
(`spec.manual ? false : ...`) — comparing a pension-only base against a
fixed manual burden is meaningless.

### Regression tests (ledger suites 56 → 62, helpers not weakened)

- Solver-exhausted-but-funded bootstrap path → `failed`/`nonconvergence` +
  blocked summary.
- Insurance-driven depletion payload keeps summed KV/PV amounts visible
  (never zero).
- Terminal-insurance-unfunded search candidate fails `survives()`.
- `ledgerSurvives` rethrows input errors vs returning false for candidates;
  manual spec `ceilingBinding` is false.
- `insurance.calendarYear` mismatch throws `LedgerInsuranceError`.
- Test-helper consistency fix (not weakening): `yi`/`yearInput` derive
  `finalYear`/`finalAge` from the patch so the default insurance spec year
  matches an overridden ledger year under the new (b) validation.

### Gate results (exact commands, final tree at `ce80b09`)

- `npx vitest run
  src/features/rentenluecke/model/lifecycleLedger/lifecycleLedger.adapters.test.ts` —
  26 passed.
- `npx vitest run
  src/features/rentenluecke/model/lifecycleLedger/lifecycleLedger.test.ts` —
  25 passed.
- `npx vitest run
  src/features/rentenluecke/model/lifecycleLedger/lifecycleLedger.conservation.test.ts` —
  11 passed.
- `npx vitest run src/features/rentenluecke/model/investmentTax` —
  1 file, 24 passed.
- `npx vitest run
  src/features/rentenluecke/model/lifecycleAllocation/lifecycleAllocation.test.ts` —
  42 passed; `.../lifecycleSensitivity.test.ts` — 10 passed;
  `.../hermesAudit.test.ts` — 2 passed (allocation block 54 + tax 24 = 78).
- Full `npm test -- --run` — 32 files, 646 tests, all pass, exit 0
  (prior 640 + 6 new ledger regression tests).
- `npm run lint` (`eslint .`) — exit 0.
- `npm run build` (`tsc -b && vite build`) — exit 0.
- `git diff --check` — clean.
