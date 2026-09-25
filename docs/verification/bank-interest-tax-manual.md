# Bank-interest tax — manual post-merge checklist (no browser pass claimed)

Status: pending. Browser testing was explicitly waived for this PR; nothing below
was executed in a browser. The maintained Playwright PR covers browser execution.
Fixed-return engine assertions underneath are covered by
`src/features/rentenluecke/model/tax/bankInterestTax.test.ts` and
`src/features/rentenluecke/components/__tests__/CapitalTaxLabels.test.tsx`
(`npx vitest run --dir src --maxWorkers=1`: 38 files / 687 tests, exit 0).

Limitation: no exact browser fixture numbers can be established from source —
the deterministic plan path depends on default inputs plus expected returns from
the selected return proxies — so expectations below are structural (labels,
causes, conservation), not invented euro amounts. Hand-computed numbers appear
only where marked as engine-level (vitest), never as browser output.

## 1. Bank-only fixture (automatic capital basis)

1. Vermögen → `+ Anlage hinzufügen`; set `Tatsächliche Anlageart` =
   `Gewöhnliche Bankeinlage`, `Aktueller Wert` e.g. 100.000 €,
   `Renditequelle/Proxy` = a Cash proxy with a gross interest source
   (bank deposits require a Brutto-Zinsquelle, not a fund/price return).
2. `Anschaffungskosten und Ertragsschätzung`: fund cost stays 0 (no funds);
   tick both confirmation checkboxes (`Anlageumfang bestätigt…`,
   `Verlustumfang bestätigt…`).
3. Versicherung → `Kapitalbasis – Brücke` and `Kapitalbasis – Rentenphase` =
   `Automatisch aus dem Portfolio schätzen`.
4. Expect in `Dein Kapitalbedarf`: card title `Kapitalertragsteuer (Bankzinsen)`
   and small text `… mit Zinssteuer` (never `Entnahmesteuer`/`Umschichtung`).
5. Expect in `Jahrestabelle` → `Details anzeigen` → `Steueranlass`: `Zinsen`
   on taxed rows (never `Entnahme + Zinsen`); `Steuerpflichtige Entnahme /
   Umschichtung / Zinsen` holds the assessable interest.
6. Engine reference (vitest, not browser): 100.000 € bank at 2% gross →
   interest 2.000 €, allowance 1.000 €, base 1.000 €, tax 263,75 €,
   closing 102.000 − 263,75 €.

## 2. Mixed fixture (fund + bank)

1. Add a second bucket: `Tatsächliche Anlageart` =
   `Thesaurierender Aktienfonds / Aktien-ETF` with a fund return proxy; set
   `Anschaffungskosten des gesamten Fondspools (€)` (explicit, 0 allowed).
2. Expect card title `Kapitalertragsteuer (Entnahme, Umschichtung, Bankzinsen)`,
   small text `… mit Entnahmesteuer (einschließlich Bankzinsen)` /
   `… mit Umschichtungssteuer (einschließlich Bankzinsen)`, and taxed
   `Steueranlass` values `Entnahme + Zinsen` / `Umschichtung + Zinsen`.

## 3. Fund-only smoke (automatic, no bank buckets)

1. Expect title `Kapitalertragsteuer (Entnahme, Umschichtung)` and
   `Steueranlass` `Entnahme`/`Umschichtung` — no `Zinsen` overclaim.

## 4. Manual-mode smoke

1. Versicherung → one phase `Kapitalbasis` = `Manuelle Kapitalertragsschätzung`,
   enter `Beitragsrelevante Kapitalerträge – … (€/Monat heute)`.
2. Expect title `Kapitalertragsteuer Entnahme + Umschichtung` and the
   pauschal disclosure (`Entnahmen ohne Depotaufschlüsselung …`) under
   `Hinweise zur Renten- und Kapitalertragsteuer`; bank interest is only
   pauschal here, never separately identified.

## 5. Persistence / reload

1. Reload the page: buckets, `Tatsächliche Anlageart`, estimator checkboxes,
   and per-phase `Kapitalbasis` must survive (localStorage
   `rentenlueckenrechner.scenario.v15`) and results must recompute identically.

## 6. Stochastic results are distributional, not hand-computable

- `P10/P50/P90` and depletion probability come from bootstrap draws; do not
  expect them to equal any hand-computed fixed-return number.
- Unsupported negative gross bank draws: a sampled bank path with negative
  gross interest is rejected (`Negativer Brutto-Bankzinspfad nicht abgedeckt`)
  and surfaces as `Berechnung unvollständig: … Automatische Kapitalbasis
  prüfen oder ausdrücklich manuelle Kapitalertragsschätzung wählen.`
  Do not clamp or bypass draws; either use `Manuelle Kapitalertragsschätzung`
  for that phase or replace the bank return source. This does not affect the
  fixed-return plan path.
