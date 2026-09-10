# PR1: inactive insurance capital-income accounting foundation

Rule verification date: **2026-09-10**. This module is not imported by the application,
scenario simulator, capital search, bootstrap paths, persistence, or UI. Only tests
use it. It computes an annual capital assessment estimate and portfolio funding;
it does not calculate or fund investment taxes. No saved-state reset or distribution
input is included. No annual target rebalancing policy is introduced.

## Source register and implemented rules

The preserved `.source-1.txt` through `.source-6.txt` in this worktree were read;
these pre-existing research files are not modified by PR1. The URLs below are the
canonical provenance, so the documentation remains useful without those local files.

| Source / snapshot | Rule used and implementation boundary |
| --- | --- |
| [GKV Einnahmenkatalog, 26 May 2026](https://www.gkv-spitzenverband.de/media/dokumente/krankenversicherung_1/grundprinzipien_1/finanzierung/beitragsbemessung/2026-05-26_Katalog_Einnahmen_beitragsrechtliche_Bewertung_240_SGB_V_BF.pdf), pp. 15, 30; `.source-1.txt` | Investment income under §16 InvStG is assessable considering §§20 and 56(6); ordinary bank interest is assessable. Unrealised price appreciation and principal withdrawals are not substituted for those income measures. Applies to voluntary/§240 assessment, not an inference of KVdR eligibility. |
| [InvStG §16](https://www.gesetze-im-internet.de/invstg_2018/__16.html); `.source-2.txt` | Investment income includes Vorabpauschalen and sale gains, even without distributions. Only accumulating funds supported. |
| [InvStG §18](https://www.gesetze-im-internet.de/invstg_2018/__18.html); `.source-3.txt`, official page rechecked | Nonnegative VP uses 70% of basis rate times January value, capped by annual price appreciation. Acquisition month reduces amount by prior full months / 12. Deemed receipt is first working day next calendar year. No cash distribution branch. |
| [InvStG §19(1)](https://www.gesetze-im-internet.de/invstg_2018/__19.html); `.source-4.txt` | Sale gain subtracts assessed VP in full before partial exemption. Acquisition cost and VP balances are separate. |
| [InvStG §20(1)](https://www.gesetze-im-internet.de/invstg_2018/__20.html); `.source-5.txt` | 30% equity-fund exemption for private holdings; same 70% included fraction used for signed fund gains. No business-property or mixed-fund exemption rates. |
| [InvStG §21](https://www.gesetze-im-internet.de/invstg_2018/__21.html), retrieved directly from official site (web reader failed) | Corresponding reductions for costs/acquisition costs prevent deducting the exempt portion of fund losses. Not a blanket full deduction of raw fund-related expenses. |
| [GKV Beitragsverfahrensgrundsätze Selbstzahler, 1 January 2025](https://www.gkv-spitzenverband.de/media/dokumente/krankenversicherung_1/grundprinzipien_1/finanzierung/beitragsbemessung/2025-01-01_Einheitliche_Grundsaetze_zur_Beitragsbemessung_freiwilliger_Mitglieder_Stand_01_01_2025.pdf), §3(1b), §5(2); `.source-6.txt` | €51 annual capital-income expenses unless higher actual expenses are demonstrated. Capital-loss offsets refer to EStG §20(6). Attribution differs with accompanying work/rental income and otherwise uses the last evidenced year. The solver does not replicate that timing. |
| [EStG §20(6)](https://www.gesetze-im-internet.de/estg/__20.html), rechecked official text | Capital-only losses may offset capital income and carry forward, not offset pensions/rent or carry back. Special stock-sale loss restrictions and certification requirements exist. The module covers only fund losses within one modelled person's eligible offset pool; it does not implement certificates, external pots, joint assessment or stock losses. |
| [InvStG §2(6)](https://www.gesetze-im-internet.de/invstg_2018/__2.html), rechecked | Equity-fund classification is legal asset classification, not a return-series category. Caller must explicitly declare qualifying accumulating equity funds. |
| [InvStG §56](https://www.gesetze-im-internet.de/invstg_2018/__56.html), rechecked | Pre-2018 transition values and protected pre-2009 holdings require separate treatment; §56(6) includes a special allowance. These holdings are excluded, not silently treated as ordinary post-2017 purchases. |

These are dated rules, not promises about future legislation. The annual assessment
`expenseAllowance` defaults to the €51 snapshot for standalone API calls and accepts
a nonnegative finite amount within the monetary range. Simulation callers must index
that snapshot along scenario inflation, as required by the insurance plan for monetary
thresholds, and pass it explicitly each year. Basis rate is
a required explicit decimal parameter each year, including confirmed zero or a
negative rate. There is no default or latest-published-rate constant. The insurance
basis-rate UI assumption remains undecided and is unnecessary for this pure API.

## Coverage and opening balances

`createEstimatorState` requires declared eligibility for **every** bucket, independently
of names/proxies, even for zero-value buckets. Allowed classes are accumulating
qualifying equity funds and ordinary deposits. Unknown/distributing funds, bonds,
individual securities, money-market funds merely named “cash”, legacy holdings,
changes in fund classification, wrappers, business assets, foreign/special events,
and joint holdings are outside this engine's automatic contract. There is no partial
coverage or automatic manual-mode switch. PR2 must offer explicit manual capital
assessment or removal/replacement of unsupported holdings; whole-phase manual
KV/PV is not required merely by this portfolio gate.

The scope declaration means one person's domestic private standard holdings,
acquired after 2017, with opening holdings already owned before the first modelled
calendar year. Current-year opening acquisitions need timing information this MVP
does not have. The year parameterisation assumes whole calendar years. PR2 must
disclose its mapping from age-based simulation years to those years.

One required euro acquisition cost covers **funds only**, may exceed market value,
and may explicitly be zero. Bank principal is the deposit balance, not fund cost.
No per-fund cost or FIFO tracking is used. The supported opening loss declaration
explicitly confirms no pre-existing losses and no external offsets. This is a
coverage limit, not an unapproved assumption that everyone has zero loss history.
Simulated eligible losses are tracked after partial exemption. Any need for opening
loss history or outside pools requires manual assessment until separately supported.
Offset eligibility/evidence must be confirmed by the caller; the model cannot establish
broker/tax-office certification or make a loss usable merely by computing it.

**Approved opening-history approximation:** both accumulated assessed VP and the
previous year's pending receipt start at zero. This does not replace acquisition
costs or assert that existing history is actually zero. Omitted existing history can
distort estimates, including overstated sale income and omitted initial-year receipts.
The runtime `estimatorDisclosures` carries this limitation for future integration.
No special legacy support is implied by that approximation.

## Annual transaction ordering and units

Inputs/outputs are nominal annual EUR; rates are decimals; calculations are unrounded.
The annual result is the future authoritative ledger payload; summaries must derive
from it. The function is pure and validates its external parameters at runtime.
Monetary totals and signed intermediates must stay within ±Number.MAX_SAFE_INTEGER
(nonnegative for balances). Validation includes aggregate portfolio value, combined
fund cost/assessed/pending VP, and the no-withdrawal closing envelope before callbacks.
Even if a withdrawal could bring that envelope back into range, such inputs are rejected.
Rate products are validated before statutory caps can hide out-of-range intermediates.

1. Receive last year's pending VP at the opening of this model year. Add its **full**
   amount to the assessed adjustment balance; record its assessment income even if
   the holdings are sold later in this year. This changes neither market value nor cash.
2. Apply each bucket's supplied annual total return to opening capital, once. Fund
   internal reinvestment stays inside that return, with no acquisition-cost increment.
   Ordinary deposit return is credited interest: record that income and the increased
   bank principal without adding another cashflow. Negative bank returns are rejected
   because fees/impairments cannot silently become negative interest. A caller must
   supply an ordinary gross credited-interest return; a cost-net proxy is not enough.
3. At year end, before new contributions, solve the withdrawal required for net spending
   plus **total own** KV/PV. Every trial withdraws the same value fraction from all
   current fund and deposit buckets. Fund cost and assessed VP decrease by the sold
   fraction of the fund pool. Deposit withdrawals return principal, including already
   credited interest; no second income is created. No tax funding is added.
4. Add explicitly allocated end-year contributions. Fund purchases increase pooled
   acquisition costs; bank contributions increase deposit principal. They earn no
   return this year and are not available for the earlier funding step. This matches
   the existing accumulation ledger's return-before-contribution convention. A year
   can therefore show a funding shortfall and a positive subsequent contribution.
   Retirement income surplus remains outside the portfolio, matching current behaviour.
5. Calculate next year's pending VP on retained old units **per fund bucket**, with
   each bucket's own gain cap, then sum. Opposite bucket returns must not cancel the
   legal per-fund VP cap. December purchases get 1/12 of the capped annual amount for
   their units: approximate January value as purchase amount / (1 + annual return).
   This assumes a constant effective annual NAV ratio; proxy returns/costs are not
   literal statutory NAV observations. `calculateVorabpauschale` also accepts explicit
   same-unit start/end values and any acquisition month for independent fixtures.
   No per-fund acquisition-cost tracking is required. Year-end sales generate no VP
   for units no longer held at next-year receipt. The pending balance is **not** used
   to reduce this year's sale gains.

Pooled adjusted sale gain = fund proceeds − proportional acquisition cost − proportional
assessed VP. Fund assessment before offsets = 70% × (received VP + adjusted sale gain).
Add bank interest, offset only eligible modelled capital losses, floor assessment at
zero after the expense deduction. Excess investment losses carry forward; unused
expense allowance never creates a loss pot. The optional
`provenDeductibleAnnualExpenses` means an **already established deductible** annual
amount after any applicable fund-related partial restriction, not raw fund fees.
The API does not determine expense evidence/allocation. The supplied allowance (standalone default €51), or higher proven deductible expenses, is used
once per person/year and no Sparer-Pauschbetrag is deducted. Multiple phases or
external capital-income streams must not each deduct it again.

A -100% fund return marks value to zero without inventing a disposal or a deductible
loss. Bank withdrawals cannot dispose of worthless fund units. Cost remains attached
to those units; zero-NAV purchases are rejected. Actual liquidation/derecognition,
recovery events or recognition of total-loss deductions are outside automatic scope.

## Solver contract

The callback receives annual assessable capital income and returns total annual own
KV/PV after participation/subsidy; other income, minimum and the shared ceilings must
be computed once by the contribution engine. It must not add assessed income to
spendable income, or include tax costs. Existing manual capital basis must be replaced
explicitly when this estimator is selected. For KVdR the callback ignores ordinary
capital assessment, but accounting can continue for a later voluntary phase.

The solver brackets withdrawal between zero and assets available before contributions.
The supported callback contract is deterministic with a continuous, increasing
`withdrawal − requiredWithdrawal` residual (ordinary bounded contribution rates
below the full marginal funding gain satisfy this). It supports minima, ceilings,
loss/exemption kinks and negative spending gaps. Arbitrary nonmonotone callbacks are
not guaranteed to find all roots. A negative residual at full liquidation reports a
shortfall including the insurance on that actual sale. Bisection stops at the absolute
EUR tolerance (default 0.000001) or at most 100 iterations, configurable to 256. Endpoint
evaluations are additional; `iterations` counts bisection trials (1 for an endpoint
result). Invalid/nonfinite callback burdens throw. Discontinuity or exhausted budget
returns `nonconverged`, signed residual and diagnostic amounts, with `closingState:
null`; callers must not carry trial state forward. Each trial starts from the same
immutable opening balances so expenses, losses and VP are not repeatedly consumed.

This is a same-receipt-year annual planning feedback approximation. It does not claim
that insurance is billed immediately on a sale, or reproduce §5(2)'s evidenced-year
rules. Monthly smoothing, phase splits, evidence timing and current vs past billing
must be disclosed and resolved in PR2, not represented as legal rules here.

## Existing simulator interaction / PR2 gates

`simulateAccumulationRows` and `fundRetirementYear` operate on scalar capital. Their
return → cashflow arithmetic matches the accounting above, but they cannot recover
fund/bank composition from an aggregate return. The deterministic expected-return
and bootstrap sampling resolvers combine component returns using fixed component
weights each year. This has allocation-maintenance economics, but **no trades** are
recorded. Treating it as a transaction-free fund/bank transfer would lose assessable
sale gains and corrupt pooled cost/VP balances; adding interest on top of that scalar
return would overstate wealth.

PR1 accepts explicit per-bucket annual returns and contributions and never changes
existing return paths. It deliberately does not rebalance. For PR2, preserve each
path's overall return and make any implied fund/bank movements explicit or surface
an unsupported path. A fund→bank movement needs fund-sale gain recognition and
proportional cost/VP release; a bank→fund movement adds fund acquisition cost but not
income merely by moving principal. Fund→fund trades can also realise gains despite
shared pooled cost. Selective moves cannot use `withdrawProportionally` over the whole
portfolio; that helper is for the approved spending/insurance sale allocation only.
Do not rewrite bucket values to targets or rescale cost to hide these transactions.
The later tax release's annual-target-rebalancing decision is not authorization to
add that policy here. Integration of these movements remains an explicit PR2 gate.

The supported pure annual model has no remaining legal blocker within the stated
bounds. Full UI activation still requires the explicit insurance basis-rate UI choice,
coverage and approximation disclosures, movement/return reconciliation, phase-specific
manual overrides, and one shared authoritative ledger across deterministic, search
and bootstrap modes. No approval is re-requested for zero opening VP.

## Verification

`insuranceEstimator.test.ts` includes source-rule boundary fixtures, all acquisition
months, per-fund caps despite pooled cost, bank-only/fund-only/mixed portfolios,
contributions and zero NAV, multi-year receipt/sale balances, losses and expenses,
funding feedback/minima/ceilings/surplus/depletion, invalid input, nonconvergence,
immutability and a reproducible mixed-return/funding conservation grid. Existing
integration tests must continue to pass because PR1 remains inactive. No browser
verification is required for this unexposed pure module.

Final validation on 2026-09-10 in the isolated worktree:

- Independent final `npm test -- --run`: **19 files, 374 tests passed**, 67.78 seconds.
- Estimator coverage: **110 tests**, including three real contribution-engine callbacks,
  indexed allowance forwarding, aggregate range and pre-callback overflow regressions.
- `npm run lint`: passed (exit 0).
- `npm run build`: passed (exit 0); includes `tsc -b` typecheck and Vite production build.
- Only the estimator test imports the new module; production integration remains inactive.

An initial build found an intentionally malformed test-input cast; it was corrected
before the successful final build and full test run. No commit, push or merge performed.
