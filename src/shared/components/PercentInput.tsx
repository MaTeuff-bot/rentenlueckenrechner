import { NumberInput } from './NumberInput'

type PercentInputProps = {
  id: string
  label: string
  value: number
  error?: string
  min?: number
  max?: number
  onChange: (value: number) => void
}

export function PercentInput({ value, onChange, ...props }: PercentInputProps) {
  return (
    <NumberInput
      {...props}
      value={Number.isNaN(value) ? Number.NaN : value * 100}
      step={0.1}
      suffix="%"
      onChange={(nextValue) => onChange(Number.isNaN(nextValue) ? Number.NaN : nextValue / 100)}
    />
  )
}
