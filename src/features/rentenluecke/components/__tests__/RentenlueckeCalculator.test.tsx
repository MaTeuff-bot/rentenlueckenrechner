// @vitest-environment jsdom
import { automaticInsurance } from '../../model/__tests__/insuranceFixtures'
import { createDefaultState } from '../../hooks/scenarioState/defaults'
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
  state.childrenAnswer = { kind: 'children', rows: [{ id: 'older', year: 1980 }] }
  state.input = { ...state.input, currentAge: 65, planningAge: 70, retirementInsurance: automaticInsurance() }
  state.retirementIncomeStreams = state.retirementIncomeStreams.map(stream => ({ ...stream, support: 'standard' }))
  localStorage.setItem(STORAGE_KEY, serializeScenarioState(state))
})

function inputById(id: string): HTMLInputElement {
  const input = document.getElementById(id)

  expect(input).toBeInstanceOf(HTMLInputElement)

  return input as HTMLInputElement
}

describe('RentenlueckeCalculator', () => {
  it('renders core results after completed setup', async () => {
    render(<RentenlueckeCalculator />)

    expect(screen.getByRole('heading', { name: /^Ergebnis/ })).toBeInTheDocument()
    expect(screen.getAllByText(/Benötigtes Kapital zum Rentenbeginn/)).not.toHaveLength(0)
    expect(screen.getByRole('heading', { name: 'Kapitalverlauf und Überlebenswahrscheinlichkeit' })).toBeInTheDocument()
    fireEvent.click(screen.getByText('Jährliche Abrechnung anzeigen'))
    fireEvent.click(screen.getByText('Rechenannahmen', { exact: false, selector: 'summary' }))
    expect(screen.getByRole('heading', { name: 'Jahrestabelle' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Annahmen und Hinweise' })).toBeInTheDocument()
    expect(screen.getByText(/netto verfügbare Konsumausgaben in heutiger Kaufkraft/)).toBeInTheDocument()
    expect(screen.getAllByText(/Rentenbescheid/)).not.toHaveLength(0)
    expect(screen.getAllByText(/behandelt ihn als Bruttobetrag in heutiger Kaufkraft/)).not.toHaveLength(0)
    expect(screen.getByText(/Versicherungsstatus und den Einkommensarten/)).toBeInTheDocument()
    expect(screen.getByText(/Sozialversicherungsberatung und kein Beitragsbescheid/)).toBeInTheDocument()
  }, 20000)

  it('shows auditable gross-to-net retirement cashflows in the yearly table', () => {
    render(<RentenlueckeCalculator />)

    fireEvent.click(screen.getByText('Jährliche Abrechnung anzeigen'))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Details anzeigen' }))

    expect(screen.getByRole('columnheader', { name: 'Gewünschte Nettoausgaben' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Einkommen vor Modellabzügen (Brutto + Nettoangaben)' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Abzüge gesamt' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Verfügbarer Netto-Cashflow' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Entnahmelücke' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Konsumierter Überschuss' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Entnahme für Nettolücke' })).toBeInTheDocument()
    expect(screen.getAllByRole('cell', { name: '0 €' }).length).toBeGreaterThan(0)
  }, 20000)

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
