# Persönlicher Ruhestandsplaner

Der Rentenlückenrechner ist eine Vite/React/TypeScript-App zur vereinfachten Ruhestandsplanung. Er schätzt die Netto-Rentenlücke und das benötigte Kapital zum Rentenbeginn und zeigt Vermögensverläufe, Kennzahlen und eine Jahrestabelle. Die Ergebnisse sind Modellrechnungen, keine Finanzberatung oder Prognosen.

## Eingaben und Berechnungsgrundlage

Die jährlichen Buchungszeilen (das Jahresledger) sind die maßgebliche Berechnungsgrundlage. Ansparphase und Ruhestand werden in Jahresschritten simuliert; Kennzahlen, Diagramm und Tabelle leiten sich aus den Simulationsergebnissen ab. Renditen wirken auf das Kapital am Jahresanfang, Einzahlungen und Entnahmen erfolgen am Jahresende.

Das Vermögen wird in frei benannten Portfolio-Bausteinen erfasst. Ihre Werte und ausgewählten Renditequellen sind die maßgeblichen Portfolio-Eingaben: Daraus entstehen Gesamtvermögen, Gewichtung und Aufteilung auf Aktien, Anleihen und Cash. Die Aufteilung wird nicht unabhängig bearbeitet. Es bleibt bei **einer globalen monatlichen Sparrate**.

Jeder Baustein hat ein Feld für jährliche TER/Kosten. Bei Proxy-/indexähnlichen und synthetischen Quellen wird der eingetragene Kostensatz von der Jahresrendite abgezogen. Bei den gebündelten ETF-Renditequellen gilt die TER bereits als im Kurs berücksichtigt; dort wird auch ein zusätzlich eingetragener Baustein-Kostensatz aktuell **nicht** abgezogen.

Ruhestandseinkommen lassen sich als benannte Zahlungsströme mit Beginn und optionalem Ende erfassen, etwa gesetzliche Rente oder Betriebsrente. Monatsbeträge werden in **heutiger Kaufkraft** und ausdrücklich als netto oder brutto eingegeben. Für Bruttoströme ist ein vereinfachter pauschaler prozentualer Abschlag möglich; Nettobeträge bleiben ohne diesen Abschlag. Einkommen werden im Modell mit der Inflation fortgeschrieben. Die gewünschten Ruhestandsausgaben sind **netto verfügbare Konsumausgaben** in heutiger Kaufkraft.

## Renditequellen und Daten

Historischer Bootstrap zieht verfügbare Kalenderjahre mit Zurücklegen: Ein Jahr kann mehrfach vorkommen. Historische Renditequellen und historische Inflation teilen sich das gezogene Jahr aus ihrem gemeinsamen Datenzeitraum. Synthetische Quellen erzeugen separate Pfade aus vorgegebenen Rendite- und Volatilitätsannahmen einer vereinfachten Normalverteilung; sie verkürzen den historischen Überschneidungszeitraum nicht. Für Inflation stehen eine historische Quelle und eine feste Annahme zur Verfügung.

Die historischen Standardquellen sind aus JST Macrohistory R.6 abgeleitete reale Rendite-Proxys für Aktien entwickelter Märkte, Anleihen und Geldmarkt/Cash sowie ein deutscher Inflationsproxy aus Bundesbank-/Destatis-Daten. **Die JST-Ableitungen unterliegen CC BY-NC-SA 4.0; ihre kommerzielle Nutzung ist nicht erlaubt.** Bootstrap-Ergebnisse sind Näherungen, keine Vorhersagen und keine exakten Backtests eines ETFs, Depots oder konkreten Kalenderzeitraums.

Für **IUSQ.DE** (iShares MSCI ACWI) und **EUNM.DE** (iShares MSCI EM) sind statische Referenzprofile mit Stammdaten und Quellenhinweisen sowie separate statische jährliche Renditereihen gebündelt. Die Renditen wurden aus adjustierten Yahoo-Finance-Marktkursen der EUR-Xetra-Notierungen abgeleitet. Sie sind **keine offiziellen Fonds-NAV- oder offiziellen Total-Return-Reihen** und garantieren keine vollständige Abbildung der Gesamtrendite. Marktpreis-, Währungs- und Adjustierungseffekte können von der Fondsberichterstattung abweichen. Die App ruft zur Laufzeit keine Marktdaten ab.

Datenherkunft, Transformationen, Namensnennung und Nutzungsbedingungen einschließlich Yahoo-/Drittanbieterrechten stehen in [DATA_LICENSES.md](DATA_LICENSES.md). Datenlizenzen gelten unabhängig von einer etwaigen Lizenz des Anwendungscodes.

## Ergebnisse lesen

Das Ergebnisdiagramm zeigt Kapital in heutiger Kaufkraft: den Planwert mit der erwarteten Jahresrendite der Quellenauswahl, den Median P50 und das Band P10–P90 der simulierten Pfade. Die Aufbrauchwahrscheinlichkeit bezeichnet den Anteil der Pfade mit Kapital von 0 € oder weniger zum jeweiligen Alter.

Optional lässt sich die Überlebenswahrscheinlichkeit aus der gebündelten Destatis-Periodensterbetafel 2023/2025 für Deutschland anzeigen, bedingt auf das aktuelle Alter. Risikokarten verbinden diesen statistischen Kontext mit dem Aufbrauchrisiko. Die Sterbetafel ist keine individuelle Lebenserwartungsprognose und verändert die Finanzsimulation nicht.

Eine logarithmische Darstellung setzt nichtpositive Kapitalwerte an den unteren Achsenrand; sehr hohe P90-Werte können zur Lesbarkeit begrenzt werden. Diese Darstellung ändert die zugrunde liegenden Werte in Tooltips und Risikokarten nicht.

## Aktuelle Grenzen und Speicherung

- Keine automatische persönliche Steuerberechnung und keine automatische Berechnung von Kranken- und Pflegeversicherungsbeiträgen (KV/PV); Brutto-Abschläge sind lediglich manuelle Pauschalen.
- Keine beliebige Live-ETF-Suche oder Datenimporte und kein individueller ETF-Backtest.
- Keine auswählbare personalisierte Entnahmestrategie; das Modell deckt die berechnete Netto-Rentenlücke aus dem Vermögen.

Gültige Szenario-Eingaben werden ausschließlich lokal im Browser in `localStorage` gespeichert. Es gibt keine serverseitige Speicherung oder geräteübergreifende Synchronisierung; beim Löschen der Browserdaten gehen die gespeicherten Eingaben verloren.

## Lokal entwickeln

```sh
npm ci
npm run dev
npm test -- --run
npm run lint
npm run build
npm run preview
```

`npm run build` prüft TypeScript und erzeugt den Produktionsbuild in `dist`; `npm run preview` zeigt diesen lokal an.

## Codeübersicht

- `src/features/rentenluecke/model/`: Framework-freie Validierung, Normalisierung, Jahresledger, Kapitalbedarfssuche, Einkommensströme, Portfolio- und Renditemodelle; gebündelte Renditedaten unter `returnData/`.
- `src/features/rentenluecke/charting/`: Aus Simulationsergebnissen abgeleitete Diagrammdaten und Risikokarten.
- `src/features/rentenluecke/mortality/`: Destatis-Sterbetafel und Überlebenswahrscheinlichkeiten; erzeugt aus GENESIS `12621-0001` über `scripts/generateDestatisLifeTable.mjs`.
- `src/features/rentenluecke/hooks/`: Szenariozustand, Modellaufrufe und lokale Browserpersistenz.
- `src/features/rentenluecke/components/`: React-Eingaben, Kennzahlen, Recharts-Diagramm und Jahrestabelle.
- `src/shared/components/`: Wiederverwendbare Eingabekomponenten.
