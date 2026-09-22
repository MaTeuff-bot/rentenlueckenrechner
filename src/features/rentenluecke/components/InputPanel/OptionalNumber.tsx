import { useId } from 'react'

export function OptionalNumber({ label, value, onChange, max, min = 0, step = 'any', id: explicitId }: {
  id?: string; label: string; value?: number; onChange: (value: number | undefined) => void; max?: number; min?: number; step?: string
}) {
  const generatedId = useId()
  const id = explicitId ?? generatedId
  const invalid = value !== undefined && (!Number.isFinite(value) || value < min || (max !== undefined && value > max) || (step === '1' && !Number.isInteger(value)))
  return <label className="field" htmlFor={id}><span className="field-label" id={`${id}-label`}>{label}</span><input aria-labelledby={`${id}-label`} id={id} type="number" inputMode={step === '1' ? 'numeric' : 'decimal'} min={min} max={max} step={step} value={Number.isNaN(value) ? '' : value ?? ''} aria-invalid={invalid} aria-describedby={invalid ? `${id}-error` : undefined} onChange={e => onChange(e.target.value === '' ? undefined : e.target.valueAsNumber)} />{invalid && <span className="field-error" id={`${id}-error`}>Bitte {step === '1' ? 'eine ganze Zahl' : 'einen Wert'} ab {min}{max !== undefined ? ` bis ${max}` : ''} eingeben.</span>}</label>
}
