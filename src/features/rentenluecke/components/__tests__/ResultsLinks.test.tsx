// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { automaticInsurance, completedCoverage } from '../../model/__tests__/insuranceFixtures'
import { SYNTHETIC_RETURN_SERIES_IDS } from '../../model/historicalReturns'
import { createDefaultState, createSyntheticHistoricalState } from '../../hooks/scenarioState/defaults'
import { serializeScenarioState, STORAGE_KEY } from '../../hooks/scenarioState/persistence'
import { RentenlueckeCalculator } from '../RentenlueckeCalculator'

vi.mock('recharts', () => {
  const Container = ({ children }: PropsWithChildren) => <div>{children}</div>
  const Empty = () => null
  const Named = ({ name }: { name?: string }) => (name ? <span>{name}</span> : null)
  return {
    Area: Named,
    CartesianGrid: Empty,
    ComposedChart: Container,
    Legend: Empty,
    Line: Named,
    LineChart: Container,
    ReferenceLine: Empty,
    ResponsiveContainer: Container,
    Tooltip: Empty,
    XAxis: Empty,
    YAxis: Empty,
  }
})

afterEach(() => {
  localStorage.clear()
})

beforeEach(() => {
  localStorage.clear()
  const state = createDefaultState()
  state.insuranceCoverageAnswers = completedCoverage()
  state.childrenAnswer = { kind: 'children', rows: [{ id: 'older', year: 1980 }] }
  state.input = { ...state.input, currentAge: 65, retirementAge: 65, planningAge: 68, retirementInsurance: automaticInsurance() }
  state.retirementIncomeStreams = state.retirementIncomeStreams.map((stream) => ({ ...stream, support: 'standard' }))
  // Mandatory detailed portfolio: fund-only synthetic setup with fixed inflation
  // keeps the forecast deterministic and free of the honest bank-path rejection.
  state.historical = createSyntheticHistoricalState()
  state.portfolioBuckets = [{ id: 'fund', name: 'Fonds', value: 100000, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity, holding: 'accumulating-equity-fund' }]
  state.portfolioEstimatorSettings = { fundAcquisitionCost: 0, projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true }
  localStorage.setItem(STORAGE_KEY, serializeScenarioState(state))
})

describe('results-to-inputs linking', () => {
  it('routes median-capital, work-end and spending results to their owning inputs', () => {
    render(<RentenlueckeCalculator />)

    const savingsLink = screen.getByRole('link', { name: 'Sparrate anpassen: Vermögen bearbeiten' })
    expect(savingsLink).toHaveAttribute('href', '#monthlyContributionToday')
    fireEvent.click(savingsLink)
    expect(screen.getByRole('tab', { name: /Vermögen/ })).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(document.getElementById('monthlyContributionToday'))

    const workEndLink = screen.getByRole('link', { name: 'Zeitplan anpassen: Rentenalter bearbeiten' })
    expect(workEndLink).toHaveAttribute('href', '#retirementAge')
    fireEvent.click(workEndLink)
    expect(screen.getByRole('tab', { name: /Persönlicher Plan/ })).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(document.getElementById('retirementAge'))

    const spendingLink = screen.getByRole('link', { name: 'Gewünschte Ausgaben anpassen: Ausgaben bearbeiten' })
    expect(spendingLink).toHaveAttribute('href', '#monthlyDesiredSpendingToday')
    fireEvent.click(spendingLink)
    expect(screen.getByRole('tab', { name: /Persönlicher Plan/ })).toHaveAttribute('aria-selected', 'true')
    expect(document.getElementById('monthlyDesiredSpendingToday')).toBeVisible()
    expect(document.activeElement).toBe(document.getElementById('monthlyDesiredSpendingToday'))
  })

  it('routes timeline and capital-trajectory results to Zeitplan and Vermögen', () => {
    render(<RentenlueckeCalculator />)

    const savingsLink = screen.getByRole('link', { name: 'Sparrate anpassen: Vermögen bearbeiten' })
    expect(savingsLink).toHaveAttribute('href', '#monthlyContributionToday')
    fireEvent.click(savingsLink)
    expect(screen.getByRole('tab', { name: /Vermögen/ })).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(document.getElementById('monthlyContributionToday'))

    const horizonLink = screen.getByRole('link', { name: 'Zeitplan anpassen: Planungshorizont bearbeiten' })
    expect(horizonLink).toHaveAttribute('href', '#planningAge')
    fireEvent.click(horizonLink)
    expect(screen.getByRole('tab', { name: /Persönlicher Plan/ })).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(document.getElementById('planningAge'))

    const trajectoryLink = screen.getByRole('link', { name: 'Kapitalverlauf anpassen: Vermögen bearbeiten' })
    expect(trajectoryLink).toHaveAttribute('href', '#portfolio-add')
    fireEvent.click(trajectoryLink)
    expect(screen.getByRole('tab', { name: /Vermögen/ })).toHaveAttribute('aria-selected', 'true')
    expect(document.activeElement).toBe(document.getElementById('portfolio-add'))
  })
})
