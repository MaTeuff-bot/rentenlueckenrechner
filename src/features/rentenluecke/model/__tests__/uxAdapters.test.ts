import { describe, expect, it } from 'vitest'
import { childrenEngineFields, childrenSummary } from '../childrenAnswer'
import { timelineBoundary, transitionAfterStreamsChange } from '../scenarioTimeline'
import { automaticInsurance, insuredInput, pension } from './insuranceFixtures'
import { insuranceSetupIssues } from '../retirementInsurance'
import { simulateScenario } from '../simulateScenario'
import { rentenlueckeInputSchema } from '../inputSchema'
import { scenarioIssues, sectionStatus } from '../scenarioIssues'

describe('authoritative timeline adapter', () => {
  it('includes every statutory stream, preserves later/equal starts and propagates invalid dates', () => {
    const streams = [pension({ id: 'later', startAge: 70 }), pension({ id: 'first', startAge: 65, amountMonthlyToday: 0, support: 'unsupported' }), pension({ id: 'equal', startAge: 65 })]
    const snapshot = structuredClone(streams)
    expect(timelineBoundary(streams, 90)).toBe(65)
    expect(streams).toEqual(snapshot)
    expect(timelineBoundary([...streams, pension({ id: 'invalid', startAge: NaN })])).toBeNaN()
    expect(timelineBoundary([], undefined)).toBeUndefined()
    expect(timelineBoundary([], 72)).toBe(72)
    expect(transitionAfterStreamsChange(streams, [], 72)).toBeUndefined()
    expect(transitionAfterStreamsChange([], [], 72)).toBe(72)
  })
  it.each([64, 67, 70, 72])('preserves yearly bridge and savings boundaries with pension at %i', startAge => {
    const streams = [pension({ startAge })]
    const input = insuredInput({ currentAge: 63, retirementAge: 65, planningAge: 70, monthlyContributionToday: 100,
      retirementIncomeStreams: streams, retirementInsurance: automaticInsurance({ pensionAge: timelineBoundary(streams) }) })
    const result = simulateScenario(input)
    expect(result.accumulationRows).toHaveLength(2)
    expect(result.retirementRows.map(r => r.insurance?.phase)).toEqual([65,66,67,68,69].map(age => age < startAge ? 'bridge' : 'pension'))
    expect(result.accumulationRows.every(row => row.contribution === 1200)).toBe(true)
    expect(result.retirementRows.every(row => row.contribution === 0)).toBe(true)
  })
  it('keeps direct engine mismatch protection', () => {
    expect(insuranceSetupIssues(insuredInput({ retirementInsurance: automaticInsurance({ pensionAge: 68 }) })).join()).toContain('frühesten')
  })
})
describe('canonical birth-year answers', () => {
  it('distinguishes missing, none, blank rows and older parents', () => {
    expect(childrenEngineFields({ kind: 'missing' })).toEqual({ isParent: undefined, childrenConfirmed: undefined, childBirthYears: [] })
    expect(childrenEngineFields({ kind: 'none' })).toEqual({ isParent: false, childrenConfirmed: true, childBirthYears: [] })
    const blank = childrenEngineFields({ kind: 'children', rows: [{ id: 'a' }] })
    expect(blank.isParent).toBe(true)
    expect(blank.childBirthYears[0]).toBeNaN()
    expect(rentenlueckeInputSchema.safeParse(insuredInput({ retirementInsurance: automaticInsurance(blank) })).success).toBe(false)
    expect(childrenSummary({ kind: 'children', rows: [{ id: 'a', year: 1980 }] }, 2026)).toContain('0 unter 25')
  })
  it('preserves twins, January ageout and lifelong parenthood', () => {
    const fields = childrenEngineFields({ kind: 'children', rows: [{ id: 'a', year: 2002 }, { id: 'b', year: 2002 }] })
    expect(fields.childBirthYears).toEqual([2002, 2002])
    const rows = simulateScenario(insuredInput({ currentAge: 44, retirementAge: 44, planningAge: 47, retirementIncomeStreams: [], retirementInsurance: automaticInsurance(fields) })).retirementRows
    expect(rows.map(r => r.insurance?.status === 'automatic' && r.insurance.pvRate)).toEqual([expect.closeTo(.0335, 10), .036, .036])
  })
  it.each([1800, 1958, 2027, 2000.5])('rejects invalid child year %i for a person born in 1959', year => {
    const input = insuredInput({ retirementInsurance: automaticInsurance(childrenEngineFields({ kind: 'children', rows: [{ id: 'child', year }] })) })
    expect(!rentenlueckeInputSchema.safeParse(input).success || insuranceSetupIssues(input).length > 0).toBe(true)
  })
  it('manual replacement allows missing family, automatic coverage restores gates', () => {
    const input = insuredInput({ retirementInsurance: automaticInsurance({ ...childrenEngineFields({ kind: 'missing' }), pension: { manual: true, kvMonthlyToday: 0, pvMonthlyToday: 0 } }) })
    expect(insuranceSetupIssues(input)).toEqual([])
    input.retirementInsurance!.pension = { status: 'kvdr', circumstances: 'standard' }
    expect(insuranceSetupIssues(input).join()).toContain('Elterneigenschaft')
  })
})
it('classifies missing separately from invalid and routes nested schema errors', () => {
  const input = insuredInput({ retirementAge: NaN, retirementInsurance: automaticInsurance({ rates: { kvGeneralRate: -1 } }) })
  const parsed = rentenlueckeInputSchema.safeParse(input)
  const issues = scenarioIssues(input, { kind: 'missing' }, [], parsed.success ? undefined : parsed.error, [], null, null)
  expect(sectionStatus(issues, 'zeitplan')).toBe('Offen')
  expect(sectionStatus(issues, 'annahmen')).toBe('Prüfen')
  expect(issues.find(i => i.fieldId === 'insurance-rates-kvGeneralRate')?.fieldPath).toBe('retirementInsurance.rates.kvGeneralRate')
})
