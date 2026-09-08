import { describe, expect, it } from 'vitest'
import { DEFAULT_INPUT } from '../defaults'
import { calculateRetirementIncomeForYear } from '../retirementIncomeStreams'
import { createDefaultRetirementInsurance, getInsuranceTreatment, getInsuranceWarnings, getStreamInsuranceRates, INSURANCE_REFERENCE, type InsuranceStatus, type InsuranceTreatment, type RetirementInsurance } from '../retirementInsurance'
import { rentenlueckeInputSchema } from '../inputSchema'
import { simulateScenario } from '../simulateScenario'
import { simulateScenarioWithReturnPath } from '../stochasticReturns'
import type { RentenlueckeInput, RetirementIncomeStream, RetirementIncomeStreamKind } from '../types'

function stream(patch: Partial<RetirementIncomeStream> = {}): RetirementIncomeStream {
  return { id: 'pension', name: 'Pension', kind: 'gesetzliche-rente', amountMonthlyToday: 1000,
    startAge: 67, endAge: null, amountBasis: 'gross', deductionMode: 'effectiveHaircut', effectiveDeductionRate: 0.2,
    separateDeductions: { otherRate: 0.1 }, ...patch }
}
function insurance(patch: Partial<RetirementInsurance> = {}): RetirementInsurance {
  return { ...createDefaultRetirementInsurance(), enabled: true, status: 'kvdr', ...patch }
}
function input(patch: Partial<RentenlueckeInput> = {}): RentenlueckeInput {
  return { ...DEFAULT_INPUT, currentAge: 67, retirementAge: 67, planningAge: 70, currentCapital: 100_000,
    annualInflationRate: 0, annualReturnBeforeRetirement: 0, annualReturnInRetirement: 0,
    monthlyDesiredSpendingToday: 1000, retirementIncomeStreams: [stream()], retirementInsurance: insurance(), ...patch }
}
const matrix: [RetirementIncomeStreamKind, InsuranceTreatment, InsuranceTreatment, InsuranceTreatment][] = [
  ['gesetzliche-rente', 'include', 'include', 'review'],
  ['betriebsrente', 'include', 'include', 'review'],
  ['private-rente', 'review', 'include', 'review'],
  ['rental-income', 'exclude', 'include', 'review'],
  ['side-income', 'review', 'include', 'review'],
  ['bridge-income', 'review', 'review', 'review'],
  ['other', 'review', 'review', 'review'],
]

describe('retirement insurance defaults and manual decisions', () => {
  it.each(matrix)('implements all three status defaults and numerical treatment for %s', (kind, kvdr, voluntary, unknown) => {
    for (const [status, treatment] of [['kvdr', kvdr], ['voluntary', voluntary], ['unknown', unknown]] as [InsuranceStatus, InsuranceTreatment][]) {
      const s = stream({ kind })
      const config = insurance({ status })
      expect(getInsuranceTreatment(s, status)).toBe(treatment)
      const result = calculateRetirementIncomeForYear([s], 67, 1, config)
      expect(result.kv).toBe(treatment === 'include' ? 12_000 * getStreamInsuranceRates(s, config.rates).kv : 0)
      expect(result.pv).toBeCloseTo(treatment === 'include' ? 432 : 0, 8)
      expect(getInsuranceWarnings([s], config).some((warning) => warning.code === 'review-stream')).toBe(treatment === 'review')
    }
  })

  it.each(['include', 'exclude', 'review'] as const)('honors explicit %s for every status and category', (treatment) => {
    for (const status of ['kvdr', 'voluntary', 'unknown'] as const) {
      for (const [kind] of matrix) {
        const s = stream({ kind, insuranceTreatment: treatment })
        expect(getInsuranceTreatment(s, status)).toBe(treatment)
        const result = calculateRetirementIncomeForYear([s], 67, 1, insurance({ status }))
        expect(result.kv > 0).toBe(treatment === 'include')
        expect(result.pv > 0).toBe(treatment === 'include')
      }
    }
  })

  it('warns about unknown status even with explicit inclusion and keeps net streams protected', () => {
    const s = stream({ amountBasis: 'net', insuranceTreatment: 'include', kvRateOverride: 1, pvRateOverride: 1 })
    const config = insurance({ status: 'unknown' })
    expect(getInsuranceWarnings([s], config)).toEqual([{ code: 'unknown-status' }])
    expect(calculateRetirementIncomeForYear([s], 67, 1, config)).toMatchObject({ gross: 12_000, net: 12_000, deductions: 0, kv: 0, pv: 0, otherDeductions: 0 })
    expect(getInsuranceWarnings([stream({ insuranceTreatment: 'review' })], insurance())).toEqual([{ code: 'review-stream', streamId: 'pension' }])
    expect(getInsuranceWarnings([s], insurance({ enabled: false }))).toEqual([])
  })

  it('requires explicit replacement and restores all-in results when disabled', () => {
    const legacy = stream({ separateDeductions: undefined })
    const old = calculateRetirementIncomeForYear([legacy], 67, 1)
    expect(old).toMatchObject({ net: 9600, combinedDeductions: 2400, otherDeductions: 0, kv: 0, pv: 0 })
    expect(calculateRetirementIncomeForYear([legacy], 67, 1, insurance())).toEqual(old)
    expect(getInsuranceWarnings([legacy], insurance())).toEqual([{ code: 'combined-haircut', streamId: 'pension' }])
    expect(calculateRetirementIncomeForYear([stream()], 67, 1, insurance())).toMatchObject({ combinedDeductions: 0, otherDeductions: 1200, kv: 1050, pv: expect.closeTo(432, 8), net: 9318 })
    expect(calculateRetirementIncomeForYear([stream()], 67, 1, insurance({ enabled: false, portfolioBaseMonthlyToday: 9999 }))).toEqual(old)
  })

  it('uses dated own-burden rates, including half the additional pension rate, and explicit overrides', () => {
    expect(INSURANCE_REFERENCE.year).toBe(2026)
    expect(INSURANCE_REFERENCE.verifiedOn).toBe('2026-09-08')
    expect(INSURANCE_REFERENCE.rates.pensionKv).toBeCloseTo((0.146 + 0.029) / 2)
    expect(INSURANCE_REFERENCE.rates.pv).toBe(0.036)
    expect(INSURANCE_REFERENCE.childlessPv).toBe(0.042)
    const rates = insurance().rates
    expect(getStreamInsuranceRates(stream({ kind: 'betriebsrente' }), rates)).toEqual({ kv: 0.175, pv: 0.036 })
    expect(getStreamInsuranceRates(stream({ kind: 'rental-income' }), rates)).toEqual({ kv: 0.169, pv: 0.036 })
    expect(getStreamInsuranceRates(stream({ kind: 'side-income' }), rates).kv).toBe(0.175)
    expect(getStreamInsuranceRates(stream({ kvRateOverride: 0, pvRateOverride: 0.042 }), rates)).toEqual({ kv: 0, pv: 0.042 })
  })
})

describe('ledger cashflow and funding', () => {
  it('separates mixed net, reviewed gross and legacy deductions without taxing net inputs', () => {
    const result = simulateScenario(input({ retirementIncomeStreams: [
      stream(), stream({ id: 'net', amountBasis: 'net', kvRateOverride: 1, pvRateOverride: 1 }),
      stream({ id: 'legacy', separateDeductions: undefined }),
    ] }))
    expect(result.retirementRows[0]).toMatchObject({ retirementIncomeGross: 36_000, retirementIncomeCombinedDeductions: 2400,
      retirementIncomeOtherDeductions: 1200, healthInsurance: 1050, careInsurance: expect.closeTo(432, 8), retirementIncomeNet: 30_918 })
  })

  it.each([0, 50, 1000])('counts portfolio costs exactly once with monthly income %i, even above income', (amountMonthlyToday) => {
    const config = insurance({ portfolioBaseMonthlyToday: 1000 })
    const result = simulateScenario(input({ retirementIncomeStreams: [stream({ amountBasis: 'net', amountMonthlyToday })], retirementInsurance: config }))
    const income = amountMonthlyToday * 12
    const costs = 12_000 * (0.169 + 0.036)
    const row = result.retirementRows[0]
    expect(row.portfolioContributionBase).toBe(12_000)
    expect(row.retirementIncomeGross).toBe(income)
    expect(row.healthInsurance).toBeCloseTo(2028, 8)
    expect(row.careInsurance).toBeCloseTo(432, 8)
    expect(row.retirementIncomeNet).toBeCloseTo(income - costs)
    expect(row.gapWithdrawal).toBeCloseTo(12_000 - income + costs)
    expect(row.closingCapital).toBeCloseTo(100_000 - row.gapWithdrawal)
    expect(result.summary.requiredCapitalAtRetirement).toBeCloseTo(row.gapWithdrawal * 3, 0)
    expect(result.summary.annualGapToday).toBe(row.gapWithdrawal)
  })

  it('does not skip capital search when insurance turns an apparent surplus into a gap', () => {
    const result = simulateScenario(input({ monthlyDesiredSpendingToday: 500, retirementIncomeStreams: [stream({ amountBasis: 'net' })],
      retirementInsurance: insurance({ portfolioBaseMonthlyToday: 5000 }) }))
    expect(result.retirementRows[0].gapWithdrawal).toBe(6300)
    expect(result.summary.requiredCapitalAtRetirement).toBeCloseTo(18_900, 0)
  })

  it('uses the same constant rates and inflation-adjusted bases with deterministic and stochastic paths', () => {
    const scenario = input({ currentAge: 66, annualInflationRate: 0.02, retirementIncomeStreams: [stream({ startAge: 68, endAge: 69 })], retirementInsurance: insurance({ portfolioBaseMonthlyToday: 1000 }) })
    const deterministic = simulateScenario(scenario)
    const fixedPath = simulateScenarioWithReturnPath(scenario, [0, 0, 0, 0], [0.02, 0.02, 0.02, 0.02])
    expect(fixedPath).toEqual(deterministic)
    expect(deterministic.accumulationRows[0]).toMatchObject({ healthInsurance: 0, careInsurance: 0, portfolioContributionBase: 0 })
    const variable = simulateScenarioWithReturnPath(scenario, [0, 0.1, -0.2, 0], [0.03, 0.04, -0.01, 0.02])
    for (const row of variable.retirementRows) {
      const active = row.ageStart === 68
      expect(row.healthInsurance / row.inflationFactor).toBeCloseTo(2028 + (active ? 1050 : 0))
      expect(row.careInsurance / row.inflationFactor).toBeCloseTo(432 + (active ? 432 : 0))
      expect(row.retirementIncomeOtherDeductions / row.inflationFactor).toBeCloseTo(active ? 1200 : 0)
      expect(row.gapWithdrawal).toBeCloseTo(row.desiredSpending - row.retirementIncomeNet)
    }
    expect(variable.summary.annualGapToday).toBeCloseTo(variable.retirementRows[0].gapWithdrawal / variable.retirementRows[0].inflationFactor)
  })

  it.each([-0.01, 1.01, Number.NaN, Infinity])('rejects invalid rates %s', (rate) => {
    expect(rentenlueckeInputSchema.safeParse(input({ retirementInsurance: insurance({ rates: { ...insurance().rates, pensionKv: rate } }) })).success).toBe(false)
    expect(rentenlueckeInputSchema.safeParse(input({ retirementIncomeStreams: [stream({ pvRateOverride: rate })] })).success).toBe(false)
    expect(rentenlueckeInputSchema.safeParse(input({ retirementIncomeStreams: [stream({ separateDeductions: { otherRate: rate } })] })).success).toBe(false)
  })

  it.each([-1, Number.NaN, Infinity])('rejects invalid portfolio bases %s', (portfolioBaseMonthlyToday) => {
    expect(rentenlueckeInputSchema.safeParse(input({ retirementInsurance: insurance({ portfolioBaseMonthlyToday }) })).success).toBe(false)
  })
})
