import { useState } from 'react'
import { formatCurrency, formatNumber, formatPercent } from './format'
import type { YearlyPeriodRow } from '../model/types'

type YearlyTableProps = {
  rows: YearlyPeriodRow[]
}

/** Tax cause without inventing new row fields: the detailed estimator already
 * carries the once-credited gross bank interest on the assessment. Taxed detailed
 * rows report each present cause: fund sales/VP (`Entnahme`/`Umschichtung`), gross
 * interest (`Zinsen`), or both. Bank-only rows therefore read `Zinsen` instead of
 * misleadingly implying a fund withdrawal or rebalancing sale. Scalar/manual rows
 * keep the withdrawal-only approximation label. */
export function taxCauseLabel(row: YearlyPeriodRow): string {
  if ((row.capitalIncomeTax ?? 0) <= 0) return '—'
  const base = row.phase === 'accumulation' ? 'Umschichtung' : 'Entnahme'
  const assessment = row.capitalAssessment
  if (!assessment) return base
  const fundGain = assessment.sale.adjustedFundSaleGain + assessment.movement.adjustedFundSaleGain + assessment.receivedVorabpauschale
  const hasFundCause = fundGain !== 0
  const hasInterestCause = assessment.bankInterest > 0
  if (hasInterestCause && !hasFundCause) return 'Zinsen'
  if (hasInterestCause && hasFundCause) return `${base} + Zinsen`
  return base
}

export function YearlyTable({ rows }: YearlyTableProps) {
  const [showDetails, setShowDetails] = useState(false)

  return (
    <section className="panel" aria-labelledby="table-title">
      <div className="panel-heading">
        <div>
          <h2 id="table-title">Jahrestabelle</h2>
          <p>Planwert-Ledger mit Erwartungswert der ausgewählten Quellen; das Diagramm zeigt die Bootstrap-Verteilung.</p>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={showDetails} onChange={(event) => setShowDetails(event.target.checked)} />
          Details anzeigen
        </label>
      </div>

      <p>KV und PV enthalten auch Kosten der manuellen Portfolio-Beitragsbasis. Negativer Netto-Cashflow erhöht die Entnahmelücke um Kosten oberhalb des Einkommens. KV/PV werden genau einmal abgezogen.</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Alter</th>
              <th>Phase</th>
              <th>Startkapital</th>
              <th>Rendite</th>
              <th>Kapital vor Cashflow</th>
              <th>Einzahlung</th>
              <th>Entnahme für Nettolücke</th>
              <th title="Ruhestand: Entnahme-/Zinssteuer; Ansparen: Umschichtungs-/Zinssteuer (automatische Kapitalbasis)">Kapitalertragsteuer</th>
              <th title="Einkommensteuer auf die gesetzliche Rente (Rentenbesteuerung, nur Ruhestand)">GRV-Rentensteuer</th>
              <th>Endkapital</th>
              <th>Endkapital heutige Kaufkraft</th>
              {showDetails ? (
                <>
                  <th>Jahr Index</th>
                  <th>Inflationsfaktor</th>
                  <th>Renditeannahme</th>
                  <th>Gewünschte Nettoausgaben</th>
                  <th>Einkommen vor Modellabzügen (Brutto + Nettoangaben)</th>
                  <th>Abzüge gesamt</th>
                  <th>Sonstige Abzüge ohne KV/PV</th>
                  <th>KV-Eigenbeitrag</th>
                  <th>PV-Eigenbeitrag</th>
                  <th title="Einkommensteuer auf die gesetzliche Rente (mindert den Netto-Cashflow)">GRV-Rentensteuer</th>
                  <th title="Steuerpflichtiger Rentenanteil nach dem eingefrorenen Rentenfreibetrag, vor Sonderausgaben">Steuerpflichtige Rente (nach Freibetrag)</th>
                  <th>Portfolio-Beitragsbasis (kein Einkommen)</th>
                  <th>Verfügbarer Netto-Cashflow</th>
                  <th>Entnahmelücke</th>
                  <th title="Ruhestand: Entnahme/Zinsen; Ansparen: Umschichtung/Zinsen">Kapitalertragsteuer (Anlass)</th>
                  <th>Steueranlass</th>
                  <th>Steuerpflichtige Entnahme / Umschichtung / Zinsen</th>
                  <th>Sparerpauschbetrag angerechnet</th>
                  <th>Nettoentnahme nach Steuer</th>
                  <th>Konsumierter Überschuss</th>
                  <th>Nicht gedeckte Entnahme</th>
                </>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.phase}-${row.yearIndex}`} className={row.depleted ? 'depleted-row' : undefined}>
                <td>{row.ageStart}-{row.ageEnd}</td>
                <td>{row.phase === 'accumulation' ? 'Ansparen' : 'Ruhestand'}</td>
                <td>{formatCurrency(row.openingCapital, 100)}</td>
                <td>{formatCurrency(row.investmentReturn, 100)}</td>
                <td>{formatCurrency(row.capitalBeforeCashflow, 100)}</td>
                <td>{formatCurrency(row.contribution, 100)}</td>
                <td>{formatCurrency(row.gapWithdrawal, 100)}</td>
                <td>{formatCurrency(row.capitalIncomeTax ?? 0, 100)}</td>
                <td>{formatCurrency(row.pensionIncomeTax ?? 0, 100)}</td>
                <td>{formatCurrency(row.closingCapital, 100)}</td>
                <td>{formatCurrency(row.closingCapitalToday, 100)}</td>
                {showDetails ? (
                  <>
                    <td>{row.yearIndex}</td>
                    <td>{formatNumber(row.inflationFactor, 4)}</td>
                    <td>{formatPercent(row.nominalReturnRate)}</td>
                    <td>{formatCurrency(row.desiredSpending)}</td>
                    <td>{formatCurrency(row.retirementIncomeGross)}</td>
                    <td>{formatCurrency(row.retirementIncomeDeductions)}</td>
                    <td>{formatCurrency(row.retirementIncomeOtherDeductions)}</td>
                    <td>{formatCurrency(row.healthInsurance)}</td>
                    <td>{formatCurrency(row.careInsurance)}</td>
                    <td>{formatCurrency(row.pensionIncomeTax ?? 0)}</td>
                    <td>{formatCurrency(row.pensionTaxBase ?? 0)}</td>
                    <td>{formatCurrency(row.portfolioContributionBase)}</td>
                    <td>{formatCurrency(row.retirementIncomeNet)}</td>
                    <td>{formatCurrency(row.gapWithdrawal)}</td>
                    <td>{formatCurrency(row.capitalIncomeTax ?? 0)}</td>
                    <td>{taxCauseLabel(row)}</td>
                    <td>{formatCurrency(row.taxableWithdrawal ?? 0)}</td>
                    <td>{formatCurrency(row.sparerpauschbetragApplied ?? 0)}</td>
                    <td>{formatCurrency(row.netGapWithdrawal ?? row.gapWithdrawal)}</td>
                    <td>{formatCurrency(row.surplusIncome)}</td>
                    <td>{formatCurrency(row.unfundedWithdrawal)}</td>
                  </>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
