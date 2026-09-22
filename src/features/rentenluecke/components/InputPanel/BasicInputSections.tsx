import { CurrencyInput } from '../../../../shared/components/CurrencyInput'
import { NumberInput } from '../../../../shared/components/NumberInput'
import { inputLabels, type InputFieldName } from '../../model/inputSchema'
import type { LifeTableSex } from '../../mortality/mortality'
import type { RentenlueckeInput } from '../../model/types'

type BasicSectionProps = {
  input: RentenlueckeInput
  errors: Partial<Record<InputFieldName, string>>
  onChange: (field: InputFieldName, value: number) => void
}

type PersonalDataSectionProps = BasicSectionProps & {
  statutoryPresent?: boolean
  onLifeTableSexChange?: (value: LifeTableSex) => void
}

export function PersonalDataSection({ input, errors, onChange, statutoryPresent = false, onLifeTableSexChange }: PersonalDataSectionProps) {
  return (
    <fieldset>
      <legend>Persönliche Daten</legend>
      <NumberInput
        id="currentAge"
        label={inputLabels.currentAge}
        value={input.currentAge}
        min={0}
        max={100}
        error={errors.currentAge}
        onChange={(value) => onChange('currentAge', value)}
      />
      <NumberInput
        id="retirementAge"
        label={inputLabels.retirementAge}
        value={input.retirementAge}
        min={0}
        max={100}
        error={errors.retirementAge}
        onChange={(value) => onChange('retirementAge', value)}
      />
      {statutoryPresent && <p>Arbeitsende und Rentenbeginn sind unabhängig. Liegt das Arbeitsende früher, bitte die Versicherung für die Brücke separat ergänzen. KVdR wird nicht rückwirkend angenommen. Sparbeiträge enden mit dem Arbeitsende.</p>}
      <NumberInput
        id="planningAge"
        label={inputLabels.planningAge}
        value={input.planningAge}
        min={0}
        max={120}
        error={errors.planningAge}
        onChange={(value) => onChange('planningAge', value)}
      />
      <CurrencyInput
        id="monthlyDesiredSpendingToday"
        label={inputLabels.monthlyDesiredSpendingToday}
        value={input.monthlyDesiredSpendingToday}
        error={errors.monthlyDesiredSpendingToday}
        onChange={(value) => onChange('monthlyDesiredSpendingToday', value)}
      />
      <label className="field">
        <span className="field-label">{inputLabels.lifeTableSex}</span>
        <select
          id="lifeTableSex"
          value={input.lifeTableSex ?? 'conservative'}
          onChange={(event) => onLifeTableSexChange?.(event.target.value as LifeTableSex)}
        >
          <option value="conservative">Keine Angabe</option>
          <option value="female">Weiblich</option>
          <option value="male">Männlich</option>
        </select>
      </label>
      <p>Keine Angabe nutzt die konservative Anzeige der Sterbetafel.</p>
    </fieldset>
  )
}

export function SavingsSection({ input, errors, onChange }: BasicSectionProps) {
  return (
    <fieldset>
      <legend>Sparrate</legend>
      <CurrencyInput
        id="monthlyContributionToday"
        label={inputLabels.monthlyContributionToday}
        value={input.monthlyContributionToday}
        error={errors.monthlyContributionToday}
        onChange={(value) => onChange('monthlyContributionToday', value)}
      />
    </fieldset>
  )
}
