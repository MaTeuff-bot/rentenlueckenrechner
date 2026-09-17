import { useMemo, useState } from 'react'
import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { LifecycleRun } from '../model/lifecycleScenario'
import { formatCurrency, formatPercent } from '../model/format'
import { DESTATIS_GERMANY_LIFE_TABLE_MAX_EXACT_AGE, getSurvivalProbabilityForAgeEnd, type LifeTableSex } from '../mortality/mortality'

type Props = {
  lifecycleRun: LifecycleRun
}

function percentile(sorted: number[], q: number): number {
  if (!sorted.length) return 0
  const index = Math.round((sorted.length - 1) * q)
  return sorted[Math.min(sorted.length - 1, Math.max(0, index))] ?? 0
}

const sexOptions: { value: LifeTableSex; label: string }[] = [
  { value: 'conservative', label: 'Keine Angabe / konservativ' },
  { value: 'female', label: 'Weiblich' },
  { value: 'male', label: 'Männlich' },
]

export function LifecycleChart({ lifecycleRun }: Props) {
  const [showSurvival, setShowSurvival] = useState(true)
  const [sex, setSex] = useState<LifeTableSex>('conservative')
  const reports = lifecycleRun.result.reports
  const years = lifecycleRun.years
  const bootstrap = lifecycleRun.bootstrap
  const currentAge = reports[0]?.age ?? years[0]?.age ?? 0
  const blocked = bootstrap?.summaryBlocked ?? false

  const rows = useMemo(() => {
    const trajectories: number[][] = []
    if (bootstrap && !blocked) {
      for (const path of bootstrap.paths) {
        if (path.status === 'survived' || path.status === 'depleted') {
          const real = path.yearlyClosingNominal.map((nominal, i) => {
            const factor = path.yearlyInflationFactors[i] ?? years[i]?.inflationFactor ?? 1
            return factor > 0 ? nominal / factor : nominal
          })
          trajectories.push(real)
        }
      }
    }
    return reports.map((r, i) => {
      const factor = years[i]?.inflationFactor ?? 1
      const referenceReal = factor > 0 ? r.closingValue / factor : r.closingValue
      const anchorReal = factor > 0 ? r.anchorNominal / factor : r.anchorNominal
      let p10 = referenceReal
      let p50 = referenceReal
      let p90 = referenceReal
      let depletionProbability = 0
      if (trajectories.length) {
        const values = trajectories.map((traj) => traj[i] ?? 0).sort((a, b) => a - b)
        p10 = percentile(values, 0.1)
        p50 = percentile(values, 0.5)
        p90 = percentile(values, 0.9)
        depletionProbability = values.filter((v) => v <= 0.01).length / values.length
      } else if (bootstrap && !blocked) {
        depletionProbability = r.closingValue <= 0.01 ? 1 : 0
      }
      const ageEnd = r.age + 1
      return {
        age: r.age,
        ageEnd,
        referenceReal: Math.round(referenceReal),
        anchorReal: Math.round(anchorReal),
        p10: Math.round(p10),
        p50: Math.round(p50),
        p90: Math.round(p90),
        p10ToP90: [Math.round(p10), Math.round(p90)] as [number, number],
        survivalProbabilityEnd: getSurvivalProbabilityForAgeEnd(currentAge, ageEnd, sex),
        depletionProbability,
      }
    })
  }, [reports, years, bootstrap, blocked, currentAge, sex])

  const successProbability = bootstrap && !blocked && bootstrap.paths.length
    ? bootstrap.paths.filter((p) => p.status === 'survived').length / bootstrap.paths.length
    : null
  const reachesLimit = rows.some((r) => r.ageEnd >= DESTATIS_GERMANY_LIFE_TABLE_MAX_EXACT_AGE)

  return (
    <div>
      <h3>Vermögensverlauf Lebenszyklus (gemeinsame Jahreszeilen, heutige Kaufkraft)</h3>
      {bootstrap ? (
        blocked ? (
          <p role="status" className="field-error">Bootstrap blockiert: {bootstrap.failureCount} Pfade nicht konvergiert/fehlerhaft. Keine Erfolgswahrscheinlichkeit. Referenz bleibt sichtbar.</p>
        ) : (
          <p>{successProbability !== null ? `Erfolgswahrscheinlichkeit ${formatPercent(successProbability)} (${bootstrap.paths.filter((p) => p.status === 'survived').length} von ${bootstrap.paths.length} Pfaden). ` : ''}Bänder P10/P50/P90 aus denselben Ledger-Jahreszeilen, real (heutige Kaufkraft).</p>
        )
      ) : (
        <p>Referenzverlauf aus denselben Ledger-Jahreszeilen, real (heutige Kaufkraft).</p>
      )}
      <div className="chart-controls" aria-label="Diagrammeinstellungen">
        <label className="toggle"><input type="checkbox" checked={showSurvival} onChange={(e) => setShowSurvival(e.target.checked)} />Überlebenswahrscheinlichkeit anzeigen</label>
        <label className="field"><span className="field-label">Geschlecht für Sterbetafel</span><select value={sex} onChange={(e) => setSex(e.target.value as LifeTableSex)}>{sexOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={rows} margin={{ top: 12, right: 34, bottom: 8, left: 12 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="age" tickFormatter={(v) => `${v}`} label={{ value: 'Alter', position: 'insideBottom', offset: -4 }} />
          <YAxis yAxisId="capital" tickFormatter={(v) => formatCurrency(Number(v), 100)} width={76} label={{ value: 'Kapital heutige Kaufkraft', angle: -90, position: 'insideLeft' }} />
          {showSurvival ? <YAxis yAxisId="survival" orientation="right" domain={[0, 1]} tickFormatter={(v) => formatPercent(Number(v))} width={62} /> : null}
          <Tooltip formatter={(value, name) => (typeof value === 'number' && String(name).includes('Überleben') ? formatPercent(value) : formatCurrency(Number(value), 100))} />
          <Legend verticalAlign="top" height={36} />
          <Area yAxisId="capital" type="monotone" dataKey="p10ToP90" name="P10–P90 heutige Kaufkraft" fillOpacity={0.2} stroke="none" />
          <Line yAxisId="capital" type="monotone" dataKey="p50" name="P50 (Median) heutige Kaufkraft" dot={false} />
          <Line yAxisId="capital" type="monotone" dataKey="referenceReal" name="Referenz heutige Kaufkraft" dot={false} />
          <Line yAxisId="capital" type="monotone" dataKey="anchorReal" name="Anker heutige Kaufkraft" dot={false} />
          {showSurvival ? <Line yAxisId="survival" type="monotone" dataKey="survivalProbabilityEnd" name="Überleben" dot={false} /> : null}
          {reachesLimit ? <ReferenceLine x={DESTATIS_GERMANY_LIFE_TABLE_MAX_EXACT_AGE} stroke="#6b7280" strokeDasharray="4 4" label="Sterbetafelgrenze" /> : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
