import { CurrencyInput } from '../../../shared/components/CurrencyInput'
import { NumberInput } from '../../../shared/components/NumberInput'
import type { AllocationTransition, Milestone } from '../model/lifecycleAllocation/types'
import type { PortfolioBucket } from '../model/portfolioBuckets'

type Props = {
  buckets: PortfolioBucket[]
  milestones: Milestone[] | undefined
  transitions: AllocationTransition[] | undefined
  totalToday: number
  onInit: () => void
  onRePrefill: () => void
  onUpdateMilestone: (index: number, patch: Partial<{ name: string; startAge: number }>) => void
  onUpdateTarget: (milestoneIndex: number, bucketId: string, target: { role: 'fixedReserve'; amountToday: number } | { role: 'percent'; share: number }) => void
  onAddTransition: () => void
  onUpdateTransition: (index: number, patch: Partial<{ startAge: number; durationYears: number }>) => void
}

const percent = new Intl.NumberFormat('de-DE', { style: 'percent', maximumFractionDigits: 1 })

export function LifecycleMilestones(props: Props) {
  const { buckets, milestones, transitions, totalToday, onInit, onRePrefill, onUpdateMilestone, onUpdateTarget, onAddTransition, onUpdateTransition } = props
  if (!milestones || !transitions) {
    return (
      <fieldset className="wide-fieldset">
        <legend>Lebenszyklus-Meilensteine</legend>
        <p>Noch keine Meilensteine. Initiale Prozente stammen nur aus tatsächlichen Beständen und bleiben danach erhalten bis zur ausdrücklichen Neuauffüllung.</p>
        <button type="button" className="secondary-button" onClick={onInit}>Meilensteine aus Beständen initialisieren</button>
        {totalToday <= 0 ? <p className="field-error">Bei Nullvermögen ist eine ausdrückliche Allokation erforderlich; automatische Auffüllung ist blockiert.</p> : null}
      </fieldset>
    )
  }
  return (
    <fieldset className="wide-fieldset">
      <legend>Lebenszyklus-Meilensteine</legend>
      <p className="portfolio-note">Ein Übergang initial, weitere per Hinzufügen. Überlappende oder verkettete Übergänge sind ungültig. Sofort (0 Jahre) oder linear (n Jahre). Feste Reserven in Prioritätsreihenfolge, Rest prozentual.</p>
      <div>
        <button type="button" className="secondary-button" onClick={onRePrefill}>Prozente aus Beständen neu auffüllen</button>
        <button type="button" className="secondary-button" onClick={onAddTransition}>Übergang hinzufügen</button>
      </div>
      {milestones.map((milestone, mi) => (
        <div key={`${milestone.name}-${mi}`} className="portfolio-bucket">
          <label className="field">
            <span className="field-label">Meilenstein {mi + 1} Name</span>
            <input
              id={`lifecycle-milestone-name-${mi}`}
              type="text"
              value={milestone.name}
              onChange={(e) => onUpdateMilestone(mi, { name: e.target.value })}
            />
          </label>
          <NumberInput
            id={`lifecycle-milestone-age-${mi}`}
            label={`Startalter ${milestone.name}`}
            value={milestone.startAge}
            min={0}
            max={120}
            onChange={(value) => onUpdateMilestone(mi, { startAge: value })}
          />
          {buckets.map((bucket) => {
            const label = bucket.name.trim() || bucket.id
            const target = milestone.targets[bucket.id]
            const isFixed = target?.role === 'fixedReserve'
            return (
              <div key={bucket.id}>
                <label className="field">
                  <span className="field-label">{label} Rolle</span>
                  <select
                    id={`lifecycle-target-role-${mi}-${bucket.id}`}
                    value={target?.role ?? 'percent'}
                    onChange={(e) => {
                      const role = e.target.value
                      if (role === 'fixedReserve') {
                        onUpdateTarget(mi, bucket.id, { role: 'fixedReserve', amountToday: 0 })
                      } else {
                        onUpdateTarget(mi, bucket.id, { role: 'percent', share: 0 })
                      }
                    }}
                  >
                    <option value="percent">Prozent (Rest)</option>
                    <option value="fixedReserve">Feste Reserve (heute, real)</option>
                  </select>
                </label>
                {isFixed ? (
                  <CurrencyInput
                    id={`lifecycle-target-fixed-${mi}-${bucket.id}`}
                    label={`Reserve ${label} heute`}
                    value={target.role === 'fixedReserve' ? target.amountToday : NaN}
                    onChange={(value) => onUpdateTarget(mi, bucket.id, { role: 'fixedReserve', amountToday: value })}
                  />
                ) : (
                  <NumberInput
                    id={`lifecycle-target-share-${mi}-${bucket.id}`}
                    label={`Anteil ${label} (0-1)`}
                    value={target?.role === 'percent' ? target.share : NaN}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(value) => onUpdateTarget(mi, bucket.id, { role: 'percent', share: value })}
                  />
                )}
                {target?.role === 'percent' && Number.isFinite(target.share) ? <span>{percent.format(target.share)}</span> : null}
              </div>
            )
          })}
        </div>
      ))}
      {transitions.map((t, ti) => (
        <div key={`${t.fromMilestone}-${t.toMilestone}-${ti}`} className="portfolio-bucket">
          <strong>Übergang {ti + 1}: {t.fromMilestone} → {t.toMilestone}</strong>
          <NumberInput
            id={`lifecycle-transition-age-${ti}`}
            label="Startalter"
            value={t.startAge}
            min={0}
            max={120}
            onChange={(value) => onUpdateTransition(ti, { startAge: value })}
          />
          <NumberInput
            id={`lifecycle-transition-duration-${ti}`}
            label="Dauer Jahre (0 = sofort, sonst linear)"
            value={t.durationYears}
            min={0}
            max={60}
            onChange={(value) => onUpdateTransition(ti, { durationYears: value })}
          />
        </div>
      ))}
    </fieldset>
  )
}
