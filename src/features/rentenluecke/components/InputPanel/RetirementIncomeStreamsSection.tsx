import type { ChangeEvent } from 'react'
import { CurrencyInput } from '../../../../shared/components/CurrencyInput'
import { NumberInput } from '../../../../shared/components/NumberInput'
import { PercentInput } from '../../../../shared/components/PercentInput'
import type { RetirementIncomeStream } from '../../model/types'

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
          const endAgeError = stream.endAge !== null &&
            (!Number.isInteger(stream.endAge) || stream.endAge <= stream.startAge || stream.endAge > 120)
              ? 'Muss größer als das Startalter und höchstens 120 sein.'
              : undefined
          return (
            <div className="retirement-income-stream" key={stream.id}>
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
