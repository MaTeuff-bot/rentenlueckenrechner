# Rentenlueckenrechner

Vite/React/TypeScript app for estimating the capital needed at retirement to cover a monthly pension gap. The app runs a transparent yearly ledger from the current age through the planning age, then shows summary results, a merged outcome chart with deterministic, stochastic, depletion, and survival views, the yearly table, and assumptions.

## Core Idea

The yearly table is the source of truth. Framework-free model functions build annual accumulation and retirement rows; React components, local storage, and Recharts sit around that model as UI layers.

## Commands

```sh
npm run dev
npm test -- --run
npm run lint
npm run build
```

## Code Map

- `src/features/rentenluecke/model/`: validation, normalization, required-capital search, deterministic and stochastic simulations
- `src/features/rentenluecke/charting/`: pure derived data for the merged outcome chart and risk cards
- `src/features/rentenluecke/mortality/`: bundled Destatis period life table and survival probability helpers
- `src/features/rentenluecke/hooks/useScenarioState.ts`: browser state, validation state, derived simulations, local storage
- `src/features/rentenluecke/components/`: input form, result cards, chart rendering, yearly table, assumptions
- `src/shared/components/`: reusable numeric input wrappers
- `scripts/generateDestatisLifeTable.mjs`: regenerates the Destatis mortality data source

## Interpreting The Outcome Chart

The merged outcome chart shows all capital values in today's purchasing power. The deterministic line follows the yearly ledger with the allocation-derived expected return, while P10, P50, and P90 summarize simulated return paths; the shaded band spans P10 to P90.

The depletion probability line is the share of simulated paths with capital at or below 0 EUR by each age. The optional survival probability line comes from the bundled Destatis period life table and is conditional on the current age. Risk cards highlight the first ages where survival falls to 20 %, 10 %, and 5 %, plus the planning horizon when it is a distinct age.

When logarithmic scaling is enabled, zero or negative capital is pinned to the bottom of the chart for display only. Very high P90 outliers may also be capped in the chart to keep P10, P50, and the plan value readable; tooltips and risk cards continue to use the underlying simulation values.

## Historical Bootstrap Returns

The return-source section can use historical annual bootstrap data instead of only synthetic assumptions. Historical asset sources sample usable calendar years with replacement: the same year may appear more than once in one simulated path.

When several historical sources are selected, they share the sampled calendar year, so equity, bond, cash, and inflation observations from that year stay synchronized. Synthetic sources are different: they draw their own return paths per asset class and do not reduce the historical overlap used for the remaining historical sources.

The bundled historical default uses JST Macrohistory R.6 derived real-return proxies for developed-market equities, bonds, and bills/cash, plus a Bundesbank/Destatis German CPI inflation proxy. JST-derived data is licensed CC BY-NC-SA 4.0 and is not cleared for commercial use.

Bootstrap results are proxies, not forecasts and not exact backtests. They do not represent the precise realized return of a specific ETF, fund, tax situation, currency conversion, or EUR investor account.

## Data And Deploy Notes

The mortality data is generated into `src/features/rentenluecke/mortality/destatisGermanyPeriodLifeTable2023_2025.ts` from Destatis GENESIS dataset `12621-0001` for period `2023/2025`.

The GitHub Pages workflow installs dependencies, lints, runs tests, builds with Vite, and uploads `dist`. Vite uses base path `/rentenlueckenrechner/`.
