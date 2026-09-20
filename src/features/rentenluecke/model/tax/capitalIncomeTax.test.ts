import { describe, expect, it } from 'vitest'
import {
  ABGELTUNGSTEUER_RATE,
  assessCapitalIncomeTax,
  assessYearTax,
  createTaxState,
  scaledSparerpauschbetrag,
  SOLIDARITAETSZUSCHLAG_RATE,
  SPARERPAUSCHBETRAG_SINGLE,
  TAX_ALLOWANCE_MODE,
  TAX_SCOPE_DECLARATION,
  taxDisclosures,
} from './capitalIncomeTax'

/**
 * Hand-computed Abgeltungsteuer cases (rule snapshot kapitalertragsteuer-2026-reviewed-2026-09-20).
 * Order: Teilfreistellung → loss offset → Sparerpauschbetrag → 25% + 5.5% Soli.
 * Total rate on the taxable base: 0.25 × 1.055 = 0.26375.
 */

const SCOPE = {
  scope: TAX_SCOPE_DECLARATION,
  allowanceMode: TAX_ALLOWANCE_MODE,
} as const

function assessEquity(overrides: { fundSaleGain?: number; vorabpauschaleIncome?: number; openingLossCarryforward?: number; allowanceAvailable?: number } = {}) {
  return assessCapitalIncomeTax({
    fundSaleGain: 0,
    vorabpauschaleIncome: 0,
    openingLossCarryforward: 0,
    incomeClass: 'equity-fund',
    ...SCOPE,
    ...overrides,
  })
}

describe('assessCapitalIncomeTax: hand-computed cases', () => {
  it('taxes an equity-fund gain plus VP after 30% Teilfreistellung and full allowance', () => {
    // Gross 10,000 + 1,000 = 11,000 → ×0.7 = 7,700 → −1,000 allowance = 6,700 base.
    // Abgeltung 6,700 × 0.25 = 1,675; Soli 1,675 × 0.055 = 92.125; total 1,767.125.
    const result = assessEquity({ fundSaleGain: 10_000, vorabpauschaleIncome: 1_000 })
    expect(result.taxableWithdrawal).toBeCloseTo(7_700, 9)
    expect(result.sparerpauschbetragApplied).toBeCloseTo(1_000, 9)
    expect(result.taxableBase).toBeCloseTo(6_700, 9)
    expect(result.abgeltungsteuer).toBeCloseTo(1_675, 9)
    expect(result.soliditaetszuschlag).toBeCloseTo(92.125, 9)
    expect(result.capitalIncomeTax).toBeCloseTo(1_767.125, 9)
    expect(result.closingLossCarryforward).toBe(0)
    expect(result.closingAllowance).toBe(0)
  })

  it('applies no Teilfreistellung to ordinary bank deposits', () => {
    // 5,000 → no relief → −1,000 allowance = 4,000; Abgeltung 1,000; Soli 55; total 1,055.
    const result = assessCapitalIncomeTax({
      fundSaleGain: 5_000, vorabpauschaleIncome: 0, openingLossCarryforward: 0,
      incomeClass: 'ordinary-deposit', ...SCOPE,
    })
    expect(result.taxableWithdrawal).toBeCloseTo(5_000, 9)
    expect(result.capitalIncomeTax).toBeCloseTo(1_055, 9)
  })

  it('offsets an existing loss carryforward before the allowance', () => {
    // 10,000 × 0.7 = 7,000 − 5,000 loss = 2,000 − 1,000 allowance = 1,000 base.
    // Tax 1,000 × 0.25 × 1.055 = 263.75.
    const result = assessEquity({ fundSaleGain: 10_000, openingLossCarryforward: 5_000 })
    expect(result.taxableBase).toBeCloseTo(1_000, 9)
    expect(result.sparerpauschbetragApplied).toBeCloseTo(1_000, 9)
    expect(result.capitalIncomeTax).toBeCloseTo(263.75, 9)
    expect(result.closingLossCarryforward).toBe(0)
  })

  it('carries a loss larger than income forward and leaves the allowance untouched', () => {
    // 5,000 × 0.7 = 3,500 − 10,000 loss = −6,500 → no base, no tax, no allowance used.
    const result = assessEquity({ fundSaleGain: 5_000, openingLossCarryforward: 10_000 })
    expect(result.taxableWithdrawal).toBeCloseTo(3_500, 9)
    expect(result.taxableBase).toBe(0)
    expect(result.capitalIncomeTax).toBe(0)
    expect(result.sparerpauschbetragApplied).toBe(0)
    expect(result.closingLossCarryforward).toBeCloseTo(6_500, 9)
    expect(result.closingAllowance).toBeCloseTo(1_000, 9)
  })

  it('deducts realized fund losses symmetrically (70%) into the carryforward', () => {
    // (−5,000 + 1,000) × 0.7 = −2,800 → closing loss 2,800, no tax.
    const result = assessEquity({ fundSaleGain: -5_000, vorabpauschaleIncome: 1_000 })
    expect(result.capitalIncomeTax).toBe(0)
    expect(result.closingLossCarryforward).toBeCloseTo(2_800, 9)
  })

  it('taxes Vorabpauschale income on its own after Teilfreistellung', () => {
    // 2,000 × 0.7 = 1,400 − 1,000 allowance = 400; tax 400 × 0.25 × 1.055 = 105.5.
    const result = assessEquity({ vorabpauschaleIncome: 2_000 })
    expect(result.taxableWithdrawal).toBeCloseTo(1_400, 9)
    expect(result.capitalIncomeTax).toBeCloseTo(105.5, 9)
  })

  it('returns zero tax with zero income and consumes no allowance', () => {
    const result = assessEquity()
    expect(result.capitalIncomeTax).toBe(0)
    expect(result.taxableWithdrawal).toBe(0)
    expect(result.sparerpauschbetragApplied).toBe(0)
    expect(result.closingLossCarryforward).toBe(0)
    expect(result.closingAllowance).toBeCloseTo(1_000, 9)
  })

  it('taxes the full base when no allowance is left', () => {
    // 10,000 × 0.7 = 7,000 base; Abgeltung 1,750; Soli 96.25; total 1,846.25.
    const result = assessEquity({ fundSaleGain: 10_000, allowanceAvailable: 0 })
    expect(result.sparerpauschbetragApplied).toBe(0)
    expect(result.capitalIncomeTax).toBeCloseTo(1_846.25, 9)
  })

  it('consumes a partial allowance exactly', () => {
    // 2,000 × 0.7 = 1,400 − 300 allowance = 1,100; tax 1,100 × 0.25 × 1.055 = 290.125.
    const result = assessEquity({ fundSaleGain: 2_000, allowanceAvailable: 300 })
    expect(result.sparerpauschbetragApplied).toBeCloseTo(300, 9)
    expect(result.capitalIncomeTax).toBeCloseTo(290.125, 9)
    expect(result.closingAllowance).toBe(0)
  })

  it('uses the statutory 25% rate plus 5.5% Soli on the base', () => {
    expect(ABGELTUNGSTEUER_RATE).toBe(0.25)
    expect(SOLIDARITAETSZUSCHLAG_RATE).toBe(0.055)
    expect(SPARERPAUSCHBETRAG_SINGLE).toBe(1_000)
    const result = assessEquity({ fundSaleGain: 1_000 / 0.7 })
    // Base after full allowance: 1,000 − 1,000 = 0 → zero tax exactly at the kink.
    expect(result.taxableBase).toBeCloseTo(0, 9)
    expect(result.capitalIncomeTax).toBe(0)
  })
})

describe('scope declaration', () => {
  it('rejects anything outside the single-person scope and allowance mode', () => {
    expect(() => createTaxState({ scope: 'couple-joint' as never, allowanceMode: TAX_ALLOWANCE_MODE })).toThrow()
    expect(() => createTaxState({ scope: TAX_SCOPE_DECLARATION, allowanceMode: 'joint-2000' as never })).toThrow()
    expect(() => assessEquity({ fundSaleGain: 100 })).not.toThrow()
    expect(() => assessCapitalIncomeTax({
      fundSaleGain: 100, vorabpauschaleIncome: 0, openingLossCarryforward: 0,
      incomeClass: 'equity-fund', scope: 'other' as never, allowanceMode: TAX_ALLOWANCE_MODE,
    })).toThrow()
  })

  it('starts with zero loss unless an opening carryforward is declared', () => {
    expect(createTaxState({ ...SCOPE }).lossCarryforward).toBe(0)
    expect(createTaxState({ ...SCOPE, openingLossCarryforward: 250 }).lossCarryforward).toBe(250)
  })
})

describe('year rollforward', () => {
  it('threads only the loss across years; the allowance resets annually', () => {
    const opened = createTaxState({ ...SCOPE })
    // Year 1: 5,000 × 0.7 = 3,500 − 10,000 loss → closing loss 6,500, allowance untouched.
    const year1 = assessYearTax({ ...opened, lossCarryforward: 10_000 }, { fundSaleGain: 5_000, vorabpauschaleIncome: 0, incomeClass: 'equity-fund' })
    expect(year1.result.closingLossCarryforward).toBeCloseTo(6_500, 9)
    expect(year1.nextState.lossCarryforward).toBeCloseTo(6_500, 9)
    // Year 2 inherits the loss but gets a fresh 1,000 allowance (never refunded, never carried).
    expect(year1.nextState.allowanceAnnual).toBe(1_000)
    const year2 = assessYearTax(year1.nextState, { fundSaleGain: 20_000, vorabpauschaleIncome: 0, incomeClass: 'equity-fund' })
    // 20,000 × 0.7 = 14,000 − 6,500 = 7,500 − 1,000 = 6,500 base; tax 6,500 × 0.25 × 1.055 = 1,714.375.
    expect(year2.result.taxableBase).toBeCloseTo(6_500, 9)
    expect(year2.result.capitalIncomeTax).toBeCloseTo(1_714.375, 9)
    expect(year2.nextState.lossCarryforward).toBe(0)
  })
})

describe('scaledSparerpauschbetrag (slice 1b: inflation-scaled allowance)', () => {
  it('scales the 1,000 EUR base by the cumulative inflation factor', () => {
    expect(scaledSparerpauschbetrag(1)).toBeCloseTo(1_000, 9)
    expect(scaledSparerpauschbetrag(1.1)).toBeCloseTo(1_100, 9)
    expect(scaledSparerpauschbetrag(1.02 ** 3)).toBeCloseTo(1_000 * 1.02 ** 3, 9)
    expect(scaledSparerpauschbetrag(0)).toBe(0)
  })

  it('assesses a hand-computed gain with the scaled allowance (factor 1.1)', () => {
    // 2,000 × 0.7 = 1,400 − 1,100 (scaled) = 300 base.
    // Abgeltung 75; Soli 4.125; total 79.125.
    const result = assessEquity({ fundSaleGain: 2_000, allowanceAvailable: scaledSparerpauschbetrag(1.1) })
    expect(result.taxableWithdrawal).toBeCloseTo(1_400, 9)
    expect(result.sparerpauschbetragApplied).toBeCloseTo(1_100, 9)
    expect(result.taxableBase).toBeCloseTo(300, 9)
    expect(result.abgeltungsteuer).toBeCloseTo(75, 9)
    expect(result.soliditaetszuschlag).toBeCloseTo(4.125, 9)
    expect(result.capitalIncomeTax).toBeCloseTo(79.125, 9)
    expect(result.closingAllowance).toBeCloseTo(0, 9)
  })

  it('taxes a rebalancing-style gain plus VP with Teilfreistellung and scaled allowance', () => {
    // Rebalancing gain 8,000, no VP, loss 0, allowance 1,050 (factor 1.05):
    // 8,000 × 0.7 = 5,600 − 1,050 = 4,550 base; tax 4,550 × 0.25 × 1.055 = 1,200.0625.
    const result = assessEquity({ fundSaleGain: 8_000, allowanceAvailable: scaledSparerpauschbetrag(1.05) })
    expect(result.taxableWithdrawal).toBeCloseTo(5_600, 9)
    expect(result.capitalIncomeTax).toBeCloseTo(1_200.0625, 9)
  })

  it('offsets a carryforward before the scaled allowance (rebalancing interplay)', () => {
    // 8,000 × 0.7 = 5,600 − 4,000 loss = 1,600 − 1,050 = 550 base.
    // Tax 550 × 0.25 × 1.055 = 145.0625.
    const result = assessEquity({ fundSaleGain: 8_000, openingLossCarryforward: 4_000, allowanceAvailable: scaledSparerpauschbetrag(1.05) })
    expect(result.taxableBase).toBeCloseTo(550, 9)
    expect(result.capitalIncomeTax).toBeCloseTo(145.0625, 9)
    expect(result.closingLossCarryforward).toBe(0)
  })

  it('carries a loss larger than income forward with the scaled allowance untouched', () => {
    // 2,000 × 0.7 = 1,400 − 5,000 loss = −3,600 → closing loss 3,600, no tax.
    const result = assessEquity({ fundSaleGain: 2_000, openingLossCarryforward: 5_000, allowanceAvailable: scaledSparerpauschbetrag(1.1) })
    expect(result.capitalIncomeTax).toBe(0)
    expect(result.sparerpauschbetragApplied).toBe(0)
    expect(result.closingLossCarryforward).toBeCloseTo(3_600, 9)
    expect(result.closingAllowance).toBeCloseTo(1_100, 9)
  })

  it('creates scaled allowance states via inflationFactor', () => {
    expect(createTaxState({ ...SCOPE }).allowanceAnnual).toBe(1_000)
    expect(createTaxState({ ...SCOPE, inflationFactor: 1.1 }).allowanceAnnual).toBeCloseTo(1_100, 9)
    expect(createTaxState({ ...SCOPE, allowanceAnnual: 1_050 }).allowanceAnnual).toBe(1_050)
  })
})

describe('allowance shared across accumulation and retirement years (scaled per year)', () => {
  it('threads the loss while each year gets its fresh scaled allowance', () => {
    // Year A (accumulation, factor 1.02 → 1,020): loss-making sale feeds the carryforward.
    // (−5,000) × 0.7 = −3,500 → closing loss 3,500, allowance untouched.
    const stateA = createTaxState({ ...SCOPE, inflationFactor: 1.02 })
    const yearA = assessYearTax(stateA, { fundSaleGain: -5_000, vorabpauschaleIncome: 0, incomeClass: 'equity-fund' })
    expect(yearA.result.capitalIncomeTax).toBe(0)
    expect(yearA.result.closingLossCarryforward).toBeCloseTo(3_500, 9)
    expect(yearA.result.closingAllowance).toBeCloseTo(1_020, 9)
    // Year B (retirement, factor 1.05 → 1,050) inherits the loss, gets a fresh scaled allowance.
    // 8,000 × 0.7 = 5,600 − 3,500 = 2,100 − 1,050 = 1,050 base; tax 1,050 × 0.25 × 1.055 = 276.9375.
    const stateB = { ...yearA.nextState, allowanceAnnual: scaledSparerpauschbetrag(1.05) }
    const yearB = assessYearTax(stateB, { fundSaleGain: 8_000, vorabpauschaleIncome: 0, incomeClass: 'equity-fund' })
    expect(yearB.result.taxableBase).toBeCloseTo(1_050, 9)
    expect(yearB.result.sparerpauschbetragApplied).toBeCloseTo(1_050, 9)
    expect(yearB.result.capitalIncomeTax).toBeCloseTo(276.9375, 9)
    expect(yearB.nextState.lossCarryforward).toBe(0)
  })
})

describe('disclosures', () => {
  it('lists Kirchensteuer, Günstigerprüfung and the planning approximations', () => {
    const joined = taxDisclosures.join(' ')
    expect(joined).toMatch(/Kirchensteuer/)
    expect(joined).toMatch(/Günstigerprüfung/)
    expect(joined).toMatch(/Planungsnäherung/)
  })

  it('states the inflation-scaled base as a planning assumption and covers Umschichtung', () => {
    const joined = taxDisclosures.join(' ')
    expect(joined).toMatch(/1\.000 EUR.*skaliert|Basis 1\.000 EUR/)
    expect(joined).toMatch(/gesetzlich nominal/)
    expect(joined).toMatch(/Umschichtung/)
    expect(joined).not.toMatch(/ohne Inflationsanpassung/)
    expect(joined).not.toMatch(/außerhalb der Entnahmefinanzierung/)
  })
})
