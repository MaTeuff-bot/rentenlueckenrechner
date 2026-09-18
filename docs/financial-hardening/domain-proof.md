# Bank-only search — supported domain and proof sketch

Supported iff `isBankOnlySearchSupported` holds (else explicit `unsupported`, never silent converge):

- One bucket, `deposit`, settlement same id; concrete validated `actualOpening` value finite `> 0`.
- Explicit percent targets `100%` (`share=1`) throughout; no `fixedReserve amountToday>0`.
- Every `F` finite `> 0`, nondecreasing; `terminalInflation` finite `> 0`.
- Per-year insurance capital-independent only: `manual` replacement, `kvdr`, or
  voluntary/unknown with explicit finite `manualCapitalAssessmentMonthlyToday >= 0`.
  Automatic voluntary capital-dependent is `unsupported`.
- Allowance finite `>= 0`, `churchRate in {0,0.08,0.09}`, deposit rate finite `>= -1`, no fund prices.

Internal scaling: `proportionalBankOpening(actual, capital)` keeps id/name and sets value to trial
capital (for one deposit this is the proportional scale `capital/actualTotal`); `low=0` is only a
search artefact, the gate is on `actualTotal>0`.

Ledger order per `simulateLedgerYear` (bank-only): `beginYear -> applyPricesInterest -> +contribution
-> fund cappedWithdrawal=min(need,wealthAfterInflows) -> reconcileTax -> arrears (zero when solvent)
-> resolveInsuranceBurden (fixed) -> pay min(balance,burden) -> closeVP (no-op, no funds)`.

Scalar funded recurrence with `k=(1+0.055+church)/(4+church)<1`, initial loss `0`:

`G(W) = W*(1+r) + c - withdrawal - k*max(0, W*max(r,0) - allowance) - fixedInsurance`

- `r>=0`: `G` slope `>= 1+r*(1-k) > 0` (tax kink at `W=allowance/r` preserves order; both branches
  have positive slope; insurance fixed).
- `-1<=r<0`: interest `0`, tax `0`, `G(W)=W*(1+r)+c-withdrawal-fixedInsurance`, slope `1+r>=0`
  (`-1` gives slope `0`, still nondecreasing; value floors at `0`).
- Each yearly step is monotone nondecreasing in `W`; composition over years preserves order by
  induction; transfers absent so distribution effects vanish; fixed `F` fixes thresholds/allowances.
  Hence prefix solvency inequalities are monotone and `survives(C)` is monotone, so binary search is
  sound. Subtracting a fixed burden preserves order; no claim is made from burden monotonicity alone.

Tolerances: `LEDGER_DUST_EUR=0.01` for depletion, `LEDGER_SOLVER_TOLERANCE_EUR=0.005` for the anchor
loop, `LEDGER_REQUIRED_CAPITAL_EPSILON=1` euro bracket. Solver/insurance numeric failures are scoped
to `nonconverged` in `assessTrialForSearch` and never become `depleted`.

Excluded (explicit `unsupported`): mixed funds/multiple deposits (rate-mix and realised-gain feedback
defeat the induction), automatic voluntary (capital-dependent burden), fixed reserves, true zero actual,
nonmonotone `F`. No bypass flags exist.
