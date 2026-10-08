// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SummaryCards } from '../SummaryCards'
import { formatApproxCurrency } from '../format'
import type { StochasticSimulationSummary } from '../../model/stochasticReturns'
import type { SimulationResult, YearlyPeriodRow } from '../../model/types'

function yearlyRow(ageStart: number): YearlyPeriodRow {
  return {
    yearIndex: ageStart - 67,
    ageStart,
    ageEnd: ageStart + 1,
    phase: 'retirement',
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
    closingCapital: 100_000,
    closingCapitalToday: 100_000,
    depleted: false,
    unfundedWithdrawal: 0,
  }
}

function fixture(p50CapitalToday: number, stochasticAgeStart: number): {
  result: SimulationResult
  stochasticSummary: StochasticSimulationSummary
} {
  const retirementRows = [yearlyRow(67), yearlyRow(68)]
  const rows = [...retirementRows]
  const result: SimulationResult = {
    rows,
    accumulationRows: [],
    retirementRows,
    summary: {
      annualGapToday: 6000,
      monthlyGapToday: 500,
      projectedCapitalAtRetirement: 88888,
      depletionAge: null,
      depletionAgeEnd: null,
      survivesUntilPlanningAge: true,
    },
  }
  const stochasticSummary: StochasticSimulationSummary = {
    simulations: 1000,
    successProbability: 0.8,
    rows: [
      {
        ageStart: stochasticAgeStart,
        ageEnd: stochasticAgeStart + 1,
        planCapitalToday: 99999,
        p10CapitalToday: 80000,
        p50CapitalToday,
        p90CapitalToday: 150000,
        depletionProbability: 0.2,
      },
    ],
  }
  return { result, stochasticSummary }
}

describe('SummaryCards median P50', () => {
  it('renders direct p50CapitalToday without plan conversion or fallback', () => {
    const { result, stochasticSummary } = fixture(123456, 67)
    render(<SummaryCards result={result} stochasticSummary={stochasticSummary} />)

    const label = screen.getByText(/Median-Kapital zum Rentenbeginn/)
    const article = label.closest('article')
    expect(article).not.toBeNull()
    const strong = article!.querySelector('strong')
    expect(strong).not.toBeNull()
    expect(strong!.textContent).toBe(formatApproxCurrency(123456))
    expect(strong!.textContent).not.toBe(formatApproxCurrency(99999))
    expect(strong!.textContent).not.toBe(formatApproxCurrency(88888))
  })

  it('keeps median and gap cards neutrally styled without threshold coloring', () => {
    const { result, stochasticSummary } = fixture(123456, 67)
    const { container } = render(<SummaryCards result={result} stochasticSummary={stochasticSummary} />)

    expect(container.querySelectorAll('.warning-card').length).toBe(0)
    expect(container.querySelectorAll('.success-card').length).toBe(0)
    const medianArticle = screen.getByText(/Median-Kapital zum Rentenbeginn/).closest('article')
    const gapArticle = screen.getByText(/Monatliche Netto-Rentenlücke/).closest('article')
    expect(medianArticle?.className).toContain('result-card')
    expect(medianArticle?.className).not.toContain('warning-card')
    expect(medianArticle?.className).not.toContain('success-card')
    expect(gapArticle?.className).toContain('result-card')
    expect(gapArticle?.className).not.toContain('warning-card')
    expect(gapArticle?.className).not.toContain('success-card')
  })

  it('omits only the median card when the retirement percentile row is missing', () => {
    const { result, stochasticSummary } = fixture(123456, 70)
    render(<SummaryCards result={result} stochasticSummary={stochasticSummary} />)

    expect(screen.queryByText(/Median-Kapital zum Rentenbeginn/)).not.toBeInTheDocument()
    expect(screen.getByText(/Monatliche Netto-Rentenlücke/)).toBeInTheDocument()
  })
})
