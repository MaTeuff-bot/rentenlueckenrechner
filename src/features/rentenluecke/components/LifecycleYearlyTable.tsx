import type { LifecycleRun } from '../model/lifecycleScenario'

type Props = {
  lifecycleRun: LifecycleRun
}

const currency = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

export function LifecycleYearlyTable({ lifecycleRun }: Props) {
  const reports = lifecycleRun.result.reports
  return (
    <div>
      <h3>Jahrestabelle Lebenszyklus (gemeinsame Jahreszeilen)</h3>
      <p className="portfolio-note">Entnahme gedeckt/ungedeckt, laufende und nachgezahlte Steuern, offene Verbindlichkeiten, KV/PV gedeckt/ungedeckt, Schluss- und Ankerwerte aus derselben Simulation. Keine frischen Steuerjahre bei Abwicklung.</p>
      <p className="portfolio-note">Cash-Proxy: nominale Bewegung mindert Bestand; nur positiver Zins ist Steuer-/GKV-Einkommen (einmal). Kein Verlusttopf aus Proxy-Rückgang.</p>
      <table>
        <thead>
          <tr>
            <th>Jahr</th>
            <th>Alter</th>
            <th>Zuführung</th>
            <th>Entnahme gedeckt</th>
            <th>Entnahme ungedeckt</th>
            <th>Steuer laufend</th>
            <th>Nachzahlung Vorjahr</th>
            <th>Offen</th>
            <th>KV/PV gezahlt</th>
            <th>KV/PV offen</th>
            <th>Schlusswert</th>
          </tr>
        </thead>
        <tbody>
          {reports.map((r) => (
            <tr key={r.year}>
              <td>{r.year}</td>
              <td>{r.age}</td>
              <td>{currency.format(r.contribution)}</td>
              <td>{currency.format(r.withdrawal)}</td>
              <td>{currency.format(r.unfundedWithdrawal)}</td>
              <td>{currency.format(r.taxPaidCurrentYear)}</td>
              <td>{currency.format(Object.values(r.arrearsPaidByYear).reduce((n, v) => n + v, 0))}</td>
              <td>{currency.format(Object.values(r.remainingLiabilities).reduce((n, v) => n + v, 0))}</td>
              <td>{currency.format(r.insurancePaid)}</td>
              <td>{currency.format(r.unfundedInsuranceKv + r.unfundedInsurancePv)}</td>
              <td>{currency.format(r.closingValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
