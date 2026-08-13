import { describe, expect, it } from 'vitest'
import {
  getConditionalSurvivalProbability,
  getSurvivalProbabilityForAgeEnd,
  type LifeTableSex,
} from '../mortality'

const sexes: LifeTableSex[] = ['total', 'female', 'male']

describe('mortality survival probabilities', () => {
  it('returns 1 at the current age', () => {
    expect(getConditionalSurvivalProbability(40, 40, 'total')).toBe(1)
  })

  it('decreases or stays equal as target age increases', () => {
    const survivalTo80 = getConditionalSurvivalProbability(40, 80, 'total')
    const survivalTo81 = getConditionalSurvivalProbability(40, 81, 'total')
    const survivalTo95 = getConditionalSurvivalProbability(40, 95, 'total')

    expect(survivalTo81).toBeLessThanOrEqual(survivalTo80)
    expect(survivalTo95).toBeLessThanOrEqual(survivalTo81)
  })

  it('provides bounded male, female, and total values', () => {
    for (const sex of sexes) {
      const probability = getConditionalSurvivalProbability(67, 90, sex)

      expect(probability).toBeGreaterThanOrEqual(0)
      expect(probability).toBeLessThanOrEqual(1)
    }
  })

  it('returns lower survival to age 95 than to age 80 for a 40-year-old', () => {
    const survivalTo80 = getSurvivalProbabilityForAgeEnd(40, 80, 'total')
    const survivalTo95 = getSurvivalProbabilityForAgeEnd(40, 95, 'total')

    expect(survivalTo95).toBeLessThan(survivalTo80)
  })

  it('caps target ages above the explicit table limit and returns a bounded probability', () => {
    const cappedSurvival = getConditionalSurvivalProbability(40, 95, 'female')
    const survivalBeyondCap = getConditionalSurvivalProbability(40, 110, 'female')

    expect(survivalBeyondCap).toBe(cappedSurvival)
    expect(survivalBeyondCap).toBeGreaterThanOrEqual(0)
    expect(survivalBeyondCap).toBeLessThanOrEqual(1)
  })
})
