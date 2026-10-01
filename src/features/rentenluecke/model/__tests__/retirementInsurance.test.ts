import { describe, expect, it } from 'vitest'
import { DEFAULT_INPUT } from '../defaults'
import { clearHiddenInvalidInsuranceValues, insuranceSetupIssues, createDefaultRetirementInsurance } from '../retirementInsurance'
import { rentenlueckeInputSchema } from '../inputSchema'
import { simulateScenario } from '../simulateScenario'
import { simulateScenarioWithReturnPath } from '../stochasticReturns'
import { automaticInsurance, insuredInput, pension, withScaledCapital, zeroBucketPath } from './insuranceFixtures'
import { expectedBucketReturns } from '../capitalIncome/returns'
import { createPortfolioComponentsFromBuckets } from '../portfolioBuckets'

describe('guided insurance completeness and scope', () => {
  it('requires genuine answers; confirmed zero is complete', () => {
    expect(() => simulateScenario(DEFAULT_INPUT)).toThrow('KV/PV')
    const missing = insuredInput({ retirementInsurance: { ...createDefaultRetirementInsurance(67), insurerAdditionalRate: undefined } })
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
    // Slice 2: GRV face gross 24,000, Rentenbeginn 2026 → 84 %; freibetrag 3,840;
    // taxable 20,160; zvE 20,160-102-(2,734.725+1,080) = 16,243.275; zone 2
    // (y=0.3895275 → 684.09…) → pensionIncomeTax 684 (57/mo). Net drops by exactly that.
    expect(row.pensionTaxBase).toBeCloseTo(20_160, 8)
    expect(row.pensionIncomeTax).toBeCloseTo(684, 8)
    expect(row.retirementIncomeNet / 12).toBeCloseTo(1925.10625, 8)
    // The pension tax is a separate ledger deduction (like capitalIncomeTax), not part
    // of retirementIncomeDeductions: gross - net - pensionIncomeTax == deductions.
    expect(row.retirementIncomeDeductions).toBeCloseTo(row.retirementIncomeGross - row.retirementIncomeNet - (row.pensionIncomeTax ?? 0))
    // Mandatory detailed ledger: the 60/40 fund/bank portfolio earns modeled 5 %
    // (6,000-fund/4,000-bank blended expectation: 5,000 on 100,000 with 800 bank
    // interest, fully allowance-covered so capitalIncomeTax stays 0). Future gaps
    // are partly return-funded, so the searched 2,447.51 sits below the nominal
    // 3 × 898.725 = 2,696.175 sum (tier-3 pin for the taxed search).
    expect(row.investmentReturn).toBeCloseTo(5_000)
    expect(row.capitalIncomeTax).toBe(0)
    expect(result.summary.requiredCapitalAtRetirement).toBeCloseTo(2447.509765625, 0)
  })
  it('turns an apparent income surplus into a funded gap after insurance', () => {
    const input = insuredInput({ monthlyDesiredSpendingToday: 1900 })
    const result = simulateScenario(input)
    const row = result.retirementRows[0]
    expect(row.retirementIncomeGross - row.retirementIncomeOtherDeductions - row.desiredSpending).toBe(1200)
    expect(row.healthInsurance).toBeCloseTo(175 * 12)
    expect(row.careInsurance).toBeCloseTo(72 * 12)
    // Slice 2: Rentenbeginn 2026 → 84 %; freibetrag 3,840; taxable 20,160;
    // zvE 20,160-102-(2,100+864) = 17,094; zone 2 (y=0.4746 → 870.43…) → 870/yr.
    // Net 21,036-870 = 20,166; gap 22,800-20,166 = 2,634 = 219.5×12.
    expect(row.pensionIncomeTax).toBeCloseTo(870, 8)
    expect(row.retirementIncomeNet).toBeCloseTo(1680.5 * 12)
    expect(row.surplusIncome).toBe(0)
    expect(row.gapWithdrawal).toBeCloseTo(219.5 * 12)
    // Mandatory detailed ledger: modeled 5,000 return funds the 2,634 gap, so
    // closing = 100,000 + 5,000 − 2,634 = 102,366 (no capital tax: 800 bank
    // interest plus small fund income stay within the allowance).
    expect(row.investmentReturn).toBeCloseTo(5_000)
    expect(row.capitalIncomeTax).toBe(0)
    expect(row.closingCapital).toBeCloseTo(102_366)
    // Required capital funds the return-reduced gaps (tier-3 pin), not the
    // nominal 3 × 2,634 = 7,902 sum.
    expect(result.summary.requiredCapitalAtRetirement).toBeCloseTo(7173.15673828125, 0)
  })
  it('keeps rental cash separate from its pre-tax assessment and never adds capital basis as cash', () => {
    // Mandatory: the capital assessment is modeled from the detailed portfolio
    // (first-year 803.95 annual from 800 bank interest plus small fund income net
    // of the 51 expense allowance → 66.996/mo), never from a legacy monthly
    // estimate. Legacy capitalMonthlyToday values are tolerated on load but have
    // no engine meaning.
    const input = insuredInput({ retirementIncomeStreams: [pension({ amountMonthlyToday: 4000 }), pension({ id: 'occupation', kind: 'betriebsrente', amountMonthlyToday: 1000 }), pension({ id: 'rent', kind: 'rental-income', amountMonthlyToday: 600, effectiveDeductionRate: 0.25, rentalAssessmentMonthlyToday: 600 })], retirementInsurance: automaticInsurance({ pension: { status: 'voluntary', circumstances: 'standard', capitalMonthlyToday: 600, drvSubsidy: 'confirmed' } }) })
    const row = simulateScenario(input).retirementRows[0]
    expect(row.retirementIncomeGross / 12).toBe(5600)
    expect(row.portfolioContributionBase / 12).toBeCloseTo(66.99610591900311, 8)
    // Shared ceiling 5,812.5: pensions 5,000 + other (600 rental + 66.996 capital)
    // = 5,666.996 below the ceiling, so no capping. KV: 4,000×17.5 % + 1,000×17.5 %
    // + 666.996×16.9 % (reduced) = 987.722; minus 350 DRV subsidy → own 637.722.
    // PV: 5,666.996×3.6 % = 204.012. Assessment only, no added cashflow.
    expect(row.insurance).toMatchObject({ kvAssessmentMonthly: 5666.996105919003, pvAssessmentMonthly: 5666.996105919003, drvSubsidyMonthly: 350 })
    expect(row.healthInsurance / 12).toBeCloseTo(637.7223419003116, 8)
    expect(row.careInsurance / 12).toBeCloseTo(204.0118598130841, 8)
    // Slice 2: only the GRV face gross (48,000; Betriebsrente and rental income are
    // out of scope) enters the base. Rentenbeginn 2026 → 84 %; freibetrag 7,680;
    // taxable 40,320. zvE = 40,320 − 102 − (7,652.668 + 2,448.142) own KV/PV =
    // 30,117.19 → §32a pin 4,250 (higher than the legacy-600 zvE because the
    // smaller modeled assessment lowers Sonderausgaben).
    expect(row.pensionTaxBase).toBeCloseTo(40_320, 8)
    expect(row.pensionIncomeTax).toBeCloseTo(4_250, 8)
    expect(row.retirementIncomeNet / 12).toBeCloseTo(4254.099131619939, 8)
  })
  it('preserves negative available cash and funds insurance once even with zero income', () => {
    // Mandatory: the bridge-voluntary assessment is modeled (year 1: 1,556.91
    // annual from 800 bank interest plus fund income net of allowance → 129.74/mo,
    // still below the 1,318.33 voluntary minimum, so KV/PV stay at the minimum:
    // 1,318.33×16.9 % = 222.798/mo, 1,318.33×3.6 % = 47.460/mo).
    const input = insuredInput({ currentAge: 65, retirementAge: 65, planningAge: 67, retirementIncomeStreams: [] })
    const result = simulateScenario(input)
    const row = result.retirementRows[0]
    expect(row.retirementIncomeGross).toBe(0)
    expect(row.portfolioContributionBase / 12).toBeCloseTo(129.74227132076868, 8)
    expect(row.retirementIncomeNet / 12).toBeCloseTo(-270.25765, 8)
    // The gap carries the capital tax on the modeled assessment (160.34 year 1:
    // taxable 1,607.91, allowance-covered down to the pin) on top of spending +
    // insurance: 24,000 + 3,243.09 + 160.34 = 27,403.43.
    expect(row.capitalIncomeTax).toBeCloseTo(160.33553873023286, 8)
    expect(row.gapWithdrawal).toBeCloseTo(27403.427338730235, 8)
    expect(result.summary.requiredCapitalAtRetirement).toBeCloseTo(50868.988037109375, 0)
    // Monotone search on the same detailed ledger: required survives, 2 € less fails.
    expect(simulateScenario(withScaledCapital(input, result.summary.requiredCapitalAtRetirement)).summary.survivesUntilPlanningAge).toBe(true)
    expect(simulateScenario(withScaledCapital(input, result.summary.requiredCapitalAtRetirement - 2)).summary.survivesUntilPlanningAge).toBe(false)
  })
  it('indexes bases and thresholds with path inflation; phase and stream boundaries use row start age', () => {
    // Mandatory: the capital assessment is modeled per bucket, never a legacy
    // monthly estimate. Explicit zero per-bucket returns isolate the inflation
    // mechanics: no returns → no VP/interest/sale gains → assessment 0, so both
    // voluntary phases fall back to the inflation-indexed minimum
    // (1,318.33×factor at 16.9 % KV and 3.6 % PV). Legacy capitalMonthlyToday
    // values below are tolerated on load but have no engine meaning.
    const input = insuredInput({ currentAge: 64, retirementAge: 65, planningAge: 70, annualInflationRate: 0.02,
      retirementIncomeStreams: [pension({ endAge: 69 })], retirementInsurance: automaticInsurance({
        bridge: { status: 'voluntary', circumstances: 'standard', capitalMonthlyToday: 2000 },
        pension: { status: 'voluntary', circumstances: 'standard', capitalMonthlyToday: 3000, drvSubsidy: 'confirmed' },
      }) })
    const expected = expectedBucketReturns(input, { portfolioComponents: createPortfolioComponentsFromBuckets(input.estimatorPortfolio!), inflationSourceId: 'fixed-manual', simulations: 1 })
    const expectedPath = Array.from({ length: 6 }, () => expected.map((bucket) => ({ ...bucket })))
    const fixed = simulateScenarioWithReturnPath(input, Array(6).fill(0), Array(6).fill(0.02), expectedPath)
    expect(fixed).toEqual(simulateScenario(input))
    // Missing per-bucket returns can never fall back to an aggregate path.
    expect(() => simulateScenarioWithReturnPath(input, Array(6).fill(0), Array(6).fill(0.02))).toThrow(/je Anlage/)
    const variable = simulateScenarioWithReturnPath(input, Array(6).fill(0), [0.03, 0.04, -0.01, 0.02, 0.05, 0], zeroBucketPath(input, 6))
    expect(variable.retirementRows.map(r => r.insurance?.phase)).toEqual(['bridge', 'bridge', 'pension', 'pension', 'pension'])
    for (const row of variable.retirementRows) {
      const pensionActive = row.ageStart >= 67 && row.ageStart < 69
      expect(row.portfolioContributionBase).toBe(0)
      expect(row.retirementIncomeGross / row.inflationFactor).toBeCloseTo(pensionActive ? 24000 : 0)
      // Zero modeled assessment: pension-active rows assess only the 2,000 GRV
      // (KV own 2,000×17.5 % − 175 subsidy = 175; PV 2,000×3.6 %); all other rows
      // fall back to the indexed voluntary minimum (1,318.33 at 16.9 %/3.6 %).
      expect(row.healthInsurance / row.inflationFactor / 12).toBeCloseTo(pensionActive ? 175 : 1318.33 * 0.169, 8)
      expect(row.careInsurance / row.inflationFactor / 12).toBeCloseTo((pensionActive ? 2000 : 1318.33) * 0.036, 8)
      expect(row.gapWithdrawalToday).toBeCloseTo(row.gapWithdrawal / row.inflationFactor)
    }
    expect(variable.accumulationRows[0]).toMatchObject({ healthInsurance: 0, careInsurance: 0 })
  })
  it('ages children out on Jan 1 of turning-25 year but preserves permanent parenthood', () => {
    // Mandatory: the modeled bridge assessment (≈129–218/mo, below the 1,318.33
    // voluntary minimum) keeps every row on the minimum top-up, so KV/PV follow
    // the minimum at the child-discounted PV rate. Legacy capitalMonthlyToday is
    // tolerated on load but has no engine meaning.
    const input = insuredInput({ currentAge: 44, retirementAge: 44, planningAge: 47, retirementIncomeStreams: [],
      retirementInsurance: automaticInsurance({ pensionAge: 67, childBirthYears: [2002, 2004], bridge: { status: 'voluntary', circumstances: 'standard', capitalMonthlyToday: 2000 } }) })
    const rows = simulateScenario(input).retirementRows
    expect(rows.map(r => r.insurance?.status === 'automatic' && r.insurance.pvRate)).toEqual([expect.closeTo(0.0335, 10), 0.036, 0.036])
    expect(rows.map(r => r.healthInsurance / 12)).toEqual([expect.closeTo(1318.33 * 0.169, 10), expect.closeTo(1318.33 * 0.169, 10), expect.closeTo(1318.33 * 0.169, 10)])
    expect(rows.map(r => r.careInsurance / 12)).toEqual([expect.closeTo(1318.33 * 0.0335, 10), expect.closeTo(1318.33 * 0.036, 10), expect.closeTo(1318.33 * 0.036, 10)])
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
    // Mandatory: the modeled voluntary assessment (74.84/mo) replaces the legacy
    // zero estimate. KV own = 2,000×(0.16+0.029) + 74.8376×(0.15+0.029) − 189
    // subsidy = 202.396; PV = 2,074.8376×0.04 = 82.994. Same method as KVdR, only
    // the contribution-induced assessment differs; no double deduction.
    i.pension = { status: 'voluntary', circumstances: 'standard', capitalMonthlyToday: 0, drvSubsidy: 'confirmed' }
    const voluntary = simulateScenario(insuredInput({ retirementInsurance: i })).retirementRows[0]
    expect(voluntary.portfolioContributionBase / 12).toBeCloseTo(74.83764767443925, 8)
    expect(voluntary.healthInsurance / 12).toBeCloseTo(202.39593893372458, 8)
    expect(voluntary.careInsurance / 12).toBeCloseTo(82.99350590697757, 8)
    i.pension = { ...i.pension, manual: true, kvMonthlyToday: 0, pvMonthlyToday: 7 }
    const manual = simulateScenario(insuredInput({ retirementInsurance: i, annualInflationRate: 0.1 })).retirementRows[1]
    expect(manual.healthInsurance).toBe(0)
    expect(manual.careInsurance).toBeCloseTo(7 * 12 * 1.1)
    expect(manual.insurance).toMatchObject({ status: 'manual', assessment: null })
  })
})
