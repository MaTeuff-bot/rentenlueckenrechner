# Architektur: Modulgrenzen

Der Jahresledger (`YearlyPeriodRow`-Zeilen aus `simulateScenario`) ist die Quelle aller
berechneten Ergebnisse. Summary-Karten, Diagramm und Jahrestabelle leiten sich aus
demselben Simulationsergebnis ab und berechnen keine eigene Geschäftslogik.

## Zonen

- `src/features/rentenluecke/model/` — Framework-freie Rechenengine: Validierung, Normalisierung, deterministische Jahressimulation (Ledger), Kapitalbedarfssuche, stochastische Renditen. Kein React, kein DOM, keine UI-Importe.
- `src/features/rentenluecke/hooks/` — React-Zustandsorchestrierung: Szenariozustand, Modellaufrufe, lokale Browserpersistenz. Keine Finanzformeln.
- `src/features/rentenluecke/components/` — React-Darstellung: Eingaben, Kennzahlen, Recharts-Diagramm, Jahrestabelle sowie UI-Formatierung (`format.ts`). Keine Finanzformeln. Die Eingaben sind in vier Tabs gruppiert (lokaler State, kein Router); die Vermögens-Ansicht trennt presentational „Was ich besitze“/„Wie ich anlegen will“.
- `src/features/rentenluecke/charting/` — Reine Ableitung von Diagramm-/Anzeigezeilen und Risiko-Chips aus Simulationsergebnissen (mit Mortalitäts-Overlay). Kein React.
- `src/features/rentenluecke/mortality/` — Destatis-Sterbetafel und Überlebenswahrscheinlichkeiten; erzeugt aus GENESIS-Datensatz `12621-0001` via `scripts/generateDestatisLifeTable.mjs`.
- `src/shared/` — Zonenübergreifend wiederverwendbare, modellfremde Bausteine (z. B. Eingabekomponenten, Rundung). Kein Ersatz für Engine-Logik.

## Modell-Unterbereiche

- `model/capitalIncome/` — Automatische/manuelle Kapitalertragsbasis-Schätzung für freiwillige Phasen samt Ledger-Anbindung.
- `model/historicalReturns/` — Historische Rendite-/Inflationsregister, Quellenoptionen, Bootstrap-Stichproben/-Simulation, erwartete Renditen.
- `model/returnData/` — Gebündelte statische Datensätze (JST-/Bundesbank-Produktionsreihen, ETF-Historien) für `historicalReturns/`.
- `model/contributions/` — Beitrags-/Bemessungsengine nach 2026er-Regeln (KV/PV-Obergrenzen, DRV-Zuschusslogik) für Versicherungsphasen.

## Grenzregeln

- `model/` darf nur aus `model/` selbst (plus externen Paketen wie `zod`) importieren — niemals aus `../components`, `../hooks`, `../charting`, `../mortality` oder sonst außerhalb. Erzwungen per `no-restricted-imports` in `eslint.config.js`.
- UI-Zonen (`components/`, `hooks/`, `charting/`) dürfen `model/` in beliebiger Tiefe direkt importieren (Verzeichnisebene, keine Barrel-Dateien).
- `charting/` darf `mortality/` für das Überlebens-Overlay importieren, `components/` darf `charting/` und `mortality/` nutzen; `model/` importiert `mortality/` nie.
- Währungs-/Zahlenformatierung für die Anzeige (`format.ts`) gehört zu `components/`, nicht in die Engine.

## Tests pro Zone

```sh
npm test -- --run src/features/rentenluecke/model      # Engine inkl. Invarianten/Referenzszenarien
npm test -- --run src/features/rentenluecke/charting   # Diagrammdatenableitung
npm test -- --run src/features/rentenluecke/components # React-Komponenten
npm test -- --run src/features/rentenluecke/hooks      # Szenariozustand/Persistenz
npm test -- --run src/features/rentenluecke/mortality  # Sterbetafel/Wahrscheinlichkeiten
npm test -- --run                                      # volle Suite (Merge-Gate)
npm run lint                                           # eslint: 0 Fehler ist Pflicht
npm run build                                          # tsc -b && vite build
```
