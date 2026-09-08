export function AssumptionsPanel() {
  return (
    <section className="panel assumptions" aria-labelledby="assumptions-title">
      <h2 id="assumptions-title">Annahmen und Hinweise</h2>
      <p>
        Dies ist eine vereinfachte Modellrechnung und keine Finanzberatung. Alle Ergebnisse beruhen auf den
        eingegebenen Annahmen zu Inflation, Rendite, Ausgaben, Einkommen und Sparrate.
      </p>
      <p>
        Gewünschte Ausgaben im Ruhestand werden als netto verfügbare Konsumausgaben in heutiger Kaufkraft verstanden.
      </p>
      <p>
        Für die gesetzliche Rente kann der Monatsbetrag aus dem Rentenbescheid verwendet werden. Die Modellrechnung
        behandelt ihn als Bruttobetrag in heutiger Kaufkraft; dabei wird vereinfacht angenommen, dass sich Lohn- und
        Preisentwicklung langfristig ähnlich entwickeln.
      </p>
      <p>
        Die Simulation rechnet in Jahresschritten. Renditen werden jeweils auf das Kapital zu Jahresbeginn
        berechnet. Einzahlungen und Entnahmen erfolgen am Jahresende und beeinflussen daher erst das Kapital des
        Folgejahres.
      </p>
      <p>
        Steuern werden nur über manuelle Abzüge berücksichtigt. Kranken- und Pflegeversicherung sind entweder im
        bisherigen Gesamtabzug enthalten oder werden nach manueller Aktivierung und Prüfung separat geschätzt. Die tatsächlichen Kranken- und Pflegeversicherungsbeiträge hängen unter
        anderem vom Versicherungsstatus und den Einkommensarten ab. Dies ist keine Steuer- oder
        Sozialversicherungsberatung oder -berechnung.
      </p>
      <p>
        Darüber hinaus nicht berücksichtigt werden insbesondere: gesetzliche Rentenformel, Rentenanpassungen,
        einmalige Ausgaben, Immobilien, Partner-/Haushaltssituation und individuelle
        Produktausgestaltung.
      </p>
      <p>
        Die optionale Überlebenswahrscheinlichkeit im Diagramm nutzt die Periodensterbetafel 2023/2025 des
        Statistischen Bundesamts (Destatis) für Deutschland. Sie dient nur als statistische Orientierung, ist keine
        individuelle Prognose und ändert die Finanzsimulation nicht.
      </p>
    </section>
  )
}
