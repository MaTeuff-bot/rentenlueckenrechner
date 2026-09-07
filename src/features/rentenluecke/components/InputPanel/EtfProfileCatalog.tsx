import { getBundledEtfProfiles } from '../../model/etfProfiles'

const percent = new Intl.NumberFormat('de-DE', { style: 'percent', minimumFractionDigits: 2 })

export function EtfProfileCatalog({ selectedSourceIds }: { selectedSourceIds: string[] }) {
  const profiles = getBundledEtfProfiles().filter((profile) =>
    selectedSourceIds.some((sourceId) => sourceId.toLowerCase().includes(profile.isin.toLowerCase())),
  )

  if (profiles.length === 0) return null

  return (
    <section className="selected-etf-profiles" aria-labelledby="selected-etf-profiles-title">
      <h3 id="selected-etf-profiles-title">Ausgewählte ETF-Steckbriefe</h3>
      <p className="portfolio-note">
        Für diese ETFs sind statische historische EUR-Xetra-Renditen als auswählbare Renditequellen gebündelt.
      </p>
      <div className="source-detail-grid etf-profile-grid">
        {profiles.map((profile) => (
          <article className="source-detail-card" key={profile.isin}>
            <h3>{profile.name}</h3>
            <dl>
              <div><dt>ISIN / WKN</dt><dd>{profile.isin} / {profile.wkn}</dd></div>
              <div><dt>Handel</dt><dd>{profile.ticker} · {profile.exchange} · {profile.listingCurrency}</dd></div>
              <div><dt>Fondswährung / Domizil</dt><dd>{profile.fundCurrency} / {profile.domicile}</dd></div>
              <div><dt>Emittent / Anlageklasse</dt><dd>{profile.issuer} / Aktien</dd></div>
              <div><dt>TER / Ertragsverwendung</dt><dd>{percent.format(profile.ter)} / thesaurierend</dd></div>
              <div>
                <dt>Quellen</dt>
                <dd>
                  {profile.sources.map((source, index) => (
                    <span key={source.url}>
                      {index > 0 ? ' · ' : ''}<a href={source.url} target="_blank" rel="noreferrer">{source.name}</a>
                    </span>
                  ))}
                </dd>
              </div>
            </dl>
          </article>
        ))}
      </div>
    </section>
  )
}
