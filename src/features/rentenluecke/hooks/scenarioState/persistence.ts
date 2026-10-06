import { applyCoverage, insuranceCoverageSchema } from '../../model/insuranceCoverage'
import { z } from 'zod'
import { rentenlueckeInputSchema } from '../../model/inputSchema'
import { retirementInsuranceSchema, insurancePhaseSchema } from '../../model/retirementInsurance'
import { estimatorSetupSchema } from '../../model/capitalIncome/schema'
import { childrenEngineFields } from '../../model/childrenAnswer'
import { timelineBoundary } from '../../model/scenarioTimeline'
import { calculateAllocationFromBuckets, calculatePortfolioBucketTotal } from '../../model/portfolioBuckets'
import { calculatePortfolioExpectedReturn } from '../../model/stochasticReturns'
import { createDefaultState, withDeterministicPortfolioReturn } from './defaults'
import type { ScenarioState } from './types'

export const STORAGE_KEY = 'rentenlueckenrechner.scenario.v15'
export const RESET_NOTICE_KEY = 'rentenlueckenrechner.ux-pr2-reset-notice'
export const MANDATORY_CAPITAL_NOTICE_KEY = 'rentenlueckenrechner.mandatory-detailed-capital-notice.v1'
export const TAGESGELD_PLANNING_RATE_NOTICE_KEY = 'rentenlueckenrechner.tagesgeld-planning-rate-notice.v1'
// Draft validation checks shape/types, deliberately not calculation validity.
// Nonfinite input is encoded as a tagged draft value, never a financial answer.
const draftNumber = z.custom<number>(value => typeof value === 'number')
const optionalNumber = draftNumber.optional()
const phase = insurancePhaseSchema.extend({ kvMonthlyToday: optionalNumber, pvMonthlyToday: optionalNumber, capitalMonthlyToday: optionalNumber })
const insurance = retirementInsuranceSchema.extend({
  pensionAge: optionalNumber, referenceYear: draftNumber, insurerAdditionalRate: optionalNumber,
  childBirthYears: z.array(draftNumber), bridge: phase, pension: phase,
  rates: z.object({ kvGeneralRate: optionalNumber, kvReducedRate: optionalNumber, pvBaseRate: optionalNumber }).optional(),
  capitalEstimator: estimatorSetupSchema.extend({ fundAcquisitionCost: optionalNumber, projectedBasisRate: draftNumber }).optional(),
})
const stream = z.object({
  ...rentenlueckeInputSchema.shape.retirementIncomeStreams.unwrap().element.shape,
  amountMonthlyToday: draftNumber, startAge: draftNumber, endAge: draftNumber.nullable(), effectiveDeductionRate: draftNumber,
  rentalAssessmentMonthlyToday: optionalNumber,
})
const portfolio = z.array(z.object({ id: z.string(), name: z.string(), value: draftNumber, returnSeriesId: z.string(), annualCostRate: optionalNumber,
  holding: z.enum(['accumulating-equity-fund', 'ordinary-bank-deposit', 'unsupported']).optional(),
}))
const input = z.object({
  ...rentenlueckeInputSchema.shape,
  currentAge: draftNumber, retirementAge: draftNumber, planningAge: draftNumber, currentCapital: draftNumber,
  monthlyContributionToday: draftNumber, monthlyDesiredSpendingToday: draftNumber, monthlyRetirementIncomeToday: draftNumber,
  annualInflationRate: draftNumber, annualReturnBeforeRetirement: draftNumber, annualReturnInRetirement: draftNumber,
  retirementIncomeStreams: z.array(stream).optional(), retirementInsurance: insurance.optional(), estimatorPortfolio: portfolio.optional(),
})
const children = z.discriminatedUnion('kind', [z.object({ kind: z.literal('missing') }), z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('children'), rows: z.array(z.object({ id: z.string(), year: optionalNumber })).min(1).refine(rows => new Set(rows.map(row => row.id)).size === rows.length) })])
const persistedScenarioSchema = z.object({ version: z.literal(15), input, portfolioBuckets: portfolio, retirementIncomeStreams: z.array(stream),
  insuranceCoverageAnswers: insuranceCoverageSchema, childrenAnswer: children, explicitInsuranceTransition: optionalNumber, historical: z.object({ inflationSourceId: z.string(), simulations: optionalNumber, cashMode: z.string().optional(), cashPlanningRate: optionalNumber, cashRealRate: optionalNumber, cashPlanningRateConfirmed: z.boolean().optional() }),
})
export function loadInitialState(): ScenarioState {
  if (typeof localStorage === 'undefined') return createDefaultState()
  const oldKeys = Object.keys(localStorage).filter(key => /^rentenlueckenrechner\.scenario\.v(?:[1-9]|1[0-4])$/.test(key))
  if (oldKeys.length) {
    oldKeys.forEach(key => localStorage.removeItem(key))
    localStorage.setItem(RESET_NOTICE_KEY, '1')
  }
  return parsePersistedScenarioState(localStorage.getItem(STORAGE_KEY))
}
export function extractPortfolioSettingsForPersistence(state: ScenarioState): ScenarioState['portfolioEstimatorSettings'] {
  return state.portfolioEstimatorSettings ?? state.input.retirementInsurance?.capitalEstimator
}

export function hasLegacyManualCapitalEstimate(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const insurance = (value as { retirementInsurance?: { bridge?: Record<string, unknown>; pension?: Record<string, unknown> } }).retirementInsurance
    ?? (value as { input?: { retirementInsurance?: { bridge?: Record<string, unknown>; pension?: Record<string, unknown> } } }).input?.retirementInsurance
  if (!insurance) return false
  for (const phase of ['bridge', 'pension'] as const) {
    const p = insurance[phase] as Record<string, unknown> | undefined
    if (!p) continue
    if (p.capitalMode !== undefined || p.capitalMonthlyToday !== undefined) return true
  }
  return false
}

export function readMandatoryCapitalNotice(): string | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem(MANDATORY_CAPITAL_NOTICE_KEY)
}

export function dismissMandatoryCapitalNotice(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(MANDATORY_CAPITAL_NOTICE_KEY, 'dismissed')
}

function ensureMandatoryCapitalNoticeForLegacy(stored: unknown): void {
  if (typeof localStorage === 'undefined') return
  if (!hasLegacyManualCapitalEstimate(stored)) return
  if (localStorage.getItem(MANDATORY_CAPITAL_NOTICE_KEY) === null) {
    localStorage.setItem(MANDATORY_CAPITAL_NOTICE_KEY, 'pending')
  }
}

export function readTagesgeldPlanningRateNotice(): string | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem(TAGESGELD_PLANNING_RATE_NOTICE_KEY)
}

export function dismissTagesgeldPlanningRateNotice(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(TAGESGELD_PLANNING_RATE_NOTICE_KEY, 'dismissed')
}

function hasCashCategoryBucketWithoutConfirmedRate(stored: unknown): boolean {
  if (!stored || typeof stored !== 'object') return false
  const record = stored as { portfolioBuckets?: unknown; historical?: unknown }
  const buckets = Array.isArray(record.portfolioBuckets) ? record.portfolioBuckets : []
  const historical = (record.historical ?? {}) as { cashMode?: unknown; cashPlanningRate?: unknown; cashRealRate?: unknown; cashPlanningRateConfirmed?: unknown }
  const hasCashBucket = buckets.some((bucket) => {
    if (!bucket || typeof bucket !== 'object') return false
    const id = (bucket as { returnSeriesId?: unknown }).returnSeriesId
    if (typeof id !== 'string') return false
    if (id === 'tagesgeld-planzins-v1') return true
    if (id === 'tagesgeld-historisch-strategie-v1') return true
    if (id === 'tagesgeld-realannahme-v1') return true
    if (id === 'synthetic-cash-assumption-v1') return true
    if (id === 'jst-r6-developed-equal-weight-bills-real-post1950') return true
    return false
  })
  if (!hasCashBucket) return false
  if (historical.cashPlanningRateConfirmed !== true) return true
  const mode = historical.cashMode
  if (mode === undefined) return !(typeof historical.cashPlanningRate === 'number' && Number.isFinite(historical.cashPlanningRate) && historical.cashPlanningRate >= 0)
  if (mode === 'real-assumption-zero-floor') return !(typeof historical.cashRealRate === 'number' && Number.isFinite(historical.cashRealRate) && historical.cashRealRate > -1)
  if (mode === 'historical-zero-floor') return false
  if (mode === 'constant-nominal') return !(typeof historical.cashPlanningRate === 'number' && Number.isFinite(historical.cashPlanningRate) && historical.cashPlanningRate >= 0)
  return true
}

function ensureTagesgeldPlanningRateNotice(stored: unknown): void {
  if (typeof localStorage === 'undefined') return
  if (!hasCashCategoryBucketWithoutConfirmedRate(stored)) return
  if (localStorage.getItem(TAGESGELD_PLANNING_RATE_NOTICE_KEY) === null) {
    localStorage.setItem(TAGESGELD_PLANNING_RATE_NOTICE_KEY, 'pending')
  }
}

export function serializeScenarioState(state: ScenarioState): string {
  const { portfolioEstimatorSettings, ...rest } = state
  const legacySettings = portfolioEstimatorSettings ?? state.input.retirementInsurance?.capitalEstimator
  const storedInput = { ...rest.input }
  if (storedInput.retirementInsurance) {
    const insuranceWithoutEstimator = { ...storedInput.retirementInsurance } as Record<string, unknown>
    delete insuranceWithoutEstimator.capitalEstimator
    const bridge = { ...(insuranceWithoutEstimator.bridge as Record<string, unknown> | undefined) } as Record<string, unknown>
    const pension = { ...(insuranceWithoutEstimator.pension as Record<string, unknown> | undefined) } as Record<string, unknown>
    delete bridge.capitalMode
    delete bridge.capitalMonthlyToday
    delete pension.capitalMode
    delete pension.capitalMonthlyToday
    const cleanedWithoutEstimator = { ...insuranceWithoutEstimator, bridge, pension }
    storedInput.retirementInsurance = legacySettings === undefined
      ? cleanedWithoutEstimator as unknown as typeof storedInput.retirementInsurance
      : { ...cleanedWithoutEstimator, capitalEstimator: legacySettings } as unknown as typeof storedInput.retirementInsurance
  } else if (legacySettings !== undefined) {
    storedInput.retirementInsurance = { capitalEstimator: legacySettings } as unknown as typeof storedInput.retirementInsurance
  }
  return JSON.stringify({ ...rest, input: storedInput, version: 15, childrenAnswer: state.childrenAnswer ?? { kind: 'missing' } }, (_key, value) =>
    typeof value === 'number' && !Number.isFinite(value) ? { draftNumber: String(value) } : value)
}
export function parsePersistedScenarioState(stored: string | null): ScenarioState {
  if (!stored) return createDefaultState()
  try {
    const parsed: unknown = JSON.parse(stored, (_key, value) => {
      if (value && typeof value === 'object' && Object.keys(value).length === 1 && ['NaN', 'Infinity', '-Infinity'].includes(value.draftNumber)) return Number(value.draftNumber)
      return value
    })
    const persisted = persistedScenarioSchema.safeParse(parsed)
    if (!persisted.success) return createDefaultState()
    ensureMandatoryCapitalNoticeForLegacy(parsed)
    ensureTagesgeldPlanningRateNotice(parsed)
    const state = persisted.data
    const allocation = calculateAllocationFromBuckets(state.portfolioBuckets)
    const storedInsurance = state.input.retirementInsurance
    const persistedInsurance = storedInsurance && storedInsurance.insurerAdditionalRate === undefined
      ? { ...storedInsurance, insurerAdditionalRate: 0.029 }
      : storedInsurance
    const persistedLifeTableSex = state.input.lifeTableSex ?? 'conservative'
    const legacySettings = (persistedInsurance as { capitalEstimator?: ScenarioState['portfolioEstimatorSettings'] } | undefined)?.capitalEstimator
      ?? (parsed as { portfolioEstimatorSettings?: ScenarioState['portfolioEstimatorSettings'] }).portfolioEstimatorSettings
    const insuranceWithoutEstimator = { ...(persistedInsurance ?? {}) } as Record<string, unknown>
    delete insuranceWithoutEstimator.capitalEstimator
    const strippedInsurance = persistedInsurance ? { ...insuranceWithoutEstimator } as unknown as typeof persistedInsurance : undefined
    return { insuranceCoverageAnswers: state.insuranceCoverageAnswers, childrenAnswer: state.childrenAnswer, explicitInsuranceTransition: state.explicitInsuranceTransition, portfolioBuckets: state.portfolioBuckets, retirementIncomeStreams: state.retirementIncomeStreams, historical: state.historical, portfolioEstimatorSettings: legacySettings, input: withDeterministicPortfolioReturn({ ...state.input, lifeTableSex: persistedLifeTableSex,
      retirementIncomeStreams: state.retirementIncomeStreams, currentCapital: calculatePortfolioBucketTotal(state.portfolioBuckets),
      retirementInsurance: strippedInsurance ? { ...applyCoverage(strippedInsurance, state.insuranceCoverageAnswers),
        pensionAge: timelineBoundary(state.retirementIncomeStreams, state.explicitInsuranceTransition), ...childrenEngineFields(state.childrenAnswer),
      } : undefined,
    }, calculatePortfolioExpectedReturn(allocation)) }
  } catch {
    return createDefaultState()
  }
}
