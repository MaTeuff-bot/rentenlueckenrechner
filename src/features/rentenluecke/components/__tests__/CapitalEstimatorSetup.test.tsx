// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RetirementInsuranceSection } from '../InputPanel/RetirementInsuranceSection'
import { CapitalEstimatorSetup } from '../InputPanel/CapitalEstimatorSetup'
import { PortfolioBucketSection } from '../InputPanel/PortfolioBucketSection'
import { needsDetailedPortfolio } from '../../model/capitalIncome/setup'
import { engineCapitalEstimatorFromPortfolio, portfolioEstimatorReadiness, type PortfolioEstimatorSettings } from '../../model/capitalIncome/portfolioEstimator'
import { automaticInsurance, insuredInput, completedCoverage } from '../../model/__tests__/insuranceFixtures'
import { insuranceSetupIssues } from '../../model/retirementInsurance'
import { pensionTaxDisclosures } from '../../model/tax/incomeTax'
import { SYNTHETIC_RETURN_SERIES_IDS } from '../../model/historicalReturns/constants'
import type { PortfolioBucket } from '../../model/portfolioBuckets'

function Harness() {
  const [insurance, setInsurance] = useState(automaticInsurance({
    bridge: { status: 'voluntary', circumstances: 'standard' },
    pension: { status: 'unknown', circumstances: 'standard', drvSubsidy: 'not-received' },
  }))
  const [settings, setSettings] = useState<PortfolioEstimatorSettings | undefined>(undefined)
  const [buckets, setBuckets] = useState<PortfolioBucket[]>([{ id: 'fund', name: 'Depot', value: 100000, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity }])
  const baseInput = insuredInput({ currentAge: 65, retirementAge: 65, estimatorPortfolio: buckets, retirementInsurance: insurance })
  const needsAutomatic = needsDetailedPortfolio({ ...baseInput, retirementInsurance: insurance })
  const readiness = portfolioEstimatorReadiness(settings, buckets, 100000)
  const engineInput = insuredInput({ currentAge: 65, retirementAge: 65, estimatorPortfolio: buckets, retirementInsurance: { ...insurance, capitalEstimator: engineCapitalEstimatorFromPortfolio(settings, needsAutomatic) } })
  const issues = insuranceSetupIssues(engineInput)
  return <>
    <PortfolioBucketSection buckets={buckets} total={100000} allocation={{ equity: 1, bonds: 0, fixed: 0 }} error={null} onAdd={() => {}} onRemove={id => setBuckets(buckets.filter(b => b.id !== id))} onUpdate={(id, patch) => setBuckets(buckets.map(b => b.id === id ? { ...b, ...patch } : b))} />
    <CapitalEstimatorSetup settings={settings} readiness={readiness} needsAutomatic={needsAutomatic} onSettingsChange={setSettings} />
    <RetirementInsuranceSection coverage={completedCoverage()} insurance={insurance} input={engineInput} onChange={setInsurance} estimatorReadiness={readiness} />
    <p role="status">{issues.length ? issues.join(' ') : 'Vollständig'}</p>
    <p data-testid="portfolio-readiness">{readiness.ready ? 'Portfolio bereit' : 'Portfolio offen'}</p>
  </>
}
const change = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
describe('mandatory detailed capital setup interactions', () => {
  it('requires classification, cost and declarations in every insurance mode; no per-phase manual capital UI', () => {
    render(<Harness />)
    // Retired per-phase manual capital estimates have no UI meaning anymore.
    expect(screen.queryByLabelText('Kapitalbasis – Brücke')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Kapitalbasis – Rentenphase')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Beitragsrelevante Kapitalerträge/)).not.toBeInTheDocument()
    expect(screen.getByTestId('estimator-readiness')).toHaveTextContent('Unvollständig')
    expect(screen.getByRole('status')).not.toHaveTextContent('Vollständig')
    change('Tatsächliche Anlageart von Depot', 'accumulating-equity-fund')
    change('Anschaffungskosten des gesamten Fondspools (€)', '0')
    fireEvent.click(screen.getByLabelText(/Anlageumfang bestätigt/))
    fireEvent.click(screen.getByLabelText(/Verlustumfang bestätigt/))
    expect(screen.getByTestId('estimator-readiness')).toHaveTextContent('Bereit für detaillierte Schätzung.')
    expect(screen.getByRole('status')).toHaveTextContent('Vollständig')
    fireEvent.click(screen.getByText('Erweitert – projizierter Basiszins'))
    expect(screen.getByLabelText('Konstanter nominaler Basiszins (%)')).toHaveValue(3.2)
    change('Anschaffungskosten des gesamten Fondspools (€)', '')
    expect(screen.getByRole('status')).toHaveTextContent('Anschaffungskosten')
    expect(screen.getByTestId('estimator-readiness')).toHaveTextContent('Unvollständig')
    change('Anschaffungskosten des gesamten Fondspools (€)', '0')
    change('Tatsächliche Anlageart von Depot', 'unsupported')
    expect(screen.getByRole('status')).toHaveTextContent('entfernen/ersetzen')
    // The portfolio itself is preserved independently of insurance answers.
    expect(screen.getByLabelText('Tatsächliche Anlageart von Depot')).toHaveValue('unsupported')
    expect(screen.getByRole('spinbutton', { name: /Aktueller Wert von Depot/ })).toHaveValue(100000)
  })
  it('discloses the joint pension-tax funding and bank blocking warning', () => {
    render(<Harness />)
    expect(screen.getByText(/im selben Finanzierungs-Fixpunkt/)).toBeInTheDocument()
    expect(screen.getByText(/am Jahresende.*reinvestiert/)).toBeInTheDocument()
    expect(screen.queryByText(/kein Vermögensverbrauch nötig/)).not.toBeInTheDocument()
    expect(screen.getByText(/zu Zielgewichten zurückgekauft/)).toBeInTheDocument()
    expect(screen.queryByText(/kein Verkaufsgewinn/)).not.toBeInTheDocument()
    expect(screen.getByText(/kann ein einziger abgetasteter Negativpfad die gesamte Berechnung blockieren/)).toBeInTheDocument()
    const visibleTaxNotes = pensionTaxDisclosures.join(' ')
    expect(visibleTaxNotes).toContain('im selben Finanzierungs-Fixpunkt')
    expect(visibleTaxNotes).toContain('zurückgekauft')
    expect(visibleTaxNotes).not.toContain('Zusatzentnahme für die GRV-Rentensteuer bei Einkommenslücke')
    expect(visibleTaxNotes).not.toContain('kein Verkaufsgewinn')
  })
})
