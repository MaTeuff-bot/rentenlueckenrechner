# Merged outcome chart implementation plan

## Goal

Replace the separate deterministic/mortality and stochastic capital charts with one outcome panel that explains capital uncertainty, survival context, and depletion risk together.

## Locked product decisions

- Use one merged `ScenarioOutcomePanel` between `SummaryCards` and `YearlyTable`.
- The chart's main message is capital uncertainty over age; mortality and depletion risk are contextual interpretation aids.
- Chart capital values are always shown in heutiger Kaufkraft. Nominal capital stays in the yearly table and is not plotted.
- Show stochastic outcomes as a shaded P10-P90 band plus a prominent P50 line.
- Show deterministic capital as a subtle dashed reference line.
- Show survival probability on a right-hand Y-axis using the existing life-table selector (`conservative`, `female`, `male`).
- Do not plot depletion probability as a default line.
- Show depletion probability in the tooltip and in compact survival-threshold risk chips above the chart.

## Risk chips

Risk chips use survival-first labels and derive from the same selected life-table option as the visible survival curve:

- `Wenn noch ≤20 % leben`
- `Wenn noch ≤10 % leben`
- `Wenn noch ≤5 % leben`
- `Bis Planungshorizont`

For each threshold, use the first yearly chart row where `survivalProbabilityEnd <= threshold`. Do not interpolate between ages. Omit a threshold chip if the threshold is not reached in the available chart rows. Always include planning horizon unless a threshold chip already uses the planning-horizon age.

Each chip shows the selected age and the depletion probability by that age.

## Implementation shape

Create:

- `src/features/rentenluecke/components/ScenarioOutcomePanel.tsx`
- `src/features/rentenluecke/components/ScenarioOutcomeChart.tsx`

Stop using and remove if unused:

- `CapitalChart.tsx`
- `StochasticCapitalChart.tsx`
- `StochasticSimulationPanel.tsx`

The panel owns the life-table sex state and prepares joined chart rows from deterministic rows, stochastic percentile rows, and mortality survival probabilities. The chart renders a Recharts `ComposedChart` with an `Area` for the P10-P90 band and `Line`s for P50, deterministic, and optional survival probability.

## Acceptance criteria

- One outcome chart panel replaces the two previous chart panels.
- Merged chart shows P10-P90 shaded band, P50 line, deterministic dashed line, and optional survival line.
- Depletion probability appears in tooltip and survival-threshold risk chips.
- Chart copy labels all capital values as heutige Kaufkraft.
- Tests, lint, and production build pass.
