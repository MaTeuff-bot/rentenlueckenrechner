# Versicherungs-UX PR2: lokale Verifikation

Akzeptierter Umfang: getrennte Status-/Methodenwahl, explizite gemeinsame und Brücken-Sonderumstände, konservatives Kopieren, gemeinsame Angaben einmal, Phasenschätzungen zuletzt, Reset auf v15. Keine Beitrags-, Steuer-, Inflations- oder Kapitalberechnungsformeln wurden geändert. Die neue Anwendbarkeitsprüfung blendet leere Phasen aus.

## Reproduzieren

```sh
npm ci
npm test -- --run
npm run lint
./node_modules/.bin/tsc -b
npm run build
git diff --check
```

Für die reale Browserprüfung Playwright separat installieren oder eine vorhandene Installation über `PLAYWRIGHT_MODULE` angeben. Chromium mit der zur Playwright-Version passenden CLI installieren. Einen lokalen Vite-Server mit festem Port starten:

```sh
npm run dev -- --host 127.0.0.1 --port 5177 --strictPort
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
PR2_BASE_URL=http://127.0.0.1:5177/rentenlueckenrechner/ \
PR2_EVIDENCE_DIR=/absolute/path/to/evidence \
node scripts/verifyInsurancePr2Browser.mjs
```

Das Skript bearbeitet die frische Planung über echte Controls bei 1440 und 390 Pixeln. Es prüft KVdR, Brücke, unbekannten Status mit freiwilliger GKV, automatische Kapitalbasis, Zuschuss, manuelle Gesamtbeiträge, 0/leere Felder, Rückkehr zur Automatik, beide Kopierrichtungen, fehlende Brücken-Sonderantwort, Fokus/Disclosures, spätes nicht unterstütztes Einkommen, Planung ohne gesetzliche Rente, Reload und v14-Reset. Es speichert Screenshots und `browser-results.json` und schlägt bei horizontalem Überlauf oder Browserfehlern fehl. Nur der separate Reset-Test verwendet einen gespeicherten alten Entwurf.

## Implementierungskandidat und Ausführungsumgebung

Diese Phase vervollständigt den akzeptierten Implementierungskandidaten; sie ist keine unabhängige Abnahme oder Veröffentlichungsfreigabe. v15 bleibt bestehen. Frühere Ergebnisse unter `/workspace/task-evidence/t_76050e67/` dienen nur der Wiederaufnahme. Die aktuellen vollständigen Gate-Ausgaben werden unter `/workspace/task-evidence/t_73ef9707/` abgelegt; der abschließende `implementation-report.md` nennt die tatsächlichen Ergebnisse und Einschränkungen. Der gemeinsame Container begrenzt alle Prozesse/Threads zusammen auf 256. Ein erster voller Lauf scheiterte an `pthread_create` / `EPIPE`, bevor Assertions ausgewertet wurden. Ein erneuter Lauf verwendet bei Bedarf `NODE_OPTIONS=--v8-pool-size=1 UV_THREADPOOL_SIZE=1 RAYON_NUM_THREADS=1` und `--maxWorkers=1`; Test-Timeouts bleiben unverändert. Andere Worktrees und Prozesse werden nicht verändert.

`.github/workflows/pr.yml` prüft den exakten PR-Head. In dieser Aufgabe sind Commit, Push, PR-Erstellung und Deployment ausgeschlossen; deshalb gibt es keinen neuen CI-Head oder ausgelösten Hosted-Preview-Lauf. Der vorhandene Pages-Workflow ist Produktion und wurde nicht ausgelöst. Hermes führt nach Ende dieses Workers eigene Gate-Reruns durch und committet den Kandidaten. Nachgelagerte Owner übernehmen die frische unabhängige Prüfung, Veröffentlichung und exakte PR-Head-CI. Dieser Worker committet oder veröffentlicht nicht.

## Zuordnung der vierzehn Abnahmepunkte

Die Tests liegen in `src/features/rentenluecke/`; die tatsächlichen Run-Ergebnisse stehen im Aufgabenbericht, nicht als vorweggenommene Abnahme in dieser Tabelle.

| Punkt | Explizite Regressionen |
| --- | --- |
| 1 Status/Methode | `components/__tests__/RetirementInsurance.test.tsx`: Statuswahl, keine Brücken-KVdR, Unsupported öffnet Gesamtbeträge, freiwillige Alternative |
| 2 Phasen | `model/__tests__/insuranceCoverage.test.ts`: exakte halboffene Grenzen, früher/gleicher/später Arbeitsstopp, Horizont und ungültige Zeitpläne, versteckte Phasen ohne Pflichtantwort; `uxAdapters.test.ts`: mehrere/Null-Renten |
| 3 Gruppen | `RetirementInsurance.test.tsx`: Dokumentreihenfolge, gemeinsame Angaben genau einmal bzw. ausgeblendet, Zuschuss/Schätzer außerhalb der Statuskarten |
| 4 Ausschlüsse | `insuranceCoverage.test.ts` und `RetirementInsurance.test.tsx`: alle bestehenden Labels, Mehrfachauswahl, Exklusivität, fehlend statt abgeleitetem „Nichts davon“ |
| 5 Unsicherheit | `RetirementInsurance.test.tsx`: fehlende/eine/beide eigene KV/PV, ausdrückliche Null, Rückkehr zu explizit unterstützter Abdeckung |
| 6 Kopieren | `insuranceCoverage.test.ts`: beide Richtungen, unsure→none, none→unsure, Ausnahmen↔unsure, fehlende Quelle, Wiederholung, unabhängige spätere Bearbeitung, alle Brücken-Sonderzustände und unveränderte Finanzannahmen |
| 7 Einkommen | `retirementInsurance.test.ts`, `insuranceCoverage.test.ts` und Browser: spätere/außerhalb liegende Einkommen, ganze Phase einschließlich früher Zeilen, benannte Gründe und beide Fokusaktionen |
| 8 KV/PV | `insurancePr2Parity.test.ts`: getrennte Beträge, Inflation, einmaliger Abzug, kein zweiter Zuschuss; `CapitalEstimatorSetup.test.tsx`: manuelle Kapitalbasis bleibt automatische KV/PV |
| 9 Wechsel | `hooks/__tests__/insurancePersistence.test.ts`: v15-Reload, erhaltene inaktive Beträge/Schätzer/Zuschuss/Sätze, manuelles Flag entfernt, fehlende automatische Angaben wieder offen; bestehende Modell-/UI-Tests für ungültige versteckte Werte |
| 10 Zusatzbeitrag | `RetirementInsurance.test.tsx`: fehlend/Null, Prozentwert, untere/obere Bereichsverletzung, Kassenhilfe ohne Vorbelegung |
| 11 Zuschuss | `RetirementInsurance.test.tsx`: voluntary/unknown, keine Vorwahl, Ja/Nein-Mapping, Platzierung/Ausblendung; numerische Parität beider Optionen |
| 12 Zusammenfassungen | `RetirementInsurance.test.tsx`, `InsuranceNavigation.test.tsx` und Browser: Konfiguration ohne berechnete Eurokarten, eigene heutige Beträge, fehlend/Null, reale Fokusziele und geöffnete Details |
| 13 Reset | `insurancePersistence.test.ts`: vollständiger nichtstandardmäßiger v14-Entwurf verworfen, v15 erhalten, fremde/neue Keys erhalten; Browser prüft sichtbaren und dauerhaft schließbaren Hinweis |
| 14 Zeitplanfokus | `InsuranceNavigation.test.tsx`: andere Array-/Datumsreihenfolge, nichtgesetzliche Streams, erster Gleichstand, Nullbetrag, NaN/negativ/Bruchzahl/zu hoch, expliziter Übergang ohne Rente |

`insurancePr2Parity.test.ts` vergleicht neun explizite Legacy-Engine-Konfigurationen mit unabhängig beantworteten PR2-UI-Entwürfen: KVdR, freiwillig und unbekannt jeweils mit/ohne Zuschuss, frühe Brücke, automatische Kapitalbasis, eigene Gesamtbeträge und unsichere Abdeckung. Verglichen werden vollständige Jahreszeilen, benötigtes Kapital, fest vorgegebene Rendite-/Inflationspfade, Bootstrap-Referenz, gleiche Bootstrap-Seeds und -Pfade sowie stochastische Ausgaben. Die UI-Entwürfe enthalten absichtlich veraltete Umstände, Kinder- und Phasengrenzwerte; die kanonischen Adapter müssen diese korrekt ersetzen. Bloße Quelltextidentität gilt nicht als numerischer Test.
