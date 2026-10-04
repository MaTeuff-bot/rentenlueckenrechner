# Tagesgeld-Planungszins — Rule snapshot (2026)

Scope: liquid ordinary bank deposits (Tagesgeld) as a cash-category holding
(`ordinary-bank-deposit`) with a non-negative nominal gross credited rate
(0 allowed). Separate proportional bucket costs stay; negative net return
through costs is allowed; negative real return through inflation is allowed.
Never add inflation into the nominal rate.

Rule snapshot: `tagesgeld-planzins-v1-2026-10-04`.
No calibration claim; the 2 % value below is an explicitly confirmed proposal,
not a validated market or long-term value.

## Source-of-rate contract

- One shared constant: source id `tagesgeld-planzins-v1`, kind `planningRate`,
  category/role `cash`, expected return = planning rate, volatility 0,
  cost treatment `deductBucketAnnualCost` (bucket costs deducted from the rate,
  gross stays the planning rate).
- Same rate on all paths (reference scenario, bootstrap paths,
  required-capital search), all years/buckets/paths. Multiple bank buckets
  share this one rate; no independent per-bucket rate factor, no spurious
  diversification.
- Resolution: `resolveComponentNominalReturn` and
  `resolveComponentExpectedNominalReturn` return the planning rate for this
  source id, independent of sampled calendar year and scenario inflation.
  Threaded via `HistoricalBootstrapSettings.cashPlanningRate` through
  `bootstrapSampling`, `bootstrapSimulation` and `capitalIncome/returns`
  (`expectedBucketReturns`, `sampledBucketReturns`).
  `sampledBucketReturns` reports `grossBankReturnRate = planningRate`
  (gross, before bucket costs) and `totalReturnRate = planningRate - annualCostRate`
  (floored at -1 like other sources). `expectedBucketReturns` likewise.
- Year sampling: this source does not restrict or require historical sample
  years (same as synthetic sources). Seed material includes the planning rate
  in `createHistoricalBootstrapSeed` input hashing.
- Guard: cash-category component with planning source but missing/invalid
  (not finite >= 0) threaded rate throws
  `Tagesgeld-Planungszins fehlt oder ist ungültig; unter Rechenannahmen festlegen.`
  No silent fallback to another source.
- Legacy cash families (`jst-r6-developed-equal-weight-bills-real-post1950`,
  `synthetic-cash-assumption-v1`) conflict with this scope and are not
  reinterpreted as Tagesgeld. `ordinary-bank-deposit` requires
  `tagesgeld-planzins-v1`; other cash sources yield a readiness issue with
  re-decision. The negative-gross-bank guard in `insuranceEstimator` stays as
  diagnostics for unsupported sources.

## Ordering (yearly ledger)

Gross bank interest is credited once per year from bank opening balance x rate;
no double crediting, no principal re-taxation. Cost deduction and tax follow
the existing capital-income ordering (fund-only Teilfreistellung, single loss
pot/allowance). Result bands omit cash interest-rate uncertainty (constant
planning rate).

## NOT modeled

- Rate uncertainty, variable rates, inflation coupling, bank-switching/locking offers.
- Bonds/money-market funds, allocation/drift changes, surplus reinvestment,
  new asset classes.

## Open follow-ups (do not resolve here)

1. Varying-rate modeling/calibration/inflation coupling.
2. The 2 % value itself is an unvalidated proposal needing later justification.

## Source register (research starting point, no calibration)

- Bundesbank MFI deposit-rate statistics (overnight/overnight-households) as
  research starting point; no calibration claim in this slice.
