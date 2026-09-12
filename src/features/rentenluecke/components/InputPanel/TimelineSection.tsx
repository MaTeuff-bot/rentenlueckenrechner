import { NumberInput } from '../../../../shared/components/NumberInput'
import { PersonalDataSection } from './BasicInputSections'
import { OptionalNumber } from './RetirementInsuranceSection'
import type { InputFieldName } from '../../model/inputSchema'
import type { RentenlueckeInput, RetirementIncomeStream } from '../../model/types'
export function TimelineSection({ input, errors, onChange, onStreamChange, onTransitionChange }: {
  input: RentenlueckeInput; errors: Partial<Record<InputFieldName, string>>
  onChange: (field: InputFieldName, value: number) => void
  onStreamChange: (id: string, patch: Partial<Omit<RetirementIncomeStream, 'id'>>) => void
  onTransitionChange: (value: number | undefined) => void
}) {
  const statutory = (input.retirementIncomeStreams ?? []).filter(s => s.kind === 'gesetzliche-rente')
  return <>
    <PersonalDataSection input={input} errors={errors} onChange={onChange} />
    <fieldset><legend>Gesetzlicher Rentenbeginn</legend>
      {statutory.map(stream => <NumberInput key={stream.id} id={`retirement-income-start-${stream.id}`} label={`Gesetzlicher Rentenbeginn – ${stream.name} (Alter)`} value={stream.startAge} min={0} max={120} onChange={startAge => onStreamChange(stream.id, { startAge })} />)}
      {statutory.length ? <p>Frühester gesetzlicher Rentenbeginn: {Number.isFinite(input.retirementInsurance?.pensionAge) ? input.retirementInsurance?.pensionAge : 'Bitte prüfen'}. Jede weitere Rente behält ihren eigenen Beginn.</p> : <>
        <p>Keine gesetzliche Rente erfasst.</p>
        <OptionalNumber id="insurance-transition" label="Übergang der Versicherungsplanung ohne gesetzliche Rente (Alter)" value={input.retirementInsurance?.pensionAge} max={120} step="1" onChange={onTransitionChange} />
        <p>Explizite Grenze zwischen Brücke und späterer Versicherungsphase; erzeugt kein Renteneinkommen.</p>
      </>}
      <p>Arbeitsende und Rentenbeginn sind unabhängig. Liegt das Arbeitsende früher, bitte die Versicherung für die Brücke separat ergänzen. KVdR wird nicht rückwirkend angenommen. Sparbeiträge enden mit dem Arbeitsende.</p>
    </fieldset>
  </>
}
