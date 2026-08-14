import type { StochasticPercentileRow } from '../model/stochasticReturns'
import type { SimulationResult } from '../model/types'
import { getSurvivalProbabilityForAgeEnd, type LifeTableSex } from '../mortality/mortality'

export type ScenarioOutcomeChartRow = {
  ageStart: number
  ageEnd: number
  deterministicCapitalToday: number
  p10CapitalToday: number
  p50CapitalToday: number
  p90CapitalToday: number
  p10ToP90CapitalToday: [number, number]
  survivalProbabilityEnd: number
  depletionProbability: number
}

export type DepletionRiskChip = {
  key: string
  label: string
  ageEnd: number
  survivalProbabilityEnd: number
  depletionProbability: number
}

export type ChartDisplayRow = ScenarioOutcomeChartRow & {
  chartDeterministicCapitalToday: number
  chartP10CapitalToday: number
  chartP50CapitalToday: number
  chartP90CapitalToday: number
  chartP10ToP90CapitalToday: [number, number]
}

export const survivalThresholds = [
  { key: 'survival-20', threshold: 0.2, label: 'Wenn noch ≤20 % leben' },
  { key: 'survival-10', threshold: 0.1, label: 'Wenn noch ≤10 % leben' },
  { key: 'survival-5', threshold: 0.05, label: 'Wenn noch ≤5 % leben' },
]

function roundCapital(value: number): number {
  return Math.round(value)
}

export function toLogScaleCapital(value: number): number {
  return Math.max(1, value)
}

export function capCapital(value: number, capitalDisplayCap: number): number {
  return Math.min(value, capitalDisplayCap)
}

export function toChartCapital(value: number, useLogCapitalScale: boolean, capitalDisplayCap: number): number {
  const cappedValue = capCapital(value, capitalDisplayCap)
  return useLogCapitalScale ? toLogScaleCapital(cappedValue) : cappedValue
}

export function calculateCapitalDisplayCap(rows: ScenarioOutcomeChartRow[]): number {
  return Math.max(1, Math.max(...rows.map((row) => row.deterministicCapitalToday), 0) * 2)
}

export function isCapitalDisplayCapped(rows: ScenarioOutcomeChartRow[], capitalDisplayCap: number): boolean {
  return rows.some(
    (row) =>
      row.p10CapitalToday > capitalDisplayCap ||
      row.p50CapitalToday > capitalDisplayCap ||
      row.p90CapitalToday > capitalDisplayCap ||
      row.deterministicCapitalToday > capitalDisplayCap,
  )
}

export function buildDisplayRows(
  rows: ScenarioOutcomeChartRow[],
  useLogCapitalScale: boolean,
  capitalDisplayCap: number,
): ChartDisplayRow[] {
  return rows.map((row) => {
    const chartP10CapitalToday = toChartCapital(row.p10CapitalToday, useLogCapitalScale, capitalDisplayCap)
    const chartP50CapitalToday = toChartCapital(row.p50CapitalToday, useLogCapitalScale, capitalDisplayCap)
    const chartP90CapitalToday = toChartCapital(row.p90CapitalToday, useLogCapitalScale, capitalDisplayCap)
    const chartDeterministicCapitalToday = toChartCapital(
      row.deterministicCapitalToday,
      useLogCapitalScale,
      capitalDisplayCap,
    )

    return {
      ...row,
      chartDeterministicCapitalToday,
      chartP10CapitalToday,
      chartP50CapitalToday,
      chartP90CapitalToday,
      chartP10ToP90CapitalToday: [chartP10CapitalToday, chartP90CapitalToday],
    }
  })
}

export function buildScenarioOutcomeRows(
  result: SimulationResult,
  stochasticRows: StochasticPercentileRow[],
  lifeTableSex: LifeTableSex,
): ScenarioOutcomeChartRow[] {
  const currentAge = result.rows[0]?.ageStart ?? 0

  return result.rows.map((deterministicRow, rowIndex) => {
    const stochasticRow = stochasticRows[rowIndex]
    const p10CapitalToday = roundCapital(stochasticRow?.p10CapitalToday ?? deterministicRow.closingCapitalToday)
    const p50CapitalToday = roundCapital(stochasticRow?.p50CapitalToday ?? deterministicRow.closingCapitalToday)
    const p90CapitalToday = roundCapital(stochasticRow?.p90CapitalToday ?? deterministicRow.closingCapitalToday)

    return {
      ageStart: deterministicRow.ageStart,
      ageEnd: deterministicRow.ageEnd,
      deterministicCapitalToday: roundCapital(
        stochasticRow?.deterministicCapitalToday ?? deterministicRow.closingCapitalToday,
      ),
      p10CapitalToday,
      p50CapitalToday,
      p90CapitalToday,
      p10ToP90CapitalToday: [p10CapitalToday, p90CapitalToday],
      survivalProbabilityEnd: getSurvivalProbabilityForAgeEnd(currentAge, deterministicRow.ageEnd, lifeTableSex),
      depletionProbability: stochasticRow?.depletionProbability ?? (deterministicRow.depleted ? 1 : 0),
    }
  })
}

export function buildRiskChips(rows: ScenarioOutcomeChartRow[]): DepletionRiskChip[] {
  const chips: DepletionRiskChip[] = []
  const usedAges = new Set<number>()

  for (const threshold of survivalThresholds) {
    const row = rows.find((row) => row.survivalProbabilityEnd <= threshold.threshold)
    if (!row || usedAges.has(row.ageEnd)) {
      continue
    }

    chips.push({
      key: threshold.key,
      label: threshold.label,
      ageEnd: row.ageEnd,
      survivalProbabilityEnd: row.survivalProbabilityEnd,
      depletionProbability: row.depletionProbability,
    })
    usedAges.add(row.ageEnd)
  }

  const planningHorizonRow = rows.at(-1)
  if (planningHorizonRow && !usedAges.has(planningHorizonRow.ageEnd)) {
    chips.push({
      key: 'planning-horizon',
      label: 'Bis Planungshorizont',
      ageEnd: planningHorizonRow.ageEnd,
      survivalProbabilityEnd: planningHorizonRow.survivalProbabilityEnd,
      depletionProbability: planningHorizonRow.depletionProbability,
    })
  }

  return chips
}
