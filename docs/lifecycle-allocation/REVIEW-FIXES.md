# Lifecycle Allocation — Bounded Correctness Fix Pass (PR #45)

Scope: finish inactive lifecycle engine first; defer broad refactoring/test-hardening to later PR series; never defer confirmed core accounting errors. No rewrite, no UI activation, no merge/deploy. No commit/push — coordinator verifies and publishes.

Branch: `feat/lifecycle-allocation-engine`, head `fb61d70` at start of pass.

## Bounded fix plan

1. **Terminal-state protection (`investmentTax/terminal.ts`)** — replace `closed` parking with explicit terminal phase (`terminated`) compatible with existing `transition()` validation; blocks annual `begin`, repeated liquidation, `close`/`receipt` and all other mutations via `Invalid event order`. Keeps same-horizon settlement with no extra allowance/year. Restore/strengthen regression tests (no weakened assertions).
2. **Initial anchor (`lifecycleAllocation/engine.ts` opening)** — use actual wealth only (`wealth0`), remove future contribution/withdrawal anticipation. Contributions/withdrawals stay at year-end convention. Add matching-prefill zero-opening-trades regression even with later flows; keep legitimate opposite opening/closing trades allowed when initial targets deliberately change and market moves justify them.
3. **Tax-funding coordination (`lifecycleAllocation/engine.ts` solver + `executeUnified`)** — reserve settlement cash for payable liabilities, iterate anchor on full liability (not just paid) including tax-on-funding-sales, reuse ledger math (`taxYears[].liability`, `unpaidTax`, `calculateTax` — no duplicate formulas). Fund taxes when sellable wealth permits; report true insolvency via `unpaidTax`/`shortfall`/`unfundedWithdrawal` otherwise. Maintain basis/VP rollforward, no needless churn. Add zero-target-cash, prior-unpaid, severe-drawdown, partial/full-sale regressions + conservation checks.
4. **Inflation-factor contract (`lifecycleAllocation` yearly + terminal)** — define explicit cumulative purchasing-power factor `F` contract: `nominalTarget = amountToday * F`, `real = nominal / F`, `F` finite `> 0`, deflation (`F < 1`) and non-monotonic paths allowed, no monotonicity imposed. Use consistently for yearly reserve targets and terminal deflator. Fix tests to compounding (`1.02**i`-style) over 40/50/60y, constant-real reserves with matching terminal deflator; remove linear/annual-vs-cumulative conventions. No user-facing timing settings.
5. **Unconfirmed probes (bounded)** — probe 8-step exhaustion (last-plan vs retargeted-targets mismatch) and closing-draw fallback sell-then-buy same bucket. Reproduce or show safeguards; make exhaustion explicitly safe (flagged, not success-looking); record residual hypotheses in deferred backlog; no broad refactor.

Verification: focused regressions for each fix, existing lifecycle+tax suites, full `npm test -- --run`, `npm run lint`, `npm run build`, `git diff --check`. No assertion weakening. Report parallel jsdom 10s timeouts accurately; add serial/constrained-worker run to distinguish contention without changing global timeout. Save exact results/limitations below and in final output.

## Status / findings

_Each item: reproduced root cause → remedy → tests. All four confirmed fixes implemented; probes implemented; no unrelated behavior changed._

- Finding 1 (terminal `closed` parking allows fresh allowance): reproduced — see §Finding 1. Fix: `terminated` phase. Status: done.
- Finding 2 (initial anchor anticipates future flows): reproduced — see §Finding 2. Fix: actual-wealth anchor. Status: done.
- Finding 3 (buys drain tax cash; solver uses paid): reproduced — see §Finding 3. Fix: liability-based anchor + reserve. Status: done.
- Finding 4 (inflation semantics inconsistent): reproduced — see §Finding 4. Fix: cumulative `F` contract + compounding tests. Status: done.
- Unconfirmed (exhaustion / draw fallback churn): bounded probes implemented in `lifecycleAllocation.test.ts`; exhaustion made explicitly safe (executed-plan reporting + `solverExhausted` flag); residual hypotheses in deferred backlog. Status: done (bounded).

## Finding 1 — terminal protection

Root cause: `terminal.ts:33` parks in `closed`, so `beginInvestmentYear` (`['closed']`) opens a new year with fresh allowance after liquidation. Duplicate `terminal:<year>` id blocks same-year repeat only; advancing year bypasses it. `close`/`receipt` already blocked by phase, but `begin` hole permits double-counted allowance and second liquidation.

Remedy: add explicit `terminated` phase to `InvestmentState`; park terminal state there. All existing `transition()` callers reject it (`Invalid event order`), blocking begin/repeat/close/receipt/transactions/reconcile/market. Same-horizon settlement unchanged (requires `closed` input, no new `TaxYear`, no new allowance). Tests assert all blocked + idempotent repeat on continuation state still equal.

## Finding 2 — initial anchor

Root cause: `engine.ts:339-341` computes `anchor0 = wealth0 + contribution - min(need, wealth0+contribution)`, incorporating future year-end flows into opening targets. Matching prefill (cash4000/bond4000/equity8000) with withdrawal6000 yields opening sells though holdings already match.

Remedy: `anchor0 = max(0, wealth0)` only. Year-end contribution/withdrawal handled by closing solve. Matching prefill → zero opening trades even with later flows. Non-prefill opening trades still allowed; opposite opening/closing sides allowed when deliberate target change + market move justify (only avoidable same-closing-plan churn banned; closing XOR still asserted excluding opening legs).

## Finding 3 — tax-funding coordination

Root cause: `executeUnified` buys consume settlement cash before `reconcileTax`; solver iterates `anchor = W1 - S - paid` (`paid = min(cash,due)`), so drained cash → `paid≈0` → anchor ignores full liability. Example zero-cash-target, cash50/equity100u@100 basis2000 allowance0 price→200 basisRate.05: year-2 VP liability unpaid despite ample equity; targets ignore liability.

Remedy: iterate on full liability: `following = W1 - S - priorUnpaid - trialLiability` (ledger `taxYears[].liability`, no duplicate formula). Net anchor lowers targets, creating funding sells (including tax-on-funding-sales via iteration). Residual settlement cash after reaching net targets covers liability, so buys implicitly reserve. Prior unpaid subtracted for net targets; terminal deducts outstanding. Insolvency (even full sell cannot cover) leaves `unpaidTax`/`shortfall`/`unfundedWithdrawal` explicitly; no borrowing/negatives. Exhaustion flagged (see probes).

## Finding 4 — inflation contract

Root cause: yearly `inflationFactor` used as `amountToday * F` (cumulative) but tests supply linear `1+0.02*i` and constant `1.01` with `cum = product(F_i)` (annual convention). Terminal `cumulativeInflation` is cumulative. Mismatch hides compounding error.

Remedy: contract `F` cumulative purchasing-power factor: finite `>0`, `F=1` = today's power, compounding `F_n = Π(1+infl)`, deflation/non-monotonic allowed. Validate finite `>0` in `validateYearInput`/`resolveYearlyTargetsEuro`/`liquidateLifecycle` (already; keep, add deflation tests). Fix tests to `1.02**i` / `1.01**i` compounding, `cum = last F`, constant-real reserve + matching deflator over 40/50/60y; remove linear/product conventions.

## Unconfirmed probes

- Exhaustion: bounded loop executes last trialed plan but reports retargeted accepted targets → success-looking mismatch. Probe forces oscillation/large tax-on-sale to hit 8 steps; remedy makes exhaustion explicitly safe: report executed plan's targets with measured net anchor when exhausted, keep `solverExhausted=true`, ledger stays safe (no negatives/borrowing). Residual: optimal re-solve policy deferred.
- Draw fallback: `executeUnified` prefers non-pending-buy buckets, falls back to netted draw-and-buy only when nothing else funds withdrawal (adjusts pending buy down). Probe constructs withdrawal with only pending-buy wealth to trigger fallback; asserts netting (no full sell+buy churn) or flags residual. Residual: tax-aware draw ordering deferred.

## Deferred hardening backlog (not implementation authorization)

- Solver convergence/exhaustion policy and property-based conservation coverage.
- Prior-year arrears settlement: liabilities remain reserved and deducted from net targets/terminal wealth, but are not paid automatically when later cash arrives. Must be resolved or explicitly gated before live activation; gross closing wealth includes the reserved cash.
- Parallel jsdom contention and test reliability; do not hide failures by weakening assertions.
- Structural refactoring behind regression tests.

Lifecycle UI, persistence and insurance integration remain feature follow-ups, not hardening. FIFO, monthly timing, transaction costs, tolerance bands, tax-minimising sale selection and comparison dashboards are excluded product expansions, not approved backlog commitments.

## Verification log

- `npx tsc --noEmit` → exit 0, no output.
- `npx eslint` on all changed source/test files → exit 0, clean.
- `npm run lint` (full `eslint .`) → no findings (empty output apart from npm header).
- `npm run build` (`tsc -b && vite build`) → success, `✓ built in 3.11s`.
- `git diff --check` → exit 0, no whitespace errors.
- Focused: `npx vitest run investmentTax.test.ts lifecycleAllocation.test.ts lifecycleSensitivity.test.ts hermesAudit.test.ts` → 4 files, 78 tests passed.
- Prior batches in this pass (per handoff): `model.test.ts` 13, model `__tests__` 103+25+230+49, `scenarioOutcomeData` 9, `useScenarioState` 21, `insurancePersistence` 8 (10.98s), `InputPanel` 14 (8.8s) — all green.
- Full parallel `npm test -- --run` (timeout 120s): TIMED OUT (exit 124). `RentenlueckeCalculator.test.tsx`: 1 failed — `updates the derived total, allocation, and result from a bucket value`, 10804ms, exceeding the existing parallel jsdom 10s timeout. No global timeout change made.
- Serial re-run `npx vitest run RentenlueckeCalculator.test.tsx` → 7 passed (23.77s), consistent with contention in this untouched UI suite; a standalone pass alone does not prove its cause.
- No assertions weakened or removed to get green.

## Coordinator verification and independent follow-up review

- Full `npm test -- --run --maxWorkers=1`: 584 tests passed in 29 files, 100.34s. No timeout changes.
- Independently reran `npm run lint`, `npm run build` (includes `tsc -b`), and `git diff --check`: all passed.
- Fresh Codex/Spark Contributor xhigh review approved the bounded inactive-engine candidate: terminal, initial allocation, current-year tax funding and cumulative inflation fixes checked with disposable probes. Review explicitly cleared suspected current-liability double counting because current tax liability is recalculated during reconciliation.
- Remaining limitation: prior-year arrears are reserved rather than paid when cash recovers; this is not a claim of complete tax settlement. Solver exhaustion remains flagged, and must not be interpreted as successful target convergence. These require attention before live activation.
