import { phaseManualReasons, phaseStreams, type RetirementInsurance } from '../../model/retirementInsurance'
import { OptionalNumber } from './RetirementInsuranceSection'
import type { ChangeEvent } from 'react'
import { CurrencyInput } from '../../../../shared/components/CurrencyInput'
import { NumberInput } from '../../../../shared/components/NumberInput'
import { PercentInput } from '../../../../shared/components/PercentInput'
import type { RentenlueckeInput, RetirementIncomeStream, RetirementIncomeStreamKind } from '../../model/types'

type CategoryGroupId = 'automatic' | 'rental' | 'cashflow'

type CategoryOption = {
  value: string
  kind: RetirementIncomeStreamKind
  support: RetirementIncomeStream['support']
  label: string
  defaultName: string
  helper: string
  group: CategoryGroupId
}

const CATEGORY_OPTIONS: readonly CategoryOption[] = [
  {
    value: 'gesetzliche-rente:standard',
    kind: 'gesetzliche-rente',
    support: 'standard',
    label: 'Gesetzliche Rente (Standard)',
    defaultName: 'Gesetzliche Rente',
    helper: 'Trage den Monatsbetrag aus deinem Rentenbescheid als Bruttobetrag in heutiger Kaufkraft ein.',
    group: 'automatic',
  },
  {
    value: 'gesetzliche-rente:unsupported',
    kind: 'gesetzliche-rente',
    support: 'unsupported',
    label: 'Gesetzliche Rente (Sonderfall)',
    defaultName: 'Gesetzliche Rente',
    helper: 'Sonderfall, zum Beispiel Auslandsrente, Einmalzahlung oder ungeklärter Bezug: Die betroffene Phase braucht manuelle KV/PV-Gesamtbeträge.',
    group: 'cashflow',
  },
  {
    value: 'betriebsrente:standard',
    kind: 'betriebsrente',
    support: 'standard',
    label: 'Betriebsrente (Standard)',
    defaultName: 'Betriebsrente',
    helper: 'Gewöhnliche inländische laufende Betriebsrente: KV/PV wird automatisch berechnet.',
    group: 'automatic',
  },
  {
    value: 'betriebsrente:unsupported',
    kind: 'betriebsrente',
    support: 'unsupported',
    label: 'Betriebsrente (Sonderfall)',
    defaultName: 'Betriebsrente',
    helper: 'Sonderfall, zum Beispiel Einmalzahlung, ausländischer Vertrag oder ungeklärte Art: Die betroffene Phase braucht manuelle KV/PV-Gesamtbeträge.',
    group: 'cashflow',
  },
  {
    value: 'rental-income',
    kind: 'rental-income',
    support: undefined,
    label: 'Mieteinnahmen',
    defaultName: 'Mieteinnahmen',
    helper: 'Nutze einen nachhaltig erwarteten Betrag; Steuern, Leerstand und Instandhaltung werden nicht automatisch berechnet.',
    group: 'rental',
  },
  {
    value: 'private-rente',
    kind: 'private-rente',
    support: undefined,
    label: 'Private Rente',
    defaultName: 'Private Rente',
    helper: 'Die Vertragsart wird hier nicht automatisch eingeordnet. Bitte eigene KV/PV-Gesamtbeträge für die betroffene Phase angeben. Das bedeutet nicht, dass jede private Rente beitragspflichtig ist.',
    group: 'cashflow',
  },
  {
    value: 'side-income',
    kind: 'side-income',
    support: undefined,
    label: 'Nebenjob',
    defaultName: 'Nebenjob',
    helper: 'Steuern und Sozialabgaben werden nicht automatisch berechnet. KV/PV benötigt eine manuelle Gesamtannahme für die Phase.',
    group: 'cashflow',
  },
  {
    value: 'bridge-income',
    kind: 'bridge-income',
    support: undefined,
    label: 'Brückeneinkommen',
    defaultName: 'Brückeneinkommen',
    helper: 'Lege Start- und Endalter fest. Steuern und Sozialabgaben werden nicht automatisch berechnet.',
    group: 'cashflow',
  },
  {
    value: 'other',
    kind: 'other',
    support: undefined,
    label: 'Sonstiges Einkommen',
    defaultName: 'Weiteres Einkommen',
    helper: 'Wähle netto oder brutto; Steuern werden nicht automatisch berechnet; KV/PV benötigt eine manuelle Gesamtannahme für die Phase.',
    group: 'cashflow',
  },
]

const CATEGORY_GROUPS: readonly { id: CategoryGroupId; label: string; explanation: string }[] = [
  {
    id: 'automatic',
    label: 'KV/PV automatisch berechnet',
    explanation: 'Gesetzliche Rente (Standard) und Betriebsrente (Standard): KV/PV wird automatisch berechnet.',
  },
  {
    id: 'rental',
    label: 'Mieteinnahmen',
    explanation: 'KVdR: gewöhnliche Miete beitragsfrei; freiwillig versichert: beitragspflichtiger Überschuss (eigenes Assessment-Feld).',
  },
  {
    id: 'cashflow',
    label: 'Manuelle KV/PV-Gesamtbeträge nötig',
    explanation: 'Gesetzliche Rente (Sonderfall), Betriebsrente (Sonderfall), Private Rente, Nebenjob, Brückeneinkommen, Sonstiges: kein automatischer KV/PV-Beitrag; nur über manuelle Phasen-Gesamtbeträge; Steuern via Abzugsfeld oder netto.',
  },
]

const GENERIC_DEFAULT_NAMES = new Set([
  'Weiteres Einkommen',
  ...CATEGORY_OPTIONS.map(({ defaultName }) => defaultName),
])

function categoryValueFor(stream: RetirementIncomeStream): string {
  const kind = stream.kind ?? 'other'
  if (kind === 'gesetzliche-rente' || kind === 'betriebsrente') {
    return stream.support === 'unsupported' ? `${kind}:unsupported` : `${kind}:standard`
  }
  return kind
}

function categoryHelperFor(stream: RetirementIncomeStream): string {
  return CATEGORY_OPTIONS.find(option => option.value === categoryValueFor(stream))?.helper ?? ''
}

type Props = {
  input?: RentenlueckeInput
  insurance?: RetirementInsurance
  streams: RetirementIncomeStream[]
  onUpdate: (id: string, patch: Partial<Omit<RetirementIncomeStream, 'id'>>) => void
  onAdd: () => void
  onRemove: (id: string) => void
}

export function RetirementIncomeStreamsSection({ streams, insurance, input, onUpdate, onAdd, onRemove }: Props) {
  return (
    <fieldset className="wide-fieldset retirement-income-section">
      <legend>Einkommen im Ruhestand</legend>
      <p className="retirement-income-note">
        Für die gesetzliche Rente kannst du den Monatsbetrag aus deinem Rentenbescheid eintragen. Die Modellrechnung
        behandelt ihn als Bruttobetrag in heutiger Kaufkraft.
      </p>
      <ul className="retirement-income-note retirement-income-groups" aria-label="Kategoriegruppen im Überblick">
        {CATEGORY_GROUPS.map(group => (
          <li key={group.id}><strong>{group.label}:</strong> {group.explanation}</li>
        ))}
      </ul>
      <div className="retirement-income-list">
        {streams.map((stream, index) => {
          const label = stream.name.trim() || `Einkommen ${index + 1}`
          const kind = stream.kind ?? 'other'
          const helper = categoryHelperFor(stream)
          const isPensionKind = kind === 'gesetzliche-rente' || kind === 'betriebsrente'
          const automaticPhases = insurance ? (['bridge', 'pension'] as const).filter(phase => {
            const relevant = phaseStreams(streams, insurance, phase, input?.retirementAge ?? 0, input?.planningAge ?? 120)
            return relevant.some(s => s.id === stream.id) && !phaseManualReasons(insurance, phase, relevant).length
          }) : []
          const endAgeError = stream.endAge !== null &&
            (!Number.isInteger(stream.endAge) || stream.endAge <= stream.startAge || stream.endAge > 120)
              ? 'Muss größer als das Startalter und höchstens 120 sein.'
              : undefined
          return (
            <div className="retirement-income-stream" key={stream.id}>
              <label className="field">
                <span className="field-label">Kategorie</span>
                <select
                  id={`retirement-income-kind-${stream.id}`}
                  aria-label={`Kategorie von ${label}`}
                  aria-describedby={`retirement-income-help-${stream.id}`}
                  value={categoryValueFor(stream)}
                  onChange={(event) => {
                    const option = CATEGORY_OPTIONS.find(candidate => candidate.value === event.target.value)
                    if (!option) return
                    const mayReplaceName = stream.name.trim() === '' || GENERIC_DEFAULT_NAMES.has(stream.name.trim())
                    onUpdate(stream.id, { kind: option.kind, support: option.support, ...(mayReplaceName ? { name: option.defaultName } : {}) })
                  }}
                >
                  {CATEGORY_GROUPS.map(group => (
                    <optgroup key={group.id} label={group.label}>
                      {CATEGORY_OPTIONS.filter(option => option.group === group.id).map(option => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              {isPensionKind && <p className="retirement-income-row-note">Standard: gewöhnlicher inländischer Bezug mit automatischer KV/PV-Berechnung. Sonderfall: zum Beispiel Ausland, Einmalzahlung oder ungeklärt — die Phase braucht manuelle KV/PV-Gesamtbeträge.</p>}
              <label className="field">
                <span className="field-label">Name</span>
                <input
                  type="text"
                  id={`retirement-income-name-${stream.id}`}
                  aria-label={`Name von ${label}`}
                  value={stream.name}
                  placeholder={`Einkommen ${index + 1}`}
                  onChange={(event) => onUpdate(stream.id, { name: event.target.value })}
                />
              </label>
              <CurrencyInput
                id={`retirement-income-amount-${stream.id}`}
                label="Monatsbetrag, heutige Kaufkraft"
                value={stream.amountMonthlyToday}
                onChange={(amountMonthlyToday) => onUpdate(stream.id, { amountMonthlyToday })}
              />
              <NumberInput
                id={`retirement-income-start-${stream.id}`}
                label={kind === 'gesetzliche-rente' ? 'Rentenbeginn (Alter)' : 'Startalter'}
                value={stream.startAge}
                min={0}
                max={120}
                onChange={(startAge) => onUpdate(stream.id, { startAge })}
              />
              <OptionalEndAgeInput stream={stream} error={endAgeError} onUpdate={onUpdate} />
              <label className="field">
                <span className="field-label">Betragsart</span>
                <select
                  id={`retirement-income-amountBasis-${stream.id}`}
                  aria-label={`Betragsart von ${label}`}
                  value={stream.amountBasis}
                  onChange={(event) => {
                    const amountBasis = event.target.value as RetirementIncomeStream['amountBasis']
                    onUpdate(stream.id, {
                      amountBasis,
                      deductionMode: amountBasis === 'gross' ? 'effectiveHaircut' : 'none',
                    })
                  }}
                >
                  <option value="net">Betrag ist bereits netto</option>
                  <option value="gross">Betrag ist brutto</option>
                </select>
              </label>
              {stream.amountBasis === 'gross' ? (
                <PercentInput
                  id={`retirement-income-deduction-${stream.id}`}
                  label="Sonstige Abzüge / Steuern ohne KV/PV"
                  value={stream.effectiveDeductionRate}
                  min={0}
                  max={100}
                  onChange={(effectiveDeductionRate) => onUpdate(stream.id, {
                    deductionMode: 'effectiveHaircut',
                    effectiveDeductionRate,
                  })}
                />
              ) : null}
              {kind === 'rental-income' && automaticPhases.some(phase => insurance?.[phase].status && insurance[phase].status !== 'kvdr') && <OptionalNumber id={`retirement-income-rentalAssessmentMonthlyToday-${stream.id}`} label={`Beitragsrelevanter Mietüberschuss vor Steuern – ${label} (€/Monat heute)`} value={stream.rentalAssessmentMonthlyToday} onChange={rentalAssessmentMonthlyToday => onUpdate(stream.id, { rentalAssessmentMonthlyToday })} />}
              {kind === 'rental-income' && <p className="retirement-income-row-note">Monatsbetrag = verfügbarer Mietzufluss vor KV/PV; sonstige Abzüge separat. Die Beitragsbasis ist der Überschuss vor Steuern nach beitragsrechtlichen Kosten, unabhängig vom verfügbaren Geld. Bei KVdR ist gewöhnliche Miete beitragsfrei und darf netto bleiben.</p>}
              <p className="retirement-income-row-note">Netto nur für beitragsfreie Einnahmen oder bei manueller Phase, jeweils vor der separat erfassten KV/PV. Beitragsrelevante automatische Einkommen benötigen Brutto; keine Rückrechnung.</p>
              <button
                className="secondary-button retirement-income-remove"
                type="button"
                aria-label={`${label} entfernen`}
                onClick={() => onRemove(stream.id)}
              >
                Entfernen
              </button>
              <p className="field-help retirement-income-row-note" id={`retirement-income-help-${stream.id}`} aria-live="polite">
                {helper}
              </p>
            </div>
          )
        })}
      </div>
      <button className="secondary-button retirement-income-add" type="button" onClick={onAdd}>
        + Einkommen hinzufügen
      </button>
    </fieldset>
  )
}

function OptionalEndAgeInput({
  stream,
  error,
  onUpdate,
}: {
  stream: RetirementIncomeStream
  error?: string
  onUpdate: Props['onUpdate']
}) {
  const id = `retirement-income-end-${stream.id}`
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onUpdate(stream.id, { endAge: event.target.value === '' ? null : event.target.valueAsNumber })
  }
  return (
    <label className="field" htmlFor={id}>
      <span className="field-label">Endalter (optional)</span>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={120}
        step={1}
        value={stream.endAge ?? ''}
        onChange={handleChange}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error ? <span className="field-error" id={`${id}-error`}>{error}</span> : null}
    </label>
  )
}
