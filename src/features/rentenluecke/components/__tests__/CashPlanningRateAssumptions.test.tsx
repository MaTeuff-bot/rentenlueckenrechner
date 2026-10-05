// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CashPlanningRateAssumptions } from '../InputPanel/CashPlanningRateAssumptions'
import { cashPlanningRateIssue } from '../../model/cashPlanningRate'
import { scenarioIssues } from '../../model/scenarioIssues'
import { PLANNING_RATE_SOURCE_ID } from '../../model/historicalReturns/constants'

describe('CashPlanningRateAssumptions', () => {
  it('renders the fieldset with rate input and confirmation checkbox', () => {
    render(
      <CashPlanningRateAssumptions
        cashPlanningRate={0.02}
        cashPlanningRateConfirmed={false}
        issue={null}
        onModeChange={() => {}}
        onRateChange={() => {}}
        onRealRateChange={() => {}}
        onConfirmedChange={() => {}}
      />,
    )
    expect(screen.getByText('Tagesgeld (Bankeinlagen)')).toBeInTheDocument()
    expect(screen.getByLabelText(/Nominaler Tagesgeld-Planungszins p.a./)).toHaveAttribute('id', 'cash-planning-rate')
    const box = screen.getByRole('checkbox') as HTMLInputElement
    expect(box).toHaveAttribute('id', 'cash-planning-rate-confirmed')
    expect(box.checked).toBe(false)
    expect(screen.getByText(/keine Tagesgeld-Zinsunsicherheit/i)).toBeInTheDocument()
    expect(screen.getByText(/ausdrücklich zu bestätigender/i)).toBeInTheDocument()
  })

  it('reports confirmation changes and surfaces the issue', () => {
    const onConfirmed = vi.fn()
    const onRate = vi.fn()
    render(
      <CashPlanningRateAssumptions
        cashPlanningRate={0.02}
        cashPlanningRateConfirmed={false}
        issue="Tagesgeld-Planungszins unter Rechenannahmen festlegen und ausdrücklich bestätigen (konstanter nominaler Satz für alle Jahre/Pfade/Bankeinlagen)."
        onModeChange={() => {}}
        onRateChange={onRate}
        onRealRateChange={() => {}}
        onConfirmedChange={onConfirmed}
      />,
    )
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onConfirmed).toHaveBeenCalledWith(true)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('gates validity: cash buckets need confirmation, fund-only does not', () => {
    const cashIssue = cashPlanningRateIssue(
      [{ returnSeriesId: PLANNING_RATE_SOURCE_ID }],
      { cashPlanningRate: 0.02, cashPlanningRateConfirmed: false },
    )
    expect(cashIssue).not.toBeNull()
    const confirmed = cashPlanningRateIssue(
      [{ returnSeriesId: PLANNING_RATE_SOURCE_ID }],
      { cashPlanningRate: 0.02, cashPlanningRateConfirmed: true },
    )
    expect(confirmed).toBeNull()
    const fundOnly = cashPlanningRateIssue(
      [{ returnSeriesId: 'synthetic-equity-assumption-v1' }],
      undefined,
    )
    expect(fundOnly).toBeNull()
  })

  it('routes the issue link to the Rechenannahmen field', () => {
    const input = {
      currentAge: 67,
      retirementAge: 67,
      planningAge: 68,
      currentCapital: 10_000,
      monthlyContributionToday: 0,
      monthlyDesiredSpendingToday: 0,
      monthlyRetirementIncomeToday: 0,
      annualInflationRate: 0,
      annualReturnBeforeRetirement: 0,
      annualReturnInRetirement: 0,
    } as never
    const buckets = [
      { id: 'bank', name: 'Bank', value: 10_000, holding: 'ordinary-bank-deposit', returnSeriesId: PLANNING_RATE_SOURCE_ID },
    ] as never
    const issues = scenarioIssues(
      input,
      { kind: 'missing' } as never,
      buckets,
      undefined,
      [],
      null,
      null,
      undefined,
      'Tagesgeld-Planungszins unter Rechenannahmen festlegen und ausdrücklich bestätigen (konstanter nominaler Satz für alle Jahre/Pfade/Bankeinlagen).',
    )
    const cash = issues.find((i) => i.code === 'cashPlanningRate.missing')!
    expect(cash).toBeDefined()
    expect(cash.fieldId).toBe('cash-planning-rate')
    expect(cash.section).toBe('annahmen')
  })
})

describe('CashPlanningRateAssumptions bank modes', () => {
  it('renders all three modes with the constant default selected', () => {
    render(
      <CashPlanningRateAssumptions
        cashPlanningRate={0.02}
        cashPlanningRateConfirmed={false}
        issue={null}
        onModeChange={() => {}}
        onRateChange={() => {}}
        onRealRateChange={() => {}}
        onConfirmedChange={() => {}}
      />,
    )
    expect(screen.getByLabelText(/Konstanter nominaler Planungszins/)).toHaveAttribute('id', 'cash-mode-constant')
    expect(screen.getByLabelText(/Historischer Spar-\/Einlagen-Proxy/)).toHaveAttribute('id', 'cash-mode-historical')
    expect(screen.getByLabelText(/Realzins-Annahme mit nominaler 0%-Untergrenze/)).toHaveAttribute('id', 'cash-mode-real')
    expect((screen.getByLabelText(/Konstanter nominaler Planungszins/) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByLabelText(/Nominaler Tagesgeld-Planungszins p.a./)).toHaveAttribute('id', 'cash-planning-rate')
  })

  it('shows the account-switching disclosure for the historical mode', () => {
    const onMode = vi.fn()
    render(
      <CashPlanningRateAssumptions
        cashMode="historical-zero-floor"
        cashPlanningRateConfirmed={false}
        issue={null}
        onModeChange={onMode}
        onRateChange={() => {}}
        onRealRateChange={() => {}}
        onConfirmedChange={() => {}}
      />,
    )
    expect(screen.getByTestId('cash-historical-disclosure')).toHaveTextContent(/geeigneten Konto/)
    expect(screen.queryByLabelText(/Nominaler Tagesgeld-Planungszins p.a./)).not.toBeInTheDocument()
    fireEvent.click(screen.getByLabelText(/Konstanter nominaler Planungszins/))
    expect(onMode).toHaveBeenCalledWith('constant-nominal')
  })

  it('edits and validates the real-rate target for the real mode', () => {
    const onReal = vi.fn()
    render(
      <CashPlanningRateAssumptions
        cashMode="real-assumption-zero-floor"
        cashRealRate={-0.0028}
        cashPlanningRateConfirmed={false}
        issue={null}
        onModeChange={() => {}}
        onRateChange={() => {}}
        onRealRateChange={onReal}
        onConfirmedChange={() => {}}
      />,
    )
    expect(screen.getByTestId('cash-real-disclosure')).toHaveTextContent(/max\(0, Nominalzins\)/)
    const input = screen.getByLabelText(/Realzins-Annahme p.a./) as HTMLInputElement
    expect(input).toHaveAttribute('id', 'cash-real-rate')
    fireEvent.change(input, { target: { value: '-0.28' } })
    expect(onReal).toHaveBeenCalled()
  })
})
