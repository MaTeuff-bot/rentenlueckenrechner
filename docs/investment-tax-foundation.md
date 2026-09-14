# Inactive investment-tax foundation

Dated 2026-09-14. Pure TypeScript in `src/features/rentenluecke/model/investmentTax/`;
not imported by the active simulation, React, persistence, charts or solvers. No new
dependencies. Annual results and their transaction/income records are the accounting
source of truth. This is a bounded planning approximation, not exact broker liability.

## Sources and assumptions

Hermes independently re-fetched the statutory sources and 2026 basis-rate PDF on
2026-09-14, as recorded in task `t_96eb3624` brief and supplied lifecycle research.
This document attributes that verification to Hermes; the recovery pass did not
repeat the legal research.

| Source | Implemented rule |
| --- | --- |
| [InvStG §18](https://www.gesetze-im-internet.de/invstg_2018/__18.html) | Accumulating-fund VP: nonnegative minimum of 70% × basis rate × first price and annual price increase, multiplied by surviving units and acquisition-month fraction. Receipt is in the following year. |
| [InvStG §19](https://www.gesetze-im-internet.de/invstg_2018/__19.html) | Sale proceeds less acquisition cost and gross assessed VP, including VP previously covered by allowances. VP is income deduction, not tax credit. |
| [InvStG §20](https://www.gesetze-im-internet.de/invstg_2018/__20.html), [§21](https://www.gesetze-im-internet.de/invstg_2018/__21.html) | Explicit qualifying equity funds receive 30% exemption on signed income/loss; ordinary bond funds receive none. |
| [EStG §20](https://www.gesetze-im-internet.de/estg/__20.html) | Bank interest, general capital losses before available saver allowance; current individual allowance €1,000. Model accepts available allowance explicitly. |
| [EStG §32d](https://www.gesetze-im-internet.de/estg/__32d.html), [SolzG §4](https://www.gesetze-im-internet.de/solzg_1995/__4.html) | Flat capital-income tax with church rate k of 0, 0.08 or 0.09: combined rate (1 + 0.055 + k)/(4 + k). |
| [BMF 2026 basis rate](https://www.bundesfinanzministerium.de/Content/DE/Downloads/BMF_Schreiben/Steuerarten/Investmentsteuer/2026-01-13-basiszins-berechnung-vorabpauschale.pdf?__blob=publicationFile&v=4) | 2026 basis rate 3.20%; 2026 VP receipt 4 January 2027. Future rates are explicit scenario inputs. |
| [BMF application guidance, 21 May 2019](https://www.bzst.de/SharedDocs/BMF/DE/Downloads/bmf_schreiben_20190521_InvStG_18_anwendungsfragen.pdf?__blob=publicationFile&v=1) | Supplied research identifies year-end surviving units (18.4), gross assessed deductions (19.5–19.8), and private-investor FIFO (19.14–19.15). Model deliberately approximates FIFO with proportional average cost. |

Opening holdings specify units, market price and separate nominal acquisition cost.
Opening historical VP, pending receipts, tax losses and liabilities are zero;
opening units are treated as held before the first simulation year. This reset can
materially differ from actual historical portfolios. Existing zero-value buckets
retain identity; worthless units retain basis until sold. Purchases acquire no old VP.
Sales proportionally release units, basis and assessed VP across acquisition cohorts;
cohorts retain month information for VP, not FIFO selection.

Only accumulating equity/bond funds and deposits are supported. Classification must
be supplied from product evidence, never inferred from returns. No distributing
funds, protected legacy holdings, classification changes, direct securities,
transaction costs, foreign credits, Günstigerprüfung, households or automatic funding.
Fund quotes are NAV prices net of embedded fund fees; do not add bond coupons or
subtract fees again. Deposit rates are nonnegative; negative interest is unsupported.
No currency rounding or exact withholding calendar is modeled. Double-precision
amounts and aggregates must be finite and at most Number.MAX_SAFE_INTEGER in magnitude.
General losses are pooled under the assumption that required cross-bank assessment
is completed; unused losses have no cash value. Available allowance must account for
outside income and is neither carried forward nor automatically indexed.

## API and event contract

Import from `model/investmentTax/index.ts`. State is model-owned: use returned states
without manually editing cohorts, pending arrays, histories or phases. Transitions
clone inputs, reject duplicate event IDs on their lineage and validate numeric output;
this is not an untrusted persisted-state schema/parser. Replaying against the same
unchanged input is deterministic. IDs must be globally unique within a path; avoid
internal prefixes (`begin:`, `receipt:`, `market:`, `close:`, `vp:`, `interest:`,
`annual-tax:`, `terminal:`). Amounts/rates are nominal decimal inputs, not percentages.

| API | Contract |
| --- | --- |
| `createInvestmentState(firstYear, buckets)` | Closed opening state, unique named buckets and zero historical adjustments. |
| `simulateInvestmentYear(state, input)` | Consecutive year: receive pending VP, opening transactions, market prices/interest, closing transactions, tax reconciliation, year-end pending VP. Returns opening/closing value, external cash, price income, interest, tax cash and authoritative state. |
| `beginInvestmentYear`, `applyTransaction`, `applyAnnualPricesAndInterest`, `reconcileTax`, `closeWithPendingVP` | Low-level equivalent sequence. Capture first prices before market movement; supply every fund quote and deposit rate, even for empty buckets. Reconcile refunds before closing. Opening purchases are January; closing purchases December. |
| `calculateVorabpauschale`, `receivePendingVP` | Formula accepts months 1–12. Annual begin receives pending automatically; do not receive twice. Pending prevents transactions on attached units until receipt. |
| `calculateTax`, `unpaidTax` | Signed income after exemption, opening losses, available allowance, liability and outstanding balances. Reconciliation debits designated cash only; excess paid tax can be refunded only within that same year. |
| `bucketValue`, `totalValue` | Gross marked-to-market nominal assets, before outstanding liabilities. |
| `valueHypotheticalLiquidation(state, cashId, cumulativeInflation, cutoff?)` | Requires completed horizon year; returns nominal net, once-deflated real net, outstanding liability and diagnostic liquidation state. Continuation input remains unchanged. |

External cash events represent contributions/withdrawals. Transfers and purchases
are internal movements, not investment income. Annual conservation is
`closingValue = openingValue + externalCash + priceIncome + interest - taxCash`.
Unfunded purchases/withdrawals and oversales fail atomically. Tax cash shortfalls
remain liabilities without automatic sales. Prior-year unpaid liabilities remain
separate and are deducted by terminal valuation, rather than automatically paid in
later annual reconciliation. Net terminal wealth may therefore be negative.

Contribution-income records are independent signed copies of income after partial
exemption, before tax allowance/loss utilization or payments. They do not assess
KV/PV, implement contribution loss policy, or activate insurance funding.

## Terminal convention and evidence

Default `beforeHoldingCutoff`: sell at final quotes immediately before year-end
holding cutoff; exclude prospective current-year VP on sold units. Mandatory older
pending receipts and unpaid liabilities remain. `afterHoldingCutoff`: post pending
VP and its matching gross sale deduction together in the horizon tax ledger,
retaining actual receipt-year metadata. This is explicitly a same-horizon valuation
approximation, **not literal legal receipt-year assessment**. Neither branch grants
another allowance, market return, interest period or loss refund from closed years.
Terminal output is diagnostic and cannot be continued or liquidated again; calling
valuation repeatedly on the original continuation state gives the same result.

Fixtures cover equity/bond/deposits, average-cost conservation, future purchases
after empty years, partial-sale survivors, contribution-versus-price changes,
December reduction, receipt/interest/event repetition, worthless holdings, cash
shortfalls, refunds, both cutoffs and repeated terminal protection. A reference
€3,000 equity gain gives €2,100 taxable income before €1,000 allowance and €290.125
tax; both cutoffs agree. Independent geometric-series checks span 40/50/60 years;
sensitivity tests vary basis rate, allowance, purchase timing and gain/loss ordering.
Conservation does not establish FIFO or exact lifetime legal-tax equivalence.
Task-workspace recovery logs record commands, actual outcomes and review limitations.
