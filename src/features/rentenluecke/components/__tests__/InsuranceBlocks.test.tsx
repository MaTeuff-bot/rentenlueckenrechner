// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InputPanel } from '../InputPanel'
import { scenarioIssues } from '../../model/scenarioIssues'
import { rentenlueckeInputSchema } from '../../model/inputSchema'
import { insuranceSetupIssues } from '../../model/retirementInsurance'
import { defaultCoverageAnswers } from '../../model/insuranceCoverage'
import { automaticInsurance, completedCoverage, insuredInput, pension } from '../../model/__tests__/insuranceFixtures'
import { createDefaultState } from '../../hooks/scenarioState/defaults'
import { DEFAULT_ASSET_ALLOCATION } from '../../model/stochasticReturns'
import { DEFAULT_HISTORICAL_INFLATION_SERIES_ID } from '../../model/historicalReturns'
import type { RentenlueckeInput } from '../../model/types'
import type { InsuranceCoverageAnswers } from '../../model/insuranceCoverage'
import type { ChildrenAnswer } from '../../model/childrenAnswer'

function renderVersicherungTab(input: RentenlueckeInput, coverage: InsuranceCoverageAnswers, children: ChildrenAnswer) {
  const state = createDefaultState()
  const parsed = rentenlueckeInputSchema.safeParse(input)
  const issues = scenarioIssues(
    input,
    children,
    state.portfolioBuckets,
    parsed.success ? undefined : parsed.error,
    insuranceSetupIssues(input),
    null,
    null,
    coverage,
  )
  const noop = () => {}
  render(
    <InputPanel
      input={input}
      issues={issues}
      insuranceCoverageAnswers={coverage}
      childrenAnswer={children}
      allocation={DEFAULT_ASSET_ALLOCATION}
      portfolioBuckets={state.portfolioBuckets}
      retirementIncomeStreams={input.retirementIncomeStreams ?? []}
      historical={{ inflationSourceId: DEFAULT_HISTORICAL_INFLATION_SERIES_ID }}
      historicalValidYears={[]}
      errors={{}}
      allocationError={null}
      portfolioBucketError={null}
      onRetirementInsuranceChange={noop}
      onChange={noop}
      onPortfolioBucketChange={noop}
      onPortfolioBucketAdd={noop}
      onPortfolioBucketRemove={noop}
      onRetirementIncomeStreamChange={noop}
      onRetirementIncomeStreamAdd={noop}
      onRetirementIncomeStreamRemove={noop}
      onInflationSourceChange={noop}
      onReset={noop}
    />,
  )
  fireEvent.click(screen.getByRole('tab', { name: /Versicherung/ }))
  const panel = document.getElementById('input-tabpanel-versicherung')!
  expect(panel).toBeVisible()
  return { panel, issues }
}

describe('Versicherung tab regroup into four blocks', () => {
  it('renders all four numbered block headings in order inside the Versicherung tabpanel', () => {
    const input = insuredInput({
      retirementIncomeStreams: [pension()],
      retirementInsurance: {
        ...automaticInsurance(),
        pension: { status: 'voluntary', circumstances: 'standard', drvSubsidy: 'confirmed' },
      },
    })
    const { panel } = renderVersicherungTab(input, completedCoverage(), { kind: 'none' })
    const headings = within(panel).getAllByRole('heading', { level: 3 })
    const names = headings.map(heading => heading.textContent ?? '')
    const blockIndexes = [
      names.findIndex(name => /1\. Phasen und Status/.test(name)),
      names.findIndex(name => /2\. Gemeinsame Angaben/.test(name)),
      names.findIndex(name => /3\. Beiträge je Phase/.test(name)),
      names.findIndex(name => /4\. Kapitalertrags-Schätzung/.test(name)),
    ]
    expect(blockIndexes.every(index => index >= 0)).toBe(true)
    expect([...blockIndexes].sort((a, b) => a - b)).toEqual(blockIndexes)
    for (const heading of headings.filter(heading => /[1234]\. /.test(heading.textContent ?? ''))) {
      expect(within(heading).getByText(/Offen|Prüfen|Vollständig/)).toBeInTheDocument()
    }
    expect(screen.getByRole('button', { name: 'Zeitplan ergänzen / korrigieren' })).toBeVisible()
    expect(document.getElementById('input-tabpanel-versicherung')).toContainElement(headings[blockIndexes[0]])
  })

  it('keeps the per-phase issue link list navigating after the regroup', () => {
    const input = insuredInput({
      retirementIncomeStreams: [pension()],
      retirementInsurance: {
        ...automaticInsurance(),
        pension: { status: 'voluntary' },
      },
    })
    const { panel } = renderVersicherungTab(input, defaultCoverageAnswers(), { kind: 'missing' })
    const phaseGroup = within(panel).getByRole('group', { name: /Rentenphase · Alter/ })
    const link = within(phaseGroup).getAllByRole('link')[0]
    expect(link).toBeInTheDocument()
    const targetId = link.getAttribute('href')!.slice(1)
    const target = document.getElementById(targetId)!
    expect(target).not.toBeNull()
    fireEvent.click(link)
    expect(document.activeElement).toBe(target)
  })
})
