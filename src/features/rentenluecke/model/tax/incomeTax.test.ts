import { describe, expect, it } from 'vitest'
import {
  BESTEUERUNGSANTEIL_2026,
  BESTEUERUNGSANTEIL_ANNUAL_STEP,
  BESTEUERUNGSANTEIL_FULL_YEAR,
  besteuerungsanteilForStartYear,
  ESTG32A_ZONE2_TOP_2026,
  ESTG32A_ZONE3_TOP_2026,
  ESTG32A_ZONE4_TOP_2026,
  GRUNDFREIBETRAG_2026,
  incomeTax32a2026,
  incomeTaxWithInflation,
  PENSION_TAX_SCOPE_DECLARATION,
  scaledGrundfreibetrag,
  scaledWerbungskostenpauschbetrag,
  WERBUNGSKOSTEN_PAUSCHBETRAG_2026,
} from './incomeTax'

/**
 * Hand-computed EStG §32a (1) Grundtarif cases, Veranlagungszeitraum 2026
 * (rule snapshot rentenbesteuerung-2026-reviewed-2026-09-20).
 * Statute: floor the zvE to full EUR, then apply the zone formula and round the
 * tax DOWN to full EUR. y = (x − 12.348)/10.000, zz = (x − 17.799)/10.000.
 */

describe('incomeTax32a2026: zone 1 (Grundfreibetrag)', () => {
  it('taxes nothing up to 12,348', () => {
    expect(GRUNDFREIBETRAG_2026).toBe(12_348)
    expect(incomeTax32a2026(0)).toBe(0)
    expect(incomeTax32a2026(12_348)).toBe(0)
  })

  it('starts zone 2 above the Grundfreibetrag with statutory rounding', () => {
    // x=12,349: y=0.0001 → (914.51×0.0001+1.400)×0.0001 = 0.140009… → floor 0.
    expect(incomeTax32a2026(12_349)).toBe(0)
    // x=12,358: y=0.001 → (914.51×0.001+1.400)×0.001 = 1.400914… → floor 1.
    expect(incomeTax32a2026(12_358)).toBe(1)
  })
})

describe('incomeTax32a2026: zone 2 (12,349–17,799)', () => {
  it('applies (914,51·y + 1.400)·y inside the zone', () => {
    // x=15,000: y=0.2652 → (914.51×0.2652+1.400)×0.2652 = 435.598439… → 435.
    expect(incomeTax32a2026(15_000)).toBe(435)
  })

  it('meets zone 3 at the boundary', () => {
    // x=17,799: y=0.5451 → 1,034.872023… → 1,034.
    expect(ESTG32A_ZONE2_TOP_2026).toBe(17_799)
    expect(incomeTax32a2026(17_799)).toBe(1_034)
    // x=17,800: zz=0.0001 → (173.10×0.0001+2.397)×0.0001+1.034,87 = 1,035.109… → 1,035.
    expect(incomeTax32a2026(17_800)).toBe(1_035)
  })
})

describe('incomeTax32a2026: zone 3 (17,800–69,878)', () => {
  it('computes the full worked example zvE 40,000', () => {
    // z=(40.000−17.799)/10.000=2.2201;
    // (173.10×2.2201+2.397)×2.2201+1.034,87 = 7,209.632598… → 7,209.
    expect(incomeTax32a2026(40_000)).toBe(7_209)
  })

  it('meets the 42 % zone at the crossover', () => {
    // x=69,878: zz=5.2079 → 18,213.062999… → 18,213.
    expect(ESTG32A_ZONE3_TOP_2026).toBe(69_878)
    expect(incomeTax32a2026(69_878)).toBe(18_213)
    // x=69,879: 0.42×69.879−11.135,63 = 18,213.55 → 18,213 (continuous crossover).
    expect(incomeTax32a2026(69_879)).toBe(18_213)
  })
})

describe('incomeTax32a2026: zones 4 and 5 (42 % / 45 %)', () => {
  it('applies 0,42·x − 11.135,63 inside zone 4', () => {
    // x=100,000: 0.42×100.000−11.135,63 = 30,864.37 → 30,864.
    expect(incomeTax32a2026(100_000)).toBe(30_864)
  })

  it('meets the 45 % zone at the crossover', () => {
    // x=277,825: 0.42×277.825−11.135,63 = 105,550.87 → 105,550.
    expect(ESTG32A_ZONE4_TOP_2026).toBe(277_825)
    expect(incomeTax32a2026(277_825)).toBe(105_550)
    // x=277,826: 0.45×277.826−19.470,38 = 105,551.32 → 105,551.
    expect(incomeTax32a2026(277_826)).toBe(105_551)
    // x=300,000: 0.45×300.000−19.470,38 = 115,529.62 → 115,529.
    expect(incomeTax32a2026(300_000)).toBe(115_529)
  })

  it('floors fractional zvE to full EUR before the tariff', () => {
    // 12,358.99 → floor 12,358 → 1 (same as the integer case above).
    expect(incomeTax32a2026(12_358.99)).toBe(1)
  })
})

describe('inflation-indexed 2026 tariff (planning assumption)', () => {
  it('scales the Grundfreibetrag with the scenario inflation factor', () => {
    // 12,348 × 1.1 = 13,582.8 (legally nominal; scaling is the agreed planning assumption).
    expect(scaledGrundfreibetrag(1.1)).toBeCloseTo(13_582.8, 9)
    expect(scaledGrundfreibetrag(1)).toBe(GRUNDFREIBETRAG_2026)
  })

  it('scales the Werbungskosten-Pauschbetrag with the scenario inflation factor', () => {
    // 102 × 1.1 = 112.2.
    expect(WERBUNGSKOSTEN_PAUSCHBETRAG_2026).toBe(102)
    expect(scaledWerbungskostenpauschbetrag(1.1)).toBeCloseTo(112.2, 9)
  })

  it('keeps the indexed tariff kink-free at factor 1', () => {
    expect(incomeTaxWithInflation(40_000, 1)).toBe(7_209)
    expect(incomeTaxWithInflation(12_348, 1)).toBe(0)
  })

  it('deflates to today-EUR, applies the nominal tariff, and inflates back', () => {
    // zvE 13,582 nominal at factor 1.1 → floor(13.582/1.1)=12.347 ≤ 12.348 → 0.
    expect(incomeTaxWithInflation(13_582, 1.1)).toBe(0)
    // zvE 13,594 nominal at factor 1.1 → floor(13.594/1.1)=12.358 → zone 2,
    // y=0.001 → tax-today floor 1 → nominal 1×1.1 = 1.1.
    expect(incomeTaxWithInflation(13_594, 1.1)).toBeCloseTo(1.1, 9)
  })
})

describe('besteuerungsanteilForStartYear (EStG §22 table anchor)', () => {
  it('freezes 84 % for Rentenbeginn 2026 and rises 0.5pp per year', () => {
    expect(BESTEUERUNGSANTEIL_2026).toBe(0.84)
    expect(BESTEUERUNGSANTEIL_ANNUAL_STEP).toBe(0.005)
    expect(besteuerungsanteilForStartYear(2026)).toBeCloseTo(0.84, 12)
    expect(besteuerungsanteilForStartYear(2027)).toBeCloseTo(0.845, 12)
    expect(besteuerungsanteilForStartYear(2030)).toBeCloseTo(0.86, 12)
  })

  it('caps at 100 % from 2058', () => {
    expect(BESTEUERUNGSANTEIL_FULL_YEAR).toBe(2058)
    // 0.84 + 0.005×(2058−2026) = 0.84+0.16 = 1.00 exactly.
    expect(besteuerungsanteilForStartYear(2058)).toBe(1)
    expect(besteuerungsanteilForStartYear(2059)).toBe(1)
    expect(besteuerungsanteilForStartYear(2100)).toBe(1)
  })

  it('extends the post-2023 table linearly backwards (2023 → 82.5 %)', () => {
    expect(besteuerungsanteilForStartYear(2023)).toBeCloseTo(0.825, 12)
    expect(besteuerungsanteilForStartYear(2025)).toBeCloseTo(0.835, 12)
  })

  it('declares the GRV single-person domestic scope', () => {
    expect(PENSION_TAX_SCOPE_DECLARATION).toBe('grv-single-domestic-post-2023-no-other-income')
  })
})
