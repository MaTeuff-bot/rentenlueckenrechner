import { describe, expect, it } from 'vitest'
import { applyCoverage, copyCompatibleCoverage, coverageCircumstances, defaultCoverageAnswers, insuranceCoverageSchema, toggleCoverage, type CoverageAnswer } from '../insuranceCoverage'
import { insurancePhaseRanges, insuranceSetupIssues, phaseManualReasons, phaseStreams } from '../retirementInsurance'
import { completedCoverage, insuredInput, pension } from './insuranceFixtures'
import { simulateScenario } from '../simulateScenario'
import { runStochasticSimulation } from '../stochasticReturns'
import { scenarioIssues } from '../scenarioIssues'

describe('explicit phase coverage', () => {
  it('never infers none; permits multiple concrete exceptions and exclusive none/unsure', () => {
    let answer: CoverageAnswer = { kind: 'missing' }
    answer = toggleCoverage(answer, 'krankengeld')
    answer = toggleCoverage(answer, 'multiple-persons')
    expect(answer).toEqual({ kind: 'exceptions', selected: ['krankengeld', 'multiple-persons'] })
    answer = toggleCoverage(answer, 'none')
    expect(answer).toEqual({ kind: 'none' })
    answer = toggleCoverage(answer, 'unsure')
    expect(answer).toEqual({ kind: 'unsure' })
    answer = toggleCoverage(answer, 'krankengeld')
    expect(toggleCoverage(answer, 'krankengeld')).toEqual({ kind: 'missing' })
    expect(coverageCircumstances({ kind: 'none' }, { kind: 'missing' })).toBeUndefined()
    expect(coverageCircumstances({ kind: 'unsure' }, { kind: 'missing' })).toBe('unsupported')
    expect(coverageCircumstances({ kind: 'none' }, { kind: 'none' })).toBe('standard')
  })
  it('rejects empty, duplicate, foreign and mixed exception answers', () => {
    for (const common of [{ kind: 'exceptions', selected: [] }, { kind: 'exceptions', selected: ['krankengeld', 'krankengeld'] }, { kind: 'exceptions', selected: ['family-insurance'] }, { kind: 'none', selected: ['krankengeld'] }]) {
      expect(insuranceCoverageSchema.safeParse({ ...defaultCoverageAnswers(), pension: { common } }).success).toBe(false)
    }
  })
  it.each(['bridge', 'pension'] as const)('copies %s conservatively without mutating source or bridge-only answers', source => {
    const target = source === 'bridge' ? 'pension' : 'bridge'
    const original = completedCoverage()
    const answers = { ...original, bridge: { common: { kind: 'exceptions' as const, selected: ['krankengeld' as const] }, bridgeOnly: { kind: 'unsure' as const } }, pension: { common: { kind: 'exceptions' as const, selected: ['multiple-persons' as const] } } }
    const before = structuredClone(answers)
    const result = copyCompatibleCoverage(answers, source)
    expect(result.answers[target].common).toEqual({ kind: 'exceptions', selected: expect.arrayContaining(['krankengeld', 'multiple-persons']) })
    expect(result.answers.bridge.bridgeOnly).toEqual(before.bridge.bridgeOnly)
    expect(answers).toEqual(before)
    expect(result.answers[source]).toEqual(before[source])
    const unsure = { ...answers, [target]: { ...answers[target], common: { kind: 'unsure' as const } } }
    expect(copyCompatibleCoverage(unsure, source).answers[target].common).toEqual({ kind: 'unsure' })
  })
  it('pension none cannot erase bridge exceptions or answer its bridge-only gate', () => {
    const answers = defaultCoverageAnswers()
    answers.pension.common = { kind: 'none' }
    const copied = copyCompatibleCoverage(answers, 'pension')
    expect(copied.answers.bridge.bridgeOnly.kind).toBe('missing')
    expect(applyCoverage(insuredInput().retirementInsurance!, copied.answers).bridge.circumstances).toBeUndefined()
    expect(copied.message).toContain('separat beantwortet')
    answers.bridge.common = { kind: 'exceptions', selected: ['krankengeld'] }
    expect(copyCompatibleCoverage(answers, 'pension').answers.bridge.common).toEqual(answers.bridge.common)
    const missing = defaultCoverageAnswers()
    expect(copyCompatibleCoverage(missing, 'bridge').answers).toEqual(missing)
  })
  it('overwrites stale engine circumstances and routes bridge-only missing to its live control', () => {
    const input = insuredInput({ currentAge: 65, retirementAge: 65 })
    const answers = completedCoverage()
    const draft = { ...answers, bridge: { ...answers.bridge, bridgeOnly: { kind: 'missing' as const } } }
    input.retirementInsurance = applyCoverage(input.retirementInsurance!, draft)
    expect(input.retirementInsurance.bridge.circumstances).toBeUndefined()
    const issues = scenarioIssues(input, { kind: 'none' }, [], undefined, insuranceSetupIssues(input), null, null, draft)
    expect(issues).toContainEqual(expect.objectContaining({ fieldId: 'insurance-bridge-bridgeOnly', fieldPath: 'insuranceCoverageAnswers.bridge.bridgeOnly' }))
    const contradictory = scenarioIssues(input, { kind: 'none' }, [], undefined, insuranceSetupIssues(input), null, null, completedCoverage())
    expect(contradictory.some(issue => issue.fieldId === 'insurance-bridge-circumstances')).toBe(true)
  })
})

describe('phase applicability and whole-phase routing', () => {
  it.each([
    [65, 67, 70, ['bridge', 'pension']], [67, 67, 70, ['pension']], [68, 67, 70, ['pension']],
    [65, 70, 70, ['bridge']], [65, 75, 70, ['bridge']], [70, 67, 70, []], [65, NaN, 70, []], [65, undefined, 70, []],
  ])('work end %s boundary %s horizon %s', (retirementAge, pensionAge, planningAge, expected) => {
    const input = insuredInput({ currentAge: 65, retirementAge, planningAge })
    input.retirementInsurance!.pensionAge = pensionAge
    expect(insurancePhaseRanges(input, input.retirementInsurance!).map(r => r.phase)).toEqual(expected)
  })
  it.each(['private-rente', 'side-income', 'bridge-income', 'other', undefined] as const)('late %s forces whole phase manual from its first year', kind => {
    const input = insuredInput({ retirementIncomeStreams: [pension(), pension({ id: 'late', name: 'Später', kind, startAge: 69 })] })
    const i = input.retirementInsurance!
    const streams = phaseStreams(input.retirementIncomeStreams!, i, 'pension', 67, 70)
    expect(phaseManualReasons(i, 'pension', streams).join()).toContain('Später')
    i.pension = { ...i.pension, kvMonthlyToday: 0, pvMonthlyToday: 0 }
    expect(simulateScenario(input).retirementRows[0].healthInsurance).toBe(0)
    expect(phaseStreams([pension({ startAge: 70 })], i, 'pension', 67, 70)).toEqual([])
  })
  it('routes the earliest statutory date and malformed controlling date, not array order', () => {
    const input = insuredInput({ retirementIncomeStreams: [pension({ id: 'later', startAge: 69 }), pension({ id: 'earlier', startAge: 66 })] })
    const route = () => scenarioIssues(input, { kind: 'none' }, [], undefined, ['Rentenbeginn muss zum frühesten gesetzlichen Rentenstrom passen.'], null, null)[0].fieldId
    expect(route()).toBe('retirement-income-start-earlier')
    input.retirementIncomeStreams![0].startAge = NaN
    expect(route()).toBe('retirement-income-start-later')
  })
})

it('completed coverage preserves full ledger, required capital and fixed-seed stochastic results', () => {
  const input = insuredInput({ currentAge: 65, retirementAge: 65, annualInflationRate: .02 })
  const adapted = { ...input, retirementInsurance: applyCoverage(input.retirementInsurance!, completedCoverage()) }
  expect(simulateScenario(adapted)).toEqual(simulateScenario(input))
  const settings = { simulations: 8, seed: 8123, allocation: { equity: .6, bonds: .3, fixed: .1 } }
  expect(runStochasticSimulation(adapted, settings)).toEqual(runStochasticSimulation(input, settings))
})

describe.each(['bridge', 'pension'] as const)('binding conservative transfer from %s', source => {
  const target = source === 'bridge' ? 'pension' : 'bridge'
  const none = { kind: 'none' } as const
  const unsure = { kind: 'unsure' } as const
  const missing = { kind: 'missing' } as const
  const exceptions = { kind: 'exceptions' as const, selected: ['krankengeld' as const, 'multiple-persons' as const] }
  it.each([
    { name: 'unsure into none', from: unsure, to: none, expected: unsure },
    { name: 'none into unsure', from: none, to: unsure, expected: unsure },
    { name: 'exceptions into unsure', from: exceptions, to: unsure, expected: unsure },
    { name: 'unsure into exceptions', from: unsure, to: exceptions, expected: exceptions },
    { name: 'missing into exceptions', from: missing, to: exceptions, expected: exceptions },
    { name: 'missing into unsure', from: missing, to: unsure, expected: unsure },
    { name: 'none into exceptions', from: none, to: exceptions, expected: exceptions },
    { name: 'exceptions into none', from: exceptions, to: none, expected: exceptions },
    { name: 'unsure into missing', from: unsure, to: missing, expected: unsure },
    { name: 'none into missing', from: none, to: missing, expected: none },
    { name: 'missing into missing', from: missing, to: missing, expected: missing },
  ])('$name, repeated transfer and independent later edits', ({ from, to, expected }) => {
    const answers = defaultCoverageAnswers()
    answers[source].common = structuredClone(from)
    answers[target].common = structuredClone(to)
    const snapshot = structuredClone(answers)
    const copied = copyCompatibleCoverage(answers, source)
    expect(copied.answers[target].common).toEqual(expected)
    expect(answers).toEqual(snapshot)
    expect(copyCompatibleCoverage(copied.answers, source).answers).toEqual(copied.answers)
    if (expected.kind === 'unsure' || expected.kind === 'exceptions') {
      expect(coverageCircumstances(copied.answers[target].common)).toBe('unsupported')
      expect(copied.message).toMatch(/KV\/PV|nichts geändert/)
    }
    const editedSource = { ...copied.answers, [source]: { ...copied.answers[source], common: { kind: 'none' as const } } }
    expect(editedSource[target]).toEqual(copied.answers[target])
  })
  it.each([
    { kind: 'missing' as const }, { kind: 'unsure' as const }, { kind: 'none' as const },
    { kind: 'exceptions' as const, selected: ['family-insurance' as const, 'social-benefit' as const] },
  ])('preserves bridge-only $kind byte-for-byte and all non-coverage assumptions', bridgeOnly => {
    const answers = completedCoverage()
    const draft = { ...answers, bridge: { ...answers.bridge, bridgeOnly } }
    const input = insuredInput()
    input.retirementInsurance!.bridge = { status: 'unknown', manual: true, kvMonthlyToday: 111, pvMonthlyToday: 22, capitalMonthlyToday: 333 }
    input.retirementInsurance!.pension = { status: 'voluntary', manual: false, kvMonthlyToday: 444, pvMonthlyToday: 55, capitalMonthlyToday: 666, drvSubsidy: 'confirmed' }
    const before = structuredClone(input)
    const copied = copyCompatibleCoverage(draft, source)
    expect(JSON.stringify(copied.answers.bridge.bridgeOnly)).toBe(JSON.stringify(bridgeOnly))
    const adapted = applyCoverage(input.retirementInsurance!, copied.answers)
    for (const phase of ['bridge', 'pension'] as const) {
      const { circumstances: ignored, ...unchanged } = adapted[phase]
      void ignored
      expect(unchanged).toEqual(before.retirementInsurance![phase])
    }
    expect(input).toEqual(before)
  })
})

it.each([
  { currentAge: 65, retirementAge: 65, boundary: 67, horizon: 70, ranges: [{ phase: 'bridge', start: 65, end: 67 }, { phase: 'pension', start: 67, end: 70 }] },
  { currentAge: 65, retirementAge: 67, boundary: 67, horizon: 70, ranges: [{ phase: 'pension', start: 67, end: 70 }] },
  { currentAge: 65, retirementAge: 68, boundary: 67, horizon: 70, ranges: [{ phase: 'pension', start: 68, end: 70 }] },
  { currentAge: 65, retirementAge: 65, boundary: 70, horizon: 70, ranges: [{ phase: 'bridge', start: 65, end: 70 }] },
  { currentAge: 65, retirementAge: 65, boundary: 72, horizon: 70, ranges: [{ phase: 'bridge', start: 65, end: 70 }] },
  { currentAge: 65, retirementAge: 70, boundary: 67, horizon: 70, ranges: [] },
  { currentAge: 65, retirementAge: 71, boundary: 67, horizon: 70, ranges: [] },
  { currentAge: 65, retirementAge: 64, boundary: 67, horizon: 70, ranges: [] },
  { currentAge: NaN, retirementAge: 65, boundary: 67, horizon: 70, ranges: [] },
  { currentAge: 65, retirementAge: 65, boundary: 67.5, horizon: 70, ranges: [] },
  { currentAge: 65, retirementAge: 65, boundary: -1, horizon: 70, ranges: [] },
  { currentAge: 65, retirementAge: 65, boundary: Infinity, horizon: 70, ranges: [] },
  { currentAge: 65, retirementAge: 65, boundary: 67, horizon: NaN, ranges: [] },
])('range bounds and hidden-phase validation: $retirementAge / $boundary / $horizon', ({ currentAge, retirementAge, boundary, horizon, ranges }) => {
  const input = insuredInput({ currentAge, retirementAge, planningAge: horizon, retirementIncomeStreams: [] })
  input.retirementInsurance!.pensionAge = boundary
  expect(insurancePhaseRanges(input, input.retirementInsurance!)).toEqual(ranges)
  if (ranges.length === 1) {
    const hidden = ranges[0].phase === 'bridge' ? 'pension' : 'bridge'
    input.retirementInsurance![hidden] = {}
    expect(insuranceSetupIssues(input)).toEqual([])
  }
})
