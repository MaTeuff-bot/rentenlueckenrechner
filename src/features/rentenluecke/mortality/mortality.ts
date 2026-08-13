import { DESTATIS_GERMANY_PERIOD_LIFE_TABLE_2023_2025 } from './destatisGermanyPeriodLifeTable2023_2025'

export type LifeTableSex = 'conservative' | 'female' | 'male'

export type MortalityAgeRow = {
  age: number
  qxMale: number
  qxFemale: number
  lxMale: number
  lxFemale: number
}

export const DESTATIS_GERMANY_LIFE_TABLE_MAX_EXACT_AGE = 100

const rowsByAge = new Map(DESTATIS_GERMANY_PERIOD_LIFE_TABLE_2023_2025.map((row) => [row.age, row]))

function lxForSex(row: MortalityAgeRow, sex: LifeTableSex): number {
  if (sex === 'male') return row.lxMale
  if (sex === 'female') return row.lxFemale
  return Math.max(row.lxMale, row.lxFemale)
}

function clampProbability(value: number): number {
  return Math.min(Math.max(value, 0), 1)
}

function normalizeAge(age: number): number {
  return Math.min(Math.max(Math.floor(age), 0), DESTATIS_GERMANY_LIFE_TABLE_MAX_EXACT_AGE)
}

export function getConditionalSurvivalProbability(
  currentAge: number,
  targetAge: number,
  sex: LifeTableSex,
): number {
  const fromAge = normalizeAge(currentAge)
  const toAge = normalizeAge(targetAge)

  if (toAge <= fromAge) return 1

  const currentAgeRow = rowsByAge.get(fromAge)
  const targetAgeRow = rowsByAge.get(toAge)

  if (!currentAgeRow || !targetAgeRow) return 1

  const currentLx = lxForSex(currentAgeRow, sex)
  const targetLx = lxForSex(targetAgeRow, sex)

  if (currentLx <= 0) return 0

  return clampProbability(targetLx / currentLx)
}

export function getSurvivalProbabilityForAgeEnd(
  currentAge: number,
  ageEnd: number,
  sex: LifeTableSex,
): number {
  return getConditionalSurvivalProbability(currentAge, ageEnd, sex)
}
