import { describe, expect, it } from 'vitest'
import { applyCoverage, defaultCoverageAnswers, type InsuranceCoverageAnswers } from '../insuranceCoverage'
import { childrenEngineFields } from '../childrenAnswer'
import { timelineBoundary } from '../scenarioTimeline'
import { clearHiddenInvalidInsuranceValues, insuranceSetupIssues } from '../retirementInsurance'
import { simulateScenario } from '../simulateScenario'
import { runStochasticSimulation, simulateScenarioWithReturnPath } from '../stochasticReturns'
import { runHistoricalBootstrapSimulation, simulateHistoricalBootstrapReferenceScenario, simulateHistoricalBootstrapScenario, FIXED_INFLATION_SOURCE_ID, SYNTHETIC_RETURN_SERIES_IDS } from '../historicalReturns'
import { createPortfolioComponentsFromBuckets } from '../portfolioBuckets'
import { needsEstimator } from '../capitalIncome/setup'
import { completedCoverage, insuredInput } from './insuranceFixtures'
import type { RentenlueckeInput, SimulationResult } from '../types'

const cases = ['kvdr', 'voluntary-yes', 'voluntary-no', 'unknown-yes', 'unknown-no', 'early-bridge', 'automatic-estimator', 'own-totals', 'coverage-unsure'] as const
function equivalentCases(name: typeof cases[number]): { legacy: RentenlueckeInput; coverage: InsuranceCoverageAnswers } {
  // Explicit pre-PR2 engine contract: circumstances, permanent parenthood and boundary.
  // UI answers are supplied independently below, never inferred from these fields.
  const legacy = insuredInput({ currentAge: 65, retirementAge: 67, planningAge: 70, annualInflationRate: .02, annualReturnBeforeRetirement: .04, annualReturnInRetirement: .04 })
  legacy.estimatorPortfolio = [{ id: 'fund', name: 'Fund', value: legacy.currentCapital, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity, holding: 'accumulating-equity-fund', annualCostRate: .001 }]
  const i = legacy.retirementInsurance!
  i.childBirthYears = [2002, 2002]
  let coverage: InsuranceCoverageAnswers = completedCoverage()
  if (name.startsWith('voluntary') || name.startsWith('unknown')) i.pension = { status: name.startsWith('unknown') ? 'unknown' : 'voluntary', circumstances: 'standard', capitalMode: 'manual', capitalMonthlyToday: 321, drvSubsidy: name.endsWith('yes') ? 'confirmed' : 'not-received' }
  if (name === 'early-bridge' || name === 'automatic-estimator') legacy.retirementAge = 65
  if (name === 'automatic-estimator') {
    i.bridge = { status: 'voluntary', circumstances: 'standard', capitalMode: 'automatic' }
    i.pension = { status: 'unknown', circumstances: 'standard', capitalMode: 'automatic', drvSubsidy: 'confirmed' }
    i.capitalEstimator = { fundAcquisitionCost: 80000, projectedBasisRate: .032, scopeConfirmed: true, lossScopeConfirmed: true }
  }
  if (name === 'own-totals') {
    legacy.retirementAge = 65
    i.bridge = { manual: true, kvMonthlyToday: 111, pvMonthlyToday: 22 }
    i.pension = { status: 'unknown', manual: true, kvMonthlyToday: 80, pvMonthlyToday: 20, capitalMonthlyToday: 999, drvSubsidy: 'confirmed' }
    coverage = defaultCoverageAnswers()
  }
  if (name === 'coverage-unsure') {
    i.pension = { status: 'unknown', circumstances: 'unsupported', kvMonthlyToday: 80, pvMonthlyToday: 20, drvSubsidy: 'confirmed' }
    coverage.pension.common = { kind: 'unsure' }
  }
  return { legacy, coverage }
}
function expectNumericalParity(actual: SimulationResult, legacy: SimulationResult) {
  expect(actual.rows).toEqual(legacy.rows)
  expect(actual.summary.requiredCapitalAtRetirement).toBe(legacy.summary.requiredCapitalAtRetirement)
  expect(actual.summary).toEqual(legacy.summary)
  for (const row of actual.retirementRows) {
    // Assessment-only capital must never enter spendable receipts. Insurance is deducted once.
    expect(row.retirementIncomeNet).toBeCloseTo(row.retirementIncomeGross - row.retirementIncomeOtherDeductions - row.healthInsurance - row.careInsurance, 8)
  }
}

describe('PR2 canonical answers versus equivalent legacy engine inputs', () => {
  it.each(cases)('%s: full annual ledger, capital search, explicit paths and fixed-seed bootstrap parity', name => {
    const { legacy, coverage } = equivalentCases(name)
    const snapshot = structuredClone(legacy)
    // Deliberately stale cached fields prove canonical answers actually control the model input.
    const draft = structuredClone(legacy)
    const i = draft.retirementInsurance!
    i.pensionAge = 99
    i.isParent = false
    i.childBirthYears = []
    i.bridge.circumstances = 'unsupported'
    i.pension.circumstances = coverage.pension.common.kind === 'unsure' ? 'standard' : 'unsupported'
    const adapted = clearHiddenInvalidInsuranceValues({ ...draft, retirementInsurance: {
      ...applyCoverage(i, coverage), pensionAge: timelineBoundary(draft.retirementIncomeStreams ?? []),
      ...childrenEngineFields({ kind: 'children', rows: [{ id: 'a', year: 2002 }, { id: 'b', year: 2002 }] }),
    } })
    expect(insuranceSetupIssues(legacy)).toEqual([])
    expect(insuranceSetupIssues(adapted)).toEqual([])
    expectNumericalParity(simulateScenario(adapted), simulateScenario(legacy))
    const path = [.05, -.03, .08, .01, .04]
    const inflation = [.01, .03, .02, -.01, .04]
    const bucketPath = needsEstimator(legacy) ? path.map(totalReturnRate => [{ id: 'fund', totalReturnRate }]) : undefined
    expectNumericalParity(simulateScenarioWithReturnPath(adapted, path, inflation, bucketPath), simulateScenarioWithReturnPath(legacy, path, inflation, bucketPath))
    const settings = { portfolioComponents: createPortfolioComponentsFromBuckets(legacy.estimatorPortfolio!), inflationSourceId: FIXED_INFLATION_SOURCE_ID, simulations: 4 }
    const oldPath = simulateHistoricalBootstrapScenario(legacy, settings)
    const newPath = simulateHistoricalBootstrapScenario(adapted, settings)
    expect(newPath.metadata).toEqual(oldPath.metadata) // same seed and sampled path, not just distribution.
    expectNumericalParity(newPath, oldPath)
    expectNumericalParity(simulateHistoricalBootstrapReferenceScenario(adapted, settings), simulateHistoricalBootstrapReferenceScenario(legacy, settings))
    expect(runHistoricalBootstrapSimulation(adapted, settings)).toEqual(runHistoricalBootstrapSimulation(legacy, settings))
    if (!needsEstimator(legacy)) {
      const stochastic = { simulations: 4, seed: 73491, allocation: { equity: .6, bonds: .3, fixed: .1 } }
      expect(runStochasticSimulation(adapted, stochastic)).toEqual(runStochasticSimulation(legacy, stochastic))
    }
    if (name === 'own-totals' || name === 'coverage-unsure') {
      for (const row of simulateScenario(adapted).retirementRows.filter(row => row.insurance?.phase === 'pension')) {
        expect(row.healthInsurance).toBeCloseTo(80 * 12 * row.inflationFactor, 10)
        expect(row.careInsurance).toBeCloseTo(20 * 12 * row.inflationFactor, 10)
      }
    }
    expect(legacy).toEqual(snapshot)
  })
})
