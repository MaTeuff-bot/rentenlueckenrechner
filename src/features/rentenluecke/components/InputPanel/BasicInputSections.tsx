import { CurrencyInput } from '../../../../shared/components/CurrencyInput'
import { NumberInput } from '../../../../shared/components/NumberInput'
import { inputLabels, type InputFieldName } from '../../model/inputSchema'
import type { RentenlueckeInput } from '../../model/types'

type BasicSectionProps = {
  input: RentenlueckeInput
  errors: Partial<Record<InputFieldName, string>>
  onChange: (field: InputFieldName, value: number) => void
}

export function PersonalDataSection({ input, errors, onChange }: BasicSectionProps) {
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
      <NumberInput
        id="planningAge"
        label={inputLabels.planningAge}
        value={input.planningAge}
        min={0}
        max={120}
        error={errors.planningAge}
        onChange={(value) => onChange('planningAge', value)}
      />
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

export function RetirementCashflowSection({ input, errors, onChange }: BasicSectionProps) {
  return (
    <fieldset>
      <legend>Ausgaben und Einkommen im Ruhestand</legend>
      <CurrencyInput
        id="monthlyDesiredSpendingToday"
        label={inputLabels.monthlyDesiredSpendingToday}
        value={input.monthlyDesiredSpendingToday}
        error={errors.monthlyDesiredSpendingToday}
        onChange={(value) => onChange('monthlyDesiredSpendingToday', value)}
      />
      <CurrencyInput
        id="monthlyRetirementIncomeToday"
        label={inputLabels.monthlyRetirementIncomeToday}
        value={input.monthlyRetirementIncomeToday}
        error={errors.monthlyRetirementIncomeToday}
        onChange={(value) => onChange('monthlyRetirementIncomeToday', value)}
      />
    </fieldset>
  )
}
