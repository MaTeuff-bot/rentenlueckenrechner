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
  it('renders core result, simulation, table, and assumptions content by default', async () => {
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
  it('updates the derived total, allocation, and result from a bucket value', () => {
    render(<RentenlueckeCalculator />)

    expect(document.getElementById('currentCapital')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Portfolio-Zusammenfassung')).toHaveTextContent('Gesamtwert: 50.000')
    fireEvent.change(inputById('portfolio-value-equity'), { target: { value: '40000' } })
    expect(screen.getByLabelText('Portfolio-Zusammenfassung')).toHaveTextContent('Gesamtwert: 55.000')
    expect(screen.getByLabelText('Portfolio-Zusammenfassung')).toHaveTextContent('Aktien 72,7 %')
    expect(screen.getByRole('heading', { name: 'Ergebnis' })).toBeInTheDocument()
  })

  it('adds, retypes, and removes a bucket', () => {
    render(<RentenlueckeCalculator />)

    fireEvent.click(screen.getByRole('button', { name: /Anlage hinzufügen/ }))
    const newName = screen.getByDisplayValue('Neue Anlage')
    const newRow = newName.closest('.portfolio-bucket') as HTMLElement
    fireEvent.change(newRow.querySelector('input[type="number"]') as HTMLInputElement, { target: { value: '10000' } })
    fireEvent.change(newRow.querySelector('select') as HTMLSelectElement, { target: { value: 'cash' } })
    expect(screen.getByLabelText('Portfolio-Zusammenfassung')).toHaveTextContent('Cash 25 %')
    fireEvent.click(screen.getByRole('button', { name: 'Neue Anlage entfernen' }))
    expect(screen.queryByDisplayValue('Neue Anlage')).not.toBeInTheDocument()
  })

  it('hides results for an empty portfolio', () => {
    render(<RentenlueckeCalculator />)

    for (const button of screen.getAllByRole('button', { name: /entfernen$/ })) fireEvent.click(button)
    expect(screen.getByRole('status')).toHaveTextContent('Gesamtwert des Portfolios muss größer als 0')
    expect(screen.queryByRole('heading', { name: 'Ergebnis' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Jahrestabelle' })).not.toBeInTheDocument()
  })
})
