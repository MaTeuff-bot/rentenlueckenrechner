// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
  DEFAULT_HISTORICAL_RETURN_SERIES_IDS,
} from '../../model/historicalReturns'
import { DEFAULT_ASSET_ALLOCATION } from '../../model/stochasticReturns'
import { DEFAULT_INPUT } from '../../model/defaults'
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
    expect(screen.getByText('P50 mittlerer Verlauf')).toBeInTheDocument()
    expect(screen.getByText('Planwert mit Erwartungswert der Auswahl')).toBeInTheDocument()
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

  it('shows synthetic return sources as per-asset options', () => {
    render(<RentenlueckeCalculator />)

    expect(screen.getByRole('option', { name: 'Synthetisch: Aktien (7 % Erwartung, 18 % Volatilität)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Synthetisch: Anleihen (3 % Erwartung, 7 % Volatilität)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Synthetisch: Cash (2 % Erwartung, 1 % Volatilität)' })).toBeInTheDocument()
  })

  it('migrates v3 synthetic mode to synthetic asset return sources', () => {
    localStorage.setItem(
      'rentenlueckenrechner.scenario.v3',
      JSON.stringify({
        version: 3,
        input: DEFAULT_INPUT,
        allocation: DEFAULT_ASSET_ALLOCATION,
        returnModel: 'synthetic',
        historical: {
          returnSeriesIds: {
            equity: 'jst-r6-developed-equal-weight-equity-real-post1950',
            bond: 'jst-r6-developed-equal-weight-bonds-real-post1950',
            cash: 'jst-r6-developed-equal-weight-bills-real-post1950',
          },
          inflationSeriesId: DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
          manualCashRealReturn: 0,
        },
      }),
    )

    render(<RentenlueckeCalculator />)

    expect(screen.getByDisplayValue('Synthetisch: Aktien (7 % Erwartung, 18 % Volatilität)')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Synthetisch: Anleihen (3 % Erwartung, 7 % Volatilität)')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Synthetisch: Cash (2 % Erwartung, 1 % Volatilität)')).toBeInTheDocument()
    expect(screen.getByLabelText('Inflationsquelle')).toHaveDisplayValue('Manuell: feste Inflation (2 %)')
    expect(inputById('annualInflationRate')).toBeInTheDocument()
  })

  it('migrates old provisional fixture ids to production defaults', () => {
    localStorage.setItem(
      'rentenlueckenrechner.scenario.v4',
      JSON.stringify({
        version: 4,
        input: DEFAULT_INPUT,
        allocation: DEFAULT_ASSET_ALLOCATION,
        historical: {
          returnSeriesIds: {
            equity: 'fixture-global-equity-eur-provisional',
            bond: 'fixture-eur-bonds-provisional',
            cash: 'fixture-eur-cash-provisional',
          },
          inflationSeriesId: 'fixture-de-eur-inflation-provisional',
          manualCashRealReturn: 0,
        },
      }),
    )

    render(<RentenlueckeCalculator />)

    expect(screen.getByDisplayValue('Historisch: Aktien, entwickelte Märkte')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Historisch: Staatsanleihen, entwickelte Märkte')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Historisch: Bills/Cash, entwickelte Märkte')).toBeInTheDocument()
    expect(screen.getByLabelText('Inflationsquelle')).toHaveDisplayValue('Historisch: Deutschland CPI Inflation, 1950-2020')
    expect(screen.queryByText(/Provisorisch|fixture|provisional/i)).not.toBeInTheDocument()
  })

  it('falls back to the production CPI default for unknown persisted inflation sources', () => {
    localStorage.setItem(
      'rentenlueckenrechner.scenario.v5',
      JSON.stringify({
        version: 5,
        input: DEFAULT_INPUT,
        allocation: DEFAULT_ASSET_ALLOCATION,
        historical: {
          returnSeriesIds: { ...DEFAULT_HISTORICAL_RETURN_SERIES_IDS },
          inflationSourceId: 'missing-inflation-source',
          manualCashRealReturn: 0,
        },
      }),
    )

    render(<RentenlueckeCalculator />)

    expect(screen.getByLabelText('Inflationsquelle')).toHaveDisplayValue('Historisch: Deutschland CPI Inflation, 1950-2020')
  })

  it('preserves v3 historical manual Cash selections during migration', () => {
    localStorage.setItem(
      'rentenlueckenrechner.scenario.v3',
      JSON.stringify({
        version: 3,
        input: DEFAULT_INPUT,
        allocation: DEFAULT_ASSET_ALLOCATION,
        returnModel: 'historicalAnnualBootstrap',
        historical: {
          returnSeriesIds: {
            equity: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity,
            bond: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.bond,
            cash: 'manual-fixed-real',
          },
          inflationSeriesId: DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
          manualCashRealReturn: 0.01,
        },
      }),
    )

    render(<RentenlueckeCalculator />)

    expect(screen.getByDisplayValue('Cash: fester Realzins')).toBeInTheDocument()
    expect(inputById('manualCashRealReturn')).toHaveValue(1)
  })

  it('migrates v2 synthetic scenarios to synthetic asset return sources', () => {
    localStorage.setItem(
      'rentenlueckenrechner.scenario.v2',
      JSON.stringify({
        version: 2,
        input: DEFAULT_INPUT,
        allocation: DEFAULT_ASSET_ALLOCATION,
      }),
    )

    render(<RentenlueckeCalculator />)

    expect(screen.getByDisplayValue('Synthetisch: Aktien (7 % Erwartung, 18 % Volatilität)')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Synthetisch: Anleihen (3 % Erwartung, 7 % Volatilität)')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Synthetisch: Cash (2 % Erwartung, 1 % Volatilität)')).toBeInTheDocument()
    expect(screen.getByLabelText('Inflationsquelle')).toHaveDisplayValue('Manuell: feste Inflation (2 %)')
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
