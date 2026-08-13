import { NumberInput } from './NumberInput'

type CurrencyInputProps = {
  id: string
  label: string
  value: number
  error?: string
  onChange: (value: number) => void
}

export function CurrencyInput(props: CurrencyInputProps) {
  return <NumberInput {...props} min={0} step={100} suffix="EUR" />
}
