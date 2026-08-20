import { useState } from 'react'
import { formatCurrency, formatNumber, formatPercent } from '../model/format'
import type { YearlyPeriodRow } from '../model/types'

type YearlyTableProps = {
  rows: YearlyPeriodRow[]
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
              <th>Entnahme</th>
              <th>Endkapital</th>
              <th>Endkapital heutige Kaufkraft</th>
              {showDetails ? (
                <>
                  <th>Jahr Index</th>
                  <th>Inflationsfaktor</th>
                  <th>Renditeannahme</th>
                  <th>Gewünschte Ausgaben</th>
                  <th>Renteneinkommen</th>
                  <th>Rentenlücke</th>
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
                <td>{formatCurrency(row.closingCapital, 100)}</td>
                <td>{formatCurrency(row.closingCapitalToday, 100)}</td>
                {showDetails ? (
                  <>
                    <td>{row.yearIndex}</td>
                    <td>{formatNumber(row.inflationFactor, 4)}</td>
                    <td>{formatPercent(row.nominalReturnRate)}</td>
                    <td>{formatCurrency(row.desiredSpending, 100)}</td>
                    <td>{formatCurrency(row.retirementIncome, 100)}</td>
                    <td>{formatCurrency(row.gapWithdrawal, 100)}</td>
                    <td>{formatCurrency(row.unfundedWithdrawal, 100)}</td>
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
