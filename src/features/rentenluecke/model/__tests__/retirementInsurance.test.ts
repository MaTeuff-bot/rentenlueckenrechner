import { describe, expect, it } from 'vitest'
import { DEFAULT_INPUT } from '../defaults'
import { clearHiddenInvalidInsuranceValues, insuranceSetupIssues, createDefaultRetirementInsurance } from '../retirementInsurance'
import { rentenlueckeInputSchema } from '../inputSchema'
import { simulateScenario } from '../simulateScenario'
import { simulateScenarioWithReturnPath } from '../stochasticReturns'
import { normalizeInput } from '../normalizeInput'
import { simulateRetirementRows } from '../simulateRetirement'
import { automaticInsurance, insuredInput, pension } from './insuranceFixtures'

describe('guided insurance completeness and scope', () => {
  it('requires genuine answers; confirmed zero is complete', () => {
    expect(() => simulateScenario(DEFAULT_INPUT)).toThrow('KV/PV')
    const missing = insuredInput({ retirementInsurance: createDefaultRetirementInsurance(67) })
    expect(insuranceSetupIssues(missing)).toEqual(expect.arrayContaining([
      'Rentenphase: Versicherungsstatus auswählen.', 'Kassenindividuellen Zusatzbeitrag angeben.',
      'Dauerhafte PV-Elterneigenschaft angeben.',
    ]))
    const zero = insuredInput({ retirementIncomeStreams: [], retirementInsurance: automaticInsurance({
      pension: { status: 'unknown', circumstances: 'standard', capitalMonthlyToday: 0, drvSubsidy: 'not-received' },
    }) })
    expect(insuranceSetupIssues(zero)).toEqual([])
    expect(simulateScenario(zero).retirementRows[0].insurance).toMatchObject({ selectedStatus: 'unknown', effectiveStatus: 'voluntary' })
  })
  it('checks explicit commencement against the earliest statutory stream, independently of work stop', () => {
    const input = insuredInput({ retirementAge: 65, currentAge: 64 })
    expect(insuranceSetupIssues(input)).toEqual([])
    expect(insuranceSetupIssues({ ...input, retirementInsurance: automaticInsurance({ pensionAge: 68 }) }).join()).toContain('frühesten')
    expect(insuranceSetupIssues(insuredInput({ currentAge: 68, retirementAge: 68 }))).toEqual([])
  })
  it('requires gross relevant pensions and rental assessments; excluded KVdR rent may remain net', () => {
    expect(insuranceSetupIssues(insuredInput({ retirementIncomeStreams: [pension({ amountBasis: 'net' })] })).join()).toContain('brutto')
    const rent = pension({ id: 'rent', kind: 'rental-income', amountBasis: 'net', support: undefined })
    expect(insuranceSetupIssues(insuredInput({ retirementIncomeStreams: [pension(), rent] }))).toEqual([])
    const voluntary = automaticInsurance({ pension: { status: 'voluntary', circumstances: 'standard', capitalMonthlyToday: 0, drvSubsidy: 'confirmed' } })
    expect(insuranceSetupIssues(insuredInput({ retirementIncomeStreams: [pension(), rent], retirementInsurance: voluntary })).join()).toContain('Mietüberschuss')
    expect(insuranceSetupIssues(insuredInput({ retirementIncomeStreams: [pension({ support: undefined })] })).join()).toContain('bestätigen')
  })
  it.each(['private-rente', 'side-income', 'bridge-income', 'other'] as const)('routes %s to whole-phase manual totals, including before a later receipt', kind => {
    const streams = [pension(), pension({ id: 'special', kind, startAge: 69 })]
    const i = createDefaultRetirementInsurance(67)
    expect(insuranceSetupIssues(insuredInput({ retirementIncomeStreams: streams, retirementInsurance: i })).join()).toContain('gesamte Phase')
    i.pension = { kvMonthlyToday: 123, pvMonthlyToday: 45 }
    expect(insuranceSetupIssues(insuredInput({ retirementIncomeStreams: streams, retirementInsurance: i }))).toEqual([])
    const rows = simulateScenario(insuredInput({ retirementIncomeStreams: streams, retirementInsurance: i })).retirementRows
    expect(rows.every(r => r.insurance?.status === 'manual' && r.healthInsurance === 1476 && r.careInsurance === 540)).toBe(true)
  })
  it.each(['unsupported', 'kvdr'] as const)('uses whole-phase manual replacement for unsupported bridge status %s', status => {
    const i = automaticInsurance({ bridge: { status, kvMonthlyToday: 200, pvMonthlyToday: 50 } })
    const rows = simulateScenario(insuredInput({ currentAge: 65, retirementAge: 65, retirementInsurance: i })).retirementRows
    expect(rows[0].insurance).toMatchObject({ status: 'manual', ownKvMonthly: 200, ownPvMonthly: 50 })
    expect(rows[2].insurance?.status).toBe('automatic')
  })
  it('examines declared special circumstances and pension types, even at confirmed zero income', () => {
    for (const input of [
      insuredInput({ retirementInsurance: automaticInsurance({ pension: { status: 'kvdr', circumstances: 'unsupported' } }) }),
      insuredInput({ retirementIncomeStreams: [pension({ support: 'unsupported', amountMonthlyToday: 0 })] }),
    ]) expect(insuranceSetupIssues(input).join()).toContain('gesamte Phase')
  })
  it('does not turn missing ordinary inputs into manual fallback', () => {
    const issues = insuranceSetupIssues(insuredInput({ retirementInsurance: automaticInsurance({ insurerAdditionalRate: undefined, isParent: undefined }) }))
    expect(issues.join()).not.toContain('gesamte Phase')
    expect(issues).toHaveLength(2)
  })
  it('validates family contradictions, future children and duplicate income IDs before simulation', () => {
    for (const i of [automaticInsurance({ isParent: false, childBirthYears: [2010] }), automaticInsurance({ childBirthYears: [2027] }), automaticInsurance({ childrenConfirmed: false })]) {
      expect(insuranceSetupIssues(insuredInput({ retirementInsurance: i })).length).toBeGreaterThan(0)
    }
    expect(() => simulateScenario(insuredInput({ retirementIncomeStreams: [pension(), pension()] }))).toThrow('Kennungen')
  })
  it('clears malformed hidden values on manual transitions without losing valid overrides', () => {
    const input = insuredInput({ retirementInsurance: automaticInsurance({ insurerAdditionalRate: -1, childBirthYears: [0],
      rates: { kvGeneralRate: 0.16 }, pension: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0, capitalMonthlyToday: -1 },
    }), retirementIncomeStreams: [pension({ kind: 'rental-income', rentalAssessmentMonthlyToday: -1 })] })
    const cleaned = clearHiddenInvalidInsuranceValues(input)
    expect(insuranceSetupIssues(cleaned)).toEqual([])
    expect(cleaned.retirementInsurance?.rates?.kvGeneralRate).toBe(0.16)
    expect(cleaned.retirementInsurance?.insurerAdditionalRate).toBeUndefined()
    expect(cleaned.retirementIncomeStreams?.[0].rentalAssessmentMonthlyToday).toBeUndefined()
    expect(input.retirementInsurance?.childBirthYears).toEqual([0])
  })
  describe.each(['kvGeneralRate', 'kvReducedRate', 'pvBaseRate'] as const)('%s override validation and cleanup', key => {
    it.each([-1, NaN, Infinity, -Infinity, 0.5001])('rejects numeric invalid rate %s and clears only that override in manual mode', rate => {
      const rates = { kvGeneralRate: 0.16, kvReducedRate: 0.15, pvBaseRate: 0.04, [key]: rate }
      const input = insuredInput({ retirementInsurance: automaticInsurance({ rates }) })
      expect(rentenlueckeInputSchema.safeParse(input).success).toBe(false)
      expect(insuranceSetupIssues(clearHiddenInvalidInsuranceValues(input))).not.toEqual([])
      const manual = { ...input, retirementInsurance: { ...input.retirementInsurance!,
        pension: { ...input.retirementInsurance!.pension, manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 },
      } }
      const cleaned = clearHiddenInvalidInsuranceValues(manual)
      expect(cleaned.retirementInsurance!.rates).toEqual({ ...rates, [key]: undefined })
      expect(insuranceSetupIssues(cleaned)).toEqual([])
      expect(manual.retirementInsurance.rates).toEqual(rates)
      const automatic = { ...cleaned, retirementInsurance: { ...cleaned.retirementInsurance!,
        pension: { ...cleaned.retirementInsurance!.pension, manual: false },
      } }
      expect(insuranceSetupIssues(automatic)).toEqual([])
      expect(simulateScenario(automatic).retirementRows[0].insurance?.status).toBe('automatic')
    })
    it.each([0, 0.0099, 0.01, 0.5])('honors the rate boundary %s', rate => {
      const input = insuredInput({ retirementInsurance: automaticInsurance({ rates: { [key]: rate } }) })
      const valid = key !== 'pvBaseRate' || rate >= 0.01
      expect(rentenlueckeInputSchema.safeParse(input).success).toBe(valid)
      input.retirementInsurance!.pension = { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 }
      expect(clearHiddenInvalidInsuranceValues(input).retirementInsurance!.rates?.[key]).toBe(valid ? rate : undefined)
    })
  })
  it.each([-1, NaN, Infinity, -Infinity, 0.2001])('rejects numeric invalid additional rate %s', insurerAdditionalRate => {
    const input = insuredInput({ retirementInsurance: automaticInsurance({ insurerAdditionalRate }) })
    expect(rentenlueckeInputSchema.safeParse(input).success).toBe(false)
    input.retirementInsurance!.pension = { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 }
    expect(clearHiddenInvalidInsuranceValues(input).retirementInsurance!.insurerAdditionalRate).toBeUndefined()
  })
  it.each([-1, NaN, Infinity])('rejects malformed assessment %s', capitalMonthlyToday => {
    expect(rentenlueckeInputSchema.safeParse(insuredInput({ retirementInsurance: automaticInsurance({ pension: { status: 'voluntary', capitalMonthlyToday } }) })).success).toBe(false)
  })
})

describe('authoritative contribution ledger', () => {
  it('reconciles the independently calculated mixed KVdR fixture with one occupational allowance', () => {
    const result = simulateScenario(insuredInput({ retirementIncomeStreams: [pension({ effectiveDeductionRate: 0.1 }), pension({ id: 'occupation', kind: 'betriebsrente', amountMonthlyToday: 500 })] }))
    const row = result.retirementRows[0]
    expect(row.retirementIncomeGross).toBe(30_000)
    expect(row.retirementIncomeOtherDeductions).toBe(2400)
    expect(row.healthInsurance / 12).toBeCloseTo(227.89375, 8)
    expect(row.careInsurance / 12).toBeCloseTo(90, 8)
    expect(row.retirementIncomeNet / 12).toBeCloseTo(1982.10625, 8)
    expect(row.retirementIncomeDeductions).toBeCloseTo(row.retirementIncomeGross - row.retirementIncomeNet)
    expect(result.summary.requiredCapitalAtRetirement).toBeCloseTo(row.gapWithdrawal * 3, 0)
  })
  it('turns an apparent income surplus into a funded gap after insurance', () => {
    const input = insuredInput({ monthlyDesiredSpendingToday: 1900 })
    const result = simulateScenario(input)
    const row = result.retirementRows[0]
    expect(row.retirementIncomeGross - row.retirementIncomeOtherDeductions - row.desiredSpending).toBe(1200)
    expect(row.healthInsurance).toBeCloseTo(175 * 12)
    expect(row.careInsurance).toBeCloseTo(72 * 12)
    expect(row.retirementIncomeNet).toBeCloseTo(1753 * 12)
    expect(row.surplusIncome).toBe(0)
    expect(row.gapWithdrawal).toBeCloseTo(147 * 12)
    expect(row.closingCapital).toBeCloseTo(row.openingCapital - row.gapWithdrawal)
    expect(result.summary.requiredCapitalAtRetirement).toBeCloseTo(147 * 12 * 3, 0)
  })
  it('keeps rental cash separate from its pre-tax assessment and never adds capital basis as cash', () => {
    const input = insuredInput({ retirementIncomeStreams: [pension({ amountMonthlyToday: 4000 }), pension({ id: 'occupation', kind: 'betriebsrente', amountMonthlyToday: 1000 }), pension({ id: 'rent', kind: 'rental-income', amountMonthlyToday: 600, effectiveDeductionRate: 0.25, rentalAssessmentMonthlyToday: 600 })], retirementInsurance: automaticInsurance({ pension: { status: 'voluntary', circumstances: 'standard', capitalMonthlyToday: 600, drvSubsidy: 'confirmed' } }) })
    const row = simulateScenario(input).retirementRows[0]
    expect(row.retirementIncomeGross / 12).toBe(5600)
    expect(row.portfolioContributionBase / 12).toBe(600)
    expect(row.insurance).toMatchObject({ kvAssessmentMonthly: 5812.5, pvAssessmentMonthly: 5812.5, drvSubsidyMonthly: 350 })
    expect(row.healthInsurance / 12).toBeCloseTo(662.3125, 8)
    expect(row.retirementIncomeNet / 12).toBeCloseTo(4578.4375, 8)
  })
  it('preserves negative available cash and funds insurance once even with zero income', () => {
    const input = insuredInput({ currentAge: 65, retirementAge: 65, planningAge: 67, retirementIncomeStreams: [] })
    const result = simulateScenario(input)
    const row = result.retirementRows[0]
    expect(row.retirementIncomeGross).toBe(0)
    expect(row.retirementIncomeNet / 12).toBeCloseTo(-270.25765, 8)
    expect(row.gapWithdrawal).toBeCloseTo(24_000 + 270.25765 * 12)
    expect(result.summary.requiredCapitalAtRetirement).toBeCloseTo(row.gapWithdrawal * 2, 0)
    const scenario = normalizeInput(input)
    expect(simulateRetirementRows(scenario, result.summary.requiredCapitalAtRetirement).every(r => !r.depleted)).toBe(true)
    expect(simulateRetirementRows(scenario, result.summary.requiredCapitalAtRetirement - 2).some(r => r.depleted)).toBe(true)
  })
  it('indexes bases and thresholds with path inflation; phase and stream boundaries use row start age', () => {
    const input = insuredInput({ currentAge: 64, retirementAge: 65, planningAge: 70, annualInflationRate: 0.02,
      retirementIncomeStreams: [pension({ endAge: 69 })], retirementInsurance: automaticInsurance({
        bridge: { status: 'voluntary', circumstances: 'standard', capitalMonthlyToday: 2000 },
        pension: { status: 'voluntary', circumstances: 'standard', capitalMonthlyToday: 3000, drvSubsidy: 'confirmed' },
      }) })
    const fixed = simulateScenarioWithReturnPath(input, Array(6).fill(0), Array(6).fill(0.02))
    expect(fixed).toEqual(simulateScenario(input))
    const variable = simulateScenarioWithReturnPath(input, Array(6).fill(0), [0.03, 0.04, -0.01, 0.02, 0.05, 0])
    expect(variable.retirementRows.map(r => r.insurance?.phase)).toEqual(['bridge', 'bridge', 'pension', 'pension', 'pension'])
    for (const row of variable.retirementRows) {
      const pensionActive = row.ageStart >= 67 && row.ageStart < 69
      const capital = row.ageStart < 67 ? 2000 : 3000
      expect(row.portfolioContributionBase / row.inflationFactor).toBeCloseTo(capital * 12)
      expect(row.retirementIncomeGross / row.inflationFactor).toBeCloseTo(pensionActive ? 24000 : 0)
      expect(row.healthInsurance / row.inflationFactor / 12).toBeCloseTo(capital * 0.169 + (pensionActive ? 175 : 0), 8)
      expect(row.careInsurance / row.inflationFactor / 12).toBeCloseTo((capital + (pensionActive ? 2000 : 0)) * 0.036, 8)
      expect(row.gapWithdrawalToday).toBeCloseTo(row.gapWithdrawal / row.inflationFactor)
    }
    expect(variable.accumulationRows[0]).toMatchObject({ healthInsurance: 0, careInsurance: 0 })
  })
  it('ages children out on Jan 1 of turning-25 year but preserves permanent parenthood', () => {
    const input = insuredInput({ currentAge: 44, retirementAge: 44, planningAge: 47, retirementIncomeStreams: [],
      retirementInsurance: automaticInsurance({ pensionAge: 67, childBirthYears: [2002, 2004], bridge: { status: 'voluntary', circumstances: 'standard', capitalMonthlyToday: 2000 } }) })
    const rows = simulateScenario(input).retirementRows
    expect(rows.map(r => r.insurance?.status === 'automatic' && r.insurance.pvRate)).toEqual([expect.closeTo(0.0335, 10), 0.036, 0.036])
    expect(rows.map(r => r.careInsurance / 12)).toEqual([expect.closeTo(67, 10), 72, 72])
  })
  it('starts childless surcharge in turning-23 year', () => {
    const rows = simulateScenario(insuredInput({ currentAge: 22, retirementAge: 22, planningAge: 25, retirementIncomeStreams: [], retirementInsurance: automaticInsurance({ isParent: false }) })).retirementRows
    expect(rows.map(r => r.insurance?.status === 'automatic' && r.insurance.pvRate)).toEqual([0.036, expect.closeTo(0.042, 10), expect.closeTo(0.042, 10)])
  })
  it('uses advanced total rates consistently for own KV and DRV subsidy; manual replaces all rules', () => {
    const i = automaticInsurance({ rates: { kvGeneralRate: 0.16, kvReducedRate: 0.15, pvBaseRate: 0.04 } })
    const row = simulateScenario(insuredInput({ retirementInsurance: i })).retirementRows[0]
    expect(row.healthInsurance / 12).toBeCloseTo(189)
    expect(row.careInsurance / 12).toBeCloseTo(80)
    i.pension = { status: 'voluntary', circumstances: 'standard', capitalMonthlyToday: 0, drvSubsidy: 'confirmed' }
    expect(simulateScenario(insuredInput({ retirementInsurance: i })).retirementRows[0].healthInsurance).toBeCloseTo(row.healthInsurance)
    i.pension = { ...i.pension, manual: true, kvMonthlyToday: 0, pvMonthlyToday: 7 }
    const manual = simulateScenario(insuredInput({ retirementInsurance: i, annualInflationRate: 0.1 })).retirementRows[1]
    expect(manual.healthInsurance).toBe(0)
    expect(manual.careInsurance).toBeCloseTo(7 * 12 * 1.1)
    expect(manual.insurance).toMatchObject({ status: 'manual', assessment: null })
  })
})
