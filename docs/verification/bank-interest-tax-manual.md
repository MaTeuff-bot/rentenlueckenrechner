# Bank-interest tax — manual post-merge checklist (no browser pass claimed)

Status: pending. Browser testing was explicitly waived for this PR; nothing below
was executed in a browser. The maintained Playwright PR covers browser execution.
Engine behavior underneath is covered by
`src/features/rentenluecke/model/tax/bankInterestTax.test.ts` and
`src/features/rentenluecke/components/__tests__/CapitalTaxLabels.test.tsx`.

## 0. Start / reset (read first — saved data warning)

1. `Eingaben` panel heading → `Eingaben zurücksetzen` restores factory defaults
   **and overwrites** localStorage `rentenlueckenrechner.scenario.v15` in this
   browser. Current inputs are lost — note them down first if needed.
2. Fresh defaults are NOT result-ready: three buckets (Aktien/Anleihen/Cash,
   70/20/10), one `Gesetzliche Rente` stream (Standard, brutto), empty insurance
   phases. Still missing after reset: estimator fund cost + both confirmation
   checkboxes, per-bucket holding classification, per-phase insurance status /
   circumstances / KV-PV / DRV-Zuschuss, coverage answers
   (`Besondere Umstände`), children (`PV-Elterneigenschaft`), Zusatzbeitrag.
3. Until every open issue is answered, `Ergebnis` shows the invalid panel
   (`Deine Prognose ist noch offen. …` + `Zu den offenen Angaben`) instead of
   results. Work through the linked Angaben in the tabs `Persönlicher Plan`
   (Zeitplan/Ausgaben/Einkommen), `Vermögen`, `Versicherung`, `Annahmen`
   (Rechenannahmen) until `Ergebnis` renders.

## 1. Baseline: fund-only smoke (reproducible, no bank)

1. Tab `Vermögen`: delete the Anleihen- and Cash-buckets via their trash buttons
   (`{Name} entfernen`) so exactly one bucket remains. Set its
   `Tatsächliche Anlageart` (`portfolio-holding-{id}`) to
   `Thesaurierender Aktienfonds / Aktien-ETF` and keep a fund
   `Renditequelle/Proxy` (`portfolio-source-{id}`); the single value carries the
   full amount.
2. `Anschaffungskosten und Ertragsschätzung`: enter
   `Anschaffungskosten des gesamten Fondspools (€)`
   (`estimator-fundAcquisitionCost`) explicitly (0 allowed); tick
   `Anlageumfang bestätigt…` (`estimator-scopeConfirmed`) and
   `Verlustumfang bestätigt…` (`estimator-lossScopeConfirmed`).
3. Tab `Versicherung`: set BOTH `Kapitalbasis – Brücke`
   (`insurance-bridge-capitalMode`) and `Kapitalbasis – Rentenphase`
   (`insurance-pension-capitalMode`) to
   `Automatisch aus dem Portfolio schätzen`; answer per-phase
   `Versicherungsstatus` (`insurance-{phase}-status`), `Besondere Umstände`
   coverage, own monthly KV/PV where required,
   `Rentenversicherungszuschuss einplanen?` (`insurance-pension-drvSubsidy`) for
   the pension phase, Zusatzbeitrag, children; Einkommen card: amount and
   `Rentenbeginn (Alter)` of `Gesetzliche Rente`.
4. Expect, conditional on taxed rows existing: in `Dein Kapitalbedarf`, card
   `Kapitalertragsteuer (Fondserträge)` with small text
   `… von … Ruhestandsjahren mit Fondsertragsteuer` (`… Ansparjahren mit
   Fondsertragsteuer` if accumulation years are taxed); in `Jahrestabelle` →
   `Details anzeigen`, taxed `Steueranlass` reads `Fondserträge`. Untaxed rows
   always read `—`, never a cause. `Steuerpflichtige Fondserträge / Zinsen` is
   pre-loss/pre-allowance assessable income and may exceed the final base — do
   not expect it to equal any interest or tax amount. If NO row is taxed at all,
   the title instead shows the full untaxed scope
   `(Fondserträge, Bankzinsen)`. Never `Zinsen`/`Zinssteuer` in this fixture.

## 2. Bank checks (conditional — no guaranteed fixture)

Limitation (source-proven, not a guess): no positive-only cash proxy exists.
The `Renditequelle/Proxy` cash options are
`Cash — Historisch: Bills, entwickelte Märkte` (real bill returns in source
range ≈ −7,8 %…+5,5 %, so sampled bootstrap years can carry negative gross
bank interest) and `Cash — Synthetisch: Cash (2 % Erwartung, 1 % Volatilität)`
(Normal draws can sample negative). No executable successful bank fixture can
therefore be guaranteed from source; the steps below are conditional, and the
§3 stop outcome is expected behavior, not a fixture failure.

1. From §1: remove the fund bucket(s); `+ Anlage hinzufügen` (`portfolio-add`);
   set `Tatsächliche Anlageart` to `Gewöhnliche Bankeinlage` with a value and a
   cash-category `Renditequelle/Proxy` (category chip must read
   `Kategorie: Cash` — a fund/price return raises the
   `Bankeinlagen benötigen eine Brutto-Zinsquelle…` issue on
   `portfolio-source-{id}`). Fund cost stays 0 (no funds); both confirmation
   checkboxes stay ticked. Mixed variant: keep one fund bucket plus one bank
   bucket instead of a pure swap.
2. Expect ONLY if the calculation succeeds: bank-only card
   `Kapitalertragsteuer (Bankzinsen)` with `… mit Zinssteuer`; taxed
   `Steueranlass` reads `Zinsen`. Mixed: each taxed year shows only its own
   causes — `Fondserträge`, `Zinsen`, or `Fondserträge + Zinsen`; different
   years may differ, so never expect one label on every row. Card
   title/nouns aggregate across taxed rows
   (`(Fondserträge, Bankzinsen)` + `Fondsertragsteuer (einschließlich
   Bankzinsen)` once any year mixes both).

## 3. Unsupported-path stop / report instruction

If `Ergebnis` shows `Berechnung unvollständig: … Negativer
Brutto-Bankzinspfad nicht abgedeckt … Automatische Kapitalbasis prüfen oder
ausdrücklich manuelle Kapitalertragsschätzung wählen.` (a sampled bootstrap
year drew negative gross bank interest, which `simulateEstimatorYear`
rejects): STOP. Record fixture + message (screenshot/note) and report it — do
not clamp, edit, or bypass draws. Then either set the affected phase(s) to
`Manuelle Kapitalertragsschätzung` (§4) or replace the bank return source and
re-run. Note the whole `Ergebnis` (plan table AND P10/P50/P90) blanks together:
both are computed in one bootstrap run, so one rejected bank draw fails the
entire calculation, not just a distribution tail.

## 4. Manual mode (BOTH phases required for scalar wording)

1. Set BOTH `insurance-bridge-capitalMode` AND `insurance-pension-capitalMode`
   to `Manuelle Kapitalertragsschätzung` and enter both
   `Beitragsrelevante Kapitalerträge – … (€/Monat heute)` values
   (`insurance-{phase}-capitalMonthlyToday`, 0 allowed). One phase alone is not
   enough: the other phase keeps detailed (`capitalAssessment`) rows, so
   cause-aware labels persist.
2. Expect only when no detailed rows remain: title
   `Kapitalertragsteuer Entnahme + Umschichtung` (scalar wording, no
   parentheses) plus the pauschal disclosure under
   `Hinweise zur Renten- und Kapitalertragsteuer`
   (`Entnahmen ohne Depotaufschlüsselung … Bankzinsen sind darin nur pauschal
   enthalten …`); bank interest is never separately identified here.

## 5. Plan vs distribution (do not hand-compare)

- `Jahrestabelle` / `Dein Kapitalbedarf` plan numbers are the bootstrap
  REFERENCE scenario: per-bucket expected returns averaged over the valid
  historical years plus one sampled inflation path — never a hand-computable
  fixed-return number.
- `P10/P50/P90` and depletion probability are the 1 000-draw historical
  bootstrap distribution. Never expect them to equal the plan numbers, each
  other across fixtures, or any hand-computed amount.
- Engine reference (vitest only, never browser output): 100 000 € bank at 2 %
  gross → 2 000 € interest, 1 000 € allowance, 1 000 € base, 263,75 € tax.

## 6. Persistence / reload

1. Reload the page: buckets, holding classification, estimator checkboxes + fund
   cost, per-phase `Kapitalbasis`, and insurance answers must survive
   (localStorage `rentenlueckenrechner.scenario.v15`) and results must
   recompute identically.
