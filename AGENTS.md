# AGENTS.md

- Treat the yearly ledger rows as the source of truth for calculations. Summary cards, charts, and tables should derive from the same simulation result instead of recomputing separate business logic.
- Keep the model framework-free. Validation, normalization, deterministic simulation, required-capital search, stochastic returns, and mortality helpers belong outside React.
- Keep React, local storage, and Recharts as outer layers around the model. UI code may orchestrate state and rendering, but should not own financial formulas.
- The bundled mortality data is generated from Destatis GENESIS dataset `12621-0001` by `scripts/generateDestatisLifeTable.mjs` into `src/features/rentenluecke/mortality/destatisGermanyPeriodLifeTable2023_2025.ts`.
