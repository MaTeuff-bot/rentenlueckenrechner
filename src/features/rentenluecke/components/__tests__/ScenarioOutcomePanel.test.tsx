// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ScenarioOutcomePanel } from '../ScenarioOutcomePanel'
import type { LifeTableSex } from '../../mortality/mortality'
import type { StochasticSimulationSummary } from '../../model/stochasticReturns'
import type { SimulationResult, YearlyPeriodRow } from '../../model/types'

vi.mock('../ScenarioOutcomeChart', () => ({
  ScenarioOutcomeChart: () => null,
}))

function yearlyRow(ageStart: number): YearlyPeriodRow {
  return {
    yearIndex: ageStart - 40,
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

function fixture(): { result: SimulationResult; stochasticSummary: StochasticSimulationSummary } {
  const rows = Array.from({ length: 60 }, (_, index) => yearlyRow(40 + index))
  const stochasticRows = rows.map((row) => ({
    ageStart: row.ageStart,
    ageEnd: row.ageEnd,
    planCapitalToday: 100_000,
    p10CapitalToday: 80_000,
    p50CapitalToday: 100_000,
    p90CapitalToday: 120_000,
    depletionProbability: 0,
  }))
  return {
    result: {
      rows,
      accumulationRows: [],
      retirementRows: rows,
      summary: {
        annualGapToday: 0,
        monthlyGapToday: 0,
        projectedCapitalAtRetirement: 0,
        requiredCapitalAtRetirement: 0,
        capitalShortfallAtRetirement: 0,
        capitalSurplusAtRetirement: 0,
        depletionAge: null,
        depletionAgeEnd: null,
        survivesUntilPlanningAge: true,
      },
    },
    stochasticSummary: { simulations: 1000, successProbability: 1, rows: stochasticRows },
  }
}

function riskGridText(): string {
  return screen.getByLabelText('Aufbrauchrisiko nach Überlebenswahrscheinlichkeit').textContent ?? ''
}

describe('ScenarioOutcomePanel life table sex', () => {
  it('renders the conservative display for Keine Angabe and respects the persisted selection', () => {
    const { result, stochasticSummary } = fixture()
    const renderPanel = (lifeTableSex: LifeTableSex) => (
      <ScenarioOutcomePanel
        result={result}
        stochasticSummary={stochasticSummary}
        historicalValidYears={[1950]}
        lifeTableSex={lifeTableSex}
      />
    )
    const { rerender } = render(renderPanel('conservative'))
    const conservativeText = riskGridText()
    expect(conservativeText).toContain('Alter')

    rerender(renderPanel('female'))
    expect(riskGridText()).toBe(conservativeText)

    rerender(renderPanel('male'))
    expect(riskGridText()).not.toBe(conservativeText)
  })

  it('keeps the Geschlecht select out of the chart as a single editing home', () => {
    const { result, stochasticSummary } = fixture()
    render(
      <ScenarioOutcomePanel
        result={result}
        stochasticSummary={stochasticSummary}
        historicalValidYears={[1950]}
        lifeTableSex="conservative"
      />,
    )

    expect(screen.queryByLabelText('Geschlecht für Sterbetafel')).not.toBeInTheDocument()
  })
})
