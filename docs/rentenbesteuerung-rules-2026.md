# Rentenbesteuerung der gesetzlichen Rente (GRV) — Rule snapshot (tax slice 2)

Scope: income tax on the statutory pension (GRV) in retirement
(`retirementRows` with GRV receipt). Implements the Besteuerungsanteil /
Rentenfreibetrag mechanics (§22 EStG) with the §32a Einkommensteuertarif for
Veranlagungszeitraum 2026 as a transformation on the ledger, following the
Kapitalertragsteuer pattern (`docs/kapitalertragsteuer-rules-2026.md`).

Rule snapshot: `rentenbesteuerung-2026-reviewed-2026-09-20`.
Recheck date: `2027-01-15` (annual: §32a figures, Grundfreibetrag,
Besteuerungsanteil table, Werbungskosten-Pauschbetrag).

## Scope declaration

`grv-single-domestic-post-2023-no-other-income` — statutory pension only,
single assessment, domestic, no other income in the tax base. Kapitalerträge do
NOT enter the zvE (Abgeltung fertig, slices 1/1b are separate).

## Ledger reads / writes / ordering (planning contract)

**Reads (per retirement year):**
- GRV gross pension of the year (face value of active `gesetzliche-rente`
  streams: monthly amount × 12 × inflation factor; net-basis entries at face
  value, see approximation below).
- Frozen setup: Besteuerungsanteil (from the earliest GRV start age) and the
  nominal Rentenfreibetrag-EUR amount (from the first simulation retirement
  year with GRV receipt).
- `healthInsurance` + `careInsurance` — the contribution engine's yearly own
  KV/PV amounts, used as Sonderausgaben.
- Inflation factor (nominal ledger units throughout; the 2026 tariff is indexed
  with the scenario factor as a planning assumption, see below).

**Writes (per retirement year, new optional fields on `YearlyPeriodRow`):**
- `pensionIncomeTax` — GRV-Rentensteuer due for the year (nominal EUR).
- `pensionTaxBase` — taxable pension share after the frozen Rentenfreibetrag,
  before Sonderausgaben (transparency field).
- `retirementIncome` / `retirementIncomeNet` — reduced by `pensionIncomeTax`
  (net = gross − other deductions − KV/PV − pension tax). `gapWithdrawal`
  (and `surplusIncome`) derive from that net, so the gap stays net of ALL
  deductions. Accumulation rows never carry pension-tax fields.

**Ordering (annual sequence):**
- Scalar ledger (`simulateRetirement.ts`): retirement income (KV/PV) →
  Rentenbesteuerung (capital-independent: sets the gap) → Abgeltungsteuer
  assessment on the resulting gap → portfolio funding (`fundRetirementYear`).
- Estimator ledger (`capitalIncome/ledger.ts`): estimator year simulation
  (sales, VP, Kapitalertragsteuer, funding of the pension-ignorant required
  withdrawal) → Rentenbesteuerung from the final KV/PV amounts → the pension-tax
  share joins the same funding logic as insurance
  (`required = max(0, need)`, estimator line 263): only what outside income
  cannot cover is funded from the remaining portfolio; a covering surplus keeps
  absorbing the tax outside the portfolio. Funded amounts leave the holdings as
  a pro-rata cash take (bucket values scale down; cost, Vorabpauschalen and loss
  carryforward untouched, so estimator book-chaining holds exactly).
- Required-capital search needs no separate pension-tax loop: the scalar search
  reuses the taxed `gapWithdrawal` rows, and the estimator search rebuilds rows
  through the same taxed path. Same-year funding does not replicate
  evidenced-year tax billing; tax funding is a planning approximation, disclosed
  like the slice-1 funding approximation.

## Implemented rules

| Rule | Content | Source |
| --- | --- | --- |
| §32a Grundtarif 2026 | 5 zones: 0 bis 12.348 → 0; 12.349–17.799 → (914,51·y + 1.400)·y, y=(x−12.348)/10.000; 17.800–69.878 → (173,10·z + 2.397)·z + 1.034,87, z=(x−17.799)/10.000; 69.879–277.825 → 0,42·x − 11.135,63; ab 277.826 → 0,45·x − 19.470,38. zvE floored to full EUR before the tariff; tax rounded DOWN to full EUR. | [§32a EStG](https://www.gesetze-im-internet.de/estg/__32a.html) |
| Besteuerungsanteil | Determined by the pension START year (earliest GRV stream start age → calendar year via `referenceYear + startAge − currentAge`), frozen once (einmalige Verfestigung): 84 % for 2026, +0,5pp per later year, capped at 100 % from 2058. Linear extension covers earlier starts as a planning approximation (scope: post-2023). | [§22 EStG](https://www.gesetze-im-internet.de/estg/__22.html), BMF Besteuerungsanteil-Tabelle (2023 → 82,5 %) |
| Rentenfreibetrag | Tax-free ABSOLUTE EUR amount = (1 − Besteuerungsanteil) × GRV gross pension of the FIRST FULL pension year of the simulation, frozen nominally forever. Each later year: taxable share = current gross − frozen EUR amount (pension increases raise the taxable amount). | [§22 EStG](https://www.gesetze-im-internet.de/estg/__22.html) |
| Inflation indexation (AGREED planning override) | Grundfreibetrag (12.348), Werbungskosten-Pauschbetrag (102) and the §32a zone boundaries scale with the scenario cumulative inflation factor: the nominal zvE is deflated to today's EUR, taxed with the nominal 2026 tariff, and the tax is inflated back (kink-free). Legally the 2026 figures are nominal and change only by law; scaling is a planning approximation. The Rentenfreibetrag-EUR freeze stays NOMINAL (actual law — increases are not indexed). | Planning assumption agreed 2026-09-20 (nominal statute: [§32a EStG](https://www.gesetze-im-internet.de/estg/__32a.html)) |
| zvE | Current GRV gross − frozen Rentenfreibetrag − Werbungskosten-Pauschbetrag (102 × factor) − KV/PV Sonderausgaben (engine yearly amounts), floored at 0. Then tax = §32a(zvE). | §§22, 9a S. 1 Nr. 3, 10, 32a EStG |
| Werbungskosten-Pauschbetrag | 102 EUR/year base (sonstige Einkünfte), inflation-scaled like the tariff. | [§9a EStG](https://www.gesetze-im-internet.de/estg/__9a.html) |
| Solidaritätszuschlag | Not assessed on the GRV-Rentensteuer (only above the exemption zone — note, not a hard claim). | [Solidaritätszuschlagsgesetz](https://www.gesetze-im-internet.de/solzg_1995/) |

## What is NOT modeled (disclosures)

- Only GRV: no Riester, no private pensions (Ertragsanteil), no Betriebsrenten,
  no Alte Versicherte (born before 1948), no other income besides the GRV
  pension in the tax base.
- No church tax, no couples (Zusammenveranlagung / Splitting).
- Net-basis GRV entries are taxed at face value (no gross-up reconstruction).
- GRV pensions starting before the simulation use the simulation's first GRV
  year for the Rentenfreibetrag (no historical pension data in the model).
- Pre-2023 pension starts use the linear Besteuerungsanteil extension.
- The estimator funding take realizes no capital gains and retains the loss
  carryforward (slight optimistic bias on future capital-tax estimates,
  small versus holdings).
- Quarterly prepayments, Steuerbescheid timing, or discounting of the tax to a
  different year than its assessment.

Scope declaration (estimator pattern): `grv-single-domestic-post-2023-no-other-income`.
Any state outside the declaration blocks the pension-tax calculation (throws,
like the capital-income estimator).

## Vertical slice

- Slice 2 (this PR): `model/tax/incomeTax.ts` pure engine (tariff, share, setup,
  assessment) + GRV helpers in `model/retirementIncomeStreams.ts` + scalar and
  estimator ledger integration + Jahrestabelle column, SummaryCards totals and
  income-card labeling + reference/invariant pin updates + this snapshot.
