# Kapitalertragsteuer auf Entnahmen und Umschichtungen — Rule snapshot (PR tax-1b)

Scope: taxation of portfolio withdrawals that fund the retirement gap
(`gapWithdrawal` rows) and of accumulation-phase rebalancing (Umschichtung)
gains in automatic-capital (estimator) mode. Implements Abgeltungsteuer as a
transformation on the ledger, following the insurance-estimator pattern
(`docs/insurance-capital-estimator.md`).

Rule snapshot: `kapitalertragsteuer-2026-reviewed-2026-09-20`.

## Ledger reads / writes / ordering (planning contract)

**Reads (per year):**
- `gapWithdrawal` — the withdrawal amount to fund (Ruhestand rows; zero in Ansparjahren, where only the rebalancing tax is funded).
- Opening holdings, acquisition costs, assessed/pending Vorabpauschalen and loss
  carryforward from the estimator state (only in automatic-capital mode; manual
  capital estimates have no holdings breakdown, see boundary below).
- Inflation factor (nominal ledger units throughout; no separate real-tax track).

**Writes (per year, new optional fields on `YearlyPeriodRow`):**
- `capitalIncomeTax` — total tax due on the year's withdrawal-funded capital income.
- `taxableWithdrawal` — the portion of the withdrawal that is taxable income
  (sale gain + assessed Vorabpauschale income, after Teilfreistellung).
- `sparerpauschbetragApplied` — amount of the annual allowance consumed.
- `netGapWithdrawal` — what actually leaves the portfolio after funding the tax
  (the gap must still be met in full; see funding rule).

**Ordering (extends the estimator's annual sequence):** estimator year simulation
first (sales, VP receipt/assessment, insurance funding) → tax assessment on the
resulting capital income (Entnahme gains + rebalancing gains + received VP) → tax funding from the portfolio → remaining withdrawal.
Same-year funding does not replicate evidenced-year tax billing; tax funding is a
planning approximation, disclosed like the insurance funding approximation.

## Funding rule (the decision that defines this feature)

The retirement gap is a *net* obligation. The portfolio must fund
`gapWithdrawal + capitalIncomeTax`, not just the gross withdrawal. A withdrawal
whose sale proceeds do not cover tax plus gap leaves `unfundedWithdrawal` as today
(never silently covered). This changes required-capital search inputs, so the
reference-scenario and invariant suites pin the new numbers.

## Implemented rules

| Rule | Content | Source |
| --- | --- | --- |
| Abgeltungsteuersatz | 25% flat on taxable capital income; Abgeltungswirkung (§43(5) EStG) — no Günstigerprüfung modeled | [§32d EStG](https://www.gesetze-im-internet.de/estg/__32d.html) |
| Solidaritätszuschlag | 5.5% of the Abgeltungsteuer (§3 SolzG; no exemption-zone nuance at this rate base) | [Solidaritätszuschlagsgesetz](https://www.gesetze-im-internet.de/solzg_1995/) |
| Kirchensteuer | Not modeled — single-person domestic scope, no confession flag; listed in disclosures | §32d(1) EStG |
| Sparerpauschbetrag | Basis 1,000 EUR/year (single), scaled by the scenario cumulative inflation factor (effective allowance = 1,000 × inflationFactor; planning assumption, legally nominal); applies after Teilfreistellung, before the 25% rate; consumed first, never refunded across years | [§20(9) EStG](https://www.gesetze-im-internet.de/estg/__20.html) |
| Teilfreistellung | 30% for qualifying equity funds (>50% equity, the estimator's `accumulating-equity-fund` classification), 0% for ordinary bank deposits; applies to sale gains and Vorabpauschale income alike | [§20(1) Nr. 1 + InvStG §18/§20](https://www.gesetze-im-internet.de/invstg_2018/__20.html) |
| Sale gains | Gross sale gain minus previously assessed Vorabpauschalen on the sold shares (estimator's proportional-sale accounting, InvStG §19(1)), then Teilfreistellung | [InvStG §19](https://www.gesetze-im-internet.de/invstg_2018/__19.html) |
| Verlustverrechnung | Existing simulated loss carryforward is offset before the allowance; only within capital-income loss pot, no Aktien-/Aktienfonds loss pots split | [§20(6) EStG](https://www.gesetze-im-internet.de/estg/__20.html) |
| Vorabpauschale income | Already assessed amounts are capital income in the assessment year; the estimator's `assessedVorabpauschalen` rollforward stays the single source | [InvStG §18](https://www.gesetze-im-internet.de/invstg_2018/__18.html) |

## What is NOT modeled (disclosures)

- Kirchensteuer (scope declaration, see below).
- Günstigerprüfung against personal income tax (always 25% + Soli).
- Loss pots beyond a single carryforward; no stock-loss-pot split (§20(6) sentence 8-10).
- Sparerpauschbetrag for couples (Zusammenveranlagung 2,000 EUR).
- Tax on capital income *outside* realized sales/VP (unrealized gains, thesaurierung
  without sale; dividends are not supported holdings anyway — accumulating funds
  and bank deposits only).
- Accumulation-phase tax only in automatic-capital (estimator) mode; manual capital
  estimates keep the disclosed withdrawal-only approximation with no Ansparphasen modeling.
- Quarterly prepayments, Steuerbescheid timing, or discounting of the tax to a
  different year than its assessment.
- No Krypto, Termingeschäfte, REIT special rules, or foreign withholding tax.

Scope declaration (estimator pattern): `single-person-domestic-private-post-2017-no-special-events`,
allowance mode `single-sparerpauschbetrag`. Any state outside the declaration blocks
the tax calculation and falls back to the disclosed pre-tax numbers.

## Vertical slice

- Slice 0 (this PR): rule snapshot + ledger-schema/effect-map page; no behavior change.
- Slice 1 (next PR, user-visible): `model/tax/` pure engine + ledger integration +
  estimator consumption + rewritten estimator disclosure ("Investment taxes are
  not calculated or funded" → truthful statement) + UI row/summary showing
  `capitalIncomeTax` and net spendable amounts.
