import { EUROSTAT_GERMANY_LIFE_TABLE_2024 } from './eurostatGermanyLifeTable2024'

export type LifeTableSex = 'total' | 'female' | 'male'

export type MortalityAgeRow = {
  age: number
  qxMale: number
  qxFemale: number
  qxTotal: number
}

const rowsByAge = new Map(EUROSTAT_GERMANY_LIFE_TABLE_2024.map((row) => [row.age, row]))

export const EUROSTAT_GERMANY_LIFE_TABLE_MAX_EXACT_AGE = 95

function qxForSex(row: MortalityAgeRow, sex: LifeTableSex): number {
  if (sex === 'male') return row.qxMale
  if (sex === 'female') return row.qxFemale
  return row.qxTotal
}

function clampProbability(value: number): number {
  return Math.min(Math.max(value, 0), 1)
}

function normalizeAge(age: number): number {
  return Math.min(Math.max(Math.floor(age), 0), EUROSTAT_GERMANY_LIFE_TABLE_MAX_EXACT_AGE)
}

export function getConditionalSurvivalProbability(
  currentAge: number,
  targetAge: number,
  sex: LifeTableSex,
): number {
  const fromAge = normalizeAge(currentAge)
  const toAge = normalizeAge(targetAge)

  if (toAge <= fromAge) return 1

  let probability = 1

  for (let age = fromAge; age < toAge; age += 1) {
    const row = rowsByAge.get(age)

    if (!row) break

    probability *= 1 - clampProbability(qxForSex(row, sex))
  }

  return clampProbability(probability)
}

export function getSurvivalProbabilityForAgeEnd(
  currentAge: number,
  ageEnd: number,
  sex: LifeTableSex,
): number {
  return getConditionalSurvivalProbability(currentAge, ageEnd, sex)
}
