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

## Eingabeführung und Speicherung

Die frei erreichbaren Abschnitte sind **Zeitplan → Ausgaben → Einkommen → Vermögen & Sparen → Versicherung → Ergebnis**. „Offen“ kennzeichnet fehlende Antworten, „Prüfen“ ungültige Angaben und „Vollständig“ einen abgeschlossenen Abschnitt. Fehlerlinks öffnen gegebenenfalls Rechenannahmen oder weitere Details und fokussieren das betroffene Feld. Unvollständige Eingaben zeigen keine aktuelle Prognose.

Der Zeitplan enthält aktuelles Alter, Arbeitsende, alle gesetzlichen Rentenbeginne und den Planungshorizont. Der früheste gesetzliche Strom bestimmt die Versicherungsphasengrenze, auch bei einem Betrag von null oder einem Sonderfall. Spätere Renten bleiben eigenständig. Ohne gesetzliche Rente ist ein ausdrücklicher Übergang der Versicherungsplanung erforderlich; das Entfernen der letzten gesetzlichen Rente bestätigt keinen Übergang. Die Brücke gilt vor der Grenze, die spätere Phase ab der Grenze. Sparbeiträge enden am Arbeitsende.

Die Kinderliste enthält ausschließlich Geburtsjahre aller für die Pflegeversicherung anerkannten Kinder. Auch ältere Kinder begründen dauerhafte Elterneigenschaft; Zwillinge erhalten zwei Zeilen. „Keine anerkannten Kinder“ ist eine ausdrückliche Antwort. Eine unberührte Liste oder das Entfernen des letzten Kindes bleibt unbeantwortet. Das Jahresmodell zählt Kinder ab 1. Januar des 25. Geburtstagsjahres nicht mehr als unter 25; die Elterneigenschaft bleibt erhalten.

Eingaben einschließlich unvollständiger Entwürfe werden ausschließlich lokal unter `rentenlueckenrechner.scenario.v14` gespeichert. Für UX PR1 werden ausschließlich die app-eigenen Szenarioversionen v1–v13 entfernt, ohne Migration. Betroffene Nutzer erhalten einen dauerhaft schließbaren Hinweis. Fremde Einträge und gültige v14-Daten bleiben erhalten. Es gibt keine serverseitige Speicherung oder Synchronisierung. Nicht endliche Zahlen werden als Entwurfsmarker gespeichert und blockieren weiterhin die Berechnung.

## Kranken- und Pflegeversicherung im Modell

Die Versicherungsangaben sind erforderlich. Für jede aktive Phase werden Status und gewöhnliche Versicherungsumstände ausdrücklich beantwortet. KVdR wird vom Nutzer gewählt; die App prüft keine Berechtigung und überträgt KVdR niemals automatisch auf die Brücke. „Unbekannt“ verwendet die bestehende freiwillige GKV-Annahme. Zusatzbeitrag und Kinderangaben sind bei automatischen Phasen erforderlich.

Die vorhandene Beitragsrechnung berücksichtigt ihre jährlichen Mindest-/Höchstbemessungen, Betriebsrentenregeln, Kinderregeln und bestätigte DRV-Zuschüsse. Beitragsrelevante automatische Einkommen müssen brutto erfasst werden; gewöhnliche Miete kann bei KVdR netto bleiben. Sonstige Abzüge und verfügbare Zuflüsse bleiben getrennt von der Beitragsbemessung.

Nicht unterstützte Einkommen, Versicherungsstatus oder besondere Umstände erfordern ausdrückliche eigene KV/PV-Gesamtbeträge nach allen Zuschüssen für die gesamte betroffene Phase, auch bei null. Diese ersetzen alle automatischen Regeln dieser Phase. Ungeklärte Kinderanerkennung wird über diesen bestehenden Sonderfall-/manuellen Weg behandelt. Jede verbleibende automatische Phase benötigt weiterhin geklärte Familienangaben.

Freiwillige Phasen können die Kapitalbasis aus klassifizierten Anlagen schätzen oder eine ausdrückliche manuelle Kapitalertragsschätzung verwenden. Der automatische Schätzer unterstützt thesaurierende Aktienfonds und gewöhnliche Bankeinlagen unter den im Formular genannten Umfangs- und Verlustannahmen. Anschaffungskosten, Vorabpauschalen, simulierte Verluste und proportionale Verkäufe folgen der bestehenden Modellrechnung. Die Kapitalbasis ist kein zusätzliches auszahlbares Einkommen. Eine manuelle Kapitalbasis ersetzt nicht die gesamte Versicherungsphase.

Rechenannahmen enthalten Inflation, Quellen, Methoden und gesetzliche Satzüberschreibungen. Quellenbeschränkungen und aktive Überschreibungen bleiben sichtbar. Die Antwortkarten stehen vor der aufklappbaren KV/PV-Abrechnung; auch die Jahrestabelle ist aufklappbar. Sämtliche Werte stammen aus denselben Simulationsergebnissen und Jahreszeilen. Diagramme, Kaufkraftdarstellung und Rundung bleiben unverändert.

Investmentsteuern werden nicht automatisch berechnet oder finanziert; die Ergebnisse sind keine vollständig nach Steuern verfügbare Kaufkraft. Besondere persönliche Versicherungs-/Steuerfälle, PKV-Formeln oder eine individuelle Entnahmestrategie sind nicht Gegenstand der Automatik. Keine Live-ETF-Suche oder individuellen ETF-Backtests. Die Modellannahmen sind keine individuelle Steuer- oder Sozialversicherungsberatung.

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
