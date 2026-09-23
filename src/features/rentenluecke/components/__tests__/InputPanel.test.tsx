// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_HISTORICAL_INFLATION_SERIES_ID,
  FIXED_INFLATION_SOURCE_ID,
} from '../../model/historicalReturns'
import { DEFAULT_INPUT } from '../../model/defaults'
import { DEFAULT_ASSET_ALLOCATION } from '../../model/stochasticReturns'
import type { InputFieldName } from '../../model/inputSchema'
import { createDefaultPortfolioBuckets } from '../../model/portfolioBuckets'
import { createDefaultRetirementIncomeStreams } from '../../model/retirementIncomeStreams'
import { createDefaultRetirementInsurance } from '../../model/retirementInsurance'
import { InputPanel } from '../InputPanel'
import { RetirementIncomeStreamsSection } from '../InputPanel/RetirementIncomeStreamsSection'
import { TimelineSection } from '../InputPanel/TimelineSection'
import type { RetirementIncomeStream } from '../../model/types'

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
  options: { allocationError?: string; onReset?: () => void; syntheticCash?: boolean; etfEquity?: boolean } = {},
) {
  const buckets = createDefaultPortfolioBuckets(DEFAULT_INPUT.currentCapital, DEFAULT_ASSET_ALLOCATION)
  if (options.syntheticCash) {
    const cash = buckets.find((bucket) => bucket.id === 'fixed')
    if (cash) cash.returnSeriesId = 'synthetic-cash-assumption-v1'
  }
  if (options.etfEquity) {
    const equity = buckets.find((bucket) => bucket.id === 'equity')
    if (equity) equity.returnSeriesId = 'etf-ie00b6r52259-iusq'
  }
  render(
    <InputPanel
      input={DEFAULT_INPUT}
      allocation={DEFAULT_ASSET_ALLOCATION}
      portfolioBuckets={buckets}
      retirementIncomeStreams={createDefaultRetirementIncomeStreams(DEFAULT_INPUT)}
      historical={historical}
      historicalValidYears={Array.from({ length: 71 }, (_, index) => 1950 + index)}
      errors={{}}
      allocationError={options.allocationError ?? null}
      portfolioBucketError={null}
      onRetirementInsuranceChange={vi.fn()}
      onChange={vi.fn<(field: InputFieldName, value: number) => void>()}
      onPortfolioBucketChange={vi.fn()}
      onPortfolioBucketAdd={vi.fn()}
      onPortfolioBucketRemove={vi.fn()}
      onRetirementIncomeStreamChange={vi.fn()}
      onRetirementIncomeStreamAdd={vi.fn()}
      onRetirementIncomeStreamRemove={vi.fn()}
      onInflationSourceChange={vi.fn<(sourceId: string) => void>()}
      onReset={options.onReset ?? vi.fn()}
    />,
  )
}

describe('InputPanel return source UX', () => {
  it('shows bundled ETF metadata and offers both ETFs as return sources', () => {
    renderInputPanel()
    fireEvent.click(screen.getByRole('tab', { name: /Vermögen/ }))

    expect(screen.queryByText('Ausgewählte ETF-Steckbriefe')).not.toBeInTheDocument()
    expect(screen.queryByText('iShares MSCI ACWI UCITS ETF USD (Acc)')).not.toBeInTheDocument()
    expect(screen.queryByText('iShares MSCI EM UCITS ETF USD (Acc)')).not.toBeInTheDocument()
    expect(screen.getAllByRole('option', { name: /IUSQ\.DE/ }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('option', { name: /EUNM\.DE/ }).length).toBeGreaterThan(0)
    const sourceSelect = screen.getAllByLabelText(/Renditequelle\/Proxy von/)[0]
    expect(within(sourceSelect).getByRole('group', { name: 'ETF-Renditequellen' })).toBeInTheDocument()
    expect(within(sourceSelect).getByRole('group', { name: 'Historische Anlageklassen' })).toBeInTheDocument()
    expect(within(sourceSelect).getByRole('group', { name: 'Synthetische Annahmen' })).toBeInTheDocument()
  })

  it('renders selected source details with source, license, and caveat information', () => {
    renderInputPanel()
    fireEvent.click(screen.getByRole('tab', { name: /Rechenannahmen/ }))

    expect(screen.getByRole('group', { name: 'Quellen und Details' })).toBeInTheDocument()
    expect(screen.getByText('Ausgewählte Quellen im Detail')).toBeInTheDocument()
    expect(screen.getAllByText('Jorda-Schularick-Taylor Macrohistory Database R.6').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/CC BY-NC-SA 4\.0; nicht für kommerzielle Nutzung freigegeben/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('ETF/EUR-Proxy').length).toBeGreaterThan(0)
    expect(screen.getByText('Bundesbank time series sourced to Federal Statistical Office, Wiesbaden')).toBeInTheDocument()
    expect(screen.getByText('CPI-Jahresproxy')).toBeInTheDocument()
    expect(screen.getAllByText('Kostenbehandlung').length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Bucket-Kosten werden jährlich von der Rendite abgezogen/).length).toBeGreaterThan(0)
  })

  it('shows ETF cost treatment and adjusted-close caveats in selected source details', () => {
    renderInputPanel(undefined, { etfEquity: true })
    fireEvent.click(screen.getByRole('tab', { name: /Rechenannahmen/ }))

    expect(screen.getByText('Ausgewählte ETF-Steckbriefe')).toBeInTheDocument()
    expect(screen.getByText('iShares MSCI ACWI UCITS ETF USD (Acc)')).toBeInTheDocument()
    expect(screen.queryByText('iShares MSCI EM UCITS ETF USD (Acc)')).not.toBeInTheDocument()
    expect(screen.getByText(/statische historische EUR-Xetra-Renditen als auswählbare Renditequellen/)).toBeInTheDocument()
    expect(screen.getAllByText(/ETF-TER\/OCF bereits in der Renditequelle berücksichtigt/).length).toBeGreaterThan(0)
    expect(screen.getByText('statischer Datenstand')).toBeInTheDocument()
    expect(screen.getByText('Adjusted Close ≠ Fonds-NAV')).toBeInTheDocument()
    expect(screen.getByText('EUR/Xetra-Marktkurs')).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('tab', { name: /Rechenannahmen/ }))

    fireEvent.click(screen.getByText('Methode und Grenzen'))

    expect(screen.getAllByText(/mit Zurücklegen/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/kein Backtest/).length).toBeGreaterThan(0)
    expect(within(screen.getByRole('tabpanel', { name: /Rechenannahmen/ })).getByText(/keine Prognose/)).toBeInTheDocument()
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
    fireEvent.click(screen.getByRole('tab', { name: /Vermögen/ }))

    expect(screen.getAllByRole('option', { name: 'Aktien — Synthetisch: Aktien (7 % Erwartung, 18 % Volatilität)' })).toHaveLength(3)
    expect(screen.getAllByRole('option', { name: 'Anleihen — Synthetisch: Anleihen (3 % Erwartung, 7 % Volatilität)' })).toHaveLength(3)
    expect(screen.getAllByRole('option', { name: 'Cash — Synthetisch: Cash (2 % Erwartung, 1 % Volatilität)' })).toHaveLength(3)
  })

  it('shows one inflation source selector without nominal return inputs', () => {
    renderInputPanel()
    fireEvent.click(screen.getByRole('tab', { name: /Rechenannahmen/ }))

    expect(screen.getByRole('group', { name: 'Inflation' })).toHaveClass('wide-fieldset')
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
    fireEvent.click(screen.getByRole('tab', { name: /Rechenannahmen/ }))

    expect(screen.getByLabelText('Inflationsquelle')).toHaveDisplayValue('Manuell: feste Inflation (2 %)')
    expect(inputById('annualInflationRate')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Inflation' })).toHaveClass('wide-fieldset')
  })

  it('renders allocation errors and delegates reset without running a scenario', () => {
    const onReset = vi.fn()

    renderInputPanel(undefined, {
      allocationError: 'Die Aufteilung muss zusammen 100 % ergeben.',
      onReset,
    })
    fireEvent.click(screen.getByRole('tab', { name: /Vermögen/ }))

    expect(screen.getAllByText('Die Aufteilung muss zusammen 100 % ergeben.')).not.toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Eingaben zurücksetzen' }))
    expect(onReset).toHaveBeenCalledOnce()
  })

  it('switches task-focused tabs and shows both portfolio blocks on Vermögen', () => {
    renderInputPanel()

    expect(screen.getByRole('tab', { name: /Persönlicher Plan/ })).toHaveAttribute('aria-selected', 'true')
    expect(document.getElementById('zeitplan')).toBeVisible()
    expect(document.getElementById('vermoegen')).not.toBeVisible()

    fireEvent.click(screen.getByRole('tab', { name: /Vermögen/ }))
    expect(screen.getByRole('tab', { name: /Vermögen/ })).toHaveAttribute('aria-selected', 'true')
    expect(document.getElementById('vermoegen')).toBeVisible()
    expect(document.getElementById('zeitplan')).not.toBeVisible()
    expect(screen.getAllByText('Was ich besitze').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Wie ich anlegen will').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('tab', { name: /Rechenannahmen/ }))
    expect(screen.getByRole('group', { name: 'Inflation' })).toBeVisible()
    expect(document.getElementById('vermoegen')).not.toBeVisible()
  })
})

describe('retirement income category selector', () => {
  const baseStream: RetirementIncomeStream = {
    id: 'income',
    name: 'Weiteres Einkommen',
    kind: 'other',
    amountMonthlyToday: 0,
    startAge: 67,
    endAge: null,
    amountBasis: 'net',
    deductionMode: 'none',
    effectiveDeductionRate: 0,
  }

  it('shows German category choices and category-specific caveats', () => {
    render(
      <RetirementIncomeStreamsSection
        streams={[{ ...baseStream, kind: 'rental-income', name: 'Mieteinnahmen' }]}
        onUpdate={vi.fn()}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    const selector = screen.getByLabelText('Kategorie von Mieteinnahmen')
    expect(selector).toHaveDisplayValue('Mieteinnahmen')
    expect(within(selector).getByRole('option', { name: 'Gesetzliche Rente (Standard)' })).toBeInTheDocument()
    expect(within(selector).getByRole('option', { name: 'Gesetzliche Rente (Sonderfall)' })).toBeInTheDocument()
    expect(within(selector).getByRole('option', { name: 'Brückeneinkommen' })).toBeInTheDocument()
    expect(screen.getByText(/Steuern, Leerstand und Instandhaltung werden nicht automatisch berechnet/)).toBeInTheDocument()
  })

  it('keeps changing category guidance below all controls and describes the selector', () => {
    const onUpdate = vi.fn()
    const props = { onUpdate, onAdd: vi.fn(), onRemove: vi.fn() }
    const stream = { ...baseStream, name: 'Meine Rente', amountBasis: 'gross' as const }
    const { rerender } = render(<RetirementIncomeStreamsSection {...props} streams={[stream]} />)
    const selector = screen.getByLabelText('Kategorie von Meine Rente')
    const helper = document.getElementById(selector.getAttribute('aria-describedby')!)!
    expect(helper).toHaveClass('retirement-income-row-note')
    expect(helper).toHaveAttribute('aria-live', 'polite')
    expect(helper.parentElement).toBe(selector.closest('.retirement-income-stream'))
    expect(helper.parentElement?.lastElementChild).toBe(helper)
    expect(helper.previousElementSibling).toBe(screen.getByRole('button', { name: 'Meine Rente entfernen' }))
    expect(selector.closest('label')).not.toContainElement(helper)
    expect(selector).toHaveAccessibleDescription(/Wähle netto oder brutto/)
    expect(screen.getByRole('spinbutton', { name: /Sonstige Abzüge \/ Steuern ohne KV\/PV/ })).toBeInTheDocument()

    fireEvent.change(selector, { target: { value: 'gesetzliche-rente:standard' } })
    expect(onUpdate).toHaveBeenCalledWith('income', { kind: 'gesetzliche-rente', support: 'standard' })
    rerender(<RetirementIncomeStreamsSection {...props} streams={[{ ...stream, kind: 'gesetzliche-rente' }]} />)
    expect(selector).toHaveAccessibleDescription(/Rentenbescheid als Bruttobetrag in heutiger Kaufkraft/)
    expect(helper).not.toHaveTextContent('Wähle netto oder brutto')
    expect(helper.parentElement?.lastElementChild).toBe(helper)
    expect(screen.getByLabelText('Betragsart von Meine Rente')).toHaveValue('gross')
  })

  it('updates a generic default name when the category changes', () => {
    const onUpdate = vi.fn()
    render(
      <RetirementIncomeStreamsSection streams={[baseStream]} onUpdate={onUpdate} onAdd={vi.fn()} onRemove={vi.fn()} />,
    )

    fireEvent.change(screen.getByLabelText('Kategorie von Weiteres Einkommen'), { target: { value: 'side-income' } })

    expect(onUpdate).toHaveBeenCalledWith('income', { kind: 'side-income', name: 'Nebenjob' })
  })

  it('does not overwrite a custom name when the category changes', () => {
    const onUpdate = vi.fn()
    render(
      <RetirementIncomeStreamsSection
        streams={[{ ...baseStream, name: 'Kiosk am Wochenende' }]}
        onUpdate={onUpdate}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Kategorie von Kiosk am Wochenende'), { target: { value: 'side-income' } })

    expect(onUpdate).toHaveBeenCalledWith('income', { kind: 'side-income' })
  })
})

describe('PR C: retirement income restructure', () => {
  const otherStream: RetirementIncomeStream = {
    id: 'income',
    name: 'Weiteres Einkommen',
    kind: 'other',
    amountMonthlyToday: 0,
    startAge: 67,
    endAge: null,
    amountBasis: 'net',
    deductionMode: 'none',
    effectiveDeductionRate: 0,
  }
  const statutoryStream: RetirementIncomeStream = {
    id: 'statutory-pension',
    name: 'Gesetzliche Rente',
    kind: 'gesetzliche-rente',
    support: 'standard',
    amountMonthlyToday: 2000,
    startAge: 67,
    endAge: null,
    amountBasis: 'gross',
    deductionMode: 'effectiveHaircut',
    effectiveDeductionRate: 0,
  }
  const sectionProps = { onUpdate: vi.fn(), onAdd: vi.fn(), onRemove: vi.fn() }

  it('edits the statutory start on the card through the moved input id', () => {
    const onUpdate = vi.fn()
    render(
      <RetirementIncomeStreamsSection
        streams={[statutoryStream]}
        onUpdate={onUpdate}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    const start = screen.getByLabelText('Rentenbeginn (Alter)')
    expect(start).toHaveAttribute('id', 'retirement-income-start-statutory-pension')
    expect(start).toHaveAttribute('type', 'number')
    expect(start).toHaveAttribute('min', '0')
    expect(start).toHaveAttribute('max', '120')
    expect(start).not.toBeDisabled()
    fireEvent.change(start, { target: { value: '68' } })
    expect(onUpdate).toHaveBeenCalledWith('statutory-pension', { startAge: 68 })
  })

  it('keeps non-statutory starts editable on the card', () => {
    const onUpdate = vi.fn()
    render(
      <RetirementIncomeStreamsSection
        streams={[{ ...otherStream, kind: 'side-income', name: 'Nebenjob' }]}
        onUpdate={onUpdate}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    const start = screen.getByLabelText('Startalter')
    expect(start).toHaveAttribute('id', 'retirement-income-start-income')
    fireEvent.change(start, { target: { value: '60' } })
    expect(onUpdate).toHaveBeenCalledWith('income', { startAge: 60 })
  })

  it('shows the statutory start read-only in the timeline with per-stream mentions', () => {
    render(
      <TimelineSection
        input={{
          ...DEFAULT_INPUT,
          retirementIncomeStreams: [
            { ...statutoryStream, id: 'first', name: 'Erste Rente', startAge: 67 },
            { ...statutoryStream, id: 'second', name: 'Zweite Rente', startAge: 69 },
          ],
          retirementInsurance: createDefaultRetirementInsurance(67),
        }}
        errors={{}}
        onChange={vi.fn()}
        onTransitionChange={vi.fn()}
      />,
    )

    expect(document.getElementById('retirement-income-start-first')).toBeNull()
    expect(document.getElementById('retirement-income-start-second')).toBeNull()
    expect(screen.getByText(/Frühester gesetzlicher Rentenbeginn: 67/)).toBeInTheDocument()
    expect(screen.getByText(/Erste Rente: Alter 67/)).toBeInTheDocument()
    expect(screen.getByText(/Zweite Rente: Alter 69/)).toBeInTheDocument()
    expect(screen.getByText(/Rentenbeginn \(Alter\)/)).toBeInTheDocument()
  })

  it('shows a single statutory start without a per-stream list and keeps the transition branch without statutory streams', () => {
    const props = { errors: {}, onChange: vi.fn(), onTransitionChange: vi.fn() }
    const { rerender } = render(
      <TimelineSection
        input={{
          ...DEFAULT_INPUT,
          retirementIncomeStreams: [statutoryStream],
          retirementInsurance: createDefaultRetirementInsurance(67),
        }}
        {...props}
      />,
    )

    expect(document.getElementById('retirement-income-start-statutory-pension')).toBeNull()
    expect(screen.getByText(/Frühester gesetzlicher Rentenbeginn: 67/)).toBeInTheDocument()
    expect(screen.queryByText(/Gesetzliche Rente: Alter/)).not.toBeInTheDocument()

    rerender(
      <TimelineSection
        input={{
          ...DEFAULT_INPUT,
          retirementIncomeStreams: [],
          retirementInsurance: createDefaultRetirementInsurance(undefined),
        }}
        {...props}
      />,
    )
    expect(screen.getByText('Keine gesetzliche Rente erfasst.')).toBeInTheDocument()
    expect(screen.getByLabelText('Übergang der Versicherungsplanung ohne gesetzliche Rente (Alter)')).toHaveAttribute(
      'id',
      'insurance-transition',
    )
  })

  it('selects Standard and Sonderfall support through the split category', () => {
    const onUpdate = vi.fn()
    const props = { onUpdate, onAdd: vi.fn(), onRemove: vi.fn() }
    const { rerender } = render(<RetirementIncomeStreamsSection {...props} streams={[otherStream]} />)

    fireEvent.change(screen.getByLabelText('Kategorie von Weiteres Einkommen'), {
      target: { value: 'gesetzliche-rente:standard' },
    })
    expect(onUpdate).toHaveBeenCalledWith('income', {
      kind: 'gesetzliche-rente',
      support: 'standard',
      name: 'Gesetzliche Rente',
    })

    fireEvent.change(screen.getByLabelText('Kategorie von Weiteres Einkommen'), {
      target: { value: 'betriebsrente:unsupported' },
    })
    expect(onUpdate).toHaveBeenCalledWith('income', {
      kind: 'betriebsrente',
      support: 'unsupported',
      name: 'Betriebsrente',
    })

    rerender(
      <RetirementIncomeStreamsSection
        {...props}
        streams={[{ ...otherStream, kind: 'betriebsrente', support: 'unsupported', name: 'Betriebsrente' }]}
      />,
    )
    expect(screen.getByLabelText('Kategorie von Betriebsrente')).toHaveValue('betriebsrente:unsupported')
    expect(screen.getByText(/Ausland, Einmalzahlung oder ungeklärt/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Kategorie von Betriebsrente'), { target: { value: 'other' } })
    expect(onUpdate).toHaveBeenCalledWith('income', expect.objectContaining({ kind: 'other', support: undefined }))
  })

  it('shows no empty confirmation hurdle for statutory and company pensions', () => {
    render(
      <RetirementIncomeStreamsSection
        streams={[
          statutoryStream,
          { ...statutoryStream, id: 'company', name: 'Betriebsrente', kind: 'betriebsrente' },
        ]}
        onUpdate={vi.fn()}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />,
    )

    expect(screen.queryByLabelText(/Art bestätigen/)).not.toBeInTheDocument()
    for (const label of ['Kategorie von Gesetzliche Rente', 'Kategorie von Betriebsrente']) {
      const select = screen.getByLabelText(label)
      expect(within(select).queryByRole('option', { name: 'Bitte auswählen' })).not.toBeInTheDocument()
    }
    expect(screen.getByLabelText('Kategorie von Gesetzliche Rente')).toHaveValue('gesetzliche-rente:standard')
    expect(screen.getByLabelText('Kategorie von Betriebsrente')).toHaveValue('betriebsrente:standard')
  })

  it('prefills a complete standard statutory stream that stays removable', () => {
    const defaults = createDefaultRetirementIncomeStreams(DEFAULT_INPUT)
    expect(defaults).toHaveLength(1)
    expect(defaults[0]).toMatchObject({ id: 'statutory-pension', kind: 'gesetzliche-rente', support: 'standard' })

    const onRemove = vi.fn()
    render(
      <RetirementIncomeStreamsSection
        streams={defaults}
        onUpdate={vi.fn()}
        onAdd={vi.fn()}
        onRemove={onRemove}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Gesetzliche Rente entfernen' }))
    expect(onRemove).toHaveBeenCalledWith('statutory-pension')
  })

  it('groups categories into three explained tiers', () => {
    render(
      <RetirementIncomeStreamsSection
        streams={[otherStream]}
        onUpdate={sectionProps.onUpdate}
        onAdd={sectionProps.onAdd}
        onRemove={sectionProps.onRemove}
      />,
    )

    const selector = screen.getByLabelText('Kategorie von Weiteres Einkommen')
    const automatic = within(selector).getByRole('group', { name: 'KV/PV automatisch berechnet' })
    expect(within(automatic).getByRole('option', { name: 'Gesetzliche Rente (Standard)' })).toBeInTheDocument()
    expect(within(automatic).getByRole('option', { name: 'Betriebsrente (Standard)' })).toBeInTheDocument()
    expect(within(automatic).queryByRole('option', { name: 'Gesetzliche Rente (Sonderfall)' })).not.toBeInTheDocument()
    expect(within(automatic).queryByRole('option', { name: 'Betriebsrente (Sonderfall)' })).not.toBeInTheDocument()
    const rental = within(selector).getByRole('group', { name: 'Mieteinnahmen' })
    expect(within(rental).getByRole('option', { name: 'Mieteinnahmen' })).toBeInTheDocument()
    const manual = within(selector).getByRole('group', { name: 'Manuelle KV/PV-Gesamtbeträge nötig' })
    for (const name of ['Gesetzliche Rente (Sonderfall)', 'Betriebsrente (Sonderfall)', 'Private Rente', 'Nebenjob', 'Brückeneinkommen', 'Sonstiges Einkommen']) {
      expect(within(manual).getByRole('option', { name })).toBeInTheDocument()
    }
    expect(screen.queryByRole('group', { name: 'Cashflow-only' })).not.toBeInTheDocument()
    expect(screen.getByText(/Gesetzliche Rente \(Standard\) und Betriebsrente \(Standard\)/)).toBeInTheDocument()
    expect(screen.getByText(/beitragspflichtiger Überschuss/)).toBeInTheDocument()
    expect(screen.getByText(/kein automatischer KV\/PV-Beitrag/)).toBeInTheDocument()
  })
})

describe('PR D: Zeitplan cleanup', () => {
  const firstStatutory: RetirementIncomeStream = {
    id: 'first',
    name: 'Erste Rente',
    kind: 'gesetzliche-rente',
    support: 'standard',
    amountMonthlyToday: 2000,
    startAge: 67,
    endAge: null,
    amountBasis: 'gross',
    deductionMode: 'effectiveHaircut',
    effectiveDeductionRate: 0,
  }
  const secondStatutory: RetirementIncomeStream = {
    ...firstStatutory,
    id: 'second',
    name: 'Zweite Rente',
    startAge: 69,
  }
  const timelineProps = { errors: {}, onChange: vi.fn(), onTransitionChange: vi.fn() }

  it('dissolves the hollow statutory fieldset but keeps the derived line visible', () => {
    render(
      <TimelineSection
        input={{
          ...DEFAULT_INPUT,
          retirementIncomeStreams: [firstStatutory, secondStatutory],
          retirementInsurance: createDefaultRetirementInsurance(67),
        }}
        {...timelineProps}
      />,
    )

    expect(screen.queryByRole('group', { name: 'Gesetzlicher Rentenbeginn' })).not.toBeInTheDocument()
    expect(screen.getByText(/Frühester gesetzlicher Rentenbeginn: 67/)).toBeInTheDocument()
    expect(screen.getByText(/Erste Rente: Alter 67/)).toBeInTheDocument()
    expect(screen.getByText(/Zweite Rente: Alter 69/)).toBeInTheDocument()
    expect(screen.getByText(/Rentenbeginn \(Alter\)/)).toBeInTheDocument()
  })

  it('places the Arbeitsende paragraph directly under the Arbeitsende field', () => {
    render(
      <TimelineSection
        input={{
          ...DEFAULT_INPUT,
          retirementIncomeStreams: [firstStatutory],
          retirementInsurance: createDefaultRetirementInsurance(67),
        }}
        {...timelineProps}
      />,
    )

    const personal = within(screen.getByRole('group', { name: 'Persönliche Daten' }))
    const retirementAge = personal.getByLabelText('Arbeitsende (Alter)')
    const paragraph = personal.getByText(/Arbeitsende und Rentenbeginn sind unabhängig/)
    const planningAge = personal.getByLabelText('Planung bis Alter')
    expect(retirementAge.compareDocumentPosition(paragraph) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(paragraph.compareDocumentPosition(planningAge) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps the Übergang branch as its own fieldset without statutory streams', () => {
    render(
      <TimelineSection
        input={{
          ...DEFAULT_INPUT,
          retirementIncomeStreams: [],
          retirementInsurance: createDefaultRetirementInsurance(undefined),
        }}
        {...timelineProps}
      />,
    )

    const transition = screen.getByRole('group', { name: 'Versicherungsübergang' })
    expect(within(transition).getByText('Keine gesetzliche Rente erfasst.')).toBeInTheDocument()
    expect(within(transition).getByLabelText('Übergang der Versicherungsplanung ohne gesetzliche Rente (Alter)')).toHaveAttribute(
      'id',
      'insurance-transition',
    )
    expect(within(transition).getByText(/Explizite Grenze zwischen Brücke/)).toBeInTheDocument()
    expect(within(transition).getByText(/Arbeitsende und Versicherungsübergang sind unabhängig/)).toBeInTheDocument()
    expect(
      within(screen.getByRole('group', { name: 'Persönliche Daten' })).queryByText(/Arbeitsende und Rentenbeginn sind unabhängig/),
    ).not.toBeInTheDocument()
    expect(screen.queryByText(/Frühester gesetzlicher Rentenbeginn/)).not.toBeInTheDocument()
  })

  it('moves Ausgaben into Persönliche Daten and drops the standalone section', () => {
    renderInputPanel()

    const spending = within(screen.getByRole('group', { name: 'Persönliche Daten' })).getByLabelText(
      /Gewünschte monatliche Ausgaben/,
    )
    expect(spending).toHaveAttribute('id', 'monthlyDesiredSpendingToday')
    expect(document.getElementById('ausgaben')).toBeNull()
  })

  it('offers Geschlecht with Keine Angabe default and forwards the selection', () => {
    const onLifeTableSexChange = vi.fn()
    const legacyInput = { ...DEFAULT_INPUT }
    delete legacyInput.lifeTableSex
    const { rerender } = render(
      <TimelineSection
        input={{ ...legacyInput, retirementIncomeStreams: [], retirementInsurance: createDefaultRetirementInsurance(undefined) }}
        errors={{}}
        onChange={vi.fn()}
        onTransitionChange={vi.fn()}
        onLifeTableSexChange={onLifeTableSexChange}
      />,
    )

    const select = within(screen.getByRole('group', { name: 'Persönliche Daten' })).getByLabelText(
      'Geschlecht für Sterbetafel',
    )
    expect(select).toHaveAttribute('id', 'lifeTableSex')
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Keine Angabe',
      'Weiblich',
      'Männlich',
    ])
    expect(select).toHaveValue('conservative')
    expect(select).toHaveDisplayValue('Keine Angabe')
    fireEvent.change(select, { target: { value: 'female' } })
    expect(onLifeTableSexChange).toHaveBeenCalledWith('female')

    rerender(
      <TimelineSection
        input={{ ...DEFAULT_INPUT, lifeTableSex: 'male', retirementIncomeStreams: [], retirementInsurance: createDefaultRetirementInsurance(undefined) }}
        errors={{}}
        onChange={vi.fn()}
        onTransitionChange={vi.fn()}
        onLifeTableSexChange={onLifeTableSexChange}
      />,
    )
    expect(screen.getByLabelText('Geschlecht für Sterbetafel')).toHaveValue('male')
  })
})
