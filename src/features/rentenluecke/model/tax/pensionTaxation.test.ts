import { describe, expect, it } from 'vitest'
import {
  assessPensionYearTax,
  assessPensionYearTaxValues,
  createPensionTaxSetup,
  PENSION_TAX_SCOPE_DECLARATION,
  resolvePensionTaxSetup,
} from './incomeTax'
import type { RetirementIncomeStream } from '../types'

/**
 * Hand-computed Rentenbesteuerung cases
 * (rule snapshot rentenbesteuerung-2026-reviewed-2026-09-20).
 * Order per year: current gross − frozen nominal Rentenfreibetrag
 * → − Werbungskosten-Pauschbetrag → − KV/PV Sonderausgaben → floor 0 → §32a.
 */

const SCOPE = { scope: PENSION_TAX_SCOPE_DECLARATION } as const

function grvStream(patch: Partial<RetirementIncomeStream> = {}): RetirementIncomeStream {
  return {
    id: 'grv', name: 'Gesetzliche Rente', kind: 'gesetzliche-rente',
    amountMonthlyToday: 2_000, startAge: 67, endAge: null,
    amountBasis: 'gross', deductionMode: 'none', effectiveDeductionRate: 0,
    ...patch,
  }
}

describe('createPensionTaxSetup: frozen Besteuerungsanteil and Rentenfreibetrag', () => {
  it('euro-fies the tax-free amount from the first full pension year', () => {
    // Rentenbeginn 2027 → 84.5 %; first-year gross 24,000 →
    // Rentenfreibetrag = 15.5 % × 24,000 = 3,720 EUR, frozen nominally.
    const setup = createPensionTaxSetup({ ...SCOPE, startYear: 2027, firstYearGrvGross: 24_000 })
    expect(setup.besteuerungsanteil).toBeCloseTo(0.845, 12)
    expect(setup.rentenfreibetragEUR).toBeCloseTo(3_720, 9)
    expect(setup.firstYearGrvGross).toBeCloseTo(24_000, 9)
  })

  it('rejects anything outside the declared GRV scope', () => {
    expect(() => createPensionTaxSetup({
      scope: 'single-person-domestic-private-post-2017-no-special-events' as never,
      startYear: 2027, firstYearGrvGross: 24_000,
    })).toThrow()
  })
})

describe('assessPensionYearTax: Rentenfreibetrag euro-fication under pension growth', () => {
  // Same setup throughout: Rentenbeginn 2027 (84.5 %), first-year 24,000 → freibetrag 3,720.
  const setup = createPensionTaxSetup({ ...SCOPE, startYear: 2027, firstYearGrvGross: 24_000 })

  it('taxes the first year from the frozen share', () => {
    // Base 24,000 − 3,720 = 20,280; zvE 20,280 − 102 − (2,100+1,008) = 17,070;
    // zone 2, y=0.4722 → 864.990891… → 864.
    const assessed = assessPensionYearTax(setup, {
      grvGross: 24_000, healthInsurance: 2_100, careInsurance: 1_008, inflationFactor: 1,
    })
    expect(assessed.pensionTaxBase).toBeCloseTo(20_280, 9)
    expect(assessed.zveNominal).toBeCloseTo(17_070, 9)
    expect(assessed.pensionIncomeTax).toBe(864)
  })

  it('lets the taxable share rise with a 3 % Rentenerhöhung against the frozen freibetrag', () => {
    // Gross 24,720 (+3 %); freibetrag stays 3,720 → base 21,000;
    // zvE 21,000 − 102 − 3,108 = 17,790; zone 2, y=0.5442 → 1,032.715465… → 1,032.
    const assessed = assessPensionYearTax(setup, {
      grvGross: 24_720, healthInsurance: 2_100, careInsurance: 1_008, inflationFactor: 1,
    })
    expect(assessed.pensionTaxBase).toBeCloseTo(21_000, 9)
    expect(assessed.zveNominal).toBeCloseTo(17_790, 9)
    expect(assessed.pensionIncomeTax).toBe(1_032)
  })

  it('keeps the frozen freibetrag nominal under inflation (not indexed)', () => {
    // Pure inflation year (factor 1.1): gross 26,400; freibetrag stays 3,720
    // (NOT 3,720×1.1 = 4,092) → base 22,680. zvE 22,680 − 112.2 − 3,418.8 = 19,149;
    // today-EUR floor(19.149/1.1) = 17,408 → zone 2, y=0.506 → 942.547… → 942;
    // nominal 942×1.1 = 1,036.2.
    const assessed = assessPensionYearTax(setup, {
      grvGross: 26_400, healthInsurance: 2_310, careInsurance: 1_108.8, inflationFactor: 1.1,
    })
    expect(setup.rentenfreibetragEUR).toBeCloseTo(3_720, 9)
    expect(assessed.pensionTaxBase).toBeCloseTo(22_680, 9)
    expect(assessed.zveNominal).toBeCloseTo(19_149, 6)
    expect(assessed.pensionIncomeTax).toBeCloseTo(1_036.2, 9)
  })

  it('floors the zvE at 0 when KV/PV exceed the taxable share', () => {
    // Base 20,280, but contributions 25,000 → 20,280 − 102 − 25,000 < 0 → zvE 0 → tax 0.
    // The transparency base keeps the pre-Sonderausgaben share.
    const assessed = assessPensionYearTax(setup, {
      grvGross: 24_000, healthInsurance: 20_000, careInsurance: 5_000, inflationFactor: 1,
    })
    expect(assessed.pensionTaxBase).toBeCloseTo(20_280, 9)
    expect(assessed.zveNominal).toBe(0)
    expect(assessed.pensionIncomeTax).toBe(0)
  })

  it('assesses no tax without GRV receipt', () => {
    const assessed = assessPensionYearTax(setup, {
      grvGross: 0, healthInsurance: 2_160, careInsurance: 480, inflationFactor: 1,
    })
    expect(assessed.pensionTaxBase).toBe(0)
    expect(assessed.zveNominal).toBe(0)
    expect(assessed.pensionIncomeTax).toBe(0)
  })
})

describe('resolvePensionTaxSetup: first-full-year rule and GRV-only scope', () => {
  const base = {
    currentAge: 66, retirementAge: 67, planningAge: 69,
    referenceYear: 2026, yearsToRetirement: 1,
    inflationFactorAt: () => 1,
  }

  it('starts from the earliest GRV stream and annualizes its first simulation year', () => {
    // Earliest GRV start 67 → calendar 2026+(67−66) = 2027 → 84.5 %;
    // first retirement year gross 2,000×12 = 24,000 → freibetrag 3,720.
    const setup = resolvePensionTaxSetup({ ...base, streams: [grvStream()] })
    expect(setup?.startYear).toBe(2027)
    expect(setup?.besteuerungsanteil).toBeCloseTo(0.845, 12)
    expect(setup?.rentenfreibetragEUR).toBeCloseTo(3_720, 9)
  })

  it('skips pre-pension bridge years until GRV receipt starts', () => {
    // Pension at 67, simulation retirement from 60: Rentenbeginn 2026+(67−60) = 2033
    // → 87.5 %; first GRV year is age 67 (factor 1, gross 24,000) →
    // freibetrag 12.5 % × 24,000 = 3,000, even though the horizon starts earlier.
    const setup = resolvePensionTaxSetup({
      ...base, currentAge: 60, retirementAge: 60, yearsToRetirement: 0,
      planningAge: 72, streams: [grvStream({ startAge: 67 })],
    })
    expect(setup?.startYear).toBe(2026 + (67 - 60))
    expect(setup?.besteuerungsanteil).toBeCloseTo(0.875, 12)
    expect(setup?.rentenfreibetragEUR).toBeCloseTo(3_000, 9)
  })

  it('returns null without GRV streams or without GRV receipt in the horizon', () => {
    expect(resolvePensionTaxSetup({ ...base, streams: undefined })).toBeNull()
    expect(resolvePensionTaxSetup({ ...base, streams: [] })).toBeNull()
    // Betriebsrente alone never enters the GRV tax base.
    expect(resolvePensionTaxSetup({
      ...base, streams: [grvStream({ kind: 'betriebsrente' })],
    })).toBeNull()
    // GRV starting after the planning horizon never pays within the simulation.
    expect(resolvePensionTaxSetup({
      ...base, streams: [grvStream({ startAge: 80 })],
    })).toBeNull()
  })
})

describe('assessPensionYearTaxValues: arithmetic core matches the validated entry', () => {
  const setup = createPensionTaxSetup({ scope: PENSION_TAX_SCOPE_DECLARATION, startYear: 2027, firstYearGrvGross: 24_000 })
  for (const year of [
    { grvGross: 24_000, healthInsurance: 2_100, careInsurance: 1_008, inflationFactor: 1 },
    { grvGross: 26_400, healthInsurance: 2_310, careInsurance: 1_108.8, inflationFactor: 1.1 },
    { grvGross: 0, healthInsurance: 0, careInsurance: 0, inflationFactor: 2 },
  ]) {
    it('matches for ' + JSON.stringify(year), () => {
      expect(assessPensionYearTaxValues(setup, year.grvGross, year.healthInsurance, year.careInsurance, year.inflationFactor))
        .toEqual(assessPensionYearTax(setup, year))
    })
  }
})
