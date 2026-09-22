import { PersonalDataSection } from './BasicInputSections'
import { OptionalNumber } from './RetirementInsuranceSection'
import type { InputFieldName } from '../../model/inputSchema'
import type { LifeTableSex } from '../../mortality/mortality'
import type { RentenlueckeInput } from '../../model/types'
export function TimelineSection({ input, errors, onChange, onTransitionChange, onLifeTableSexChange }: {
  input: RentenlueckeInput; errors: Partial<Record<InputFieldName, string>>
  onChange: (field: InputFieldName, value: number) => void
  onTransitionChange: (value: number | undefined) => void
  onLifeTableSexChange?: (value: LifeTableSex) => void
}) {
  const statutory = (input.retirementIncomeStreams ?? []).filter(s => s.kind === 'gesetzliche-rente')
  return <>
    <PersonalDataSection input={input} errors={errors} onChange={onChange} statutoryPresent={statutory.length > 0} onLifeTableSexChange={onLifeTableSexChange} />
    {statutory.length ? (
      <p>Frühester gesetzlicher Rentenbeginn: {Number.isFinite(input.retirementInsurance?.pensionAge) ? input.retirementInsurance?.pensionAge : 'Bitte prüfen'}. Jede weitere Rente behält ihren eigenen Beginn.{statutory.length > 1 ? ` Einzelne Renten: ${statutory.map(stream => `${stream.name.trim() || 'Gesetzliche Rente'}: Alter ${Number.isFinite(stream.startAge) ? stream.startAge : 'offen'}`).join('; ')}.` : ''} Den Beginn änderst du auf der jeweiligen Rentenkarte im Einkommen-Bereich („Rentenbeginn (Alter)“).</p>
    ) : (
      <fieldset><legend>Versicherungsübergang</legend>
        <p>Keine gesetzliche Rente erfasst.</p>
        <OptionalNumber id="insurance-transition" label="Übergang der Versicherungsplanung ohne gesetzliche Rente (Alter)" value={input.retirementInsurance?.pensionAge} max={120} step="1" onChange={onTransitionChange} />
        <p>Explizite Grenze zwischen Brücke und späterer Versicherungsphase; erzeugt kein Renteneinkommen.</p>
        <p>Arbeitsende und Versicherungsübergang sind unabhängig. Liegt das Arbeitsende früher, bitte die Versicherung für die Brücke separat ergänzen. KVdR wird nicht rückwirkend angenommen. Sparbeiträge enden mit dem Arbeitsende.</p>
      </fieldset>
    )}
  </>
}
