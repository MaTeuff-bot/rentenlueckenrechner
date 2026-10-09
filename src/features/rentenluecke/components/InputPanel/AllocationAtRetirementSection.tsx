import { CurrencyInput } from '../../../../shared/components/CurrencyInput'
import { PercentInput } from '../../../../shared/components/PercentInput'
import { isSupportedAllocationEligibility, validateAllocationDraft, type AllocationDraft } from '../../model/capitalIncome/allocationEvent'
import type { PortfolioBucket } from '../../model/portfolioBuckets'

type Props = {
  buckets: PortfolioBucket[]
  draft: AllocationDraft | undefined
  onPrefill: () => void
  onAccept: () => void
  onReset: () => void
  onToggleEnabled: (enabled: boolean) => void
  onFixedChange: (bucketId: string, amountToday: number) => void
  onWeightChange: (bucketId: string, weight: number) => void
  onRemoveTarget: (bucketId: string) => void
  onMoveFixedTarget: (bucketId: string, direction: -1 | 1) => void
  onRemoveFixedTarget: (bucketId: string) => void
}

export function AllocationAtRetirementSection({ buckets, draft, onPrefill, onAccept, onReset, onToggleEnabled, onFixedChange, onWeightChange, onRemoveTarget, onMoveFixedTarget, onRemoveFixedTarget }: Props) {
  const supported = buckets.filter(b => isSupportedAllocationEligibility(b.holding))
  const validation = validateAllocationDraft(buckets, draft)
  const dangling = new Set(validation.danglingIds)
  const fixedById = new Map((draft?.fixedTargets ?? []).map(t => [t.bucketId, t.amountToday]))
  const status = !draft
    ? 'Deaktiviert: das Vermögen driftet mit Startanteilen, Sparraten und proportionalen Entnahmen.'
    : draft.enabled
      ? 'Aktiv: einmalige Umschichtung am Ende des ersten Ruhestandsjahres.'
      : draft.accepted
        ? 'Übernommen, aber deaktiviert: erst nach Aktivieren wirksam.'
        : 'Entwurf: bitte prüfen und ausdrücklich übernehmen.'
  return (
    <fieldset className="wide-fieldset allocation-section">
      <legend>Umschichtung zum Arbeitsende (einmalig, optional)</legend>
      <p id="allocation-status" data-testid="allocation-status">{status}</p>
      <p>Einmalig statt fortlaufend: Die bisherigen Anlagen erwirtschaften im ersten Ruhestandsjahr noch ihre bisherigen Renditen und finanzieren gemeinsam Ausgaben sowie alle modellierten Abgaben (Steuern, KV/PV). Erst danach wird das verbleibende Nettovermögen auf die Zielanlagen aufgeteilt; die neue Aufteilung wirkt ab dem Folgejahr. Keine Schutzrücklage, keine Folgetermine.</p>
      <p>Festbeträge (heutige Kaufkraft, der Reihe nach) können das Vermögen aufzehren; Restanteile verteilen den Rest. Die Aktienquote kann dadurch steigen, im Abschwung wird proportional aus allen Anlagen verkauft. Umschichtungsgewinne und Bankzinsen werden wie Entnahmen versteuert; Sparraten folgen weiter den Startanteilen.</p>
      <p>Festbeträge sind Zielbeträge in heutiger Kaufkraft (heutige Euro mal Inflationsfaktor) und keine geschützten Rücklagen: Die einmalige Aufteilung zieht keine Festbeträge vom Vermögen ab, sondern verteilt nur das verbleibende Nettovermögen der Reihe nach. Reicht das Nettovermögen nicht für alle Festbeträge, werden spätere Prioritäten nur teilweise oder gar nicht bedient und der Restanteil ist null. Nach der Umschichtung entwickeln sich alle Zielanlagen mit ihren Renditen und proportionalen Entnahmen weiter und können daher auch bei Verlusten schrumpfen.</p>
      {!draft ? (
        <button id="allocation-prefill" className="secondary-button" type="button" onClick={onPrefill} disabled={supported.length === 0}>
          Zielallokation aus Startanteilen vorbefüllen
        </button>
      ) : (
        <>
          <label className="field">
            <span>
              <input id="allocation-enabled" type="checkbox" checked={draft.enabled}
                disabled={draft.enabled ? false : (!draft.accepted || !validation.clean)}
                onChange={e => onToggleEnabled(e.target.checked)} />
              Einmalige Umschichtung zum Arbeitsende aktivieren
            </span>
          </label>
          {draft.enabled && (!draft.accepted || !validation.clean) ? (
            <p className="field-error">Aktivierung blockiert: erst reparieren und erneut übernehmen — oder zurücksetzen/deaktivieren.</p>
          ) : null}
          <h4>Festbeträge – Prioritätsreihenfolge (exakte Engine-Reihenfolge)</h4>
          {draft.fixedTargets.length === 0 ? (
            <p id="allocation-priority-empty">Noch keine Festbeträge festgelegt.</p>
          ) : (
            <ol id="allocation-priority-list">
              {draft.fixedTargets.map((target, index) => {
                const bucket = buckets.find(b => b.id === target.bucketId)
                const label = bucket?.name.trim() || target.bucketId
                const danglingTarget = dangling.has(target.bucketId)
                return (
                  <li key={target.bucketId} id={`allocation-priority-${target.bucketId}`}>
                    <span>Priorität {index + 1}: {label}{danglingTarget ? ' (entfernt oder nicht unterstützt)' : ''}</span>
                    <button id={`allocation-fixed-up-${target.bucketId}`} className="secondary-button" type="button"
                      disabled={index === 0} onClick={() => onMoveFixedTarget(target.bucketId, -1)}>
                      Nach oben
                    </button>
                    <button id={`allocation-fixed-down-${target.bucketId}`} className="secondary-button" type="button"
                      disabled={index === draft.fixedTargets.length - 1} onClick={() => onMoveFixedTarget(target.bucketId, 1)}>
                      Nach unten
                    </button>
                    <button id={`allocation-fixed-remove-${target.bucketId}`} className="secondary-button" type="button"
                      onClick={() => onRemoveFixedTarget(target.bucketId)}>
                      Festbetrag entfernen
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
          <h4>Festbeträge je Zielanlage (heutige Kaufkraft, Beträge)</h4>
          {supported.filter(b => !dangling.has(b.id)).map(bucket => {
            const label = bucket.name.trim() || bucket.id
            const value = fixedById.get(bucket.id) ?? 0
            return (
              <CurrencyInput key={bucket.id} id={`allocation-fixed-${bucket.id}`}
                label={`Festbetrag für ${label}`}
                value={value}
                error={!Number.isFinite(value) || value < 0 ? 'Bitte einen nicht negativen Eurobetrag eingeben.' : undefined}
                onChange={amountToday => onFixedChange(bucket.id, amountToday)} />
            )
          })}
          <h4>Restanteile (normiert; fehlende Anlagen erhalten null)</h4>
          {supported.filter(b => !dangling.has(b.id)).map(bucket => {
            const label = bucket.name.trim() || bucket.id
            const weight = draft.remainderWeights[bucket.id] ?? 0
            return (
              <PercentInput key={bucket.id} id={`allocation-weight-${bucket.id}`}
                label={`Restanteil für ${label}`}
                value={weight}
                min={0}
                error={!Number.isFinite(weight) || weight < 0 ? 'Bitte ein nicht negatives Gewicht eingeben.' : undefined}
                onChange={w => onWeightChange(bucket.id, w)} />
            )
          })}
          {validation.danglingIds.length > 0 ? (
            <>
              <h4>Entfernte oder nicht mehr unterstützte Ziele (zur Reparatur erhalten)</h4>
              {validation.danglingIds.map(id => (
                <div className="field" key={id} id={`allocation-dangling-${id}`}>
                  <span className="field-label">Ziel „{id}“ — Anlage entfernt oder nicht unterstützt</span>
                  <button id={`allocation-repair-${id}`} className="secondary-button" type="button" onClick={() => onRemoveTarget(id)}>
                    Ziel entfernen
                  </button>
                </div>
              ))}
            </>
          ) : null}
          {validation.problems.length > 0 && draft.enabled ? (
            <ul>{validation.problems.map((problem, index) => <li key={index} className="field-error">{problem}</li>)}</ul>
          ) : null}
          <div className="allocation-actions">
            <button id="allocation-accept" className="secondary-button" type="button" onClick={onAccept} disabled={draft.accepted && validation.clean}>
              Ziele übernehmen
            </button>
            <button id="allocation-reset" className="secondary-button" type="button" onClick={onReset}>
              Zurücksetzen (deaktivieren)
            </button>
          </div>
        </>
      )}
    </fieldset>
  )
}
