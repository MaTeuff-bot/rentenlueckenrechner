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
`retirementIncomeDeductions`, `retirementIncomeOtherDeductions`, `surplusIncome`
(after all modeled charges on supported detailed rows; `surplusReinvested`
optionally mirrors the reinvested amount), `gapWithdrawal(Today)`,
`unfundedWithdrawal`.

Embedded sub-ledgers (each with its own doc):
- `insurance` — KV/PV contribution line
  (`docs/gkv-pv-rules-2026.md`)
- `capitalAssessment` — detailed capital-income estimator year (mandatory in every insurance mode)
  (`docs/insurance-capital-estimator.md`)

## Effect map (feature → reads → writes)

| Feature | Reads | Writes |
| --- | --- | --- |
| GKV/PV contributions | income rows, phase, age | `insurance`, `retirementIncomeDeductions`, `healthInsurance`, `careInsurance` |
| Capital-income estimator | buckets, returns, income, phase | `capitalAssessment`, retirement income adjustments |
| **Kapitalertragsteuer (slice 1, implemented + PR1 bank interest)** | `gapWithdrawal`, estimator state (holdings, acquisition cost, VP, once-credited gross `bankInterest`, loss carryforward), `inflationFactor` | `capitalIncomeTax`, `taxableWithdrawal`, `sparerpauschbetragApplied`, `netGapWithdrawal` (all derived from the same assessment result; no separate recomputation) |
| Rentenbesteuerung (slice 2) | GRV gross, frozen Rentenfreibetrag, KV/PV Sonderausgaben, `inflationFactor` | `pensionIncomeTax`, `pensionTaxBase`, net recalc (`retirementIncome(Net)`, `gapWithdrawal`, `surplusIncome`) — [snapshot](rentenbesteuerung-rules-2026.md) |
| Retirement-surplus reinvestment (implemented) | committed signed need (`spendingLessOtherIncome` + own KV/PV + `capitalIncomeTax` + `pensionIncomeTax`), post-funding holdings, bucket returns, `projectedBasisRate` | `surplusIncome` (corrected after-all-charges surplus), optional `surplusReinvested`, updated `capitalAssessment.closingState` (buckets + pooled cost + pending VP), `closingCapital(Today)`; no recomputation of tax/loss/allowance/insurance |

## Conventions for adding a feature

1. Spec = the feature's rule-snapshot doc: reads / writes / ordering (see
   `docs/kapitalertragsteuer-rules-2026.md` for the pattern).
2. Pure engine module in `model/`, zod state, own tests; no React/DOM (zone rules in
   `docs/ARCHITECTURE.md`).
3. New fields are optional (additive, no persistence reset); derived summaries and
   charts consume rows, never recompute.
4. Ordering: declare the feature's slot in the annual sequence explicitly.

## Annual ordering (retirement years, nominal EUR)

Pending-VP receipt → apply bucket returns once (credit `bankInterest` once from
gross yield) → joint solver trial with shared loss/allowance, KV/PV + capital tax
+ pension-tax extra → commit `required/paid` (immutable trial) → only if
`!accumulation`, committed `surplusIncome > 0`, `requiredWithdrawal == 0` and not
`shortfall`: reinvest `surplus = max(0, -signedNeed)` year-end proportionally to
CURRENT holdings (equal across declared supported buckets only when total zero;
fund shares add cost + December pending VP, bank shares add principal, no
current-year return), adding its December pending VP to the committed balance.
The estimator's contribution/pending-VP handling has already completed before this
ledger post-step; retirement contributions are zero, accumulation has no surplus
reinvestment. `simulatedLossCarryforward` is unchanged by the post-step. Loss/allowance consumed once in
trials, never reconsumed for surplus. Historical statements that surplus remains
outside the portfolio are superseded; `docs/verification/` receipts stay as history.
