import { CurrencyInput } from '../../../shared/components/CurrencyInput'
import { NumberInput } from '../../../shared/components/NumberInput'
import { PercentInput } from '../../../shared/components/PercentInput'
import { inputLabels, type InputFieldName } from '../model/inputSchema'
import type { RentenlueckeInput } from '../model/types'

type InputPanelProps = {
  input: RentenlueckeInput
  errors: Partial<Record<InputFieldName, string>>
  onChange: (field: InputFieldName, value: number) => void
  onReset: () => void
}

export function InputPanel({ input, errors, onChange, onReset }: InputPanelProps) {
  return (
    <section className="panel input-panel" aria-labelledby="inputs-title">
      <div className="panel-heading">
        <div>
          <h2 id="inputs-title">Eingaben</h2>
          <p>Deine Eingaben werden nur lokal in diesem Browser gespeichert.</p>
        </div>
        <button className="secondary-button" type="button" onClick={onReset}>
          Eingaben zurücksetzen
        </button>
      </div>

      <div className="input-grid">
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

        <fieldset>
          <legend>Vermögen und Sparrate</legend>
          <CurrencyInput
            id="currentCapital"
            label={inputLabels.currentCapital}
            value={input.currentCapital}
            error={errors.currentCapital}
            onChange={(value) => onChange('currentCapital', value)}
          />
          <CurrencyInput
            id="monthlyContributionToday"
            label={inputLabels.monthlyContributionToday}
            value={input.monthlyContributionToday}
            error={errors.monthlyContributionToday}
            onChange={(value) => onChange('monthlyContributionToday', value)}
          />
        </fieldset>

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

        <fieldset>
          <legend>Annahmen</legend>
          <PercentInput
            id="annualInflationRate"
            label={inputLabels.annualInflationRate}
            value={input.annualInflationRate}
            min={-5}
            max={20}
            error={errors.annualInflationRate}
            onChange={(value) => onChange('annualInflationRate', value)}
          />
          <PercentInput
            id="annualReturnBeforeRetirement"
            label={inputLabels.annualReturnBeforeRetirement}
            value={input.annualReturnBeforeRetirement}
            min={-50}
            max={50}
            error={errors.annualReturnBeforeRetirement}
            onChange={(value) => onChange('annualReturnBeforeRetirement', value)}
          />
          <PercentInput
            id="annualReturnInRetirement"
            label={inputLabels.annualReturnInRetirement}
            value={input.annualReturnInRetirement}
            min={-50}
            max={50}
            error={errors.annualReturnInRetirement}
            onChange={(value) => onChange('annualReturnInRetirement', value)}
          />
        </fieldset>
      </div>
    </section>
  )
}
