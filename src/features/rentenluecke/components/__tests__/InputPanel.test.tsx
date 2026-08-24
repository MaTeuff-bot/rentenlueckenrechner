// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
  FIXED_INFLATION_SOURCE_ID,
} from '../../model/historicalReturns'
import { DEFAULT_INPUT } from '../../model/defaults'
import { DEFAULT_ASSET_ALLOCATION } from '../../model/stochasticReturns'
import type { InputFieldName } from '../../model/inputSchema'
import { createDefaultPortfolioBuckets } from '../../model/portfolioBuckets'
import { InputPanel } from '../InputPanel'

function inputById(id: string): HTMLInputElement {
  const input = document.getElementById(id)

  expect(input).toBeInstanceOf(HTMLInputElement)

  return input as HTMLInputElement
}

function renderInputPanel(
  historical: {
    inflationSourceId: string
  } = {
    inflationSourceId: DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
  },
  options: { allocationError?: string; onReset?: () => void; syntheticCash?: boolean } = {},
) {
  const buckets = createDefaultPortfolioBuckets(DEFAULT_INPUT.currentCapital, DEFAULT_ASSET_ALLOCATION)
  if (options.syntheticCash) {
    const cash = buckets.find((bucket) => bucket.id === 'fixed')
    if (cash) cash.returnSeriesId = 'synthetic-cash-assumption-v1'
  }
  render(
    <InputPanel
      input={DEFAULT_INPUT}
      allocation={DEFAULT_ASSET_ALLOCATION}
      portfolioBuckets={buckets}
      historical={historical}
      historicalValidYears={Array.from({ length: 71 }, (_, index) => 1950 + index)}
      errors={{}}
      allocationError={options.allocationError ?? null}
      portfolioBucketError={null}
      onChange={vi.fn<(field: InputFieldName, value: number) => void>()}
      onPortfolioBucketChange={vi.fn()}
      onPortfolioBucketAdd={vi.fn()}
      onPortfolioBucketRemove={vi.fn()}
      onInflationSourceChange={vi.fn<(sourceId: string) => void>()}
      onReset={options.onReset ?? vi.fn()}
    />,
  )
}

describe('InputPanel return source UX', () => {
  it('shows bundled ETF metadata without offering ETFs as return sources', () => {
    renderInputPanel()

    expect(screen.getByRole('group', { name: 'ETF-Steckbriefe' })).toBeInTheDocument()
    expect(screen.getByText('iShares MSCI ACWI UCITS ETF USD (Acc)')).toBeInTheDocument()
    expect(screen.getByText('iShares MSCI EM UCITS ETF USD (Acc)')).toBeInTheDocument()
    expect(screen.getByText(/weder auswählbare Renditequellen noch mit Portfolio-Anlagen verknüpft/)).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /IUSQ|EUNM/ })).not.toBeInTheDocument()
  })

  it('renders selected source details with source, license, and caveat information', () => {
    renderInputPanel()

    expect(screen.getByRole('group', { name: 'Ausgewählte Quellen im Detail' })).toBeInTheDocument()
    expect(screen.getAllByText('Jorda-Schularick-Taylor Macrohistory Database R.6').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/CC BY-NC-SA 4\.0; nicht für kommerzielle Nutzung freigegeben/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('ETF/EUR-Proxy').length).toBeGreaterThan(0)
    expect(screen.getByText('Bundesbank time series sourced to Federal Statistical Office, Wiesbaden')).toBeInTheDocument()
    expect(screen.getByText('CPI-Jahresproxy')).toBeInTheDocument()
  })

  it('shows the mixed-source note conditionally for selected synthetic and historical sources', () => {
    renderInputPanel()

    expect(screen.queryByText(/Gemischte Quellen/)).not.toBeInTheDocument()

    renderInputPanel(undefined, { syntheticCash: true })

    expect(screen.getByText(/Gemischte Quellen/)).toBeInTheDocument()
    expect(screen.getByText(/synthetische Anlagen ziehen separat/)).toBeInTheDocument()
  })

  it('explains the bootstrap method with stable user-visible phrases', () => {
    renderInputPanel()

    fireEvent.click(screen.getByText('Methode und Grenzen'))

    expect(screen.getAllByText(/mit Zurücklegen/).length).toBeGreaterThan(0)
    expect(screen.getByText(/kein Backtest/)).toBeInTheDocument()
    expect(screen.getByText(/keine Prognose/)).toBeInTheDocument()
    expect(screen.getByText(/nicht die exakte Rendite eines bestimmten ETF/)).toBeInTheDocument()
  })

  it('does not render provisional fixture sources in the dropdowns', () => {
    renderInputPanel()

    const options = screen.getAllByRole('option')

    expect(options.length).toBeGreaterThan(0)
    for (const option of options) {
      expect(option).not.toHaveTextContent(/Provisorisch|fixture|provisional/i)
      expect((option as HTMLOptionElement).value).not.toMatch(/fixture|provisional/i)
    }
  })

  it('shows synthetic return sources as per-asset options', () => {
    renderInputPanel()

    expect(screen.getAllByRole('option', { name: 'Aktien — Synthetisch: Aktien (7 % Erwartung, 18 % Volatilität)' })).toHaveLength(3)
    expect(screen.getAllByRole('option', { name: 'Anleihen — Synthetisch: Anleihen (3 % Erwartung, 7 % Volatilität)' })).toHaveLength(3)
    expect(screen.getAllByRole('option', { name: 'Cash — Synthetisch: Cash (2 % Erwartung, 1 % Volatilität)' })).toHaveLength(3)
  })

  it('shows one inflation source selector without nominal return inputs', () => {
    renderInputPanel()

    expect(screen.getByRole('group', { name: 'Inflation' })).toBeInTheDocument()
    expect(screen.getByLabelText('Inflationsquelle')).toHaveDisplayValue('Historisch: Deutschland CPI Inflation, 1950-2020')
    expect(screen.getByText(/Zahlungsströme in heutiger Kaufkraft/)).toBeInTheDocument()
    expect(screen.getByText(/CPI-Jahrespfad zusätzlich mit den gezogenen Kalenderjahren synchronisiert/)).toBeInTheDocument()
    expect(screen.queryByText(/synchronisiert nur die gezogenen Kalenderjahre/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Inflation pro Jahr')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Interner Planwert vor Rentenbeginn')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Interner Planwert im Ruhestand')).not.toBeInTheDocument()
  })

  it('shows the fixed percent input only for manual inflation', () => {
    renderInputPanel({
      inflationSourceId: FIXED_INFLATION_SOURCE_ID,
    })

    expect(screen.getByLabelText('Inflationsquelle')).toHaveDisplayValue('Manuell: feste Inflation (2 %)')
    expect(inputById('annualInflationRate')).toBeInTheDocument()
  })

  it('renders allocation errors and delegates reset without running a scenario', () => {
    const onReset = vi.fn()

    renderInputPanel(undefined, {
      allocationError: 'Die Aufteilung muss zusammen 100 % ergeben.',
      onReset,
    })

    expect(screen.getAllByText('Die Aufteilung muss zusammen 100 % ergeben.')).not.toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Eingaben zurücksetzen' }))
    expect(onReset).toHaveBeenCalledOnce()
  })
})
