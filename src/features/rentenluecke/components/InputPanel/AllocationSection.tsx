import { PercentInput } from '../../../../shared/components/PercentInput'
import {
  ASSET_CLASS_ASSUMPTIONS,
  type AssetAllocation,
  type AssetClassKey,
} from '../../model/stochasticReturns'

type AllocationSectionProps = {
  allocation: AssetAllocation
  allocationError: string | null
  onAllocationChange: (field: AssetClassKey, value: number) => void
}

export function AllocationSection({ allocation, allocationError, onAllocationChange }: AllocationSectionProps) {
  return (
    <fieldset>
      <legend>Aufteilung</legend>
      {ASSET_CLASS_ASSUMPTIONS.map((assumption) => (
        <PercentInput
          key={assumption.key}
          id={`allocation-${assumption.key}`}
          label={assumption.label}
          value={allocation[assumption.key]}
          min={0}
          max={100}
          error={allocationError && assumption.key === 'fixed' ? allocationError : undefined}
          onChange={(value) => onAllocationChange(assumption.key, value)}
        />
      ))}
    </fieldset>
  )
}
