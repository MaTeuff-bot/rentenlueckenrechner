// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
  DEFAULT_HISTORICAL_RETURN_SERIES_IDS,
  FIXED_INFLATION_SOURCE_ID,
} from '../../model/historicalReturns'
import { DEFAULT_INPUT } from '../../model/defaults'
import { DEFAULT_ASSET_ALLOCATION, type AssetClassKey } from '../../model/stochasticReturns'
import type { InputFieldName } from '../../model/inputSchema'
import { InputPanel } from '../InputPanel'

function inputById(id: string): HTMLInputElement {
  const input = document.getElementById(id)

  expect(input).toBeInstanceOf(HTMLInputElement)

  return input as HTMLInputElement
}

function renderInputPanel(
  historical: {
    returnSeriesIds: {
      equity: string
      bond: string
      cash: string
    }
    inflationSourceId: string
    manualCashRealReturn: number
  } = {
    returnSeriesIds: { ...DEFAULT_HISTORICAL_RETURN_SERIES_IDS },
    inflationSourceId: DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
    manualCashRealReturn: 0,
  },
) {
  render(
    <InputPanel
      input={DEFAULT_INPUT}
      allocation={DEFAULT_ASSET_ALLOCATION}
      historical={historical}
      historicalValidYears={Array.from({ length: 71 }, (_, index) => 1950 + index)}
      errors={{}}
      allocationError={null}
      onChange={vi.fn<(field: InputFieldName, value: number) => void>()}
      onAllocationChange={vi.fn<(field: AssetClassKey, value: number) => void>()}
      onHistoricalReturnSeriesChange={vi.fn()}
      onManualCashRealReturnChange={vi.fn<(value: number) => void>()}
      onInflationSourceChange={vi.fn<(sourceId: string) => void>()}
      onReset={vi.fn()}
    />,
  )
}

describe('InputPanel return source UX', () => {
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

    renderInputPanel({
      returnSeriesIds: {
        equity: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.equity,
        bond: DEFAULT_HISTORICAL_RETURN_SERIES_IDS.bond,
        cash: 'synthetic-cash-assumption-v1',
      },
      inflationSourceId: DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
      manualCashRealReturn: 0,
    })

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

  it('shows one inflation source selector without nominal return inputs', () => {
    renderInputPanel()

    expect(screen.getByRole('group', { name: 'Inflation' })).toBeInTheDocument()
    expect(screen.getByLabelText('Inflationsquelle')).toHaveDisplayValue('Historisch: Deutschland CPI Inflation, 1950-2020')
    expect(screen.getByText(/Zahlungsströme in heutiger Kaufkraft/)).toBeInTheDocument()
    expect(screen.getByText(/Umwandlung realer historischer oder manueller Renditen/)).toBeInTheDocument()
    expect(screen.queryByText(/synchronisiert nur die gezogenen Kalenderjahre/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Inflation pro Jahr')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Nominale Rendite vor Rentenbeginn')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Nominale Rendite im Ruhestand')).not.toBeInTheDocument()
  })

  it('shows the fixed percent input only for manual inflation', () => {
    renderInputPanel({
      returnSeriesIds: { ...DEFAULT_HISTORICAL_RETURN_SERIES_IDS },
      inflationSourceId: FIXED_INFLATION_SOURCE_ID,
      manualCashRealReturn: 0,
    })

    expect(screen.getByLabelText('Inflationsquelle')).toHaveDisplayValue('Manuell: feste Inflation (2 %)')
    expect(inputById('annualInflationRate')).toBeInTheDocument()
  })
})
