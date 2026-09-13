// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InputPanel } from '../InputPanel'
import { scenarioIssues } from '../../model/scenarioIssues'
import { rentenlueckeInputSchema } from '../../model/inputSchema'
import { insuranceSetupIssues } from '../../model/retirementInsurance'
import { completedCoverage, insuredInput, pension } from '../../model/__tests__/insuranceFixtures'
import { createDefaultState } from '../../hooks/scenarioState/defaults'
import type { RentenlueckeInput } from '../../model/types'

function renderNavigation(input: RentenlueckeInput) {
  const state = createDefaultState()
  const parsed = rentenlueckeInputSchema.safeParse(input)
  const issues = scenarioIssues(input, { kind: 'none' }, state.portfolioBuckets, parsed.success ? undefined : parsed.error, insuranceSetupIssues(input), null, null, completedCoverage())
  const noop = () => {}
  const view = render(<InputPanel input={input} issues={issues} insuranceCoverageAnswers={completedCoverage()} childrenAnswer={{ kind: 'none' }} allocation={{ equity: .7, bonds: .2, fixed: .1 }} portfolioBuckets={state.portfolioBuckets} retirementIncomeStreams={input.retirementIncomeStreams ?? []} historical={state.historical} historicalValidYears={[]} errors={{}} allocationError={null} portfolioBucketError={null} onRetirementInsuranceChange={noop} onChange={noop} onPortfolioBucketChange={noop} onPortfolioBucketAdd={noop} onPortfolioBucketRemove={noop} onRetirementIncomeStreamChange={noop} onRetirementIncomeStreamAdd={noop} onRetirementIncomeStreamRemove={noop} onInflationSourceChange={noop} onReset={noop} />)
  return { ...view, issues }
}
function follow(container: HTMLElement, id: string) {
  const link = container.querySelector<HTMLAnchorElement>(`.validation-summary a[href="#${id}"]`)
  expect(link).not.toBeNull()
  fireEvent.click(link!)
  expect(document.activeElement).toBe(document.getElementById(id))
}

describe('real controlling-date and disclosure focus (requirements 12 and 14)', () => {
  it('focuses first tied earliest statutory stream, ignoring earlier nonstatutory and array order', () => {
    const input = insuredInput({ retirementIncomeStreams: [pension({ id: 'rent', kind: 'rental-income', startAge: 60 }), pension({ id: 'later', startAge: 69 }), pension({ id: 'earliest', startAge: 66, amountMonthlyToday: 0 }), pension({ id: 'tie', startAge: 66 })] })
    const { container, issues } = renderNavigation(input)
    expect(issues.find(issue => issue.fieldPath === 'retirementInsurance.pensionAge')?.fieldId).toBe('retirement-income-start-earliest')
    follow(container, 'retirement-income-start-earliest')
  })
  it.each([NaN, -1, 66.5, 121])('focuses malformed controlling date %s rather than later valid date', startAge => {
    const input = insuredInput({ retirementIncomeStreams: [pension({ id: 'valid', startAge: 69 }), pension({ id: 'invalid', startAge })] })
    input.retirementInsurance!.pensionAge = Math.min(69, startAge)
    const { container, issues } = renderNavigation(input)
    follow(container, 'retirement-income-start-invalid')
    expect(issues.find(issue => issue.fieldPath === 'retirementIncomeStreams.1.startAge')?.kind).toBe(Number.isNaN(startAge) ? 'missing' : 'invalid')
  })
  it('focuses the live explicit transition when there is no statutory stream', () => {
    const input = insuredInput({ retirementIncomeStreams: [] })
    input.retirementInsurance!.pensionAge = undefined
    const { container } = renderNavigation(input)
    follow(container, 'insurance-transition')
  })
  it('opens enclosing advanced details before focusing an invalid rate override', () => {
    const input = insuredInput()
    input.retirementInsurance!.rates = { kvGeneralRate: -1 }
    const { container } = renderNavigation(input)
    const field = document.getElementById('insurance-rates-kvGeneralRate')!
    const details = field.closest('details')!
    expect(details.open).toBe(false)
    follow(container, field.id)
    expect(details.open).toBe(true)
  })
})
