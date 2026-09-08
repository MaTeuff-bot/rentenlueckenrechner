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

- Keine automatische persönliche Steuerberechnung oder rechtliche KV/PV-Berechnung. Optional ist eine geführte manuelle GKV-/PV-Schätzung möglich (siehe unten).
- Keine beliebige Live-ETF-Suche oder Datenimporte und kein individueller ETF-Backtest.
- Keine auswählbare personalisierte Entnahmestrategie; das Modell deckt die berechnete Netto-Rentenlücke aus dem Vermögen.

Gültige Szenario-Eingaben werden ausschließlich lokal im Browser in `localStorage` gespeichert. Es gibt keine serverseitige Speicherung oder geräteübergreifende Synchronisierung; beim Löschen der Browserdaten gehen die gespeicherten Eingaben verloren.

## Manuelle GKV-/PV-Schätzung im Ruhestand

Die Schätzung ist zunächst **ausgeschaltet**. Versicherungsstatus (KVdR, freiwillige GKV, unbekannt), Zuordnungen und eigene Beitragssätze werden manuell angegeben; die App bestimmt weder Anspruch noch Beitragspflicht. „Prüfen“ wird ohne zusätzliche Versicherung gerechnet und mit einer hervorgehobenen Unvollständigkeitswarnung auch bei den Ergebnissen angezeigt.

| Einkommensart | KVdR | Freiwillige GKV | Unbekannt |
| --- | --- | --- | --- |
| Gesetzliche Rente | Einbeziehen | Einbeziehen | Prüfen |
| Betriebsrente | Einbeziehen | Einbeziehen | Prüfen |
| Private Rente | Prüfen | Einbeziehen | Prüfen |
| Mieteinnahmen | Nicht einbeziehen | Einbeziehen | Prüfen |
| Nebenjob | Prüfen | Einbeziehen | Prüfen |
| Brückeneinkommen | Prüfen | Prüfen | Prüfen |
| Sonstiges | Prüfen | Prüfen | Prüfen |

Diese Matrix enthält **Planungsvorschläge**, keine abschließenden Rechtsregeln. Beispielsweise kann neben der Rente erzieltes selbstständiges Arbeitseinkommen auch bei KVdR beitragspflichtig sein; die breite Kategorie Nebenjob bleibt deshalb zur Prüfung offen. Jeder Strom bietet „Warum?“ und eine sichtbare Überschreibung. Eigene Zuordnungen und Satzüberschreibungen bleiben bei Status-/Kategoriewechsel bestehen und müssen erneut geprüft werden.

Referenzjahr **2026**, offizielle Seiten live geprüft am **08.09.2026**:

- [BMG: Beiträge](https://www.bundesgesundheitsministerium.de/beitraege): allgemeiner KV-Satz 14,6 %, ermäßigter Satz 14 %, durchschnittlicher Zusatzbeitrag 2,9 %. Gesetzliche Renten und Versorgungsbezüge unterliegen grundsätzlich dem allgemeinen Satz. Die Rentenversicherung beteiligt sich am Rentenbeitrag einschließlich Zusatzbeitrag zur Hälfte. Freiwillige GKV berücksichtigt grundsätzlich auch weitere Einnahmen, etwa Mieten und Kapitalerträge.
- [DRV: Kranken- und Pflegeversicherung der Rentner](https://www.deutsche-rentenversicherung.de/DRV/DE/Rente/In-der-Rente/Kranken-und-Pflegeversicherung-der-Rentner/kranken-und-pflegeversicherung-der-rentner.html): bestätigt die hälftige KV-Beteiligung; bei freiwilliger GKV erfolgt sie als Zuschuss. Pflegebeiträge tragen Rentner selbst. KVdR hängt unter anderem von Vorversicherungszeiten ab; das wird hier nicht geprüft.
- [BMG: Finanzierung der Pflegeversicherung](https://www.bundesgesundheitsministerium.de/themen/pflege/online-ratgeber-pflege/die-pflegeversicherung/finanzierung.html): seit 2025 und weiterhin 2026 PV 3,6 %, mit Kinderlosenzuschlag von 0,6 Prozentpunkten 4,2 %. Es bestehen Ausnahmen und Kinderabschläge, die das Modell nicht automatisch bestimmt. Beide BMG-Seiten weisen den Stand 03.09.2026 aus.

Daraus abgeleitete, editierbare **Eigenbelastungsannahmen**: gesetzliche Rente 8,75 % KV einschließlich angenommener Rentenbeteiligung bzw. erhaltenem Zuschuss; Betriebsrente und übrige Einkommen 17,5 % ohne fremde Beteiligung; private Rente, Miete und manuelle Portfolio-Basis 16,9 % ohne Krankengeldanspruch angenommen. Bei Nebenjobs müssen Beschäftigungsart und Arbeitgeberanteile selbst geprüft und KV/PV am Strom angepasst werden. Der kassenindividuelle Zusatzbeitrag kann vom Referenzwert abweichen. PV startet ausdrücklich bei 3,6 % ohne Kinderlosenzuschlag oder Kinderabschläge; 4,2 % kann bewusst ausgewählt oder ein anderer eigener Satz eingetragen werden. Daraus wird kein persönlicher Kinderstatus abgeleitet. Alle Sätze bleiben während der Projektion konstant.

Bestehende Gesamtabzüge bleiben bei Migration von v10/v11 auf v12 unverändert. Selbst bei Aktivierung wird auf einen Bruttostrom erst zusätzliche KV/PV angewandt, wenn sein Gesamtabzug ausdrücklich ersetzt wurde. Die getrennten **sonstigen Abzüge** starten dann bei 0 % und müssen ohne KV/PV neu eingetragen werden. Der alte Gesamtabzug bleibt für den ausgeschalteten Modus gespeichert. Nettoangaben erhalten niemals zusätzliche Abzüge.

Die manuelle Portfolio-Beitragsbasis gilt ab Rentenbeginn in heutiger Kaufkraft und wächst wie die Einkommen mit dem Inflationspfad. Sie erzeugt **kein Einkommen** und wird nicht aus Depotwert, Rendite oder Entnahme berechnet. 0 € setzt keine entsprechenden Kosten an; ein positiver Betrag setzt unabhängig vom angegebenen Status bewusst Kosten an. Diese reduzieren den verfügbaren Cashflow genau einmal, auch unter null. Beispiel: 1.000 € Monatsbasis verursacht bei 16,9 % KV + 3,6 % PV jährlich 2.460 € Kosten; ohne Einkommen erhöht sich der jährliche Kapitalbedarf um diese 2.460 €.

Das Jahresledger trennt bisherige Gesamtabzüge, sonstige Abzüge, KV, PV, Portfolio-Basis und verfügbaren Netto-Cashflow. Sein Einkommensbetrag vor Abzügen enthält bei gemischten Eingaben Brutto- **und** bereits verfügbare Nettobeträge, keine hochgerechneten Bruttowerte. Zusammenfassungen und Entnahmelücken stammen aus dem Ledger. Deterministische Rechnung, Kapitalbedarfssuche und Bootstrap verwenden denselben Cashflow; Versicherungseinstellungen verändern nicht die gezogenen Marktpfade.

Nicht enthalten: Beitragsbemessungsgrenzen, Mindestbemessung/-beiträge, Freibeträge (auch für Betriebsrenten), PKV-Formeln, Familien-/Partnerregeln, grenzüberschreitende Fälle, Steuern, Anschaffungskosten, Gewinne oder Ausschüttungsverfolgung. Portfolio-Kosten dürfen nicht nochmals angesetzt werden, wenn sie bereits in einer Nettoangabe oder Pauschale berücksichtigt wurden. Dies ist eine vereinfachte Schätzung, keine Steuer- oder Sozialversicherungsberatung.

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
