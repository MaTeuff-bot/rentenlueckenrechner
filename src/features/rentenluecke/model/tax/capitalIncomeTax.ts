import { z } from 'zod'
import { assessCore } from './pureCore'

// Kapitalertragsteuer auf Entnahmen im Ruhestand und auf Umschichtungsgewinne der
// Ansparphase (Abgeltungsteuer + Solidaritätszuschlag).
// Rule snapshot: docs/kapitalertragsteuer-rules-2026.md (kapitalertragsteuer-2026-reviewed-2026-09-20).
// Pattern: docs/insurance-capital-estimator.md — zod state, pure functions,
// scope declaration, disclosures. Framework-free: no React/DOM.

export const TAX_SCOPE_DECLARATION = 'single-person-domestic-private-post-2017-no-special-events' as const
export const TAX_ALLOWANCE_MODE = 'single-sparerpauschbetrag' as const

/** §20(9) EStG: Sparerpauschbetrag, single assessment, per calendar year, use-it-or-lose-it. Base amount; the effective annual allowance scales with scenario inflation (planning assumption). */
export const SPARERPAUSCHBETRAG_SINGLE = 1_000
/** §32d EStG: flat rate on taxable capital income; Abgeltungswirkung, no Günstigerprüfung. */
export const ABGELTUNGSTEUER_RATE = 0.25
/** SolzG §4: 5.5% of the Abgeltungsteuer, no exemption-zone nuance at this rate base. */
export const SOLIDARITAETSZUSCHLAG_RATE = 0.055
/** InvStG §20: 30% for qualifying equity funds (>50% equity). */
export const TEILFREISTELLUNG_EQUITY_FUND = 0.3
/** No relief for ordinary bank deposits. */
export const TEILFREISTELLUNG_ORDINARY_DEPOSIT = 0

const money = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER)
const signed = z.number().finite().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)

const inflationFactorSchema = z.number().finite().nonnegative()

/** Effective annual Sparerpauschbetrag for a model year: base 1,000 EUR scaled by
 * the scenario's cumulative inflation factor. Planning assumption — the statute
 * fixes nominal amounts; scaling keeps the allowance's real value constant.
 * Schemas are module-level so hot paths (capital search, bootstrap trials) reuse
 * them instead of rebuilding per call. */
export function scaledSparerpauschbetrag(inflationFactor: number): number {
  return money.parse(SPARERPAUSCHBETRAG_SINGLE * inflationFactorSchema.parse(inflationFactor))
}

export const taxDisclosures = [
  'Kirchensteuer wird nicht modelliert (kein Konfessionsmerkmal im Ein-Personen-Inlandsumfang).',
  'Günstigerprüfung gegen den persönlichen Einkommensteuersatz wird nicht modelliert (immer 25 % + Solidaritätszuschlag).',
  'Verlustverrechnung nur in einem einzigen Kapitalertrag-Verlusttopf; kein getrennter Aktien-/Aktienfonds-Verlusttopf.',
  'Sparerpauschbetrag nur für Einzelveranlagung (Basis 1.000 EUR/Jahr, mit der Szenario-Inflationsrate skaliert als Planungsannahme; gesetzlich nominal); kein Zusammenveranlagungs-Betrag.',
  'Umschichtungsgewinne der Ansparphase werden nur bei automatischer Kapitalbasis besteuert und aus dem Portfolio finanziert; bei manueller Kapitalbasis bleibt die Steuer eine Entnahme-Näherung ohne Ansparphasen-Modellierung.',
  'Bankzinsen (EStG §20 Absatz 1 Nummer 7) werden nur bei automatischer Kapitalbasis gesondert erfasst und ohne Teilfreistellung in dieselbe Abgeltungsteuer-Bemessung einbezogen; sie teilen sich Verlusttopf und Sparerpauschbetrag mit Fondsgewinnen und Vorabpauschalen.',
  'Gleichjährige Steuerfinanzierung ist eine Planungsnäherung; keine Abbildung von Vorauszahlungen, Steuerbescheid-Timing oder Abzinsung.',
] as const

/** Shown additionally whenever withdrawals lack a holdings breakdown (scalar ledger,
 * including manual capital estimates): gains are estimated proportionally to the
 * withdrawal share, with no Teilfreistellung as a conservative planning approximation. */
export const manualApproximationDisclosure =
  'Entnahmen ohne Depotaufschlüsselung (vereinfachte oder manuelle Kapitalbasis): steuerpflichtige Gewinne werden aus dem Kapitalzuwachs anteilig zur Entnahme geschätzt, ohne Teilfreistellung (konservativ voll steuerpflichtig). Bankzinsen sind darin nur pauschal enthalten und werden erst bei automatischer Kapitalbasis gesondert ohne Teilfreistellung besteuert.' as const

const taxStateSchema = z.object({
  scope: z.literal(TAX_SCOPE_DECLARATION),
  allowanceMode: z.literal(TAX_ALLOWANCE_MODE),
  /** Effective annual allowance for the current model year (base scaled by inflation). */
  allowanceAnnual: money,
  lossCarryforward: money,
})
export type CapitalIncomeTaxState = z.infer<typeof taxStateSchema>

/** Coverage declarations must be explicit; anything outside the single-person
 * domestic private post-2017 scope blocks the tax calculation (throws, like the estimator). */
export function createTaxState(input: {
  scope: 'single-person-domestic-private-post-2017-no-special-events'
  allowanceMode: 'single-sparerpauschbetrag'
  openingLossCarryforward?: number
  /** Effective annual allowance override (inflation-scaled year amount). Defaults to the base. */
  allowanceAnnual?: number
  /** Convenience: derive the effective allowance as base × factor instead of passing it directly. */
  inflationFactor?: number
}): CapitalIncomeTaxState {
  z.literal(TAX_SCOPE_DECLARATION).parse(input.scope)
  z.literal(TAX_ALLOWANCE_MODE).parse(input.allowanceMode)
  const allowanceAnnual = input.allowanceAnnual ?? (input.inflationFactor !== undefined
    ? scaledSparerpauschbetrag(input.inflationFactor)
    : SPARERPAUSCHBETRAG_SINGLE)
  return taxStateSchema.parse({
    scope: input.scope,
    allowanceMode: input.allowanceMode,
    allowanceAnnual,
    lossCarryforward: input.openingLossCarryforward ?? 0,
  })
}

const incomeClassSchema = z.enum(['equity-fund', 'ordinary-deposit'])

const assessmentSchema = z.object({
  /** Adjusted sale gain after previously assessed Vorabpauschalen (proportional-sale
   * accounting, InvStG §19(1)). Signed: realized losses feed the carryforward. */
  fundSaleGain: signed,
  /** Assessed Vorabpauschale income of the year (InvStG §18), single source: estimator rollforward. */
  vorabpauschaleIncome: money,
  /** Ordinary gross bank interest of the year (EStG §20(1)7), credited once from
   * the gross bank yield. No Teilfreistellung (InvStG §20 covers funds only);
   * joins the single assessment after the fund-only exemption, before the shared
   * loss offset and allowance. Defaults to zero (scalar/manual callers). */
  bankInterest: money.default(0),
  openingLossCarryforward: money,
  allowanceAvailable: money.default(SPARERPAUSCHBETRAG_SINGLE),
  incomeClass: incomeClassSchema,
  scope: z.literal(TAX_SCOPE_DECLARATION),
  allowanceMode: z.literal(TAX_ALLOWANCE_MODE),
})

/** Per-year Abgeltungsteuer assessment. Order per snapshot: Teilfreistellung on
 * (sale gain + VP income) → + unexempted bank interest → loss carryforward
 * offset → Sparerpauschbetrag (effective annual amount, base scaled by
 * inflation; consumed in-year, never refunded across years) → 25% + 5.5% Soli. */
export function assessCapitalIncomeTax(input: z.input<typeof assessmentSchema>) {
  const p = assessmentSchema.parse(input)
  const result = assessCore(
    p.fundSaleGain, p.vorabpauschaleIncome, p.openingLossCarryforward,
    p.allowanceAvailable, p.incomeClass === 'equity-fund', p.bankInterest)
  const taxableBase = money.parse(result.taxableBase)
  const abgeltungsteuer = taxableBase * ABGELTUNGSTEUER_RATE
  return {
    taxableWithdrawal: money.parse(result.taxableWithdrawal),
    sparerpauschbetragApplied: money.parse(result.sparerpauschbetragApplied),
    taxableBase,
    abgeltungsteuer,
    soliditaetszuschlag: abgeltungsteuer * SOLIDARITAETSZUSCHLAG_RATE,
    capitalIncomeTax: money.parse(result.capitalIncomeTax),
    closingLossCarryforward: money.parse(result.closingLossCarryforward),
    closingAllowance: money.parse(result.closingAllowance),
  }
}

export type CapitalIncomeTaxAssessment = ReturnType<typeof assessCapitalIncomeTax>

/** One immutable assessment year: pure assessment plus the next rollforward state.
 * The annual allowance never rolls across years (callers set the scaled amount per
 * year via state); only the loss carryforward does. */
export function assessYearTax(
  state: CapitalIncomeTaxState,
  income: { fundSaleGain: number; vorabpauschaleIncome: number; incomeClass: z.infer<typeof incomeClassSchema>; bankInterest?: number },
) {
  const s = taxStateSchema.parse(state)
  const result = assessCapitalIncomeTax({
    ...income,
    openingLossCarryforward: s.lossCarryforward,
    allowanceAvailable: s.allowanceAnnual,
    scope: s.scope,
    allowanceMode: s.allowanceMode,
  })
  return {
    result,
    nextState: taxStateSchema.parse({ ...s, lossCarryforward: result.closingLossCarryforward }),
  }
}
