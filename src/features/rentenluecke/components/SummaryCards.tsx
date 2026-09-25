import type { MouseEvent } from 'react'
import { manualApproximationDisclosure, taxDisclosures } from '../model/tax/capitalIncomeTax'
import { pensionTaxDisclosures } from '../model/tax/incomeTax'
import { formatApproxCurrency, formatCurrency } from './format'
import type { StochasticSimulationSummary } from '../model/stochasticReturns'
import type { SimulationResult, YearlyPeriodRow } from '../model/types'
import type { FlowSection } from '../model/scenarioIssues'

export type ResultAdjustHandler = (section: FlowSection, fieldId?: string) => void

type SummaryCardsProps = {
  result: SimulationResult
  stochasticSummary: StochasticSimulationSummary
  onRequestSection?: ResultAdjustHandler
}

function AdjustLink({
  section,
  fieldId,
  label,
  onRequestSection,
}: {
  section: FlowSection
  fieldId: string
  label: string
  onRequestSection?: ResultAdjustHandler
}) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onRequestSection) return
    event.preventDefault()
    onRequestSection(section, fieldId)
  }
  return (
    <a href={`#${fieldId}`} aria-label={label} onClick={handleClick}>
      Anpassen
    </a>
  )
}

/** Cause-aware capital-tax labels. The detailed estimator carries the
 * once-credited gross bank interest on each assessment, so labels list only
 * causes actually present: bank-only taxed results read `Bankzinsen`/`Zinssteuer`
 * instead of misleadingly implying fund withdrawals or rebalancing sales, and
 * fund-only detailed results do not overclaim interest. Scalar/manual ledgers keep
 * the withdrawal-only approximation wording. Fund cause is any nonzero realized
 * fund sale gain or received Vorabpauschale on a taxed row. */
export function capitalTaxTitleSuffix(rows: YearlyPeriodRow[], usesHoldingsBreakdown: boolean): string {
  if (!usesHoldingsBreakdown) return ' Entnahme + Umschichtung'
  const taxed = rows.filter((row) => (row.capitalIncomeTax ?? 0) > 0)
  if (taxed.length === 0) return ' (Entnahme, Umschichtung, Bankzinsen)'
  let fund = false
  let interest = false
  for (const row of taxed) {
    const assessment = row.capitalAssessment
    if (!assessment) { fund = true; continue }
    if (assessment.sale.adjustedFundSaleGain + assessment.movement.adjustedFundSaleGain + assessment.receivedVorabpauschale !== 0) fund = true
    if (assessment.bankInterest > 0) interest = true
  }
  if (fund && interest) return ' (Entnahme, Umschichtung, Bankzinsen)'
  if (!fund && interest) return ' (Bankzinsen)'
  if (fund && !interest) return ' (Entnahme, Umschichtung)'
  return ' (Entnahme, Umschichtung, Bankzinsen)'
}

export function retirementTaxNoun(taxedRetirementRows: YearlyPeriodRow[], usesHoldingsBreakdown: boolean): string {
  if (!usesHoldingsBreakdown || taxedRetirementRows.length === 0) return 'Entnahmesteuer'
  let fund = false
  let interest = false
  for (const row of taxedRetirementRows) {
    const assessment = row.capitalAssessment
    if (!assessment) { fund = true; continue }
    if (assessment.sale.adjustedFundSaleGain + assessment.movement.adjustedFundSaleGain + assessment.receivedVorabpauschale !== 0) fund = true
    if (assessment.bankInterest > 0) interest = true
  }
  if (interest && !fund) return 'Zinssteuer'
  if (interest && fund) return 'Entnahmesteuer (einschließlich Bankzinsen)'
  return 'Entnahmesteuer'
}

export function accumulationTaxNoun(taxedAccumulationRows: YearlyPeriodRow[], usesHoldingsBreakdown: boolean): string {
  if (!usesHoldingsBreakdown || taxedAccumulationRows.length === 0) return 'Umschichtungssteuer'
  let fund = false
  let interest = false
  for (const row of taxedAccumulationRows) {
    const assessment = row.capitalAssessment
    if (!assessment) { fund = true; continue }
    if (assessment.sale.adjustedFundSaleGain + assessment.movement.adjustedFundSaleGain + assessment.receivedVorabpauschale !== 0) fund = true
    if (assessment.bankInterest > 0) interest = true
  }
  if (interest && !fund) return 'Zinssteuer'
  if (interest && fund) return 'Umschichtungssteuer (einschließlich Bankzinsen)'
  return 'Umschichtungssteuer'
}

export function SummaryCards({ result, stochasticSummary, onRequestSection }: SummaryCardsProps) {
  const { summary } = result
  const retirementAge = result.retirementRows[0]?.ageStart ?? result.rows.at(-1)?.ageEnd
  const retirementPercentileRow = stochasticSummary.rows.find((row) => row.ageStart === retirementAge)
  const planRetirementRow = result.accumulationRows.at(-1)
  const planCapitalAtRetirementToday = planRetirementRow?.closingCapitalToday ?? summary.projectedCapitalAtRetirement
  const retirementCapitalToTodayFactor =
    planRetirementRow && summary.projectedCapitalAtRetirement > 0
      ? planRetirementRow.closingCapitalToday / summary.projectedCapitalAtRetirement
      : 1
  const requiredCapitalAtRetirementToday = summary.requiredCapitalAtRetirement * retirementCapitalToTodayFactor
  const displayedProjectedCapital = retirementPercentileRow?.p50CapitalToday ?? planCapitalAtRetirementToday
  const displayedShortfall = Math.max(0, requiredCapitalAtRetirementToday - displayedProjectedCapital)
  const displayedSurplus = Math.max(0, displayedProjectedCapital - requiredCapitalAtRetirementToday)
  const hasShortfall = displayedShortfall > 0
  const firstMedianDepletionRow =
    result.retirementRows.length > 0
      ? stochasticSummary.rows.find((row) => row.ageStart >= result.retirementRows[0].ageStart && row.p50CapitalToday <= 0)
      : null
  const totalPensionIncomeTax = result.retirementRows.reduce((sum, row) => sum + (row.pensionIncomeTax ?? 0), 0)
  const taxedPensionYears = result.retirementRows.filter((row) => (row.pensionIncomeTax ?? 0) > 0).length
  const averagePensionIncomeTax = result.retirementRows.length > 0 ? totalPensionIncomeTax / result.rows.length : 0
  const totalCapitalIncomeTax = result.rows.reduce((sum, row) => sum + (row.capitalIncomeTax ?? 0), 0)
  const taxedRetirementYears = result.retirementRows.filter((row) => (row.capitalIncomeTax ?? 0) > 0).length
  const taxedAccumulationYears = result.accumulationRows.filter((row) => (row.capitalIncomeTax ?? 0) > 0).length
  const averageCapitalIncomeTax = result.retirementRows.length > 0 ? totalCapitalIncomeTax / result.rows.length : 0
  const usesHoldingsBreakdown = result.retirementRows.some((row) => row.capitalAssessment !== undefined)
  const taxedRows = result.rows.filter((row) => (row.capitalIncomeTax ?? 0) > 0)
  const taxedRetirementRows = result.retirementRows.filter((row) => (row.capitalIncomeTax ?? 0) > 0)
  const taxedAccumulationRows = result.accumulationRows.filter((row) => (row.capitalIncomeTax ?? 0) > 0)

  return (
    <section aria-labelledby="capital-answer-title">
      <h3 id="capital-answer-title">Dein Kapitalbedarf</h3>
      <div className="summary-grid">
        <article className="result-card result-card-primary">
          <span>Benötigtes Kapital zum Rentenbeginn, heutige Kaufkraft</span>
          <strong>{formatApproxCurrency(requiredCapitalAtRetirementToday)}</strong>
          <AdjustLink
            section="vermoegen"
            fieldId="portfolio-add"
            label="Benötigtes Kapital anpassen: Vermögen bearbeiten"
            onRequestSection={onRequestSection}
          />
        </article>
        <article className="result-card">
          <span>Median-Kapital zum Rentenbeginn (P50)</span>
          <strong>{formatApproxCurrency(displayedProjectedCapital)}</strong>
          <AdjustLink
            section="vermoegen"
            fieldId="monthlyContributionToday"
            label="Sparrate anpassen: Vermögen bearbeiten"
            onRequestSection={onRequestSection}
          />
        </article>
        <article className={`result-card ${hasShortfall ? 'warning-card' : 'success-card'}`}>
          <span>{hasShortfall ? 'Kapital-Lücke zum Rentenbeginn' : 'Median-Überschuss zum Rentenbeginn'}</span>
          <strong>{formatApproxCurrency(hasShortfall ? displayedShortfall : displayedSurplus)}</strong>
          <AdjustLink
            section="zeitplan"
            fieldId="retirementAge"
            label="Zeitplan anpassen: Rentenalter bearbeiten"
            onRequestSection={onRequestSection}
          />
        </article>
        <article className="result-card">
          <span>Kapitalertragsteuer{capitalTaxTitleSuffix(taxedRows, usesHoldingsBreakdown)} (gesamt{result.rows.length > 0 ? `, ø ${formatCurrency(averageCapitalIncomeTax, 100)}/Jahr` : ''})</span>
          <strong>{formatApproxCurrency(totalCapitalIncomeTax, 50)}</strong>
          <small>{taxedRetirementYears} von {result.retirementRows.length} Ruhestandsjahren mit {retirementTaxNoun(taxedRetirementRows, usesHoldingsBreakdown)}{taxedAccumulationYears > 0 ? `; ${taxedAccumulationYears} von ${result.accumulationRows.length} Ansparjahren mit ${accumulationTaxNoun(taxedAccumulationRows, usesHoldingsBreakdown)}` : ''}</small>
        </article>
        <article className="result-card">
          <span>GRV-Rentensteuer (gesamt{result.rows.length > 0 ? `, ø ${formatCurrency(averagePensionIncomeTax, 100)}/Jahr` : ''})</span>
          <strong>{formatApproxCurrency(totalPensionIncomeTax, 50)}</strong>
          <small>{taxedPensionYears} von {result.retirementRows.length} Ruhestandsjahren mit Rentensteuer (Netto-Cashflow bereits gemindert)</small>
        </article>
        <article className="result-card">
          <span>Monatliche Netto-Rentenlücke in heutiger Kaufkraft</span>
          <strong>{formatApproxCurrency(summary.monthlyGapToday, 50)}</strong>
          <AdjustLink
            section="ausgaben"
            fieldId="monthlyDesiredSpendingToday"
            label="Gewünschte Ausgaben anpassen: Ausgaben bearbeiten"
            onRequestSection={onRequestSection}
          />
        </article>
      </div>
      {firstMedianDepletionRow ? (
        <p className="depletion-note">
          Im Median-Verlauf ist das Kapital im Jahr {firstMedianDepletionRow.ageStart}-{firstMedianDepletionRow.ageEnd}{' '}
          aufgebraucht.
        </p>
      ) : summary.depletionAge !== null && summary.depletionAgeEnd !== null ? (
        <p className="depletion-note">
          Der Planwert reicht nicht vollständig im Jahr {summary.depletionAge}-{summary.depletionAgeEnd}.
        </p>
      ) : (
        <p className="survival-note">Der Median-Verlauf deckt die Entnahmen bis zum Planungshorizont.</p>
      )}
      <details className="method-details">
        <summary>Hinweise zur Renten- und Kapitalertragsteuer</summary>
        <p>
          Die gesetzliche Rente wird nach der Rentenbesteuerung (Besteuerungsanteil
          nach Rentenbeginnjahr, eingefrorener Rentenfreibetrag, §32a-Tarif 2026)
          besteuert; der ausgewiesene Netto-Cashflow und die Entnahmelücke sind
          bereits um die GRV-Rentensteuer gemindert.
        </p>
        <ul>
          {pensionTaxDisclosures.map((disclosure) => (
            <li key={disclosure}>{disclosure}</li>
          ))}
        </ul>
        <p>
          Entnahmen im Ruhestand (Entnahme), Umschichtungsgewinne der Ansparphase und Bankzinsen bei automatischer
          Kapitalbasis (Entnahme, Umschichtung, Zinsen) werden nach Abgeltungsteuer (25 % zuzüglich 5,5 %
          Solidaritätszuschlag) besteuert; Bankzinsen ohne Teilfreistellung in derselben Bemessung mit gemeinsamem
          Verlusttopf und Sparerpauschbetrag. Das Portfolio finanziert Entnahmelücke zuzüglich Steuer. Nicht gedeckte
          Beträge bleiben als nicht gedeckte Entnahme sichtbar.
        </p>
        <ul>
          {taxDisclosures.map((disclosure) => (
            <li key={disclosure}>{disclosure}</li>
          ))}
          {!usesHoldingsBreakdown ? <li>{manualApproximationDisclosure}</li> : null}
        </ul>
      </details>
    </section>
  )
}
