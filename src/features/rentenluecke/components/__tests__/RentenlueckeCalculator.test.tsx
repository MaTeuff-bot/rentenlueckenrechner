// @vitest-environment jsdom

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
  it('renders core result, simulation, table, and assumptions content by default', () => {
    render(<RentenlueckeCalculator />)

    expect(screen.getByRole('heading', { name: 'Ergebnis' })).toBeInTheDocument()
    expect(screen.getAllByText(/Benötigtes Kapital zum Rentenbeginn/)).not.toHaveLength(0)
    expect(screen.getByRole('heading', { name: 'Kapitalverlauf und Überlebenswahrscheinlichkeit' })).toBeInTheDocument()
    expect(screen.getByText(/1\.000 Verläufe/)).toBeInTheDocument()
    expect(screen.getAllByText(/heutiger Kaufkraft/).length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Kapital logarithmisch skalieren')).toBeInTheDocument()
    expect(screen.getByText('P50')).toBeInTheDocument()
    expect(screen.getByText('Planwert')).toBeInTheDocument()
    expect(screen.getByText('Band: P10–P90')).toBeInTheDocument()
    expect(screen.getByText('Linie: P50')).toBeInTheDocument()
    expect(screen.getByText('Gestrichelt: Planwert')).toBeInTheDocument()
    expect(screen.getByText('Risiko: Kapital aufgebraucht')).toBeInTheDocument()
    expect(screen.getByText('Simulationen sind Näherungen, keine Prognosen.')).toBeInTheDocument()
    expect(screen.getByText('Methodik & Grenzen')).toBeInTheDocument()
    expect(screen.getByText(/höchstens\s*20 %/)).toBeInTheDocument()
    expect(screen.getByText('Bis Planungshorizont')).toBeInTheDocument()
    expect(screen.getByText('Aufbrauchwahrscheinlichkeit')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Inflation' })).toBeInTheDocument()
    expect(screen.getByLabelText('Inflationsquelle')).toHaveDisplayValue('Historisch: Deutschland CPI Inflation, 1950-2020')
    expect(screen.getByText(/CPI-Jahrespfad zusätzlich mit den gezogenen Kalenderjahren synchronisiert/)).toBeInTheDocument()
    expect(screen.queryByLabelText('Inflation pro Jahr')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Interner Planwert vor Rentenbeginn')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Interner Planwert im Ruhestand')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Jahrestabelle' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Annahmen und Hinweise' })).toBeInTheDocument()
    expect(screen.queryByText('Synthetische Annahmen')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Historischer Jahres-Bootstrap')).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Renditequellen je Anlageklasse' })).toBeInTheDocument()
    expect(screen.getByText(/Die Simulation mischt ganze Kalenderjahre/)).toBeInTheDocument()
  }, 20000)

  it('labels bootstrap results as percentiles instead of a deterministic draw', () => {
    render(<RentenlueckeCalculator />)

    expect(screen.getByText(/Median-Kapital zum Rentenbeginn \(P50\)/)).toBeInTheDocument()
    expect(screen.getByText(/Historische Quellen ziehen Jahre mit Zurücklegen aus 1950-2020/)).toBeInTheDocument()
    expect(screen.getAllByText(/kein Backtest eines konkreten Kalenderzeitraums/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Planwert-Ledger mit Erwartungswert der ausgewählten Quellen/)).toBeInTheDocument()
    expect(screen.queryByText('Deterministisch')).not.toBeInTheDocument()
  })

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

  it('shows the allocation error and hides calculated outputs when allocation no longer sums to 100 percent', () => {
    render(<RentenlueckeCalculator />)

    fireEvent.change(inputById('allocation-equity'), { target: { value: '60' } })

    expect(screen.getAllByText('Die Aufteilung muss zusammen 100 % ergeben.')).not.toHaveLength(0)
    expect(screen.getByRole('status')).toHaveTextContent('Die Aufteilung muss zusammen 100 % ergeben.')
    expect(screen.queryByRole('heading', { name: 'Ergebnis' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Kapitalverlauf und Überlebenswahrscheinlichkeit' })).not.toBeInTheDocument()
  })

  it('restores defaults after editing an input and resetting', () => {
    render(<RentenlueckeCalculator />)

    const currentCapital = inputById('currentCapital')
    fireEvent.change(currentCapital, { target: { value: '123456' } })
    expect(currentCapital).toHaveValue(123456)

    fireEvent.click(screen.getByRole('button', { name: 'Eingaben zurücksetzen' }))

    expect(inputById('currentCapital')).toHaveValue(50000)
    expect(screen.getByRole('heading', { name: 'Ergebnis' })).toBeInTheDocument()
  })
})
