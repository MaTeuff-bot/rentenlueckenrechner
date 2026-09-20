# Ledger schema and per-feature effect map

One page. The yearly ledger (`YearlyPeriodRow` from `simulateScenario`, defined in
`src/features/rentenluecke/model/types.ts`) is the single computation surface: every
feature adds/modifies fields per year and derives everything else from the rows.

## Core row fields (today)

Timeline/units: `yearIndex`, `ageStart/ageEnd`, `phase` ('accumulation'|'retirement'),
`inflationFactor` (nominal ledger units; `*Today` fields divide by the factor).

Capital: `openingCapital`, `nominalReturnRate`, `investmentReturn`,
`capitalBeforeCashflow`, `closingCapital`, `closingCapitalToday`, `depleted`.

Cashflows: `contribution`, `desiredSpending`, `retirementIncome(Gross/Net)`,
`retirementIncomeDeductions`, `retirementIncomeOtherDeductions`, `surplusIncome`,
`gapWithdrawal(Today)`, `unfundedWithdrawal`.

Embedded sub-ledgers (each with its own doc):
- `insurance` — KV/PV contribution line
  (`docs/gkv-pv-rules-2026.md`)
- `capitalAssessment` — automatic capital-income estimator year
  (`docs/insurance-capital-estimator.md`)

## Effect map (feature → reads → writes)

| Feature | Reads | Writes |
| --- | --- | --- |
| GKV/PV contributions | income rows, phase, age | `insurance`, `retirementIncomeDeductions`, `healthInsurance`, `careInsurance` |
| Capital-income estimator | buckets, returns, income, phase | `capitalAssessment`, retirement income adjustments |
| **Kapitalertragsteuer (slice 1, planned)** | `gapWithdrawal`, estimator state (holdings, acquisition cost, VP, loss carryforward), `inflationFactor` | `capitalIncomeTax`, `taxableWithdrawal`, `sparerpauschbetragApplied`, `netGapWithdrawal` |
| Rentenbesteuerung (slice 2, planned) | statutory pension income | taxable share on `retirementIncomeGross`, net recalc |

## Conventions for adding a feature

1. Spec = the feature's rule-snapshot doc: reads / writes / ordering (see
   `docs/kapitalertragsteuer-rules-2026.md` for the pattern).
2. Pure engine module in `model/`, zod state, own tests; no React/DOM (zone rules in
   `docs/ARCHITECTURE.md`).
3. New fields are optional (additive, no persistence reset); derived summaries and
   charts consume rows, never recompute.
4. Ordering: declare the feature's slot in the annual sequence explicitly.
