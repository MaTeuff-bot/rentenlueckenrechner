// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { taxCauseLabel } from '../YearlyTable'
import { accumulationTaxNoun, capitalTaxTitleSuffix, retirementTaxNoun } from '../SummaryCards'
import type { YearlyPeriodRow } from '../../model/types'

function row(overrides: Partial<YearlyPeriodRow> & { phase: 'accumulation' | 'retirement' }): YearlyPeriodRow {
  return {
    yearIndex: 0,
    ageStart: 67,
    ageEnd: 68,
    inflationFactor: 1,
    nominalReturnRate: 0,
    openingCapital: 100_000,
    investmentReturn: 0,
    capitalBeforeCashflow: 100_000,
    contribution: 0,
    desiredSpending: 0,
    retirementIncome: 0,
    retirementIncomeGross: 0,
    retirementIncomeDeductions: 0,
    retirementIncomeOtherDeductions: 0,
    healthInsurance: 0,
    careInsurance: 0,
    portfolioContributionBase: 0,
    retirementIncomeNet: 0,
    surplusIncome: 0,
    gapWithdrawal: 0,
    gapWithdrawalToday: 0,
    closingCapital: 0,
    closingCapitalToday: 0,
    depleted: false,
    unfundedWithdrawal: 0,
    ...overrides,
  } as YearlyPeriodRow
}

function detailedAssessment(fundGain: number, vorabpauschale: number, bankInterest: number) {
  return {
    bankInterest,
    receivedVorabpauschale: vorabpauschale,
    sale: { adjustedFundSaleGain: fundGain },
    movement: { adjustedFundSaleGain: 0 },
  } as unknown as YearlyPeriodRow['capitalAssessment']
}

describe('taxCauseLabel: bank-only rows must not imply fund sales', () => {
  it('labels bank-only retirement tax as Zinsen', () => {
    const taxed = row({ phase: 'retirement', capitalIncomeTax: 263.75, capitalAssessment: detailedAssessment(0, 0, 2_000) })
    expect(taxCauseLabel(taxed)).toBe('Zinsen')
  })

  it('labels bank-only accumulation tax as Zinsen', () => {
    const taxed = row({ phase: 'accumulation', capitalIncomeTax: 100, capitalAssessment: detailedAssessment(0, 0, 800) })
    expect(taxCauseLabel(taxed)).toBe('Zinsen')
  })

  it('labels mixed rows with both causes', () => {
    const retirement = row({ phase: 'retirement', capitalIncomeTax: 100, capitalAssessment: detailedAssessment(1_000, 500, 800) })
    expect(taxCauseLabel(retirement)).toBe('Entnahme + Zinsen')
    const accumulation = row({ phase: 'accumulation', capitalIncomeTax: 100, capitalAssessment: detailedAssessment(1_000, 0, 800) })
    expect(taxCauseLabel(accumulation)).toBe('Umschichtung + Zinsen')
  })

  it('labels fund-only rows without overclaiming interest', () => {
    const retirement = row({ phase: 'retirement', capitalIncomeTax: 100, capitalAssessment: detailedAssessment(1_000, 500, 0) })
    expect(taxCauseLabel(retirement)).toBe('Entnahme')
    const accumulation = row({ phase: 'accumulation', capitalIncomeTax: 100, capitalAssessment: detailedAssessment(1_000, 0, 0) })
    expect(taxCauseLabel(accumulation)).toBe('Umschichtung')
  })

  it('keeps scalar rows on the withdrawal-only approximation', () => {
    const taxed = row({ phase: 'retirement', capitalIncomeTax: 100 })
    expect(taxCauseLabel(taxed)).toBe('Entnahme')
    const untaxed = row({ phase: 'retirement', capitalIncomeTax: 0, capitalAssessment: detailedAssessment(0, 0, 2_000) })
    expect(taxCauseLabel(untaxed)).toBe('—')
  })
})

describe('summary tax scope: only actually present causes are named', () => {
  it('titles bank-only detailed results without fund causes', () => {
    const rows = [row({ phase: 'retirement', capitalIncomeTax: 263.75, capitalAssessment: detailedAssessment(0, 0, 2_000) })]
    expect(capitalTaxTitleSuffix(rows, true)).toBe(' (Bankzinsen)')
    expect(retirementTaxNoun(rows, true)).toBe('Zinssteuer')
  })

  it('titles mixed detailed results with the full scope', () => {
    const rows = [row({ phase: 'retirement', capitalIncomeTax: 100, capitalAssessment: detailedAssessment(1_000, 0, 800) })]
    expect(capitalTaxTitleSuffix(rows, true)).toBe(' (Entnahme, Umschichtung, Bankzinsen)')
    expect(retirementTaxNoun(rows, true)).toBe('Entnahmesteuer (einschließlich Bankzinsen)')
  })

  it('does not overclaim interest for fund-only detailed results', () => {
    const rows = [row({ phase: 'retirement', capitalIncomeTax: 100, capitalAssessment: detailedAssessment(1_000, 0, 0) })]
    expect(capitalTaxTitleSuffix(rows, true)).toBe(' (Entnahme, Umschichtung)')
    expect(retirementTaxNoun(rows, true)).toBe('Entnahmesteuer')
    const acc = [row({ phase: 'accumulation', capitalIncomeTax: 100, capitalAssessment: detailedAssessment(1_000, 0, 0) })]
    expect(accumulationTaxNoun(acc, true)).toBe('Umschichtungssteuer')
  })

  it('labels bank-only accumulation rows as interest-only', () => {
    const acc = [row({ phase: 'accumulation', capitalIncomeTax: 100, capitalAssessment: detailedAssessment(0, 0, 800) })]
    expect(accumulationTaxNoun(acc, true)).toBe('Zinssteuer')
    expect(capitalTaxTitleSuffix(acc, true)).toBe(' (Bankzinsen)')
  })

  it('keeps scalar wording unchanged', () => {
    const rows = [row({ phase: 'retirement', capitalIncomeTax: 100 })]
    expect(capitalTaxTitleSuffix(rows, false)).toBe(' Entnahme + Umschichtung')
    expect(retirementTaxNoun(rows, false)).toBe('Entnahmesteuer')
    expect(accumulationTaxNoun(rows, false)).toBe('Umschichtungssteuer')
  })
})
