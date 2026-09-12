// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RetirementInsuranceSection } from '../InputPanel/RetirementInsuranceSection'
import { PortfolioBucketSection } from '../InputPanel/PortfolioBucketSection'
import { automaticInsurance, insuredInput } from '../../model/__tests__/insuranceFixtures'
import { insuranceSetupIssues } from '../../model/retirementInsurance'
import { SYNTHETIC_RETURN_SERIES_IDS } from '../../model/historicalReturns/constants'
import type { PortfolioBucket } from '../../model/portfolioBuckets'

function Harness() {
  const [insurance, setInsurance] = useState(automaticInsurance({
    bridge: { status: 'voluntary', circumstances: 'standard' },
    pension: { status: 'unknown', circumstances: 'standard', drvSubsidy: 'not-received' },
  }))
  const [buckets, setBuckets] = useState<PortfolioBucket[]>([{ id: 'fund', name: 'Depot', value: 100000, returnSeriesId: SYNTHETIC_RETURN_SERIES_IDS.equity }])
  const input = insuredInput({ currentAge: 65, retirementAge: 65, estimatorPortfolio: buckets, retirementInsurance: insurance })
  const issues = insuranceSetupIssues(input)
  return <>
    <PortfolioBucketSection buckets={buckets} total={100000} allocation={{ equity: 1, bonds: 0, fixed: 0 }} error={null} onAdd={() => {}} onRemove={id => setBuckets(buckets.filter(b => b.id !== id))} onUpdate={(id, patch) => setBuckets(buckets.map(b => b.id === id ? { ...b, ...patch } : b))} />
    <RetirementInsuranceSection insurance={insurance} input={input} onChange={setInsurance} />
    <p role="status">{issues.length ? issues.join(' ') : 'Vollständig'}</p>
  </>
}
const change = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } })
describe('automatic capital setup interactions', () => {
  it('requires classification, cost and declarations; preserves portfolio under independent manual overrides', () => {
    render(<Harness />)
    expect(screen.getByLabelText('Kapitalbasis – Brücke')).toHaveValue('automatic')
    expect(screen.getByLabelText('Kapitalbasis – Rentenphase')).toHaveValue('automatic')
    expect(screen.getByRole('status')).not.toHaveTextContent('Vollständig')
    change('Tatsächliche Anlageart von Depot', 'accumulating-equity-fund')
    change('Anschaffungskosten des gesamten Fondspools (€)', '0')
    fireEvent.click(screen.getByLabelText(/Anlageumfang bestätigt/))
    fireEvent.click(screen.getByLabelText(/Verlustumfang bestätigt/))
    expect(screen.getByRole('status')).toHaveTextContent('Vollständig')
    fireEvent.click(screen.getByText('Erweitert – projizierter Basiszins'))
    expect(screen.getByLabelText('Konstanter nominaler Basiszins (%)')).toHaveValue(3.2)
    change('Anschaffungskosten des gesamten Fondspools (€)', '')
    expect(screen.getByRole('status')).toHaveTextContent('Anschaffungskosten')
    change('Tatsächliche Anlageart von Depot', 'unsupported')
    expect(screen.getByRole('status')).toHaveTextContent('entfernen/ersetzen')
    change('Kapitalbasis – Brücke', 'manual')
    change('Beitragsrelevante Kapitalerträge – Brücke (€/Monat heute)', '100')
    expect(screen.getByRole('status')).not.toHaveTextContent('Vollständig')
    change('Kapitalbasis – Rentenphase', 'manual')
    change('Beitragsrelevante Kapitalerträge – Rentenphase (€/Monat heute)', '0')
    expect(screen.getByRole('status')).toHaveTextContent('Vollständig')
    expect(screen.getByLabelText('Tatsächliche Anlageart von Depot')).toHaveValue('unsupported')
    expect(screen.getByRole('spinbutton', { name: /Aktueller Wert von Depot/ })).toHaveValue(100000)
    expect(screen.queryByLabelText(/Eigene KV nach allen Zuschüssen/)).not.toBeInTheDocument()
    change('Kapitalbasis – Brücke', 'automatic')
    expect(screen.getByRole('status')).toHaveTextContent('entfernen/ersetzen')
    change('Kapitalbasis – Brücke', 'manual')
    expect(screen.getByLabelText('Beitragsrelevante Kapitalerträge – Brücke (€/Monat heute)')).toHaveValue(100)
  })
})
