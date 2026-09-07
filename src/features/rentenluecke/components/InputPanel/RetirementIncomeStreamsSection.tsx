import type { ChangeEvent } from 'react'
import { CurrencyInput } from '../../../../shared/components/CurrencyInput'
import { NumberInput } from '../../../../shared/components/NumberInput'
import { PercentInput } from '../../../../shared/components/PercentInput'
import type { RetirementIncomeStream, RetirementIncomeStreamKind } from '../../model/types'

const CATEGORY_DETAILS: Record<RetirementIncomeStreamKind, { label: string; defaultName: string; helper: string }> = {
  'gesetzliche-rente': {
    label: 'Gesetzliche Rente',
    defaultName: 'Gesetzliche Rente',
    helper: 'Trage den Monatsbetrag aus deinem Rentenbescheid als Bruttobetrag in heutiger Kaufkraft ein.',
  },
  betriebsrente: {
    label: 'Betriebsrente',
    defaultName: 'Betriebsrente',
    helper: 'Prüfe, ob deine Angabe brutto oder bereits netto ist, und bilde Abzüge bei Bedarf nur pauschal ab.',
  },
  'private-rente': {
    label: 'Private Rente',
    defaultName: 'Private Rente',
    helper: 'Prüfe, ob deine Angabe brutto oder bereits netto ist, und bilde Abzüge bei Bedarf nur pauschal ab.',
  },
  'rental-income': {
    label: 'Mieteinnahmen',
    defaultName: 'Mieteinnahmen',
    helper: 'Nutze einen nachhaltig erwarteten Betrag; Steuern, Leerstand und Instandhaltung werden nicht automatisch berechnet.',
  },
  'side-income': {
    label: 'Nebenjob',
    defaultName: 'Nebenjob',
    helper: 'Steuern und Sozialabgaben werden nicht automatisch berechnet. Nutze dafür bei Bruttoangaben den pauschalen Abschlag.',
  },
  'bridge-income': {
    label: 'Brückeneinkommen',
    defaultName: 'Brückeneinkommen',
    helper: 'Lege Start- und Endalter fest. Steuern und Sozialabgaben werden nicht automatisch berechnet.',
  },
  other: {
    label: 'Sonstiges Einkommen',
    defaultName: 'Weiteres Einkommen',
    helper: 'Wähle netto oder brutto; Steuern sowie Kranken- und Pflegeversicherung werden nicht automatisch berechnet.',
  },
}

const GENERIC_DEFAULT_NAMES = new Set([
  'Weiteres Einkommen',
  ...Object.values(CATEGORY_DETAILS).map(({ defaultName }) => defaultName),
])

type Props = {
  streams: RetirementIncomeStream[]
  onUpdate: (id: string, patch: Partial<Omit<RetirementIncomeStream, 'id'>>) => void
  onAdd: () => void
  onRemove: (id: string) => void
}

export function RetirementIncomeStreamsSection({ streams, onUpdate, onAdd, onRemove }: Props) {
  return (
    <fieldset className="wide-fieldset retirement-income-section">
      <legend>Einkommen im Ruhestand</legend>
      <p className="retirement-income-note">
        Für die gesetzliche Rente kannst du den Monatsbetrag aus deinem Rentenbescheid eintragen. Die Modellrechnung
        behandelt ihn als Bruttobetrag in heutiger Kaufkraft.
      </p>
      <div className="retirement-income-list">
        {streams.map((stream, index) => {
          const label = stream.name.trim() || `Einkommen ${index + 1}`
          const kind = stream.kind ?? 'other'
          const category = CATEGORY_DETAILS[kind]
          const endAgeError = stream.endAge !== null &&
            (!Number.isInteger(stream.endAge) || stream.endAge <= stream.startAge || stream.endAge > 120)
              ? 'Muss größer als das Startalter und höchstens 120 sein.'
              : undefined
          return (
            <div className="retirement-income-stream" key={stream.id}>
              <label className="field">
                <span className="field-label">Kategorie</span>
                <select
                  aria-label={`Kategorie von ${label}`}
                  aria-describedby={`retirement-income-help-${stream.id}`}
                  value={kind}
                  onChange={(event) => {
                    const nextKind = event.target.value as RetirementIncomeStreamKind
                    const nextName = CATEGORY_DETAILS[nextKind].defaultName
                    const mayReplaceName = stream.name.trim() === '' || GENERIC_DEFAULT_NAMES.has(stream.name.trim())
                    onUpdate(stream.id, { kind: nextKind, ...(mayReplaceName ? { name: nextName } : {}) })
                  }}
                >
                  {Object.entries(CATEGORY_DETAILS).map(([value, details]) => (
                    <option key={value} value={value}>{details.label}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Name</span>
                <input
                  type="text"
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
                label="Startalter"
                value={stream.startAge}
                min={0}
                max={120}
                onChange={(startAge) => onUpdate(stream.id, { startAge })}
              />
              <OptionalEndAgeInput stream={stream} error={endAgeError} onUpdate={onUpdate} />
              <label className="field">
                <span className="field-label">Betragsart</span>
                <select
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
                  label="Vereinfachter Abschlag für Steuern / Kranken- und Pflegeversicherung"
                  value={stream.effectiveDeductionRate}
                  min={0}
                  max={100}
                  onChange={(effectiveDeductionRate) => onUpdate(stream.id, {
                    deductionMode: 'effectiveHaircut',
                    effectiveDeductionRate,
                  })}
                />
              ) : null}
              <button
                className="secondary-button retirement-income-remove"
                type="button"
                aria-label={`${label} entfernen`}
                onClick={() => onRemove(stream.id)}
              >
                Entfernen
              </button>
              <p className="field-help retirement-income-row-note" id={`retirement-income-help-${stream.id}`} aria-live="polite">
                {category.helper}
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
