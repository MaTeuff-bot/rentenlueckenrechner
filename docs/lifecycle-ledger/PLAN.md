# Shared Annual Cashflow Tax / KV-PV Ledger — Bounded Integration Plan (inactive)

Status: PLAN ONLY. No implementation, no source edits, no UI/persistence wiring,
no commits, no publication. This document is the only output of this task.
Coordinator approval required before any implementation PR.

Authoritative scope (read, not duplicated here):

- `/workspace/repos/personal-agent-persistance/Plans/Active/rentenlueckenrechner-next-pr-sequence.md`
  — next-PR definition: one annual ledger reconciling spending, lifecycle
  allocation, taxes and insurance before any UI release; reuse `investmentTax`,
  `lifecycleAllocation` and verified insurance rules; no duplicate engine.
- `Research/Rentenlueckenrechner/lifecycle-research-conclusions.md` — common
  per-bucket ledger, average-cost planning approximation, same-horizon
  liquidation, incremental terminal insurance, zero-start/future-holding and
  absolute-reserve search limits.
- `Research/Rentenlueckenrechner/lifecycle-tax-research.md` — annual nominal
  ledger, per-bucket classification/exemption, VP receipt year, gross-VP sale
  deduction, FIFO-vs-average-cost disclosure, no extra-January convention.
- `Research/Rentenlueckenrechner/lifecycle-insurance-research.md` — voluntary
  vs KVdR assessment sources, €51 expense rule, loss corresponding application,
  gain-only sale assessment, incremental terminal reserve, pooling warning,
  opening-state warning.
- `Architecture/Rentenlueckenrechner-Design.md` — yearly ledger is the model;
  summaries/charts/tables derive from the same rows; net spending semantics.

Repository grounding (head `e408bbc`, PR #45 merged as `5f6af01`):

- `src/features/rentenluecke/model/investmentTax/` — `index.ts` barrel is the
  only allowed import surface: `createInvestmentState`, `beginInvestmentYear`,
  `applyTransaction`, `applyAnnualPricesAndInterest`, `reconcileTax`,
  `closeWithPendingVP`, `calculateTax`, `unpaidTax`, `bucketValue`,
  `totalValue`, `valueHypotheticalLiquidation`, `calculateVorabpauschale`,
  `receivePendingVP`. Phases `closed → opening → closing → closed` plus
  `terminated`; consecutive years; exact price/rate coverage; settlement-cash
  funding (`min(cash, due)`, remainder stays `unpaidTax`); average-cost sale
  release of `basis`/`assessedVP`; 30% equity / 0% bond exemption; per-year
  allowance is an input. See `docs/investment-tax-foundation.md`.
- `src/features/rentenluecke/model/lifecycleAllocation/` — `engine.ts`
  (`createLifecycleState`, `simulateLifecycleYear`, `simulateLifecycle`),
  `targets.ts` (`resolveYearlyTargetsEuro`, cumulative-`F` contract),
  `rebalance.ts` (`DUST_EUR = 0.01`), `terminal.ts` (`liquidateLifecycle`
  wrapper, `beforeHoldingCutoff` default), `prefill.ts` (throws at zero
  wealth). Solver: `MAX_SOLVER_ITERATIONS = 8`,
  `SOLVER_TOLERANCE_EUR = 0.005`, liability-based anchor
  (`taxYears[].liability` + `unpaidTax`), `solverExhausted` executed-plan
  reporting. See `docs/lifecycle-allocation/PLAN.md` (historical where
  `docs/lifecycle-allocation/REVIEW-FIXES.md` supersedes) and
  `docs/lifecycle-allocation/REVIEW-FIXES.md` Findings 1–4 + bounded probes.
  Known gap carried into this plan: prior-year arrears are *reserved* in the
  anchor, not *paid* when cash recovers (`REVIEW-FIXES.md` remaining
  limitation).
- Insurance: `src/features/rentenluecke/model/contributions/contributionEngine.ts`
  (`calculateContributions`, shared-ceiling `add()` ordering, manual vs
  automatic, `ownKvMonthly`/`ownPvMonthly`, `availableIncomeMonthly`),
  `src/features/rentenluecke/model/retirementInsurance.ts`
  (`calculateRetirementInsuranceForYear`, `insurancePhaseRanges`,
  `phaseManualReasons`, `phaseStreams`, work-end/pension-start phases, bridge
  vs pension, KVdR/voluntary/unknown, manual replacements),
  `src/features/rentenluecke/model/insuranceCoverage.ts`,
  `src/features/rentenluecke/model/capitalIncome/insuranceEstimator.ts`
  (pooled-fund/manual-fallback shipped MVP, `assessCapitalIncome`,
  `withdrawProportionally`, funding callback, `closingState: null` on
  nonconvergence), `src/features/rentenluecke/model/retirementIncomeStreams.ts`.
  Rules: `docs/gkv-pv-rules-2026.md`, `docs/insurance-capital-estimator.md`.
- Existing adapters to reuse, not fork:
  `src/features/rentenluecke/model/simulateScenario.ts`,
  `src/features/rentenluecke/model/simulateAccumulation.ts`
  (`createInflationFactorResolver`, return-on-opening then end-year
  contribution), `src/features/rentenluecke/model/simulateRetirement.ts`
  (`fundRetirementYear`, `MONEY_EPSILON = 1e-7`),
  `src/features/rentenluecke/model/requiredCapital.ts`
  (`REQUIRED_CAPITAL_EPSILON = 1`, `MAX_REQUIRED_CAPITAL`, bounding + binary
  search, `RequiredCapitalCalculationError`, ledger-reuse convention),
  `src/features/rentenluecke/model/stochasticReturns.ts`
  (`simulateScenarioWithReturnPath`, `runStochasticSimulation`),
  `src/features/rentenluecke/model/historicalReturns/bootstrapSimulation.ts`
  (full-path `BucketReturnPath`, reference path, per-path ledger),
  `src/features/rentenluecke/model/capitalIncome/ledger.ts`
  (`simulateCapitalLedger`, fixed-weight precedent to replace with
  age-specific targets), `src/features/rentenluecke/charting/scenarioOutcomeData.ts`.
- AGENTS.md: yearly ledger rows are the source of truth; model stays
  framework-free; React/local-storage/Recharts are outer layers; mortality
  data is generated into
  `src/features/rentenluecke/mortality/destatisGermanyPeriodLifeTable2023_2025.ts`.

---

## 1. Goal and bounded scope

Goal: reconcile spending, lifecycle allocation, investment tax and KV/PV in ONE
shared annual ledger, inactive, reusing existing engines, before exposing new
controls in the following UI PR (per next-PR-sequence doc).

In scope (this integration PR only):

1. Dated arrears recovery: settle carried `unpaidTax` when later cash/assets
   permit, against dated liabilities, without recalculating old allowances or
   double-charging terminal wealth. Report current-year vs prior-year payments
   and remaining liabilities separately. Deterministic payment priority and
   true-insolvency handling; explicit shortfalls preserved.
2. Coordinated spending / allocation / funding-sale tax / KV-PV funding in the
   annual close. Tax and insurance assessment stay separate ledgers;
   assessment income never becomes spendable cash. Never charge the shipped
   pooled estimator *and* the new per-bucket assessment on the same income.
3. Phase/assumption retention: work-end/pension-start phases, bridge coverage,
   KVdR/voluntary/unknown, floors/ceilings, manual phase replacements.
   Bond-fund and terminal-insurance handling verified against persisted
   research + official rules. Terminal insurance is incremental under disclosed
   membership assumptions, never another full minimum bill.
4. Common adapters for deterministic, required-capital search and bootstrap
   paths on this ledger. Zero-start/future holdings supported. Fixed-euro
   reserves invalidate old scale-invariance/monotonic-search assumptions:
   verify or return `unsupported`/`nonconverged`, never a plausible answer.
5. Fail-closed convergence: never label an exhausted/nonconverged path
   complete/successful. Diagnostics and genuine unfunded spending stay visible.

Out of scope (explicit non-goals, not hardening deferrals of correctness):

- Live UI, milestone editor, per-bucket setup inputs, prefill controls,
  coverage gates, persistence/reset, result cards/charts/tables wiring.
- Any change to the live calculator path (`simulateScenario`,
  `simulateCapitalLedger` activation via `needsEstimator`, current
  accumulation/retirement engines, required-capital search, stochastic or
  bootstrap entry points). New code lives in a new inactive module; no imports
  from live paths into the new module beyond shared pure engines, and no
  imports of the new module from live paths.
- New engines: no duplicate tax formulas, no duplicate contribution rules, no
  forked allowance/loss/VP math. Reuse `calculateTax`, `taxYears[].liability`,
  `unpaidTax`, `recordIncome` semantics, `calculateContributions` and
  `calculateRetirementInsuranceForYear`.
- Product expansions from the next-PR-sequence preserved boundaries:
  FIFO lots, distributing funds, household taxation, tax-minimising trading
  strategy, monthly modelling, comparison dashboards, nominal-reserve option,
  transaction costs. Legacy §56(6) holdings stay excluded/unsupported.
- The shipped insurance MVP stays pooled-fund/manual-fallback; this plan does
  not retroactively change it. Unsupported holdings never get silent partial
  automatic coverage.

---

## 2. Proposed module shape (inactive)

New directory only, e.g.
`src/features/rentenluecke/model/lifecycleLedger/` (exact name at
implementation time; no live imports):

| File | Contents |
| --- | --- |
| `types.ts` | Ledger input/report/adapter types only; reuses `LifecycleConfig`, `InvestmentState`, `ContributionResult` types, never redefines them. |
| `annualCashflow.ts` | Single shared yearly close: arrears settlement + spending/allocation/tax/insurance funding sequence. Calls `lifecycleAllocation` + `investmentTax` + `contributionEngine` in one order; owns no formulas. |
| `arrears.ts` | Dated-liability payment helper operating on `taxYears[]` snapshots; no allowance/loss recomputation. |
| `insuranceAssessment.ts` | Per-bucket `contributionIncome` → monthly capital assessment mapping + `calculateContributions` call adapter; KVdR exclusion; manual-replacement pass-through. |
| `terminalInsurance.ts` | Incremental same-horizon terminal KV/PV wrapper (with/without-liquidation comparison). |
| `adapters.ts` | Deterministic / required-capital-search / bootstrap adapters on the common yearly close. |
| `index.ts` | Barrel re-exports only. |
| `lifecycleLedger.test.ts`, `lifecycleLedger.conservation.test.ts`, `lifecycleLedger.adapters.test.ts` | Only new tests (see §8). |

Dependency rule (enforced by an import-lint test mirroring the lifecycle
module's rule): the new module may import only from `../investmentTax`
(barrel), `../lifecycleAllocation` (barrel), `../contributions/*`,
`../retirementInsurance`, `../retirementIncomeStreams`, `../../mortality`
(types only if needed). It must not import `../simulateAccumulation`,
`../simulateScenario`, `../portfolioBuckets`, `../capitalIncome`,
`../../hooks`, `../../components`, or any UI/store path. Live code must not
import the new module.

Ledger-row principle (AGENTS.md): the new yearly report extends
`LifecycleYearReport` fields (tax paid split, arrears paid split, insurance
paid split, remaining dated liabilities, assessment trace ids) and *is* the
source of truth. Any future summary/chart/table derives from it; no parallel
business logic.

---

## 3. Shared annual close design

One deterministic order per year, reusing the lifecycle yearly skeleton
(`beginInvestmentYear → opening rebalance (first year only) → market/interest
→ contribution → unified close → reconcileTax → closeWithPendingVP`):

1. `beginInvestmentYear` (receives mandatory pending VP; throws on
   unreceived-VP trades, preserving the `investmentTax` guard).
2. First-year opening rebalance only, on actual wealth (`wealth0`, per
   REVIEW-FIXES Finding 2). No anticipation of year-end flows.
3. `applyAnnualPricesAndInterest` with exact fund/deposit coverage, including
   zero-balance future holdings (their prices/rates still required).
4. Year-end external contribution credited to `taxCashId` (existing
   year-end convention; no extra full-year return on contributions).
5. Unified funding solve: allocation-aware sales fund, in one coupled step,
   (a) `withdrawalNeed` (gap spending), (b) current-year tax liability in full
   (`taxYears[].liability`, i.e. including tax-on-funding-sales, not just
   `paid`), (c) prior unpaid carried balances (reserved in anchor; paid per
   §4 priority when settlement cash exists), (d) current-year own KV/PV cash
   burden from the insurance callback. Iterate the anchor on the full measured
   liability exactly as the lifecycle solver does today
   (`MAX_SOLVER_ITERATIONS = 8`, `SOLVER_TOLERANCE_EUR = 0.005`); trial states
   are clones, never committed. Reuse ledger math only.
6. Assessment/execution separation: funding-sale gains feed *both* the tax
   ledger (`taxIncome` via `applyTransaction` sale records) *and* the
   insurance assessment input (signed `contributionIncome` copies mapped to a
   monthly capital assessment). Neither ledger writes into the other; the cash
   step deducts the resulting euro burdens once each (see §5 for the
   no-double-charge rule).
7. `reconcileTax` on the executed state (same-year refund-before-close
   preserved: `closeWithPendingVP` throws if `paid > liability`).
8. Arrears settlement (§4) against dated `taxYears[]` balances from settlement
   cash, with deterministic priority, recording per-year payments.
9. Insurance cash settlement from settlement cash per §5 priority; any
   unfunded remainder stays an explicit shortfall, never a silent carry.
10. `closeWithPendingVP(firstPrices, basisRate)`; report `taxPaid`,
    `arrearsPaidByYear`, `insurancePaid`, `unpaidTax`, dated remaining
    liabilities, `solverExhausted`, `shortfall`, `unfundedWithdrawal`.

Conservation invariant for every year (tested, §8.1):

```text
closingValue = openingValue + externalCash + priceIncome + interest
               − taxCash − insuranceCash − netWithdrawal
```

plus basis rollforward (purchases add, sales release sold-share basis),
assessed-VP rollforward (gross assessed amounts retained, sale deduction only
via ledger `applyTransaction` records), pending-VP and loss-balance
rollforward independent of invested capital. Rebalancing transfers are
internal, never income. `contributionIncome` records are signed assessment
copies, never cash.

---

## 4. Dated arrears recovery

Problem today: `reconcileTax` pays `min(cash, due)` for the *current* year
only; `unpaidTax(state)` carries the rest forward; the lifecycle anchor
*reserves* for prior unpaid but never *pays* it when cash recovers
(REVIEW-FIXES remaining limitation). Terminal valuation then deducts it via
`outstandingLiability`, which is correct only if later payment was genuinely
impossible.

Design (all inside the inactive module; no `investmentTax` behavior change):

- Treat `state.taxYears[]` as dated liabilities: `{ year, liability, paid }`.
  Outstanding per year = `max(0, liability − paid)`. Never recompute
  `calculateTax` for a closed year; never touch its `allowance`,
  `openingLoss`, `allowanceUsed` or `loss` fields. Payment only increments
  `paid` (capped at `liability`) and moves settlement cash.
- New `settleArrears(state, cashId, payments)` helper: takes the executed
  closing state *after* `reconcileTax`, pays dated balances from settlement
  cash in deterministic priority order (§6), one euro-movement per year paid,
  each with a unique non-reserved event id (`lifecycle:<year>:arrears:<taxYear>`
  — never `begin:`/`receipt:`/`market:`/`close:`/`vp:`/`interest:`/
  `annual-tax:`/`terminal:` prefixes). Fails closed on oversale/unfunded
  conditions (no borrowing, no negative cash).
- Reporting: `taxPaidCurrentYear` (= `taxYears[current].paid` delta this
  year), `arrearsPaidByYear: Record<taxYear, euros>`, `remainingLiabilities:
  Record<taxYear, euros>`, and aggregate `unpaidTax` (reuse existing
  observer). Current-year and prior-year payments are never merged in reports.
- Insolvency: if settlement cash plus sellable wealth cannot cover dated
  balances, pay what priority order allows, leave the rest in
  `remainingLiabilities`, surface via `unpaidTax`/`shortfall`, and mark the
  year accordingly. Terminal settlement deducts exactly the still-outstanding
  amount once (existing `valueHypotheticalLiquidation` behavior); already-paid
  arrears are never re-deducted.
- Phase boundaries: arrears survive milestone/transition changes, role
  changes and work-end/pension-start boundaries; changing targets never resets
  `taxYears[]`, basis, assessed VP, pending VP or loss balances (engine-recon
  contract §2).

Tests: arrears recovery with later contributions; recovery with taxable sales
funding taxes; partial recovery (oldest-first visible); no-recovery
insolvency; zero-cash-target year with arrears; arrears across a phase
boundary and across a manual-override year; same-horizon terminal with paid
vs unpaid arrears (paid amount not re-deducted). See §8.2.

---

## 5. Funding-sale-coupled spending, tax and KV/PV

Constraints from research (do not redesign):

- Voluntary GKV + social PV: bank interest, accumulating equity-fund VP/sale
  gains (30% exemption after gross-VP deduction) and accumulating
  bond-fund VP/sale gains (0% exemption) are assessable; sale assessment is
  gain-only, not proceeds; reinvesting does not erase the sale; €51/year
  expense allowance (or higher proven expenses), once per person across
  capital income, not per bucket; tax withheld does not reduce assessment;
  losses correspond via §20(6) (no negative contributions, no cross-category
  offset). KVdR: ordinary private capital income is outside assessment —
  funding sales still create *tax* but no *new KV/PV*.
- Assessment income never becomes spendable cash. Bank principal (including
  previously credited interest) is not re-assessed on withdrawal. Internal
  coupons of accumulating funds are not extra personal interest. Opposite
  fund returns never cancel each other's gain caps (per-bucket VP caps).
- Never charge the shipped pooled estimator and the new per-bucket ledger on
  the same income. The pooled estimator stays live-only; the new ledger uses
  only per-bucket `contributionIncome` + `calculateContributions`. An
  invariant test asserts a year routes to exactly one of the two (by
  construction: the new module never imports `capitalIncome/*`).
- `contributionEngine.calculateContributions` input contract: monthly EUR,
  unrounded projection; `cashflowBeforeInsuranceMonthly` already includes all
  cash sources minus other deductions but NO KV/PV; `capitalAssessmentMonthly`
  is the pre-tax contribution-relevant amount after allowable expenses, NOT
  net cash; pensions first in shared ceiling, then rental+capital grouped at
  reduced rate, then minimum top-up; unknown status uses conservative
  voluntary assumption (disclosed, not a legal upper bound).

Coupled funding sequence (one solve, two ledgers, two cash deductions):

1. Compute the spending need for the year (gap spending after pensions/other
   income, per `retirementIncomeStreams` + `retirementInsurance` phase rules).
2. Execute allocation-aware funding sales (lifecycle `executeUnified`
   semantics: sells by euro plan, withdrawal draw preferring non-pending-buy
   buckets, buys from residual cash; sales release proportional basis + gross
   assessed VP and recognize gains via the tax ledger).
3. Derive the insurance callback input from the *executed* funding sales:
   map the year's signed per-bucket `contributionIncome` (sale + interest +
   received VP, after partial exemption, before allowance/loss) to
   `capitalAssessmentMonthly` (annual ÷ 12), plus rental/pension inputs from
   the scenario streams. KVdR years pass `capitalAssessmentMonthly:
   undefined` (no capital input needed) while tax still settles.
4. Call `calculateContributions` once per year with indexed 2026 thresholds
   (`indexedContributionThresholds(inflation)`), the year's `status`
   (kvdr/voluntary/unknown→effective), family/child inputs, and manual
   replacements where `phaseManualReasons` is non-empty (whole-phase manual:
   `kvMonthlyToday`/`pvMonthlyToday` indexed, no automatic assessment for
   that phase — phase-scope rule: a later unsupported receipt makes the whole
   phase manual).
5. Cash-settle `ownKvMonthly*12 + ownPvMonthly*12` from settlement cash per
   priority (§6). The funding solve iterates on this burden together with the
   full tax liability, so funding sales cover their own coupled tax+insurance
   (fixed-point, bounded iterations, fail-closed on exhaustion).

Manual overrides: manual phases bypass automatic assessment entirely for that
phase; the ledger still funds the manual euro burden in the same coupled
solve. Tests cover manual bridge + automatic pension, automatic bridge +
manual pension, all-manual, and a mid-phase unsupported receipt flipping the
whole phase to manual.

---

## 6. Deterministic payment priority (normative for this PR)

When settlement cash is insufficient to pay everything, pay in this exact
order; record every partial payment; never borrow; never reorder by size:

1. Current-year tax liability (`taxYears[current].liability − paid`), up to
   available settlement cash. Rationale: same-year refund-before-close is a
   hard `investmentTax` constraint (`closeWithPendingVP` throws if
   `paid > liability`; refunds must reconcile before closing). Paying current
   year first preserves the close.
2. Dated tax arrears, oldest tax year first (FIFO), in full per year where
   possible; partial payment of the oldest outstanding year before touching
   newer arrears. Rationale: matches loss/allowance vintage semantics (older
   vintages never recomputed) and keeps `remainingLiabilities` interpretable;
   any other order (e.g. newest-first) would be equally deterministic but is
   rejected here for auditability — oldest-first is the documented default.
3. Current-year own KV (`ownKvMonthly*12`), then current-year own PV
   (`ownPvMonthly*12`). Rationale: KV/PV are same-year cash burdens with no
   cross-year vintage ledger in `contributionEngine`; arrears are prior legal
   liabilities and rank ahead of current consumption-like burdens in this
   planning model. KV before PV follows the engine's assessment-line order
   (pensions at general rate first, then grouped other-income at reduced
   rate); the order is documented, not a legal seniority claim.
4. Gap spending (net withdrawal to the household). Spending is last: taxes and
   insurance already assessed on executed funding sales must settle before
   residual cash is treated as spendable. Any spending that cannot be funded
   after 1–3 is `unfundedWithdrawal` (explicit, never negative cash).

Within allocation sales, the existing lifecycle draw preference is retained:
prefer drawing from buckets *without* a pending buy leg (avoid
sell-then-buy churn on the same bucket); netted draw-and-buy only as a last
resort. Reserve priority never creates assets: fixed reserves fill by bucket
`priority` up to available anchor; any unfilled claim is `shortfall`.

True insolvency (wealth + contribution cannot cover 1–3 even after full
sell-down to settlement cash): pay per priority as far as cash goes, leave
`remainingLiabilities` + `unfundedWithdrawal` explicit, keep
`solverExhausted`/diagnostics per §7. Terminal settlement deducts only the
remaining outstanding amount.

This priority is a technical default of the inactive model, documented here
and asserted in tests. Changing it later is a product decision with full
regression re-baselining, not a patch.

---

## 7. Terminal settlement: same-horizon + incremental insurance

Tax terminal (reuse, do not reimplement):

- `liquidateLifecycle(state, taxCashId, cumulativeInflation)` →
  `valueHypotheticalLiquidation(state, cashId, F_last, 'beforeHoldingCutoff')`
  is the default same-horizon convention (technical default, not a
  user-facing setting). No extra allowance/year/market return/interest/loss
  refund from closed years. Both cutoff branches stay tested in
  `investmentTax`; the ledger default is `beforeHoldingCutoff` with an
  explicit `afterHoldingCutoff` sensitivity case (same-horizon valuation
  approximation with retained receipt-year metadata, not literal legal
  receipt-year assessment). Repeated valuation on the continuation state is
  idempotent; the returned diagnostic state parks in `terminated` and rejects
  all further mutations (`Invalid event order`).
- `cumulativeInflation` is the cumulative purchasing-power factor `F` at the
  horizon (finite `> 0`; must equal the last yearly `inflationFactor` for
  constant-real comparisons; deflation `F < 1` allowed). Terminal
  `real = nominal / F_last`. Annual-vs-cumulative confusion is a bug.

Insurance terminal (new wrapper `terminalInsurance.ts`, incremental only):

- KVdR at horizon: ordinary private liquidation gains create NO new
  capital-income KV/PV charge. Earlier voluntary-period unpaid liabilities are
  not erased; they remain dated arrears (§4), not new terminal charges.
- Continuing voluntary at horizon: reserve the *incremental* justified
  capital-income KV/PV only — conceptually
  `insurance(total income incl. liquidation assessment) − insurance(total
  income excl. liquidation assessment)` under disclosed ongoing-membership /
  annual-assessment assumptions, taking other assessed income, the
  minimum/ceiling (`indexedContributionThresholds`) and the allocation period
  into account. Never multiply all unrealised gains by an uncapped combined
  rate; never charge a second year's minimum merely because a sale is valued.
  Do not drop payable liabilities because payment lies past the chart horizon.
- Death / switch-to-KVdR / continuing-membership are NOT equivalent terminal
  events. The wrapper labels its ongoing-membership assumption; boundary
  scenarios (death, switch) are shown as separate sensitivities pending
  insurer confirmation, per insurance research.
- Bond-fund terminal gains use 0% exemption; equity-fund gains use 30% after
  gross-VP deduction; bank principal is not re-assessed. Unused terminal
  losses are not a receivable/refund. Calculation runs on a copy; the
  continuation path is never silently sold.

Tests: KVdR terminal with large gains → zero new KV/PV; voluntary terminal →
incremental equals with-minus-without difference (capped, minimum-aware);
minimum already satisfied → no second minimum; ceiling binding → capped
increment; bond vs equity exemption respected; idempotent repeat; terminated
state rejects further begins/liquidations. See §8.2.

---

## 8. Adapters: deterministic / search / bootstrap (common ledger)

All three adapters call the same `annualCashflow` yearly close. No mode gets a
private formula.

### 8.1 Common adapter contract

- Deterministic: yearly `fundPrices` from expected-return compounding,
  `depositRates` from scenario rates, `inflationFactor` from
  `createInflationFactorResolver` cumulative compounding
  (`F_n = Prod(1 + infl)`; fixed-rate case `F_n = (1 + r)^n`). Per-bucket
  prices required every year, including zero-balance future holdings.
- Bootstrap: per-bucket `BucketReturnPath` (one entry per bucket per year,
  ids exactly matching opening buckets, no fallback to expected returns),
  inflation path from the sampled history. Missing years/buckets throw
  (fail-closed); zero-NAV (−100%) fund purchases rejected explicitly as
  zero-price purchases (no disposal/loss fiction). Both the sampled path and
  the reference (expected-return) path run the same ledger.
- Required-capital search: same retirement ledger inside the `survives()`
  predicate (which must now include arrears/insurance/terminal-settlement
  semantics, not just gap withdrawals). Hypothetical starting portfolios
  scale projected per-euro acquisition cost, assessed/pending VP and simulated
  loss history (explicit search assumption, not a mutation of the actual
  portfolio); zero projected assets → hypothetical new funds acquired at cost
  with no prior adjustments. Bracket `€1` (`REQUIRED_CAPITAL_EPSILON`),
  upper bound `MAX_REQUIRED_CAPITAL`, bounding + binary phases preserved.
- Fixed real reserves break the old search: scale-invariance and monotonicity
  (`more starting capital ⇒ survives`) are NOT inherited. A fixed reserve
  (e.g. €X today → €X·F nominal) is an absolute floor that can make survival
  nonmonotone in starting capital across the joint tax/insurance solve
  (funding-sale gains change liability; reserve priority truncates percent
  targets). Therefore:
  - The search adapter first checks the reserve condition: if any milestone
    in the horizon uses `fixedReserve` with `amountToday > 0`, the adapter
    must either (a) prove monotonicity for the concrete config in tests, or
    (b) return `unsupported`/`nonconverged` with diagnostics instead of a
    capital number. Default is (b) unless a bounded proof fixture exists.
  - Nonmonotone `F` paths (deflation, sawtooth inflation) are allowed for
    deterministic/bootstrap ledgers but force search to `unsupported` unless
    the concrete `F` path is proven monotone-safe in the test.
  - Any `solverExhausted`, unfunded, or arrears-insolvent year inside
    `survives()` makes that candidate fail (not pass); a fully exhausted
    bracket makes the search `nonconverged`, never a capital number.
- Zero wealth / future holdings: `prefillTargetsFromHoldings` throws at zero
  total wealth by design — adapters must supply explicit milestone targets
  for zero-start scenarios (no division by opening wealth). Future holdings
  starting at zero receive full return paths from year 0 and standard
  cost-on-purchase treatment. Deterministic, search and bootstrap each get an
  explicit zero-start/future-holding fixture.

### 8.2 Convergence: explicit fail-closed policy (normative)

- Yearly solve: at most `MAX_SOLVER_ITERATIONS = 8` liability-anchored
  iterations at `SOLVER_TOLERANCE_EUR = 0.005`. On exhaustion: report the
  EXECUTED plan's targets (not a success-looking retarget),
  `solverExhausted: true`, measured anchor, iterations, and the residual
  mismatch. Never relabel as converged.
- Insurance funding callback (inside `calculateContributions`-coupled solve):
  same pattern as the shipped estimator — bounded interpolation with periodic
  bisection, absolute-EUR tolerance, capped iterations; `nonconverged` yields
  no committable next state (`closingState: null` equivalent), signed
  residual and diagnostics. Callers never carry trial state forward; each
  trial starts from the same immutable opening balances.
- Required-capital search: `RequiredCapitalCalculationError` on bounding
  failure preserved; binary phase capped at `MAX_BINARY_SEARCH_ITERATIONS =
  200`; any nonconverged/unfunded/unsupported year fails the candidate;
  unprovable fixed-reserve configs return `unsupported`, not a number.
- Bootstrap: a failed path blocks the combined forecast for that path set
  (no silent omission); the summary surfaces the failure count and the
  reference result still performs its complete run. Depletion vs
  nonconvergence are distinct statuses in reports.
- Display contract (for the future UI PR, stated here so adapters preserve
  the fields): nonconverged years render as incomplete calculations with
  residual/diagnostics; insufficient assets render explicit unfunded amounts
  including insurance on actual sales. No adapter may collapse these into a
  zero or a success.

---

## 9. Technical defaults (normative for this PR)

All values are model-technical defaults, not user settings. Changing any of
them later requires re-baselining the reference fixtures in §8.

| Item | Default | Source |
| --- | --- | --- |
| Annual granularity; year-end contributions/withdrawals; returns on opening balances | fixed | Design §7; `simulateAccumulation.ts`; lifecycle engine |
| Cumulative inflation factor `F`: `nominalTarget = amountToday × F`, `real = nominal / F`, finite `> 0`, `F = 1` = today; compounding; deflation/nonmonotone allowed, no monotonicity imposed | fixed | REVIEW-FIXES Finding 4; `LifecycleYearInput.inflationFactor` contract |
| Tax allowance per year | caller-supplied remainder after outside income; neither carried forward nor indexed | `investment-tax-foundation.md`; `AnnualInput.allowance` |
| Church rate | `0 \| 0.08 \| 0.09` per year, caller-supplied | `TaxYear.churchRate` |
| Basis rate | caller-supplied per year (scenario assumption; e.g. BMF 2026 notice 3.20% is a data point, not a hardcoded constant) | `AnnualInput.basisRate`; tax research |
| Fund exemption | equity 30%, bond 0%, applied after gross-VP deduction, including losses | `holdings.ts`; tax research §20 |
| Bank interest | credited once/year; principal not re-taxed/re-assessed on withdrawal | `annualLedger.ts`; tax + insurance research |
| Sale accounting | average-cost release of basis + gross assessed VP; no FIFO lots | planning approximation, disclosed |
| Opening VP/loss history | zero unless explicitly supplied; missing history disclosed, not silently exact | research opening-state warning |
| Dust / solver | `DUST_EUR = 0.01`; `MAX_SOLVER_ITERATIONS = 8`; `SOLVER_TOLERANCE_EUR = 0.005 €` | `rebalance.ts`; `engine.ts` |
| Terminal tax cutoff | `beforeHoldingCutoff` (same-horizon; no new allowance/year) | `terminal.ts`; `lifecycleAllocation/terminal.ts` |
| Terminal phase | `terminated`, rejecting all further transitions | REVIEW-FIXES Finding 1 |
| Insurance expense allowance | €51/year (× inflation) or higher proven expenses; once per person, not per bucket | insurance research §3(1b); `insuranceEstimator.ts` |
| Contribution thresholds/rates | 2026 rules snapshot, inflation-indexed monetary thresholds; percentages held fixed | `contributions/rules2026.ts`; `indexedContributionThresholds` |
| Payment priority | current-year tax → oldest arrears FIFO → current KV → current PV → spending (§6) | this plan (new) |
| Terminal insurance | incremental with-minus-without under disclosed ongoing membership; KVdR = no new charge | insurance research; §7 |
| Required-capital bracket | `€1` epsilon; `MAX_REQUIRED_CAPITAL = 1e12`; max 100 bounding + 200 binary iterations | `requiredCapital.ts` |
| Retirement funding epsilon | `MONEY_EPSILON = 1e-7` (live scalar engine; new ledger uses its own dust/solver tolerances above and must not mix them) | `simulateRetirement.ts` |

---

## 10. Test plan (new tests only; live suites untouched)

All new tests live under the new module. Existing suites
(`investmentTax.test.ts`, `lifecycleAllocation.test.ts`,
`lifecycleSensitivity.test.ts`, `hermesAudit.test.ts`, insurance and model
suites) are run gates, never edited to weaken assertions.

### 10.1 Conservation (every test asserts; failures block)

- Annual cash/basis/VP/tax/insurance conservation per §3 formula, including
  years with funding sales, contributions, arrears payments and insurance
  burdens. Rebalancing-only years move no net cash.
- No-op-target years execute no taxable sales (no churn).
- `contributionIncome` ↔ `taxIncome` consistency: signed assessment copies
  match sale/interest/VP events; assessment income never credited as cash.
- Single-assessment invariant: pooled estimator never runs in the new ledger
  (import-lint + a routing test).
- Terminal reconciliation: deferred liabilities + sale taxes settled exactly
  once; pending VP neither omitted-and-credited nor double-charged; unused
  losses are not refunded; paid arrears not re-deducted.

### 10.2 Reference and long-horizon fixtures

- Controlled reference cases (hand-computed, small horizons): equity/bond/
  deposit mix with a funding sale, one arrears year + recovery year, one
  voluntary year + one KVdR year, one manual phase, one bridge→pension
  boundary, one same-horizon terminal with incremental insurance. Each
  asserts dated payments, remaining liabilities, assessment inputs, cash
  burdens and closing holdings to the cent where deterministic.
- 40/50/60-year geometric-series checks (mirroring the `investmentTax`
  independent checks): constant-real reserves with matching terminal
  deflator (`F_last`), compounding `F` (`1.02**i`-style), no fresh terminal
  allowance or loss-refund fiction, real-value drift bounded and explained as
  timing approximation vs repeated bias. Nonmonotone-`F` (deflation dip)
  ledger case allowed; search on that path asserts `unsupported`.
- Cross-adapter consistency: deterministic vs bootstrap-with-degenerate-path
  vs search-`survives()` agree on the same price/inflation inputs for
  reserve-free configs; fixed-reserve configs assert the §8.1
  prove-or-`unsupported` behavior.

### 10.3 Matrix (each a named test, not a paragraph)

Arrears: recovery-via-contribution; recovery-via-taxable-sale (tax-on-sale
included in anchor); partial-oldest-first; insolvency-no-recovery;
zero-cash-target-with-arrears; arrears-across-phase-boundary;
arrears-with-manual-override; terminal-paid-vs-unpaid (no double deduction).
Spending/tax/insurance: voluntary-year coupled burden; KVdR-year tax-only;
unknown-status conservative-voluntary; manual-bridge/automatic-pension and
inverse; unsupported-receipt flips whole phase to manual; minimum-top-up year;
ceiling-binding year; loss-carry corresponds (no negative contribution);
€51-expense once-per-person (multi-bucket test). Terminal: KVdR-no-new-charge;
voluntary-incremental-equals-difference; no-second-minimum;
ceiling-capped-increment; bond-vs-equity exemption; idempotent-repeat;
`terminated`-rejects-begin/repeat/close/receipt. Convergence: solver-exhausted
reports executed plan + flag; insurance-callback nonconverged has no next
state; search-unfunded-fails-candidate; bootstrap-failed-path-blocks-summary
(no silent drop). Zero/future: zero-start explicit-targets run; prefill-at-zero
throws; future-holding zero-opening gains paths in deterministic + bootstrap;
zero-total-start search returns `unsupported` unless explicit-target proof
exists. Scale/monotonicity: fixed-reserve search without proof →
`unsupported`; reserve-free search converges to `€1` bracket; nonmonotone-`F`
search → `unsupported`.

---

## 11. Verification gates (exact commands recorded at implementation time)

- Focused new suites + existing lifecycle + tax + insurance + model suites.
- Full `npm test -- --run` (record serial vs constrained-worker runs
  separately; REVIEW-FIXES parallel-jsdom 10s contention note applies — do
  not change global timeouts to hide failures).
- `npm run lint`, `npm run build` (includes `tsc -b`), `git diff --check`.
- No assertion weakening; no live-snapshot re-baselining without coordinator
  sign-off; independent Codex review on the final candidate; exact-head CI
  green before merge (per next-PR-sequence acceptance).
- Browser verification is explicitly OUT for this inactive PR (no UI).

---

## 12. Work breakdown (bounded, in order; stop after each for review)

1. Types + import-lint + empty yearly-close skeleton (no logic).
2. Arrears helper + dated-reporting fields + §10.3 arrears tests.
3. Insurance-assessment adapter (per-bucket mapping, KVdR exclusion, manual
   pass-through) + coupled cash settlement per §6 priority + §10.3
   spending/tax/insurance tests.
4. Unified funding solve wiring (liability-anchored iteration incl.
   tax-on-funding-sales + insurance burden) + fail-closed exhaustion per §7.
5. Terminal-insurance wrapper + §10.3 terminal tests.
6. Deterministic adapter, then bootstrap adapter, then search adapter with
   fixed-reserve `unsupported` gate (§8.1).
7. Conservation/reference/40-50-60-year fixtures (§10.1–10.2) + full gates
   (§11) + review packet. STOP: no UI/persistence follow-ups in this PR.

Deferred (hardening series, not this PR): property/fuzz conservation,
solver-boundary widening, reproducible-execution/jsdom fixes, pure refactors
(ledger boundaries, solver decomposition, validation), broader reference
fixtures — per next-PR-sequence hardening list. Required correctness and
activation gates above stay in this feature, not in hardening.

---

## 13. Risks and explicit non-promises

- Average-cost (not FIFO) plus zero-opening-history plus annual insurance
  timing plus fixed-rate/threshold projection can permanently differ from
  broker/insurer lifetime liability through allowances, losses,
  floors/ceilings and compounding. Promise ledger conservation under disclosed
  approximations, not exact lifetime taxation or exact insurer liability
  (research-conclusions no-drift limits).
- Product classifications (Aktienfonds/Mischfonds) need product evidence; a
  return-source category is insufficient. Classification is an immutable
  per-bucket input; silent changes are out of scope.
- Administrative-guidance consolidation and cross-status
  insurance-loss reconciliation stay limited as stated in the research
  reports; escalate material discrepancies rather than adding hidden
  complexity or false exactness.
- This plan creates no live behavior. Any UI/persistence activation belongs
  to the following PR and its browser-verification gate.

---

## 14. Acceptance (maps to next-PR-sequence acceptance)

- [ ] One shared yearly close funds spending/allocation/tax/KV-PV with
      separate assessment ledgers; assessment income never spendable; no
      pooled+per-bucket double charge.
- [ ] Dated arrears recover when cash/assets permit; current vs prior payments
      and remaining liabilities reported separately; priority (§6) and
      insolvency handling deterministic and tested.
- [ ] Phases, bridge, KVdR/voluntary/unknown, floors/ceilings, manual
      replacements retained; bond/terminal-insurance verified; terminal
      insurance incremental under disclosed assumptions.
- [ ] Cumulative-`F` + 40/50/60-year real-value checks; no terminal
      allowance/loss fiction; `terminated` protection intact.
- [ ] Deterministic/bootstrap/search adapters consistent on the common ledger;
      fixed-reserve/nonmonotone limits return `unsupported`/`nonconverged`,
      never plausible numbers; zero/future holdings covered.
- [ ] Fail-closed convergence everywhere; diagnostics + unfunded amounts
      visible; live calculator unchanged; gates (§11) + independent review +
      exact-head CI.

*End of plan. Awaiting coordinator approval. No implementation to follow in
this task.*
