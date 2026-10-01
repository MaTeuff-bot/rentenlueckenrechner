// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { InputPanel } from '../InputPanel'
import { scenarioIssues } from '../../model/scenarioIssues'
import { rentenlueckeInputSchema } from '../../model/inputSchema'
import { insuranceSetupIssues } from '../../model/retirementInsurance'
import { completedCoverage } from '../../model/__tests__/insuranceFixtures'
import { automaticInsurance, insuredInput, pension } from '../../model/__tests__/insuranceFixtures'
import { createDefaultState } from '../../hooks/scenarioState/defaults'
import { DEFAULT_ASSET_ALLOCATION } from '../../model/stochasticReturns'
import { DEFAULT_HISTORICAL_INFLATION_SERIES_ID } from '../../model/historicalReturns'
import { portfolioEstimatorReadiness } from '../../model/capitalIncome/portfolioEstimator'

function renderVermoegen(input: Parameters<typeof InputPanel>[0]['input'], portfolioSettings: Parameters<typeof InputPanel>[0]['portfolioEstimatorSettings'], buckets?: Parameters<typeof InputPanel>[0]['portfolioBuckets']) {
  const state = createDefaultState()
  const portfolioBuckets = buckets ?? state.portfolioBuckets
  const parsed = rentenlueckeInputSchema.safeParse(input)
  const coverage = completedCoverage()
  const issues = scenarioIssues(input, { kind: 'none' }, portfolioBuckets, parsed.success ? undefined : parsed.error, insuranceSetupIssues(input), null, null, coverage)
  const noop = () => {}
  render(
    <InputPanel
      input={input}
      issues={issues}
      insuranceCoverageAnswers={coverage}
      childrenAnswer={{ kind: 'none' }}
      allocation={DEFAULT_ASSET_ALLOCATION}
      portfolioBuckets={portfolioBuckets}
      retirementIncomeStreams={input.retirementIncomeStreams ?? []}
      historical={{ inflationSourceId: DEFAULT_HISTORICAL_INFLATION_SERIES_ID }}
      historicalValidYears={[]}
      errors={{}}
      allocationError={null}
      portfolioBucketError={null}
      onRetirementInsuranceChange={noop}
      portfolioEstimatorSettings={portfolioSettings}
      onPortfolioEstimatorSettingsChange={noop}
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

function manualInput() {
  return insuredInput({
    retirementIncomeStreams: [pension()],
    retirementInsurance: automaticInsurance({
      bridge: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
      pension: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
    }),
  })
}

function automaticInput() {
  return insuredInput({
    retirementIncomeStreams: [pension()],
    retirementInsurance: {
      ...automaticInsurance(),
      bridge: { status: 'voluntary', circumstances: 'standard', capitalMode: 'automatic' },
      pension: { status: 'voluntary', circumstances: 'standard', capitalMode: 'automatic', drvSubsidy: 'confirmed' },
    },
  })
}

describe('independent portfolio estimator UI (PR F)', () => {
  it('always shows collapsible Anschaffungskosten und Ertragsschätzung independent of insurance', () => {
    renderVermoegen(manualInput(), undefined)
    fireEvent.click(screen.getByRole('tab', { name: /Verm\u00f6gen/ }))
    const panel = document.getElementById('input-tabpanel-vermoegen')!
    expect(within(panel).getAllByText('Anschaffungskosten und Ertragssch\u00e4tzung').length).toBeGreaterThan(0)
    expect(document.getElementById('estimator-details')).not.toBeNull()
    expect(document.getElementById('estimator-fundAcquisitionCost')).not.toBeNull()
    expect(document.getElementById('estimator-scopeConfirmed')).not.toBeNull()
    expect(document.getElementById('estimator-lossScopeConfirmed')).not.toBeNull()
  })

  it('shows blocking readiness until the detailed setup is complete, independent of insurance', () => {
    renderVermoegen(manualInput(), undefined)
    fireEvent.click(screen.getByRole('tab', { name: /Verm\u00f6gen/ }))
    // Whole-phase manual totals never satisfy the mandatory portfolio setup.
    expect(document.getElementById('estimator-readiness')).toHaveTextContent(/Unvollst\u00e4ndig.*blockiert/i)
    expect(document.getElementById('estimator-readiness')).not.toHaveTextContent(/optional/i)
    expect(document.getElementById('estimator-details')).not.toBeNull()
  })

  it('shows detailed readiness as complete once cost and confirmations hold, still independent of insurance', () => {
    const settings = { fundAcquisitionCost: 0, projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true }
    const buckets = [{ id: 'fund', name: 'Fonds', value: 100000, returnSeriesId: 'synthetic-equity-assumption-v1', holding: 'accumulating-equity-fund' as const }]
    const readiness = portfolioEstimatorReadiness(settings, buckets, 100000)
    expect(readiness.ready).toBe(true)
    renderVermoegen(manualInput(), settings, buckets)
    fireEvent.click(screen.getByRole('tab', { name: /Verm\u00f6gen/ }))
    expect(document.getElementById('estimator-readiness')).toHaveTextContent(/Bereit f\u00fcr detaillierte Sch\u00e4tzung/i)
  })

  it('required incomplete setup blocks and issue link expands and focuses Verm\u00f6gen', () => {
    const complete = automaticInput()
    const input = { ...complete, estimatorPortfolio: (complete.estimatorPortfolio as unknown[]).map(bucket => ({ ...(bucket as object), holding: undefined })) as typeof complete.estimatorPortfolio,
      retirementInsurance: complete.retirementInsurance && { ...complete.retirementInsurance, capitalEstimator: undefined } }
    const { issues } = renderVermoegen(input, undefined)
    const target = issues.find(i => i.fieldId.startsWith('estimator-'))
    expect(target).toBeDefined()
    expect(target!.section).toBe('vermoegen')
    fireEvent.click(screen.getByRole('tab', { name: /Versicherung/ }))
    const link = screen.getAllByRole('link').find(a => a.getAttribute('href') === `#${target!.fieldId}`)
    expect(link).toBeDefined()
    fireEvent.click(link!)
    expect(document.getElementById('input-tabpanel-vermoegen')).toBeVisible()
    expect(document.getElementById('estimator-details')).toHaveProperty('open', true)
    expect(document.activeElement).toBe(document.getElementById(target!.fieldId))
  })

  it('insurance status changes do not hide portfolio settings (settings callback owns data)', () => {
    const onSettings = vi.fn()
    const input = manualInput()
    const state = createDefaultState()
    const parsed = rentenlueckeInputSchema.safeParse(input)
    const coverage = completedCoverage()
    const issues = scenarioIssues(input, { kind: 'none' }, state.portfolioBuckets, parsed.success ? undefined : parsed.error, insuranceSetupIssues(input), null, null, coverage)
    const noop = () => {}
    const settings = { fundAcquisitionCost: 999, projectedBasisRate: 0.032, scopeConfirmed: true, lossScopeConfirmed: true }
    const readiness = portfolioEstimatorReadiness(settings, state.portfolioBuckets, 0)
    expect(readiness.ready).toBe(false)
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
        onRetirementInsuranceChange={noop}
        portfolioEstimatorSettings={settings}
        onPortfolioEstimatorSettingsChange={onSettings}
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
    fireEvent.click(screen.getByRole('tab', { name: /Verm\u00f6gen/ }))
    expect((document.getElementById('estimator-fundAcquisitionCost') as HTMLInputElement).value).toBe('999')
  })
})
