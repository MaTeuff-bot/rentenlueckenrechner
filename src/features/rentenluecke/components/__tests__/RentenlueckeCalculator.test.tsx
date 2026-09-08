// @vitest-environment jsdom
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
})

function inputById(id: string): HTMLInputElement {
  const input = document.getElementById(id)

  expect(input).toBeInstanceOf(HTMLInputElement)

  return input as HTMLInputElement
}

describe('RentenlueckeCalculator', () => {
  it('renders core result, simulation, table, and assumptions content by default', async () => {
    render(<RentenlueckeCalculator />)

    expect(screen.getByRole('heading', { name: 'Ergebnis' })).toBeInTheDocument()
    expect(screen.getAllByText(/Benötigtes Kapital zum Rentenbeginn/)).not.toHaveLength(0)
    expect(screen.getByRole('heading', { name: 'Kapitalverlauf und Überlebenswahrscheinlichkeit' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Jahrestabelle' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Annahmen und Hinweise' })).toBeInTheDocument()
    expect(screen.getByText(/netto verfügbare Konsumausgaben in heutiger Kaufkraft/)).toBeInTheDocument()
    expect(screen.getAllByText(/Rentenbescheid/)).not.toHaveLength(0)
    expect(screen.getAllByText(/behandelt ihn als Bruttobetrag in heutiger Kaufkraft/)).not.toHaveLength(0)
    expect(screen.getByText(/Versicherungsstatus und den Einkommensarten/)).toBeInTheDocument()
    expect(screen.getByText(/keine Steuer- oder Sozialversicherungsberatung oder -berechnung/)).toBeInTheDocument()
  }, 20000)

  it('shows auditable gross-to-net retirement cashflows in the yearly table', () => {
    render(<RentenlueckeCalculator />)

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
    expect(screen.getByRole('status')).toHaveTextContent('Bitte korrigiere die markierten Eingaben')
    expect(screen.queryByRole('heading', { name: 'Ergebnis' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Jahrestabelle' })).not.toBeInTheDocument()
  })
  it('updates the derived total, allocation, and result from a bucket value', () => {
    render(<RentenlueckeCalculator />)

    expect(document.getElementById('currentCapital')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Portfolio-Zusammenfassung')).toHaveTextContent('Gesamtwert: 50.000')
    fireEvent.change(inputById('portfolio-value-equity'), { target: { value: '40000' } })
    expect(screen.getByLabelText('Portfolio-Zusammenfassung')).toHaveTextContent('Gesamtwert: 55.000')
    expect(screen.getByLabelText('Portfolio-Zusammenfassung')).toHaveTextContent('Aktien 72,7 %')
    expect(screen.getByRole('heading', { name: 'Ergebnis' })).toBeInTheDocument()
  })

  it('hides results for an empty portfolio', () => {
    render(<RentenlueckeCalculator />)

    for (const button of screen.getAllByRole('button', { name: /entfernen$/ })) fireEvent.click(button)
    expect(screen.getByRole('status')).toHaveTextContent('Gesamtwert des Portfolios muss größer als 0')
    expect(screen.queryByRole('heading', { name: 'Ergebnis' })).not.toBeInTheDocument()
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
    expect(screen.getByRole('heading', { name: 'Ergebnis' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '+ Einkommen hinzufügen' }))
    expect(screen.getByLabelText('Name von Weiteres Einkommen')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Weiteres Einkommen entfernen' }))
    expect(screen.queryByLabelText('Name von Weiteres Einkommen')).not.toBeInTheDocument()
  }, 20000)
})

it('wires manual insurance decisions through persistence into the displayed ledger', () => {
  const state = createDefaultState()
  state.input = { ...state.input, currentAge: 67, retirementAge: 67, planningAge: 68 }
  state.retirementIncomeStreams = [{ ...state.retirementIncomeStreams[0], amountMonthlyToday: 1000, effectiveDeductionRate: 0.2 }]
  localStorage.setItem(STORAGE_KEY, serializeScenarioState(state))
  render(<RentenlueckeCalculator />)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Geführte manuelle GKV-/PV-Schätzung aktivieren' }))
  expect(screen.getByRole('alert')).toHaveTextContent('KV/PV-Schätzung unvollständig')
  fireEvent.change(screen.getByLabelText('Mein angegebener Versicherungsstatus im Ruhestand'), { target: { value: 'kvdr' } })
  fireEvent.click(screen.getByRole('button', { name: /Gesamtabzug für Gesetzliche Rente geprüft:/ }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Details anzeigen' }))
  expect(screen.getByRole('columnheader', { name: 'KV-Eigenbeitrag' })).toBeInTheDocument()
  expect(screen.getByRole('columnheader', { name: 'PV-Eigenbeitrag' })).toBeInTheDocument()
  expect(screen.getByRole('columnheader', { name: 'Sonstige Abzüge ohne KV/PV' })).toBeInTheDocument()
  expect(screen.getByRole('cell', { name: '1.050 €' })).toBeInTheDocument()
  expect(screen.getByRole('cell', { name: '432 €' })).toBeInTheDocument()
  expect(screen.getByRole('cell', { name: '10.518 €' })).toBeInTheDocument()
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
  expect(saved.input.retirementInsurance).toMatchObject({ enabled: true, status: 'kvdr' })
  expect(saved.retirementIncomeStreams[0]).toMatchObject({ effectiveDeductionRate: 0.2, separateDeductions: { otherRate: 0 } })
}, 20000)
