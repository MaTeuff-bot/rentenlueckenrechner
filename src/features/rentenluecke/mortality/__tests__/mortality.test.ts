import { describe, expect, it } from 'vitest'
import { DESTATIS_GERMANY_PERIOD_LIFE_TABLE_2023_2025 } from '../destatisGermanyPeriodLifeTable2023_2025'
import {
  DESTATIS_GERMANY_LIFE_TABLE_MAX_EXACT_AGE,
  getConditionalSurvivalProbability,
  getSurvivalProbabilityForAgeEnd,
  type LifeTableSex,
} from '../mortality'

const sexes: LifeTableSex[] = ['conservative', 'female', 'male']

describe('mortality survival probabilities', () => {
  it('bundles Destatis male and female ages 0 through 100', () => {
    expect(DESTATIS_GERMANY_PERIOD_LIFE_TABLE_2023_2025).toHaveLength(101)
    expect(DESTATIS_GERMANY_LIFE_TABLE_MAX_EXACT_AGE).toBe(100)

    for (let age = 0; age <= 100; age += 1) {
      const row = DESTATIS_GERMANY_PERIOD_LIFE_TABLE_2023_2025[age]
      expect(row.age).toBe(age)
      expect(row.qxMale).toBeGreaterThanOrEqual(0)
      expect(row.qxMale).toBeLessThanOrEqual(1)
      expect(row.qxFemale).toBeGreaterThanOrEqual(0)
      expect(row.qxFemale).toBeLessThanOrEqual(1)
      expect(row.lxMale).toBeGreaterThanOrEqual(0)
      expect(row.lxFemale).toBeGreaterThanOrEqual(0)
    }
  })

  it('returns 1 at the current age', () => {
    expect(getConditionalSurvivalProbability(40, 40, 'conservative')).toBe(1)
  })

  it('decreases or stays equal as target age increases', () => {
    const survivalTo80 = getConditionalSurvivalProbability(40, 80, 'conservative')
    const survivalTo81 = getConditionalSurvivalProbability(40, 81, 'conservative')
    const survivalTo100 = getConditionalSurvivalProbability(40, 100, 'conservative')

    expect(survivalTo81).toBeLessThanOrEqual(survivalTo80)
    expect(survivalTo100).toBeLessThanOrEqual(survivalTo81)
  })

  it('provides bounded male, female, and conservative values', () => {
    for (const sex of sexes) {
      const probability = getConditionalSurvivalProbability(67, 90, sex)

      expect(probability).toBeGreaterThanOrEqual(0)
      expect(probability).toBeLessThanOrEqual(1)
    }
  })

  it('returns lower survival to age 100 than to age 95 for a 40-year-old', () => {
    const survivalTo95 = getSurvivalProbabilityForAgeEnd(40, 95, 'conservative')
    const survivalTo100 = getSurvivalProbabilityForAgeEnd(40, 100, 'conservative')

    expect(survivalTo100).toBeLessThan(survivalTo95)
  })

  it('returns small but nonnegative survival to age 100 for a 40-year-old', () => {
    const maleSurvivalTo100 = getConditionalSurvivalProbability(40, 100, 'male')
    const femaleSurvivalTo100 = getConditionalSurvivalProbability(40, 100, 'female')

    expect(maleSurvivalTo100).toBeGreaterThanOrEqual(0)
    expect(maleSurvivalTo100).toBeLessThan(0.02)
    expect(femaleSurvivalTo100).toBeGreaterThanOrEqual(0)
    expect(femaleSurvivalTo100).toBeLessThan(0.05)
  })

  it('caps target ages above 100 at the age-100 terminal probability', () => {
    const cappedSurvival = getConditionalSurvivalProbability(40, 100, 'female')
    const survivalBeyondCap = getConditionalSurvivalProbability(40, 110, 'female')

    expect(survivalBeyondCap).toBe(cappedSurvival)
    expect(survivalBeyondCap).toBeGreaterThanOrEqual(0)
    expect(survivalBeyondCap).toBeLessThanOrEqual(1)
  })
})
