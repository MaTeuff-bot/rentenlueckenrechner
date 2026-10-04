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
        onRateChange={() => {}}
        onConfirmedChange={() => {}}
      />,
    )
    expect(screen.getByText('Tagesgeld (Planungszins)')).toBeInTheDocument()
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
        onRateChange={onRate}
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
