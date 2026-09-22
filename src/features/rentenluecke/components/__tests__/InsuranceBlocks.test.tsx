// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
import type { RetirementInsurance } from '../../model/retirementInsurance'
import type { InsuranceCoverageAnswers } from '../../model/insuranceCoverage'
import type { ChildrenAnswer } from '../../model/childrenAnswer'

function renderEstimatorSplit(input: RentenlueckeInput, onRetirementInsuranceChange: (insurance: RetirementInsurance) => void = () => {}) {
  const state = createDefaultState()
  const parsed = rentenlueckeInputSchema.safeParse(input)
  const coverage = completedCoverage()
  const issues = scenarioIssues(
    input,
    { kind: 'none' },
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
      childrenAnswer={{ kind: 'none' }}
      allocation={DEFAULT_ASSET_ALLOCATION}
      portfolioBuckets={state.portfolioBuckets}
      retirementIncomeStreams={input.retirementIncomeStreams ?? []}
      historical={{ inflationSourceId: DEFAULT_HISTORICAL_INFLATION_SERIES_ID }}
      historicalValidYears={[]}
      errors={{}}
      allocationError={null}
      portfolioBucketError={null}
      onRetirementInsuranceChange={onRetirementInsuranceChange}
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
  return { issues }
}

function estimatorInput(): RentenlueckeInput {
  return insuredInput({
    retirementIncomeStreams: [pension()],
    retirementInsurance: {
      ...automaticInsurance(),
      bridge: { status: 'voluntary', circumstances: 'standard' },
      pension: { status: 'voluntary', circumstances: 'standard', drvSubsidy: 'confirmed' },
    },
  })
}

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

describe('Kapitalertragsschätzung split Vermögen / Versicherung', () => {
  it('renders the estimator fieldset in Vermögen when needsEstimator, not in Versicherung', () => {
    renderEstimatorSplit(estimatorInput())
    fireEvent.click(screen.getByRole('tab', { name: /Versicherung/ }))
    const versicherungPanel = document.getElementById('input-tabpanel-versicherung')!
    expect(versicherungPanel).toBeVisible()
    expect(document.getElementById('insurance-block-4-heading')).toBeVisible()
    expect(within(versicherungPanel).queryByLabelText('Anschaffungskosten des gesamten Fondspools (€)')).not.toBeInTheDocument()
    expect(within(versicherungPanel).queryByLabelText(/Anlageumfang bestätigt/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /Vermögen/ }))
    const vermoegenPanel = document.getElementById('input-tabpanel-vermoegen')!
    expect(vermoegenPanel).toBeVisible()
    expect(within(vermoegenPanel).getByLabelText('Anschaffungskosten des gesamten Fondspools (€)')).toBeInTheDocument()
    expect(document.getElementById('estimator-fundAcquisitionCost')).not.toBeNull()
    expect(document.getElementById('estimator-scopeConfirmed')).not.toBeNull()
    expect(document.getElementById('estimator-lossScopeConfirmed')).not.toBeNull()
    expect(within(vermoegenPanel).getByText('Erweitert – projizierter Basiszins')).toBeInTheDocument()
  })

  it('shows a pointer in Versicherung block 4 with a working jump to Vermögen', () => {
    const { issues } = renderEstimatorSplit(estimatorInput())
    fireEvent.click(screen.getByRole('tab', { name: /Versicherung/ }))
    const jump = document.getElementById('insurance-block-4-jump-to-vermoegen')!
    expect(jump).toBeVisible()
    fireEvent.click(jump)
    expect(document.getElementById('input-tabpanel-vermoegen')).toBeVisible()
    const expected = issues.find(issue => issue.fieldPath.startsWith('retirementInsurance.capitalEstimator'))!.fieldId
    expect(document.activeElement).toBe(document.getElementById(expected))
  })

  it('routes block-4 issue links to Vermögen and focuses the estimator field', () => {
    renderEstimatorSplit(estimatorInput())
    fireEvent.click(screen.getByRole('tab', { name: /Versicherung/ }))
    const block = document.getElementById('insurance-block-4-heading')!.closest('section')!
    const links = within(block).getAllByRole('link')
    expect(links.length).toBeGreaterThan(0)
    const targetId = links[0].getAttribute('href')!.slice(1)
    expect(targetId.startsWith('estimator-')).toBe(true)
    fireEvent.click(links[0])
    expect(document.getElementById('input-tabpanel-vermoegen')).toBeVisible()
    expect(document.activeElement).toBe(document.getElementById(targetId))
  })

  it('writes estimator edits to retirementInsurance.capitalEstimator and survives persistence round-trip', async () => {
    const onChange = vi.fn()
    const input = estimatorInput()
    renderEstimatorSplit(input, onChange)
    fireEvent.click(screen.getByRole('tab', { name: /Vermögen/ }))
    fireEvent.change(screen.getByLabelText('Anschaffungskosten des gesamten Fondspools (€)'), { target: { value: '123' } })
    expect(onChange).toHaveBeenCalled()
    const emitted = onChange.mock.calls[0][0] as RentenlueckeInput['retirementInsurance']
    expect(emitted?.capitalEstimator?.fundAcquisitionCost).toBe(123)
    const { serializeScenarioState, parsePersistedScenarioState } = await import('../../hooks/scenarioState/persistence')
    const state = { ...createDefaultState(), input: { ...input, retirementInsurance: emitted! } }
    const roundTripped = parsePersistedScenarioState(serializeScenarioState(state))
    expect(roundTripped.input.retirementInsurance?.capitalEstimator?.fundAcquisitionCost).toBe(123)
  })
})
