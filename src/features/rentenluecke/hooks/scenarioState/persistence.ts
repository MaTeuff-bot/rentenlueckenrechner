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

export const STORAGE_KEY = 'rentenlueckenrechner.scenario.v16'
export const RESET_NOTICE_KEY = 'rentenlueckenrechner.ux-pr2-reset-notice'
export const LIFECYCLE_RESET_NOTICE_KEY = 'rentenlueckenrechner.lifecycle-reset-notice'
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
const lifecycleTarget = z.union([
  z.object({ role: z.literal('fixedReserve'), amountToday: draftNumber }),
  z.object({ role: z.literal('percent'), share: draftNumber }),
])
const lifecycleMilestone = z.object({ name: z.string(), startAge: draftNumber, targets: z.record(z.string(), lifecycleTarget) })
const lifecycleTransition = z.object({ fromMilestone: z.string(), toMilestone: z.string(), startAge: draftNumber, durationYears: draftNumber })
const lifecycleClassification = z.record(z.string(), z.enum(['equityFund', 'bondFund', 'deposit']))
const lifecycleCosts = z.record(z.string(), draftNumber)
const lifecycleTaxSettings = z.object({
  allowanceAnnualToday: optionalNumber,
  churchRate: optionalNumber,
  basisRate: optionalNumber,
  expenseAllowanceAnnualToday: optionalNumber,
})
const persistedScenarioSchema = z.object({ version: z.literal(16), input, portfolioBuckets: portfolio, retirementIncomeStreams: z.array(stream),
  insuranceCoverageAnswers: insuranceCoverageSchema, childrenAnswer: children, explicitInsuranceTransition: optionalNumber, historical: z.object({ inflationSourceId: z.string() }),
  lifecycleClassification: lifecycleClassification.optional(), lifecycleAcquisitionCost: lifecycleCosts.optional(),
  lifecycleTaxCashId: z.string().optional(), lifecycleTaxSettings: lifecycleTaxSettings.optional(),
  lifecycleMilestones: z.array(lifecycleMilestone).optional(), lifecycleTransitions: z.array(lifecycleTransition).optional(),
})
export function loadInitialState(): ScenarioState {
  if (typeof localStorage === 'undefined') return createDefaultState()
  const oldKeys = Object.keys(localStorage).filter(key => /^rentenlueckenrechner\.scenario\.v(?:[1-9]|1[0-5])$/.test(key))
  if (oldKeys.length) {
    oldKeys.forEach(key => localStorage.removeItem(key))
    localStorage.setItem(RESET_NOTICE_KEY, '1')
    localStorage.setItem(LIFECYCLE_RESET_NOTICE_KEY, '1')
  }
  return parsePersistedScenarioState(localStorage.getItem(STORAGE_KEY))
}
export function serializeScenarioState(state: ScenarioState): string {
  return JSON.stringify({ ...state, version: 16, childrenAnswer: state.childrenAnswer ?? { kind: 'missing' } }, (_key, value) =>
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
    const state = persisted.data
    const allocation = calculateAllocationFromBuckets(state.portfolioBuckets)
    return {
      insuranceCoverageAnswers: state.insuranceCoverageAnswers,
      childrenAnswer: state.childrenAnswer,
      explicitInsuranceTransition: state.explicitInsuranceTransition,
      portfolioBuckets: state.portfolioBuckets,
      retirementIncomeStreams: state.retirementIncomeStreams,
      historical: state.historical,
      lifecycleClassification: (state.lifecycleClassification ?? {}) as ScenarioState['lifecycleClassification'],
      lifecycleAcquisitionCost: (state.lifecycleAcquisitionCost ?? {}) as ScenarioState['lifecycleAcquisitionCost'],
      lifecycleTaxCashId: state.lifecycleTaxCashId,
      lifecycleTaxSettings: (state.lifecycleTaxSettings ?? { allowanceAnnualToday: 1000, churchRate: 0, basisRate: 0.032 }) as ScenarioState['lifecycleTaxSettings'],
      lifecycleMilestones: state.lifecycleMilestones as ScenarioState['lifecycleMilestones'],
      lifecycleTransitions: state.lifecycleTransitions as ScenarioState['lifecycleTransitions'],
      input: withDeterministicPortfolioReturn({ ...state.input,
        retirementIncomeStreams: state.retirementIncomeStreams, currentCapital: calculatePortfolioBucketTotal(state.portfolioBuckets),
        retirementInsurance: state.input.retirementInsurance ? { ...applyCoverage(state.input.retirementInsurance, state.insuranceCoverageAnswers),
          pensionAge: timelineBoundary(state.retirementIncomeStreams, state.explicitInsuranceTransition), ...childrenEngineFields(state.childrenAnswer),
        } : undefined,
      }, calculatePortfolioExpectedReturn(allocation)),
    }
  } catch {
    return createDefaultState()
  }
}
export function knownAppOwnedKeys(): string[] {
  if (typeof localStorage === 'undefined') return []
  return Object.keys(localStorage).filter(key => key === STORAGE_KEY || key === RESET_NOTICE_KEY || key === LIFECYCLE_RESET_NOTICE_KEY || /^rentenlueckenrechner\.scenario\.v\d+$/.test(key))
}
