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
    expect(screen.getByRole('heading', { name: 'Jahrestabelle' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Annahmen und Hinweise' })).toBeInTheDocument()
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

  it('shows the allocation error and hides calculated outputs when allocation no longer sums to 100 percent', () => {
    render(<RentenlueckeCalculator />)

    fireEvent.change(inputById('allocation-equity'), { target: { value: '60' } })

    expect(screen.getAllByText('Die Aufteilung muss zusammen 100 % ergeben.')).not.toHaveLength(0)
    expect(screen.getByRole('status')).toHaveTextContent('Die Aufteilung muss zusammen 100 % ergeben.')
    expect(screen.queryByRole('heading', { name: 'Ergebnis' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Kapitalverlauf und Überlebenswahrscheinlichkeit' })).not.toBeInTheDocument()
  })
})
