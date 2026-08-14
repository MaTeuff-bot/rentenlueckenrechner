# Rentenlueckenrechner

Vite/React/TypeScript app for estimating the capital needed at retirement to cover a monthly pension gap. The app runs a transparent yearly ledger from the current age through the planning age, then shows summary results, deterministic and stochastic charts, the yearly table, and assumptions.

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
- `src/features/rentenluecke/mortality/`: bundled Destatis period life table and survival probability helpers
- `src/features/rentenluecke/hooks/useScenarioState.ts`: browser state, validation state, derived simulations, local storage
- `src/features/rentenluecke/components/`: input form, result cards, charts, yearly table, assumptions
- `src/shared/components/`: reusable numeric input wrappers
- `scripts/generateDestatisLifeTable.mjs`: regenerates the Destatis mortality data source

## Data And Deploy Notes

The mortality data is generated into `src/features/rentenluecke/mortality/destatisGermanyPeriodLifeTable2023_2025.ts` from Destatis GENESIS dataset `12621-0001` for period `2023/2025`.

The GitHub Pages workflow installs dependencies, lints, runs tests, builds with Vite, and uploads `dist`. Vite uses base path `/rentenlueckenrechner/`.
