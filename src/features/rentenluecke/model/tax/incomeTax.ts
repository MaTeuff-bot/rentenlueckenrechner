import { z } from 'zod'
import { earliestGrvPensionAge, grvPensionGrossForYear } from '../retirementIncomeStreams'
import type { RetirementIncomeStream } from '../types'

// Rentenbesteuerung der gesetzlichen Rente (GRV): Besteuerungsanteil (§22 EStG),
// Rentenfreibetrag-Eurofizierung und Einkommensteuertarif (§32a EStG, VZ 2026).
// Rule snapshot: docs/rentenbesteuerung-rules-2026.md (rentenbesteuerung-2026-reviewed-2026-09-20).
// Pattern: docs/kapitalertragsteuer-rules-2026.md — zod-validierte pure functions,
// scope declaration, disclosures. Framework-free: no React/DOM.

export const PENSION_TAX_SCOPE_DECLARATION = 'grv-single-domestic-post-2023-no-other-income' as const
export const PENSION_TAX_RULE_SNAPSHOT = 'rentenbesteuerung-2026-reviewed-2026-09-20' as const
/** Annual tariff/source recheck (Grundfreibetrag, §32a figures, Besteuerungsanteil table). */
export const PENSION_TAX_RECHECK_DATE = '2027-01-15' as const

/** EStG §32a (1): Grundfreibetrag (Zone 1 ceiling), Veranlagungszeitraum 2026. */
export const GRUNDFREIBETRAG_2026 = 12_348
/** EStG §32a (1): Zone 2 ceiling (linear-progressiv, y-Formel). */
export const ESTG32A_ZONE2_TOP_2026 = 17_799
/** EStG §32a (1): Zone 3 ceiling (linear-progressiv, z-Formel). */
export const ESTG32A_ZONE3_TOP_2026 = 69_878
/** EStG §32a (1): Zone 4 ceiling (42 % Proportionalzone). */
export const ESTG32A_ZONE4_TOP_2026 = 277_825
/** §9a S. 1 Nr. 3 EStG: Werbungskosten-Pauschbetrag bei sonstigen Einkünften (Renten). */
export const WERBUNGSKOSTEN_PAUSCHBETRAG_2026 = 102
/** EStG §22: Besteuerungsanteil für Rentenbeginn 2026 (planning anchor of the official table). */
export const BESTEUERUNGSANTEIL_2026 = 0.84
/** EStG §22: +0,5 Prozentpunkte je späterem Rentenbeginnjahr. */
export const BESTEUERUNGSANTEIL_ANNUAL_STEP = 0.005
/** EStG §22: 100 % Besteuerungsanteil ab diesem Rentenbeginnjahr (cap). */
export const BESTEUERUNGSANTEIL_FULL_YEAR = 2058

const money = z.number().finite().nonnegative().max(Number.MAX_SAFE_INTEGER)
const inflationFactorSchema = z.number().finite().positive().max(Number.MAX_SAFE_INTEGER)
// Hoisted (module-level): these schemas sit on hot paths (setup resolution runs
// once per ledger build, i.e. per bootstrap path), so they must not be rebuilt
// per call — zod schema construction costs ~100us+ each time.
const startYearSchema = z.number().int().min(1800).max(9999)
const pensionTaxScopeSchema = z.literal(PENSION_TAX_SCOPE_DECLARATION)

export const pensionTaxDisclosures = [
  'Nur gesetzliche Rente (GRV), Einzelveranlagung im Inland, ohne weitere Einkünfte im Steuerzugriff: Kapitalerträge bleiben in der Abgeltung (fertig) und erhöhen den zvE nicht.',
  'Grundfreibetrag, Werbungskosten-Pauschbetrag (Basis 102 EUR/Jahr) und §32a-Zonengrenzen werden mit der Szenario-Inflationsrate skaliert (Planungsannahme; gesetzlich sind die 2026er-Beträge nominal und ändern sich nur per Gesetz). Der Rentenfreibetrag-EUR-Betrag bleibt nominal eingefroren (das ist das geltende Recht — Rentenerhöhungen sind nicht indexiert).',
  'Der Rentenfreibetrag ist der steuerfreie Euro-Betrag aus dem ersten vollen Rentenjahr der Simulation und bleibt nominal für immer bestehen; spätere Rentenerhöhungen erhöhen den steuerpflichtigen Anteil.',
  'Der eingefrorene Rentenfreibetrag wirkt wie kalte Progression: Er bleibt nominal konstant, während Rentenerhöhungen die Rente erhöhen — die Rente wächst dadurch schneller als der steuerfreie Anteil, und der steuerpflichtige Teil steigt über die Jahre.',
  'KV-/PV-Eigenbeiträge auf die Rente mindern den zvE als Sonderausgaben (Jahresbeträge der Beitragsengine).',
  'Nicht modelliert: Riester, private Renten (Ertragsanteil), Betriebsrenten, Altversicherte (vor 1948), weitere Einkünfte neben der GRV-Rente im zvE, Kirchensteuer, Zusammenveranlagung.',
  'Kein Solidaritätszuschlag auf die GRV-Rentensteuer ausgewiesen (fällt erst oberhalb der Freizone an); gleichjährige Steuerzahlung ist eine Planungsnäherung ohne Vorauszahlungs-/Bescheid-Timing.',
] as const

/** EStG §32a (1) Grundtarif für den Veranlagungszeitraum 2026 (Single, Grundtabelle).
 * Per statute: zvE floored to full EUR before the tariff, tax rounded DOWN to full EUR.
 * Zones: 0 bis 12.348 → 0; 12.349–17.799 → (914,51·y + 1.400)·y mit
 * y = (x − 12.348)/10.000; 17.800–69.878 → (173,10·zz + 2.397)·zz + 1.034,87 mit
 * zz = (x − 17.799)/10.000; 69.879–277.825 → 0,42·x − 11.135,63;
 * ab 277.826 → 0,45·x − 19.470,38. */
export function incomeTax32a2026(taxBaseToday: number): number {
  const x = Math.floor(money.parse(taxBaseToday))
  if (x <= GRUNDFREIBETRAG_2026) return 0
  if (x <= ESTG32A_ZONE2_TOP_2026) {
    const y = (x - GRUNDFREIBETRAG_2026) / 10_000
    return Math.floor((914.51 * y + 1_400) * y)
  }
  if (x <= ESTG32A_ZONE3_TOP_2026) {
    const zz = (x - ESTG32A_ZONE2_TOP_2026) / 10_000
    return Math.floor((173.1 * zz + 2_397) * zz + 1_034.87)
  }
  if (x <= ESTG32A_ZONE4_TOP_2026) return Math.floor(0.42 * x - 11_135.63)
  return Math.floor(0.45 * x - 19_470.38)
}

/** Effective Grundfreibetrag for a model year: base 12.348 EUR scaled by the
 * scenario's cumulative inflation factor. Planning assumption — the statute
 * fixes nominal amounts; scaling keeps the allowance's real value constant. */
export function scaledGrundfreibetrag(inflationFactor: number): number {
  return GRUNDFREIBETRAG_2026 * inflationFactorSchema.parse(inflationFactor)
}

/** Effective Werbungskosten-Pauschbetrag for a model year: base 102 EUR scaled by
 * the scenario's cumulative inflation factor (same planning assumption). */
export function scaledWerbungskostenpauschbetrag(inflationFactor: number): number {
  return WERBUNGSKOSTEN_PAUSCHBETRAG_2026 * inflationFactorSchema.parse(inflationFactor)
}

/** §32a tax on a nominal model-year zvE under the inflation-indexed 2026 tariff
 * (planning assumption): deflate to today's EUR, apply the nominal 2026 tariff
 * (with its statutory flooring), inflate the tax back to nominal EUR. This scales
 * the Grundfreibetrag and all zone boundaries in real terms while keeping the
 * tariff curve kink-free. */
export function incomeTaxWithInflation(zveNominal: number, inflationFactor: number): number {
  const factor = inflationFactorSchema.parse(inflationFactor)
  const taxToday = incomeTax32a2026(money.parse(zveNominal) / factor)
  return taxToday * factor
}

/** EStG §22 Besteuerungsanteil for a pension START year, frozen once
 * (einmalige Verfestigung): 84 % for 2026, +0,5pp per later year, capped at
 * 100 % from 2058. The linear formula extends the official post-2023 table
 * (2023 → 82,5 %); earlier starts use the same extension as a planning
 * approximation (scope: post-2023, see scope declaration). */
export function besteuerungsanteilForStartYear(startYear: number): number {
  const year = startYearSchema.parse(startYear)
  const share = BESTEUERUNGSANTEIL_2026 + BESTEUERUNGSANTEIL_ANNUAL_STEP * (year - 2026)
  return Math.min(1, Math.max(0, share))
}

const pensionTaxSetupSchema = z.object({
  scope: pensionTaxScopeSchema,
  /** Calendar year of the (earliest) GRV pension start; fixes the Besteuerungsanteil. */
  startYear: startYearSchema,
  /** Frozen Besteuerungsanteil (einmalige Verfestigung). */
  besteuerungsanteil: z.number().finite().min(0).max(1),
  /** Frozen nominal Rentenfreibetrag in EUR (steuerfreier Euro-Betrag, never indexed). */
  rentenfreibetragEUR: money,
  /** First-full-year GRV gross pension (nominal, documented for transparency). */
  firstYearGrvGross: money,
})
export type PensionTaxSetup = z.infer<typeof pensionTaxSetupSchema>

/** Coverage declarations must be explicit; anything outside the GRV
 * single-person domestic scope blocks the pension-tax calculation (throws,
 * like the capital-income estimator). */
export function createPensionTaxSetup(input: {
  scope: 'grv-single-domestic-post-2023-no-other-income'
  startYear: number
  /** Nominal GRV gross pension of the first full pension year of the simulation. */
  firstYearGrvGross: number
}): PensionTaxSetup {
  pensionTaxScopeSchema.parse(input.scope)
  const startYear = startYearSchema.parse(input.startYear)
  const ersteJahresrente = money.parse(input.firstYearGrvGross)
  const besteuerungsanteil = besteuerungsanteilForStartYear(startYear)
  return pensionTaxSetupSchema.parse({
    scope: input.scope,
    startYear,
    besteuerungsanteil,
    rentenfreibetragEUR: (1 - besteuerungsanteil) * ersteJahresrente,
    firstYearGrvGross: ersteJahresrente,
  })
}

/** First-full-year rule: the frozen Rentenfreibetrag derives from the GRV gross
 * pension of the first simulation retirement year with GRV receipt. Returns null
 * when no GRV stream ever pays within the horizon (no pension tax). Callers pass
 * the simulation path's cumulative inflation factor per year index (same resolver
 * the ledger uses, so bootstrap/custom-inflation paths stay consistent). */
export function resolvePensionTaxSetup(input: {
  streams: readonly RetirementIncomeStream[] | undefined
  currentAge: number
  retirementAge: number
  planningAge: number
  referenceYear: number
  yearsToRetirement: number
  inflationFactorAt: (yearIndex: number) => number
}): PensionTaxSetup | null {
  const startAge = earliestGrvPensionAge(input.streams)
  if (startAge === null) return null
  // Clamped: the share saturates at 100 % from 2058, so absurd far-future starts
  // (only reachable with referenceYear near 9999) keep the capped share.
  const startYear = Math.min(9999,
    startYearSchema.parse(input.referenceYear) + (startAge - input.currentAge))
  for (let age = Math.max(startAge, input.retirementAge); age < input.planningAge; age += 1) {
    const yearIndex = input.yearsToRetirement + (age - input.retirementAge)
    const gross = grvPensionGrossForYear(
      { retirementIncomeStreams: input.streams }, age, input.inflationFactorAt(yearIndex))
    if (gross > 0) {
      return createPensionTaxSetup({
        scope: PENSION_TAX_SCOPE_DECLARATION, startYear, firstYearGrvGross: gross,
      })
    }
  }
  return null
}

const pensionYearInputSchema = z.object({
  /** Nominal GRV gross pension of the model year. */
  grvGross: money,
  /** Yearly own KV contribution on the pension (Sonderausgaben, engine amount). */
  healthInsurance: money,
  /** Yearly own PV contribution on the pension (Sonderausgaben, engine amount). */
  careInsurance: money,
  /** Scenario cumulative inflation factor of the model year (tariff indexation). */
  inflationFactor: inflationFactorSchema,
})

export type PensionYearTaxAssessment = {
  /** Taxable pension share after the frozen Rentenfreibetrag, before Sonderausgaben. */
  pensionTaxBase: number
  /** Zu versteuerndes Einkommen (nominal, floored at 0). */
  zveNominal: number
  /** GRV-Rentensteuer for the model year (nominal EUR). */
  pensionIncomeTax: number
}

/** One model-year GRV pension tax assessment. Order per snapshot: current gross
 * pension − frozen nominal Rentenfreibetrag → − inflation-scaled
 * Werbungskosten-Pauschbetrag → − KV/PV Sonderausgaben → floor at 0 → §32a
 * (inflation-indexed 2026 tariff). Capital income never enters the zvE
 * (Abgeltung fertig, scope declaration). The setup is a validated PensionTaxSetup
 * by construction (createPensionTaxSetup) and is reused across all years of a
 * ledger build without re-parsing — mirroring the shared validated tax template
 * of the capital-income search; only the varying yearly inputs are parsed. */
export function assessPensionYearTax(
  setup: PensionTaxSetup,
  input: z.input<typeof pensionYearInputSchema>,
): PensionYearTaxAssessment {
  const year = pensionYearInputSchema.parse(input)
  return assessPensionYearTaxValues(
    setup, year.grvGross, year.healthInsurance, year.careInsurance, year.inflationFactor)
}

/** Pure arithmetic core for the ledger hot paths. A single scenario recompute
 * rebuilds the ledger once per bootstrap path (~1.000 builds), so per-year zod
 * parsing here costs seconds in the render-heavy suites; the validated wrapper
 * above stays the boundary for external/test callers. Inputs are
 * engine-computed money values (GRV face gross, KV/PV Sonderausgaben, scenario
 * inflation factor) that the ledger already trusts for all surrounding money
 * math; finiteness/sign follow from those computations. The §32a tariff keeps
 * its statutory flooring/validation (incomeTax32a2026). */
export function assessPensionYearTaxValues(
  setup: PensionTaxSetup,
  grvGross: number,
  healthInsurance: number,
  careInsurance: number,
  inflationFactor: number,
): PensionYearTaxAssessment {
  const pensionTaxBase = Math.max(0, grvGross - setup.rentenfreibetragEUR)
  const zveNominal = Math.max(0,
    pensionTaxBase - WERBUNGSKOSTEN_PAUSCHBETRAG_2026 * inflationFactor
    - healthInsurance - careInsurance)
  return {
    pensionTaxBase,
    zveNominal,
    pensionIncomeTax: incomeTax32a2026(zveNominal / inflationFactor) * inflationFactor,
  }
}
