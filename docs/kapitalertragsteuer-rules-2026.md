# Kapitalertragsteuer auf Entnahmen, Umschichtungen und Bankzinsen — Rule snapshot (PR tax-1b + PR1 bank interest)

Scope: taxation of portfolio withdrawals that fund the retirement gap
(`gapWithdrawal` rows), of accumulation-phase rebalancing (Umschichtung)
gains, and of ordinary gross bank interest (Bankzinsen) in automatic-capital
(estimator) mode. Implements Abgeltungsteuer as a transformation on the ledger,
following the insurance-estimator pattern
(`docs/insurance-capital-estimator.md`).

Rule snapshot: `kapitalertragsteuer-2026-reviewed-2026-09-20`.
Statute recheck date: `2026-09-25` (EStG §20(1)7/(6)/(9), §32d; InvStG §§20/21; SolzG §4).

## Ledger reads / writes / ordering (planning contract)

**Reads (per year):**
- `gapWithdrawal` — the withdrawal amount to fund (Ruhestand rows; zero in Ansparjahren, where only the rebalancing/interest tax is funded).
- Opening holdings, acquisition costs, assessed/pending Vorabpauschalen, the
  once-credited gross bank interest (`bankInterest`, from the gross bank yield —
  fees and net returns never reduce it) and loss carryforward from the estimator
  state (only in automatic-capital mode; manual capital estimates have no
  holdings breakdown, see boundary below).
- Inflation factor (nominal ledger units throughout; no separate real-tax track).

**Writes (per year, new optional fields on `YearlyPeriodRow`):**
- `capitalIncomeTax` — total tax due on the year's withdrawal-funded capital income.
- `taxableWithdrawal` — the assessable capital income of the year (exempted fund
  sale gain + assessed Vorabpauschale income, after the fund-only Teilfreistellung,
  plus unexempted gross bank interest; before the shared loss offset and allowance).
- `sparerpauschbetragApplied` — amount of the annual allowance consumed.
- `netGapWithdrawal` — what actually leaves the portfolio after funding the tax
  (the gap must still be met in full; see funding rule).

**Ordering (extends the estimator's annual sequence):** estimator year simulation
first (sales, VP receipt/assessment, insurance funding) → tax assessment on the
resulting capital income (Entnahme gains + rebalancing gains + received VP, fund-only
30% Teilfreistellung first, then + unexempted gross bank interest, then the single
shared loss offset and allowance — inside every immutable solver trial, so no
allowance/loss is consumed between trial evaluations) → tax funding from the portfolio
→ remaining withdrawal.
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
| Solidaritätszuschlag | 5.5% of the Abgeltungsteuer (SolzG §4; no exemption-zone nuance at this rate base) | [§4 SolzG](https://www.gesetze-im-internet.de/solzg_1995/__4.html) |
| Bankzinsen | Ordinary gross bank interest (EStG §20(1)7) credited once from the gross bank yield; no Teilfreistellung (InvStG §20 exempts qualifying fund income only); joins the single assessment after the fund-only exemption and shares the loss pot and Sparerpauschbetrag with fund gains/VP; bank-principal withdrawals are not income and are never taxed twice | [§20(1)7 EStG](https://www.gesetze-im-internet.de/estg/__20.html), [§20 InvStG](https://www.gesetze-im-internet.de/invstg_2018/__20.html) |
| Kirchensteuer | Not modeled — single-person domestic scope, no confession flag; listed in disclosures | §32d(1) EStG |
| Sparerpauschbetrag | Basis 1,000 EUR/year (single), scaled by the scenario cumulative inflation factor (effective allowance = 1,000 × inflationFactor; planning assumption, legally nominal); applies after Teilfreistellung, before the 25% rate; consumed first, never refunded across years | [§20(9) EStG](https://www.gesetze-im-internet.de/estg/__20.html) |
| Teilfreistellung | 30% for qualifying equity funds (>50% equity, the estimator's `accumulating-equity-fund` classification), 0% for ordinary bank deposits; applies to sale gains and Vorabpauschale income alike (fund losses share the haircut, InvStG §21) | [§20(1) Nr. 1 EStG](https://www.gesetze-im-internet.de/estg/__20.html) + [§§20/21 InvStG](https://www.gesetze-im-internet.de/invstg_2018/__20.html) |
| Sale gains | Gross sale gain minus previously assessed Vorabpauschalen on the sold shares (estimator's proportional-sale accounting, InvStG §19(1)), then Teilfreistellung | [InvStG §19](https://www.gesetze-im-internet.de/invstg_2018/__19.html) |
| Verlustverrechnung | Existing simulated loss carryforward is offset before the allowance; only within the single capital-income loss pot, no Aktien-/Aktienfonds loss pots split; the insurance expense allowance never creates a loss pot and never touches the tax carryforward | [§20(6) EStG](https://www.gesetze-im-internet.de/estg/__20.html) |
| Vorabpauschale income | Already assessed amounts are capital income in the assessment year; the estimator's `assessedVorabpauschalen` rollforward stays the single source | [InvStG §18](https://www.gesetze-im-internet.de/invstg_2018/__18.html) |

## What is NOT modeled (disclosures)

- Kirchensteuer (scope declaration, see below).
- Günstigerprüfung against personal income tax (always 25% + Soli).
- Loss pots beyond a single carryforward; no stock-loss-pot split (§20(6) sentence 8-10).
- Sparerpauschbetrag for couples (Zusammenveranlagung 2,000 EUR).
- Tax on capital income *outside* realized sales/VP/gross bank interest (unrealized gains, thesaurierung
  without sale; dividends are not supported holdings anyway — accumulating funds
  and bank deposits only).
- Accumulation-phase tax (Umschichtung gains AND bank interest) only in automatic-capital
  (estimator) mode; manual capital estimates keep the disclosed withdrawal-only
  approximation with no Ansparphasen modeling and no separately identified bank interest.
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
- PR1 bank interest (this PR): gross bank interest joins the same assessment after
  the fund-only exemption (no separate recomputation; ledger rows consume the
  corrected totals); manual approximation unchanged; statute recheck 2026-09-25.
