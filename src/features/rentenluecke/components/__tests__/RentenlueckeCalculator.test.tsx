// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StochasticSettings } from '../../model/stochasticReturns'
import type { RentenlueckeInput } from '../../model/types'
import { RentenlueckeCalculator } from '../RentenlueckeCalculator'

vi.mock('recharts', () => {
  const Container = ({ children }: PropsWithChildren) => <div>{children}</div>
  const Empty = () => null

  return {
    Area: Empty,
    CartesianGrid: Empty,
    ComposedChart: Container,
    Legend: Empty,
    Line: Empty,
    LineChart: Container,
    ReferenceLine: Empty,
    ResponsiveContainer: Container,
    Tooltip: Empty,
    XAxis: Empty,
    YAxis: Empty,
  }
})

vi.mock('../../model/stochasticReturns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../model/stochasticReturns')>()
  const { simulateScenario } = await import('../../model/simulateScenario')

  return {
    ...actual,
    runStochasticSimulation: (input: RentenlueckeInput, settings: StochasticSettings) => {
      const result = simulateScenario(input)

      return {
        simulations: settings.simulations,
        successProbability: 1,
        rows: result.rows.map((row) => ({
          ageStart: row.ageStart,
          ageEnd: row.ageEnd,
          deterministicCapitalToday: row.closingCapitalToday,
          p10CapitalToday: row.closingCapitalToday,
          p50CapitalToday: row.closingCapitalToday,
          p90CapitalToday: row.closingCapitalToday,
          depletionProbability: row.depleted ? 1 : 0,
        })),
      }
    },
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
    expect(screen.getAllByText('Benötigtes Kapital zum Rentenbeginn')).not.toHaveLength(0)
    expect(screen.getByRole('heading', { name: 'Kapitalverlauf und Überlebenswahrscheinlichkeit' })).toBeInTheDocument()
    expect(screen.getByText(/1\.000 Verläufe/)).toBeInTheDocument()
    expect(screen.getAllByText(/heutiger Kaufkraft/).length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Kapital logarithmisch skalieren')).toBeInTheDocument()
    expect(screen.getByText(/höchstens\s*20 %/)).toBeInTheDocument()
    expect(screen.getByText('Bis Planungshorizont')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Jahrestabelle' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Annahmen und Hinweise' })).toBeInTheDocument()
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
