import { bridgeExceptions, commonExceptions, toggleCoverage, type BridgeInsuranceException, type CommonInsuranceException, type CoverageAnswer } from '../../model/insuranceCoverage'
import { useEffect, useState } from 'react'
export type CoverageManualOption = {
  id: string
  phaseLabel: string
  active: boolean
  forced: boolean
  forcedReasons: readonly string[]
  onManualChange: (manual: boolean) => void
}
export function InsuranceCoverageChecklist<E extends string>({ id, title, answer, options, onChange, manualOption }: {
  id: string; title: string; answer: CoverageAnswer<E>; options: Record<E, string>; onChange: (answer: CoverageAnswer<E>) => void; manualOption?: CoverageManualOption
}) {
  const hasExceptions = answer.kind === 'exceptions'
  const [showExceptions, setShowExceptions] = useState(hasExceptions)
  useEffect(() => { setShowExceptions(hasExceptions) }, [hasExceptions])
  const manualActive = manualOption ? manualOption.active || manualOption.forced : false
  const chooseMode = (mode: 'standard' | 'exceptions' | 'unsure' | 'manual') => {
    if (mode === 'manual') {
      if (manualOption && !manualActive) manualOption.onManualChange(true)
      return
    }
    if (manualOption?.forced) return
    if (manualOption && manualOption.active) manualOption.onManualChange(false)
    if (mode === 'standard') { setShowExceptions(false); onChange(answer.kind === 'none' ? answer : { kind: 'none' }) }
    else if (mode === 'unsure') { setShowExceptions(false); onChange(answer.kind === 'unsure' ? answer : { kind: 'unsure' }) }
    else { setShowExceptions(true); if (answer.kind !== 'exceptions') onChange({ kind: 'missing' }) }
  }
  const coverageValue: 'standard' | 'exceptions' | 'unsure' | null = answer.kind === 'unsure' ? 'unsure' : answer.kind === 'none' ? 'standard' : hasExceptions ? 'exceptions' : showExceptions ? 'exceptions' : null
  const modeValue: 'standard' | 'exceptions' | 'unsure' | 'manual' | null = manualActive ? 'manual' : coverageValue
  return <fieldset className="coverage-checklist"><legend>{title}</legend>
    {manualOption?.forced && <p>Diese Phase benötigt eigene Beiträge wegen: {manualOption.forcedReasons.join('; ')}</p>}
    <div className="coverage-mode" role="radiogroup" aria-label={`${title} – Antwortart`}>
      <label><input id={id} type="radio" name={`${id}-mode`} disabled={manualOption?.forced} checked={modeValue === 'standard'} onChange={() => chooseMode('standard')} />Alle Standardregeln genügen (automatische Berechnung)</label>
      <label><input type="radio" name={`${id}-mode`} disabled={manualOption?.forced} checked={modeValue === 'exceptions'} onChange={() => chooseMode('exceptions')} />Es trifft etwas zu</label>
      <label><input type="radio" name={`${id}-mode`} disabled={manualOption?.forced} checked={modeValue === 'unsure'} onChange={() => chooseMode('unsure')} />Ich bin unsicher</label>
      {manualOption && <label><input id={manualOption.id} type="radio" name={`${id}-mode`} checked={modeValue === 'manual'} onChange={() => chooseMode('manual')} />Eigene KV/PV-Beiträge einsetzen – {manualOption.phaseLabel}</label>}
    </div>
    {showExceptions && <div className="coverage-exceptions" aria-label={`${title} – Ausnahmen`}>
      {(Object.entries(options) as [E, string][]).map(([key, label]) => <label key={key}><input id={`${id}-${key}`} type="checkbox" checked={hasExceptions && answer.selected.includes(key)} onChange={() => onChange(toggleCoverage(answer, key))} />{label}</label>)}
      {!hasExceptions && <p>Noch offen: Mindestens eine Ausnahme ankreuzen, oder die Antwort oben ändern.</p>}
    </div>}
    <p>{answer.kind === 'missing' ? 'Noch offen: Bitte ausdrücklich antworten.' : answer.kind === 'none' ? 'Keine dieser Sonderumstände angegeben.' : 'Eigene KV/PV-Gesamtbeträge für diese Phase erforderlich. Du kannst die Angaben hier korrigieren.'}</p>
    <details><summary>Warum fragen wir danach?</summary><p>Die Automatik unterstützt eine Person ohne diese Sonderumstände. Dies sind Grenzen des Rechenmodells; die App entscheidet nicht über Versicherungsberechtigung. Bei Unsicherheit sind eigene Beiträge nötig oder die Planung bleibt unvollständig.</p></details>
  </fieldset>
}

export function BridgeCoverageChecklist({ common, bridgeOnly, onChange, manualOption }: {
  common: CoverageAnswer<CommonInsuranceException>
  bridgeOnly: CoverageAnswer<BridgeInsuranceException>
  onChange: (answers: { common: CoverageAnswer<CommonInsuranceException>; bridgeOnly: CoverageAnswer<BridgeInsuranceException> }) => void
  manualOption?: CoverageManualOption
}) {
  const id = 'insurance-bridge-circumstances'
  const title = 'Besondere Umstände – Brücke'
  const hasExceptions = common.kind === 'exceptions' || bridgeOnly.kind === 'exceptions'
  const [showExceptions, setShowExceptions] = useState(hasExceptions)
  useEffect(() => { setShowExceptions(hasExceptions) }, [hasExceptions])
  const manualActive = manualOption ? manualOption.active || manualOption.forced : false
  const chooseMode = (mode: 'standard' | 'exceptions' | 'unsure' | 'manual') => {
    if (mode === 'manual') {
      if (manualOption && !manualActive) manualOption.onManualChange(true)
      return
    }
    if (manualOption?.forced) return
    if (manualOption && manualOption.active) manualOption.onManualChange(false)
    if (mode === 'standard') {
      setShowExceptions(false)
      if (common.kind !== 'none' || bridgeOnly.kind !== 'none') {
        onChange({
          common: common.kind === 'none' ? common : { kind: 'none' },
          bridgeOnly: bridgeOnly.kind === 'none' ? bridgeOnly : { kind: 'none' },
        })
      }
    } else if (mode === 'unsure') {
      setShowExceptions(false)
      if (common.kind !== 'unsure' || bridgeOnly.kind !== 'unsure') {
        onChange({
          common: common.kind === 'unsure' ? common : { kind: 'unsure' },
          bridgeOnly: bridgeOnly.kind === 'unsure' ? bridgeOnly : { kind: 'unsure' },
        })
      }
    } else {
      setShowExceptions(true)
      if (common.kind !== 'exceptions' || bridgeOnly.kind !== 'exceptions') {
        onChange({
          common: common.kind === 'exceptions' ? common : { kind: 'missing' },
          bridgeOnly: bridgeOnly.kind === 'exceptions' ? bridgeOnly : { kind: 'missing' },
        })
      }
    }
  }
  const bothStandard = common.kind === 'none' && bridgeOnly.kind === 'none'
  const bothUnsure = common.kind === 'unsure' && bridgeOnly.kind === 'unsure'
  const modeValue: 'standard' | 'exceptions' | 'unsure' | 'manual' | null = manualActive ? 'manual' : bothStandard ? 'standard' : bothUnsure ? 'unsure' : hasExceptions || showExceptions ? 'exceptions' : null
  const needsManual = common.kind === 'exceptions' || common.kind === 'unsure' || bridgeOnly.kind === 'exceptions' || bridgeOnly.kind === 'unsure'
  return <fieldset className="coverage-checklist"><legend>{title}</legend>
    {manualOption?.forced && <p>Diese Phase benötigt eigene Beiträge wegen: {manualOption.forcedReasons.join('; ')}</p>}
    <div className="coverage-mode" role="radiogroup" aria-label={`${title} – Antwortart`}>
      <label><input id={id} type="radio" name={`${id}-mode`} disabled={manualOption?.forced} checked={modeValue === 'standard'} onChange={() => chooseMode('standard')} />Alle Standardregeln genügen (automatische Berechnung)</label>
      <label><input type="radio" name={`${id}-mode`} disabled={manualOption?.forced} checked={modeValue === 'exceptions'} onChange={() => chooseMode('exceptions')} />Es trifft etwas zu</label>
      <label><input type="radio" name={`${id}-mode`} disabled={manualOption?.forced} checked={modeValue === 'unsure'} onChange={() => chooseMode('unsure')} />Ich bin unsicher</label>
      {manualOption && <label><input id={manualOption.id} type="radio" name={`${id}-mode`} checked={modeValue === 'manual'} onChange={() => chooseMode('manual')} />Eigene KV/PV-Beiträge einsetzen – {manualOption.phaseLabel}</label>}
    </div>
    {showExceptions && <div className="coverage-exceptions" aria-label={`${title} – Ausnahmen`}>
      {(Object.entries(commonExceptions) as [CommonInsuranceException, string][]).map(([key, label]) => <label key={key}><input id={`${id}-${key}`} type="checkbox" checked={common.kind === 'exceptions' && common.selected.includes(key)} onChange={() => onChange({ common: toggleCoverage(common, key), bridgeOnly })} />{label}</label>)}
      <p>Zusätzlich in der Brücke – nur hier relevant:</p>
      <div className="coverage-bridge-only" id="insurance-bridge-bridgeOnly" tabIndex={-1}>
        {(Object.entries(bridgeExceptions) as [BridgeInsuranceException, string][]).map(([key, label]) => <label key={key}><input id={`insurance-bridge-bridgeOnly-${key}`} type="checkbox" checked={bridgeOnly.kind === 'exceptions' && bridgeOnly.selected.includes(key)} onChange={() => onChange({ common, bridgeOnly: toggleCoverage(bridgeOnly, key) })} />{label} (nur Brücke)</label>)}
      </div>
      {!hasExceptions && <p>Noch offen: Mindestens eine Ausnahme ankreuzen, oder die Antwort oben ändern.</p>}
    </div>}
    <p>{bothStandard ? 'Keine dieser Sonderumstände angegeben.' : needsManual ? 'Eigene KV/PV-Gesamtbeträge für diese Phase erforderlich. Du kannst die Angaben hier korrigieren.' : 'Noch offen: Bitte ausdrücklich antworten.'}</p>
    <details><summary>Warum fragen wir danach?</summary><p>Die Automatik unterstützt eine Person ohne diese Sonderumstände. Dies sind Grenzen des Rechenmodells; die App entscheidet nicht über Versicherungsberechtigung. Bei Unsicherheit sind eigene Beiträge nötig oder die Planung bleibt unvollständig.</p></details>
  </fieldset>
}
