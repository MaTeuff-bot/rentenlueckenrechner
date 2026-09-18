import { capitalMode } from './capitalIncome/setup.js'
import {
  applySourceCostTreatment,
  resolveComponentExpectedNominalReturn,
  resolveComponentNominalReturn,
  resolveInflationForSampledYear,
  sampleHistoricalYearsForPath,
} from './historicalReturns/bootstrapSampling.js'
import {
  findHistoricalReturnSeries,
  findSyntheticReturnSeries,
} from './historicalReturns/returnSeriesRegistry.js'
import { createHistoricalBootstrapSeed } from './historicalReturns/seed.js'
import { getRequiredInflationSource, getReturnSeriesCategory, getValidHistoricalYears } from './historicalReturns/sourceOptions.js'
import { isFixedInflationSource } from './historicalReturns/inflationSeriesRegistry.js'
import type { HistoricalBootstrapSettings } from './historicalReturns/types.js'
import { createSeededRandom } from './stochasticReturns.js'
import type { OpeningBucket } from './investmentTax/index.js'
import { liquidateLifecycle } from './lifecycleAllocation/index.js'
import type { LifecycleConfig } from './lifecycleAllocation/types.js'
import {
  assessTerminalInsurance,
  cumulativeInflationFactors,
  ledgerSurvives,
  runLedgerBootstrap,
  runLedgerDeterministic,
  searchLedgerCapital,
} from './lifecycleLedger/index.js'
import type {
  LedgerBootstrapResult,
  LedgerInsuranceSpec,
  LedgerResult,
  LedgerYearInput,
} from './lifecycleLedger/index.js'
import { activeIncomeStreams, phaseManualReasons, phaseStreams } from './retirementInsurance.js'
import type { PortfolioBucket } from './portfolioBuckets.js'
import { calculatePortfolioBucketTotal } from './portfolioBuckets.js'
import type { RentenlueckeInput, RetirementIncomeStream } from './types.js'
import { LIFECYCLE_REFERENCE_PRICE } from './lifecycleDraft.js'
import type { LifecycleClassification } from './lifecycleDraft.js'

export type LifecycleMarketYear = {
  fundPrices: Record<string, number>
  depositRates: Record<string, number>
  inflationFactor: number
  annualInflationRate: number
}
export type LifecycleYearPlan = {
  age: number
  year: number
  contribution: number
  withdrawalNeed: number
  allowance: number
  churchRate: 0 | 0.08 | 0.09
  basisRate: number
  inflationFactor: number
  insurance: LedgerInsuranceSpec
}
export type LifecycleSummary = {
  years: number
  survived: boolean
  depleted: boolean
  nonconverged: boolean
  depletionAge: number | null
  unfundedWithdrawalTotal: number
  unfundedInsuranceTotal: number
  taxPaidTotal: number
  remainingLiabilitiesTotal: number
  closingNominal: number
  liquidationNominal: number
  liquidationReal: number
  liquidationOutstandingLiability: number
  incrementalInsuranceAnnual: number
  terminalAssumption: string
}
export type LifecycleRun = {
  config: LifecycleConfig
  opening: OpeningBucket[]
  years: LedgerYearInput[]
  result: LedgerResult
  summary: LifecycleSummary
  bootstrap: LedgerBootstrapResult | null
  requiredCapital: { status: string; requiredCapital?: number; reason?: string } | null
}
function componentForBucket(bucket: PortfolioBucket) {
  const category = getReturnSeriesCategory(bucket.returnSeriesId)
  const role = category === 'equity' ? 'equity' : category === 'bond' ? 'bond' : category === 'cash' ? 'cash' : 'other'
  return {
    id: bucket.id,
    label: bucket.name,
    role: role as 'equity' | 'bond' | 'cash' | 'other',
    weight: 1,
    returnSeriesId: bucket.returnSeriesId,
    annualCostRate: bucket.annualCostRate ?? 0,
  }
}
function bucketReturnSupported(bucket: PortfolioBucket): boolean {
  return Boolean(findHistoricalReturnSeries(bucket.returnSeriesId) ?? findSyntheticReturnSeries(bucket.returnSeriesId))
}
export function buildLifecycleConfig(
  portfolioBuckets: PortfolioBucket[],
  classification: Record<string, LifecycleClassification | undefined>,
  milestones: LifecycleConfig['milestones'],
  transitions: LifecycleConfig['transitions'],
  taxCashId: string,
): LifecycleConfig {
  const buckets = portfolioBuckets.map((bucket, index) => {
    const kind = classification[bucket.id]
    if (kind !== 'equityFund' && kind !== 'bondFund' && kind !== 'deposit') throw new Error(`Missing classification for ${bucket.id}`)
    return { id: bucket.id, name: bucket.name.trim() || `Anlage ${index + 1}`, kind, priority: index + 1 }
  })
  return { buckets, milestones, transitions, taxCashId }
}
export function buildOpeningBuckets(
  portfolioBuckets: PortfolioBucket[],
  classification: Record<string, LifecycleClassification | undefined>,
  acquisitionCost: Record<string, number | undefined>,
): OpeningBucket[] {
  return portfolioBuckets.map((bucket) => {
    const kind = classification[bucket.id]
    if (kind !== 'equityFund' && kind !== 'bondFund' && kind !== 'deposit') throw new Error(`Missing classification for ${bucket.id}`)
    if (kind === 'deposit') {
      return { id: bucket.id, name: bucket.name, classification: 'deposit' as const, value: Math.max(0, bucket.value) }
    }
    const cost = acquisitionCost[bucket.id]
    if (cost === undefined || !Number.isFinite(cost) || cost < 0) throw new Error(`Missing acquisition cost for ${bucket.id}`)
    const value = Math.max(0, bucket.value)
    const price = LIFECYCLE_REFERENCE_PRICE
    const units = value / price
    if (units === 0 && cost !== 0) throw new Error(`Basis without units for ${bucket.id}`)
    return { id: bucket.id, name: bucket.name, classification: kind as 'equityFund' | 'bondFund', units, price, acquisitionCost: cost }
  })
}
function pensionsCashNominal(streams: RetirementIncomeStream[], age: number, inflationFactor: number): { cash: number; gross: number; deductions: number } {
  let gross = 0
  let deductions = 0
  for (const stream of activeIncomeStreams(streams, age)) {
    const amount = stream.amountMonthlyToday * 12 * inflationFactor
    gross += amount
    if (stream.amountBasis === 'gross' && stream.deductionMode === 'effectiveHaircut') {
      deductions += amount * stream.effectiveDeductionRate
    }
  }
  return { cash: gross - deductions, gross, deductions }
}
function rentalAssessmentNominal(streams: RetirementIncomeStream[], age: number, inflationFactor: number): number {
  let total = 0
  for (const stream of activeIncomeStreams(streams, age)) {
    if (stream.kind === 'rental-income' && stream.rentalAssessmentMonthlyToday !== undefined) {
      total += stream.rentalAssessmentMonthlyToday * 12 * inflationFactor
    }
  }
  return total / 12
}
export function buildLedgerInsuranceSpecForYear(args: {
  input: RentenlueckeInput
  streams: RetirementIncomeStream[]
  age: number
  calendarYear: number
  inflationFactor: number
  pensionsCashMonthly: number
  rentalMonthly: number
}): LedgerInsuranceSpec {
  const { input, streams, age, calendarYear, inflationFactor, pensionsCashMonthly, rentalMonthly } = args
  const insurance = input.retirementInsurance
  if (!insurance) throw new Error('Insurance answers required')
  if (age < input.retirementAge) {
    return {
      status: 'voluntary',
      phase: 'bridge',
      calendarYear,
      cashflowBeforeInsuranceMonthly: 0,
      insurerAdditionalRate: insurance.insurerAdditionalRate ?? 0,
      insuredBirthYear: (insurance.referenceYear ?? calendarYear) - input.currentAge,
      isParent: insurance.isParent ?? false,
      childBirthYears: insurance.childBirthYears ?? [],
      statutoryPensions: [],
      occupationalPensions: [],
      rentalAssessmentMonthly: 0,
      manual: { reason: 'accumulation: no retirement KV/PV', kvMonthly: 0, pvMonthly: 0 },
    }
  }
  const pensionAge = insurance.pensionAge
  if (pensionAge === undefined || !Number.isInteger(pensionAge)) throw new Error('Pension age required')
  const phase: 'bridge' | 'pension' = age < pensionAge ? 'bridge' : 'pension'
  const active = activeIncomeStreams(streams, age)
  const relevant = phaseStreams(streams, insurance, phase, input.retirementAge, input.planningAge)
  const reasons = phaseManualReasons(insurance, phase, relevant)
  const insuredBirthYear = (insurance.referenceYear ?? calendarYear) - input.currentAge
  const common = {
    phase,
    calendarYear,
    cashflowBeforeInsuranceMonthly: pensionsCashMonthly,
    insurerAdditionalRate: insurance.insurerAdditionalRate ?? 0,
    insuredBirthYear,
    isParent: insurance.isParent ?? false,
    childBirthYears: insurance.childBirthYears ?? [],
    statutoryPensions: active.filter((s) => s.kind === 'gesetzliche-rente').map((s) => ({ id: s.id, grossMonthly: s.amountMonthlyToday * inflationFactor })),
    occupationalPensions: active.filter((s) => s.kind === 'betriebsrente').map((s) => ({ id: s.id, grossMonthly: s.amountMonthlyToday * inflationFactor })),
    rentalAssessmentMonthly: rentalMonthly,
    drvSubsidy: phase === 'pension' ? (insurance[phase].drvSubsidy as 'confirmed' | 'not-received' | undefined) : undefined,
    expenseAllowanceAnnual: undefined as number | undefined,
    rateOverrides: insurance.rates as LedgerInsuranceSpec['rateOverrides'],
  }
  if (reasons.length) {
    const p = insurance[phase]
    if (p.kvMonthlyToday === undefined || p.pvMonthlyToday === undefined) throw new Error(`${phase} manual totals required`)
    return {
      status: (p.status as 'kvdr' | 'voluntary' | 'unknown' | undefined) === 'kvdr' ? 'kvdr' : 'voluntary',
      ...common,
      manual: { reason: reasons.join('; '), kvMonthly: p.kvMonthlyToday * inflationFactor, pvMonthly: p.pvMonthlyToday * inflationFactor },
    }
  }
  const p = insurance[phase]
  const status = (p.status ?? 'unknown') as 'kvdr' | 'voluntary' | 'unknown'
  if (status !== 'kvdr' && status !== 'voluntary' && status !== 'unknown') throw new Error(`Unsupported status ${p.status}`)
  const mode = capitalMode(p)
  const manualCapital = mode === 'manual' ? p.capitalMonthlyToday : undefined
  if (status !== 'kvdr' && mode === 'manual' && (manualCapital === undefined || !Number.isFinite(manualCapital) || manualCapital < 0)) {
    throw new Error(`${phase} manual capital assessment required`)
  }
  return {
    status,
    ...common,
    manualCapitalAssessmentMonthlyToday: status === 'kvdr' ? undefined : mode === 'manual' ? manualCapital : undefined,
    manual: null,
  }
}
export function deriveMarketYears(
  portfolioBuckets: PortfolioBucket[],
  classification: Record<string, LifecycleClassification | undefined>,
  settings: HistoricalBootstrapSettings,
  annualInflationRate: number,
  years: number,
  sampledYears: number[],
  rng?: () => number,
): LifecycleMarketYear[] {
  const inflationSource = getRequiredInflationSource(settings.inflationSourceId, annualInflationRate)
  const annualRates: number[] = sampledYears.map((y) => {
    if (isFixedInflationSource(inflationSource)) {
      return annualInflationRate
    }
    try {
      return resolveInflationForSampledYear(inflationSource, y)
    } catch {
      return annualInflationRate
    }
  })
  const factors = cumulativeInflationFactors(annualRates.length ? annualRates : Array.from({ length: years }, () => annualInflationRate))
  const prices: Record<string, number> = {}
  for (const bucket of portfolioBuckets) {
    const kind = classification[bucket.id]
    if (kind !== 'equityFund' && kind !== 'bondFund') continue
    prices[bucket.id] = LIFECYCLE_REFERENCE_PRICE
  }
  const out: LifecycleMarketYear[] = []
  for (let i = 0; i < years; i++) {
    const sampledYear = sampledYears[i] ?? 0
    const inflation = annualRates[i] ?? annualInflationRate
    const fundPrices: Record<string, number> = {}
    const depositRates: Record<string, number> = {}
    for (const bucket of portfolioBuckets) {
      const kind = classification[bucket.id]
      if (!bucketReturnSupported(bucket)) throw new Error(`Unknown return series for ${bucket.id}`)
      const component = componentForBucket(bucket)
      let nominal: number
      if (rng) {
        nominal = applySourceCostTreatment(resolveComponentNominalReturn(component, sampledYear, inflation, rng), bucket.returnSeriesId, bucket.annualCostRate ?? 0)
      } else {
        nominal = resolveComponentExpectedNominalReturn(component, sampledYear, inflation)
      }
      if (!Number.isFinite(nominal) || nominal <= -1) throw new Error(`Invalid nominal return for ${bucket.id}`)
      if (kind === 'deposit' && nominal < 0) throw new Error(`Deposit nominal return ${nominal} for ${bucket.id} is negative and not supported by the deposit ledger (nonnegative rates only)`)
      if (kind === 'deposit') {
        depositRates[bucket.id] = nominal
      } else if (kind === 'equityFund' || kind === 'bondFund') {
        const prev = prices[bucket.id] ?? LIFECYCLE_REFERENCE_PRICE
        const next = Math.max(0, prev * (1 + nominal))
        prices[bucket.id] = next
        fundPrices[bucket.id] = next
      }
    }
    out.push({ fundPrices, depositRates, inflationFactor: factors[i] ?? 1, annualInflationRate: inflation })
  }
  return out
}
export function buildLedgerYears(args: {
  input: RentenlueckeInput
  streams: RetirementIncomeStream[]
  portfolioBuckets: PortfolioBucket[]
  classification: Record<string, LifecycleClassification | undefined>
  tax: { allowanceAnnualToday: number; churchRate: 0 | 0.08 | 0.09; basisRate: number; expenseAllowanceAnnualToday?: number }
  marketYears: LifecycleMarketYear[]
  firstCalendarYear: number
}): LedgerYearInput[] {
  const { input, streams, tax, marketYears, firstCalendarYear } = args
  return marketYears.map((market, index) => {
    const age = input.currentAge + index
    const calendarYear = firstCalendarYear + index
    const inflationFactor = market.inflationFactor
    const allowance = tax.allowanceAnnualToday * inflationFactor
    const pensions = age < input.retirementAge
      ? { cash: 0 }
      : pensionsCashNominal(streams, age, inflationFactor)
    const rentalMonthly = age < input.retirementAge ? 0 : rentalAssessmentNominal(streams, age, inflationFactor)
    const contribution = age < input.retirementAge
      ? input.monthlyContributionToday * 12 * inflationFactor
      : pensions.cash
    const withdrawalNeed = age < input.retirementAge
      ? 0
      : input.monthlyDesiredSpendingToday * 12 * inflationFactor
    const insurance = buildLedgerInsuranceSpecForYear({
      input,
      streams,
      age,
      calendarYear,
      inflationFactor,
      pensionsCashMonthly: age < input.retirementAge ? 0 : pensions.cash / 12,
      rentalMonthly,
    })
    if (tax.expenseAllowanceAnnualToday !== undefined) {
      insurance.expenseAllowanceAnnual = tax.expenseAllowanceAnnualToday * inflationFactor
    }
    return {
      age,
      year: calendarYear,
      contribution,
      withdrawalNeed,
      allowance,
      churchRate: tax.churchRate,
      fundPrices: market.fundPrices,
      depositRates: market.depositRates,
      basisRate: tax.basisRate,
      inflationFactor,
      insurance,
    }
  })
}
export function summarizeLedgerResult(result: LedgerResult, terminalInflation: number, taxCashId: string, horizonSpec?: LedgerInsuranceSpec): LifecycleSummary {
  const reports = result.reports
  const unfundedWithdrawalTotal = reports.reduce((n, r) => n + r.unfundedWithdrawal, 0)
  const unfundedInsuranceTotal = reports.reduce((n, r) => n + r.unfundedInsuranceKv + r.unfundedInsurancePv, 0)
  const taxPaidTotal = reports.reduce((n, r) => n + r.taxPaid, 0)
  const last = reports.at(-1)
  const remaining = last?.remainingLiabilities ?? {}
  const remainingLiabilitiesTotal = Object.values(remaining).reduce((n, v) => n + v, 0)
  const nonconverged = reports.some((r) => r.solverExhausted)
  const depleted = unfundedWithdrawalTotal > 0.01 || unfundedInsuranceTotal > 0.01 || remainingLiabilitiesTotal > 0.01
  const depletionIndex = reports.findIndex((r) => r.unfundedWithdrawal > 0.01 || r.unfundedInsuranceKv > 0.01 || r.unfundedInsurancePv > 0.01 || Object.values(r.remainingLiabilities).some((v) => v > 0.01))
  const closingNominal = last?.closingValue ?? 0
  let incrementalInsuranceAnnual = 0
  let terminalAssumption = 'none'
  const clone = structuredClone(result.state)
  const { nominal, outstandingLiability } = liquidateLifecycle(clone, taxCashId, terminalInflation)
  let liquidationNominal = nominal
  const liquidationOutstandingLiability = outstandingLiability
  if (horizonSpec) {
    const baseAssessment = last?.capitalAssessmentAnnual ?? 0
    const terminal = assessTerminalInsurance({ state: result.state, taxCashId, cumulativeInflation: terminalInflation, spec: horizonSpec, baseCapitalAssessmentAnnual: baseAssessment })
    incrementalInsuranceAnnual = terminal.incrementalKvAnnual + terminal.incrementalPvAnnual
    terminalAssumption = terminal.assumption
    liquidationNominal = Math.max(0, nominal - incrementalInsuranceAnnual)
  }
  const liquidationReal = terminalInflation > 0 ? liquidationNominal / terminalInflation : liquidationNominal
  return {
    years: reports.length,
    survived: !depleted && !nonconverged,
    depleted,
    nonconverged,
    depletionAge: depletionIndex >= 0 ? (reports[depletionIndex]?.age ?? null) : null,
    unfundedWithdrawalTotal,
    unfundedInsuranceTotal,
    taxPaidTotal,
    remainingLiabilitiesTotal,
    closingNominal,
    liquidationNominal,
    liquidationReal,
    liquidationOutstandingLiability,
    incrementalInsuranceAnnual,
    terminalAssumption,
  }
}
export function expectedBucketReturns(
  portfolioBuckets: PortfolioBucket[],
  settings: HistoricalBootstrapSettings,
  annualInflationRate: number,
): Record<string, number> {
  const inflationSource = getRequiredInflationSource(settings.inflationSourceId, annualInflationRate)
  const validYears = getValidHistoricalYears(settings.portfolioComponents, inflationSource)
  const years = validYears.length ? validYears : [0]
  const out: Record<string, number> = {}
  for (const bucket of portfolioBuckets) {
    const component = componentForBucket(bucket)
    let sum = 0
    for (const y of years) {
      const inflation = (() => {
        if (isFixedInflationSource(inflationSource)) return annualInflationRate
        try {
          return resolveInflationForSampledYear(inflationSource, y)
        } catch {
          return annualInflationRate
        }
      })()
      sum += resolveComponentExpectedNominalReturn(component, y, inflation)
    }
    out[bucket.id] = sum / years.length
  }
  return out
}
export function deriveDeterministicMarketYears(
  portfolioBuckets: PortfolioBucket[],
  classification: Record<string, LifecycleClassification | undefined>,
  annualInflationRate: number,
  inflationAnnualRates: number[],
  expectedReturns: Record<string, number>,
): LifecycleMarketYear[] {
  const factors = cumulativeInflationFactors(inflationAnnualRates.length ? inflationAnnualRates : [annualInflationRate])
  const prices: Record<string, number> = {}
  for (const bucket of portfolioBuckets) {
    const kind = classification[bucket.id]
    if (kind !== 'equityFund' && kind !== 'bondFund') continue
    prices[bucket.id] = LIFECYCLE_REFERENCE_PRICE
  }
  const out: LifecycleMarketYear[] = []
  for (let i = 0; i < inflationAnnualRates.length; i++) {
    const fundPrices: Record<string, number> = {}
    const depositRates: Record<string, number> = {}
    for (const bucket of portfolioBuckets) {
      const kind = classification[bucket.id]
      const nominal = expectedReturns[bucket.id] ?? 0
      if (!Number.isFinite(nominal) || nominal <= -1) throw new Error(`Invalid nominal return for ${bucket.id}`)
      if (kind === 'deposit' && nominal < 0) throw new Error(`Deposit nominal return ${nominal} for ${bucket.id} is negative and not supported by the deposit ledger (nonnegative rates only)`)
      if (kind === 'deposit') {
        depositRates[bucket.id] = nominal
      } else if (kind === 'equityFund' || kind === 'bondFund') {
        const prev = prices[bucket.id] ?? LIFECYCLE_REFERENCE_PRICE
        const next = Math.max(0, prev * (1 + nominal))
        prices[bucket.id] = next
        fundPrices[bucket.id] = next
      }
    }
    out.push({ fundPrices, depositRates, inflationFactor: factors[i] ?? 1, annualInflationRate: inflationAnnualRates[i] ?? annualInflationRate })
  }
  return out
}
export function runLifecycleScenario(args: {
  input: RentenlueckeInput
  streams: RetirementIncomeStream[]
  portfolioBuckets: PortfolioBucket[]
  classification: Record<string, LifecycleClassification | undefined>
  acquisitionCost: Record<string, number | undefined>
  milestones: LifecycleConfig['milestones']
  transitions: LifecycleConfig['transitions']
  taxCashId: string
  tax: { allowanceAnnualToday: number; churchRate: 0 | 0.08 | 0.09; basisRate: number; expenseAllowanceAnnualToday?: number }
  historicalSettings: HistoricalBootstrapSettings
  firstCalendarYear: number
}): LifecycleRun {
  const { input, streams, portfolioBuckets, classification, acquisitionCost, milestones, transitions, taxCashId, tax, historicalSettings, firstCalendarYear } = args
  const config = buildLifecycleConfig(portfolioBuckets, classification, milestones, transitions, taxCashId)
  const opening = buildOpeningBuckets(portfolioBuckets, classification, acquisitionCost)
  const yearsCount = input.planningAge - input.currentAge
  if (yearsCount <= 0) throw new Error('Planning horizon must be positive')
  const inflationSource = getRequiredInflationSource(historicalSettings.inflationSourceId, input.annualInflationRate)
  const validYears = getValidHistoricalYears(historicalSettings.portfolioComponents, inflationSource)
  const referenceSeed = createHistoricalBootstrapSeed(input, { ...historicalSettings, simulations: 1 })
  const referenceSampledYears = sampleHistoricalYearsForPath(historicalSettings.portfolioComponents, inflationSource, validYears, yearsCount, referenceSeed)
  const referenceInflationRates = referenceSampledYears.map((y) => {
    if (isFixedInflationSource(inflationSource)) return input.annualInflationRate
    try {
      return resolveInflationForSampledYear(inflationSource, y)
    } catch {
      return input.annualInflationRate
    }
  })
  const expected = expectedBucketReturns(portfolioBuckets, historicalSettings, input.annualInflationRate)
  const deterministicMarket = deriveDeterministicMarketYears(portfolioBuckets, classification, input.annualInflationRate, referenceInflationRates, expected)
  const years = buildLedgerYears({ input, streams, portfolioBuckets, classification, tax, marketYears: deterministicMarket, firstCalendarYear })
  const result = runLedgerDeterministic(config, opening, firstCalendarYear, years)
  const terminalInflation = deterministicMarket.at(-1)?.inflationFactor ?? 1
  const horizonSpec = years.at(-1)?.insurance
  const summary = summarizeLedgerResult(result, terminalInflation, taxCashId, horizonSpec)
  return { config, opening, years, result, summary, bootstrap: null, requiredCapital: null }
}
export function runLifecycleBootstrap(
  base: LifecycleRun,
  args: {
    input: RentenlueckeInput
    streams: RetirementIncomeStream[]
    portfolioBuckets: PortfolioBucket[]
    classification: Record<string, LifecycleClassification | undefined>
    historicalSettings: HistoricalBootstrapSettings
    tax: { allowanceAnnualToday: number; churchRate: 0 | 0.08 | 0.09; basisRate: number; expenseAllowanceAnnualToday?: number }
    firstCalendarYear: number
  },
): LedgerBootstrapResult {
  const { input, streams, portfolioBuckets, classification, historicalSettings, tax, firstCalendarYear } = args
  const yearsCount = base.years.length
  const inflationSource = getRequiredInflationSource(historicalSettings.inflationSourceId, input.annualInflationRate)
  const validYears = getValidHistoricalYears(historicalSettings.portfolioComponents, inflationSource)
  const seed = createHistoricalBootstrapSeed(input, historicalSettings)
  const rng = createSeededRandom(seed)
  const paths = Array.from({ length: historicalSettings.simulations }, () => {
    const pathSeed = Math.floor(rng() * 4294967296)
    const returnSeed = Math.floor(rng() * 4294967296)
    const sampledYears = sampleHistoricalYearsForPath(historicalSettings.portfolioComponents, inflationSource, validYears, yearsCount, pathSeed)
    const market = deriveMarketYears(portfolioBuckets, classification, historicalSettings, input.annualInflationRate, yearsCount, sampledYears, createSeededRandom(returnSeed))
    const fullYears = buildLedgerYears({ input, streams, portfolioBuckets, classification, tax, marketYears: market, firstCalendarYear })
    return {
      years: market.map((m) => ({ fundPrices: m.fundPrices, depositRates: m.depositRates, inflationFactor: m.inflationFactor })),
      fullYears,
    }
  })
  const { runLedgerBootstrap: runBootstrap } = { runLedgerBootstrap }
  return runBootstrap(base.config, base.opening, base.years[0]?.year ?? 0, base.years, paths)
}
export function searchLifecycleCapital(
  base: LifecycleRun,
  totalWealthForCapital: (capital: number) => { portfolioBuckets: PortfolioBucket[]; acquisitionCost: Record<string, number | undefined> },
): LifecycleRun['requiredCapital'] {
  const years = base.years
  if (!years.length) return { status: 'unsupported', reason: 'No horizon' }
  const terminalInflation = years.at(-1)?.inflationFactor ?? 1
  try {
    const out = searchLedgerCapital(base.config, years, {
      openingForCapital: (capital: number) => {
        const mapped = totalWealthForCapital(capital)
        const total = calculatePortfolioBucketTotal(mapped.portfolioBuckets)
        if (total <= 0 && capital > 0) throw new Error('Capital mapping must preserve positive total')
        return buildOpeningBuckets(mapped.portfolioBuckets, Object.fromEntries(base.config.buckets.map((b) => [b.id, b.kind])) as Record<string, LifecycleClassification>, mapped.acquisitionCost)
      },
      terminalInflation,
    })
    if (out.status === 'converged') return { status: 'converged', requiredCapital: out.requiredCapital }
    return { status: out.status, reason: out.reason }
  } catch (error) {
    if (error && typeof error === 'object' && 'name' in error && (error as { name: string }).name === 'RequiredCapitalCalculationError') {
      return { status: 'nonconverged', reason: 'Upper bound not found' }
    }
    throw error
  }
}
export function lifecycleSurvives(base: LifecycleRun): boolean {
  const terminalInflation = base.years.at(-1)?.inflationFactor ?? 1
  return ledgerSurvives(base.config, base.opening, base.years, terminalInflation)
}
