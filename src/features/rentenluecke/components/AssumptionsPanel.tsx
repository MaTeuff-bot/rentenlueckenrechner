export function AssumptionsPanel() {
  return (
    <section className="panel assumptions" aria-labelledby="assumptions-title">
      <h2 id="assumptions-title">Annahmen und Hinweise</h2>
      <p>
        Dies ist eine vereinfachte Modellrechnung und keine Finanzberatung. Alle Ergebnisse beruhen auf den
        eingegebenen Annahmen zu Inflation, Rendite, Ausgaben, Einkommen und Sparrate.
      </p>
      <p>
        Die Simulation rechnet in Jahresschritten. Renditen werden jeweils auf das Kapital zu Jahresbeginn
        berechnet. Einzahlungen und Entnahmen erfolgen am Jahresende und beeinflussen daher erst das Kapital des
        Folgejahres.
      </p>
      <p>
        Nicht berücksichtigt werden insbesondere: Steuern, Krankenversicherung, Pflegekosten, gesetzliche
        Rentenformel, Rentenanpassungen, Renditeschwankungen, einmalige Ausgaben, Immobilien,
        Partner-/Haushaltssituation und individuelle Produktausgestaltung.
      </p>
    </section>
  )
}
