import { isFixedInflationSource, type InflationSourceOption, type ReturnSeriesOption } from '../../model/historicalReturns'
import {
  formatCaveatTag,
  formatPrecisePercent,
  getBasisLabel,
  getCoverageLabel,
  getLicenseLabel,
  getCostTreatmentLabel,
  getSourceName,
  getSourceVersion,
} from './sourceDisplay'

export function ReturnSourceCard({ label, source }: { label: string; source: ReturnSeriesOption }) {
  const caveats = source.caveats.slice(0, 3)

  return (
    <article className="source-detail-card">
      <h3>{label}</h3>
      <dl>
        <div>
          <dt>Quelle</dt>
          <dd>{getSourceName(source)}</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>{getSourceVersion(source)}</dd>
        </div>
        <div>
          <dt>Abdeckung</dt>
          <dd>{getCoverageLabel(source)}</dd>
        </div>
        <div>
          <dt>Basis</dt>
          <dd>{getBasisLabel(source)}</dd>
        </div>
        <div>
          <dt>Lizenz</dt>
          <dd>{getLicenseLabel(source)}</dd>
        </div>
        <div>
          <dt>Kostenbehandlung</dt>
          <dd>{getCostTreatmentLabel(source)}</dd>
        </div>
      </dl>
      <CaveatTags caveats={caveats} />
    </article>
  )
}

export function InflationSourceCard({ source }: { source: InflationSourceOption }) {
  if (isFixedInflationSource(source)) {
    return (
      <article className="source-detail-card">
        <h3>Inflation</h3>
        <dl>
          <div>
            <dt>Quelle</dt>
            <dd>Manuelle Eingabe</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>Feste Annahme</dd>
          </div>
          <div>
            <dt>Abdeckung</dt>
            <dd>Alle simulierten Jahre</dd>
          </div>
          <div>
            <dt>Basis</dt>
            <dd>{formatPrecisePercent(source.annualInflationRate)} pro Jahr</dd>
          </div>
          <div>
            <dt>Lizenz</dt>
            <dd>Manuelle Modellannahme</dd>
          </div>
        </dl>
        <CaveatTags caveats={source.caveats.slice(0, 3)} />
      </article>
    )
  }

  return (
    <article className="source-detail-card">
      <h3>Inflation</h3>
      <dl>
        <div>
          <dt>Quelle</dt>
          <dd>{source.source.sourceName}</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>{source.sourceDatasetVersion}</dd>
        </div>
        <div>
          <dt>Abdeckung</dt>
          <dd>{source.startYear}-{source.endYear}, {Object.keys(source.annualInflation).length} Beobachtungen</dd>
        </div>
        <div>
          <dt>Basis</dt>
          <dd>Deutsche CPI-Inflation, {source.currency}</dd>
        </div>
        <div>
          <dt>Lizenz</dt>
          <dd>{source.license}</dd>
        </div>
      </dl>
      <CaveatTags caveats={source.caveats.slice(0, 3)} />
    </article>
  )
}

function CaveatTags({ caveats }: { caveats: readonly string[] }) {
  return (
    <div className="source-caveats" aria-label="Caveats">
      {caveats.map((caveat) => (
        <span key={caveat}>{formatCaveatTag(caveat)}</span>
      ))}
    </div>
  )
}
