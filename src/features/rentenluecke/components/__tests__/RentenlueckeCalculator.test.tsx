// @vitest-environment jsdom
import { automaticInsurance, completedCoverage } from '../../model/__tests__/insuranceFixtures'
import { createDefaultState } from '../../hooks/scenarioState/defaults'
import { createInitialLifecycleMilestones } from '../../model/lifecycleDraft'
import { serializeScenarioState, STORAGE_KEY } from '../../hooks/scenarioState/persistence'

import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  state.retirementIncomeStreams = state.retirementIncomeStreams.map(stream => ({ ...stream, support: 'standard' }))
  state.lifecycleClassification = { equity: 'equityFund', bonds: 'bondFund', fixed: 'deposit' }
  state.lifecycleAcquisitionCost = { equity: 0, bonds: 0 }
  state.lifecycleTaxCashId = 'fixed'
  state.historical.inflationSourceId = 'fixed-manual'
  const created = createInitialLifecycleMilestones(65, state.input.retirementAge, state.portfolioBuckets, state.lifecycleClassification)
  state.lifecycleMilestones = created.milestones
  state.lifecycleTransitions = created.transitions
  localStorage.setItem(STORAGE_KEY, serializeScenarioState(state))
})

function inputById(id: string): HTMLInputElement {
  const input = document.getElementById(id)

  expect(input).toBeInstanceOf(HTMLInputElement)

  return input as HTMLInputElement
}

describe('RentenlueckeCalculator', () => {
  it('renders the single lifecycle results path after completed setup', async () => {
    render(<RentenlueckeCalculator />)

    expect(screen.getByRole('heading', { name: /^Ergebnis/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Lebenszyklus-Ergebnis/ })).toBeInTheDocument()
    expect(screen.getByText(/Vermögensverlauf Lebenszyklus/)).toBeInTheDocument()
    expect(screen.queryByText(/Kapitalverlauf und Überlebenswahrscheinlichkeit/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Benötigtes Kapital zum Rentenbeginn/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Jährliche Abrechnung anzeigen'))
    expect(screen.getByText(/Jahrestabelle Lebenszyklus/)).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Entnahme gedeckt' })).toBeInTheDocument()
    fireEvent.click(screen.getByText('Benötigtes Kapital berechnen'))
    expect(await screen.findByText(/Keine Kapitalzahl/, {}, { timeout: 10000 })).toBeInTheDocument()
    expect(screen.getByText(/kein Bypass/)).toBeInTheDocument()
  }, 30000)

  it('shows lifecycle yearly rows with spending adequacy and after-liquidation wealth from the common ledger', () => {
    render(<RentenlueckeCalculator />)

    fireEvent.click(screen.getByText('Jährliche Abrechnung anzeigen'))

    expect(screen.getByRole('columnheader', { name: 'Entnahme gedeckt' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Entnahme ungedeckt' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Steuer laufend' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'KV/PV gezahlt' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Schlusswert' })).toBeInTheDocument()
    expect(screen.getByText(/Nach Abwicklung real/)).toBeInTheDocument()
    expect(screen.getByText(/Offene Steuerverbindlichkeiten/)).toBeInTheDocument()
  }, 30000)

  it('shows validation state for an invalid age and hides calculated outputs', () => {
    render(<RentenlueckeCalculator />)

    const currentAge = inputById('currentAge')
    fireEvent.change(currentAge, { target: { value: '-1' } })

    expect(screen.getByText('Muss mindestens 0 sein.')).toBeInTheDocument()
    expect(currentAge).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText(/Deine Prognose ist noch offen/)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /^Ergebnis/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Jahrestabelle' })).not.toBeInTheDocument()
  })
  it('updates the derived total, allocation, and result from a bucket value', () => {
    render(<RentenlueckeCalculator />)

    expect(document.getElementById('currentCapital')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Portfolio-Zusammenfassung')).toHaveTextContent('Gesamtwert: 50.000')
    fireEvent.change(inputById('portfolio-value-equity'), { target: { value: '40000' } })
    expect(screen.getByLabelText('Portfolio-Zusammenfassung')).toHaveTextContent('Gesamtwert: 55.000')
    expect(screen.getByLabelText('Portfolio-Zusammenfassung')).toHaveTextContent('Aktien 72,7 %')
    expect(screen.getByRole('heading', { name: /^Ergebnis/ })).toBeInTheDocument()
  })

  it('hides results for an empty portfolio', () => {
    render(<RentenlueckeCalculator />)

    for (const button of screen.getAllByRole('button', { name: /entfernen$/ }).filter(button => !button.getAttribute('aria-label')?.includes('Rente'))) fireEvent.click(button)
    expect(screen.getAllByText(/Gesamtwert des Portfolios muss größer als 0/).length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: /^Ergebnis/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Jahrestabelle' })).not.toBeInTheDocument()
  })

  it('edits, adds, and removes retirement income streams', () => {
    render(<RentenlueckeCalculator />)

    expect(screen.getAllByText(/Rentenbescheid/)).not.toHaveLength(0)
    const amount = inputById('retirement-income-amount-statutory-pension')
    fireEvent.change(amount, { target: { value: '2200' } })
    expect(amount).toHaveValue(2200)

    const deduction = inputById('retirement-income-deduction-statutory-pension')
    fireEvent.change(deduction, { target: { value: '20' } })
    expect(deduction).toHaveValue(20)
    expect(screen.getByRole('heading', { name: /^Ergebnis/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '+ Einkommen hinzufügen' }))
    expect(screen.getByLabelText('Name von Weiteres Einkommen')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Weiteres Einkommen entfernen' }))
    expect(screen.queryByLabelText('Name von Weiteres Einkommen')).not.toBeInTheDocument()
  }, 20000)
})

it('requires answers on clean load, announces the owned reset, and dismisses its notice persistently', () => {
  localStorage.clear()
  localStorage.setItem('rentenlueckenrechner.scenario.v12', 'old')
  localStorage.setItem('unrelated', 'keep')
  const { unmount } = render(<RentenlueckeCalculator />)
  expect(screen.getByText(/bisherigen Eingaben wurden/)).toBeVisible()
  expect(screen.getByRole('heading', { name: /^Ergebnis/ })).toBeInTheDocument()
  expect(screen.getByText(/Deine Prognose ist noch offen/)).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: 'Hinweis schließen' }))
  expect(localStorage.getItem('unrelated')).toBe('keep')
  unmount()
  render(<RentenlueckeCalculator />)
  expect(screen.queryByText(/bisherigen Eingaben wurden/)).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: /^Ergebnis/ })).toBeInTheDocument()
})
