// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { automaticInsurance, completedCoverage } from '../../model/__tests__/insuranceFixtures'
import { createDefaultState } from '../../hooks/scenarioState/defaults'
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
  state.input = { ...state.input, currentAge: 65, planningAge: 70, retirementInsurance: automaticInsurance() }
  state.retirementIncomeStreams = state.retirementIncomeStreams.map((stream) => ({ ...stream, support: 'standard' }))
  localStorage.setItem(STORAGE_KEY, serializeScenarioState(state))
})

describe('results-to-inputs linking', () => {
  it('routes required-capital and spending results to their owning inputs', () => {
    render(<RentenlueckeCalculator />)

    const requiredLink = screen.getByRole('link', { name: 'Benötigtes Kapital anpassen: Vermögen bearbeiten' })
    expect(requiredLink).toHaveAttribute('href', '#portfolio-add')
    fireEvent.click(requiredLink)
    expect(screen.getByRole('tab', { name: /Vermögen/ })).toHaveAttribute('aria-selected', 'true')
    expect(document.getElementById('input-tabpanel-vermoegen')).toBeVisible()
    expect(document.activeElement).toBe(document.getElementById('portfolio-add'))

    const spendingLink = screen.getByRole('link', { name: 'Gewünschte Ausgaben anpassen: Ausgaben bearbeiten' })
    expect(spendingLink).toHaveAttribute('href', '#monthlyDesiredSpendingToday')
    fireEvent.click(spendingLink)
    expect(screen.getByRole('tab', { name: /Persönlicher Plan/ })).toHaveAttribute('aria-selected', 'true')
    expect(document.getElementById('monthlyDesiredSpendingToday')).toBeVisible()
    expect(document.activeElement).toBe(document.getElementById('monthlyDesiredSpendingToday'))
  }, 20000)

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
  }, 20000)
})
