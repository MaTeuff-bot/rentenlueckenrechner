// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RetirementInsuranceSection } from '../InputPanel/RetirementInsuranceSection'
import { RetirementIncomeStreamsSection } from '../InputPanel/RetirementIncomeStreamsSection'
import { InsuranceBreakdown } from '../InsuranceBreakdown'
import { clearHiddenInvalidInsuranceValues, createDefaultRetirementInsurance, insuranceSetupIssues, type RetirementInsurance } from '../../model/retirementInsurance'
import { insuredInput, pension, automaticInsurance } from '../../model/__tests__/insuranceFixtures'
import { simulateScenario } from '../../model/simulateScenario'
import { rentenlueckeInputSchema } from '../../model/inputSchema'
import type { RetirementIncomeStream } from '../../model/types'

function Harness({ initial = pension({ support: undefined }), config = createDefaultRetirementInsurance(67), workStop = 67 }: {
  initial?: RetirementIncomeStream; config?: RetirementInsurance; workStop?: number
}) {
  const [rawInsurance, setInsurance] = useState(config)
  const [streams, setStreams] = useState([initial])
  const input = clearHiddenInvalidInsuranceValues(insuredInput({ currentAge: workStop, retirementAge: workStop, planningAge: 70, retirementIncomeStreams: streams, retirementInsurance: rawInsurance }))
  const insurance = input.retirementInsurance!
  const issues = insuranceSetupIssues(input)
  const valid = rentenlueckeInputSchema.safeParse(input).success && !issues.length
  return <>
    <RetirementInsuranceSection insurance={insurance} input={input} onChange={setInsurance} />
    <RetirementIncomeStreamsSection input={input} streams={streams} insurance={insurance}
      onUpdate={(id, patch) => setStreams(current => current.map(stream => stream.id === id ? { ...stream, ...patch } : stream))}
      onAdd={() => {}} onRemove={id => setStreams(current => current.filter(stream => stream.id !== id))} />
    {issues.length > 0 && <p role="status">{issues.join(' ')}</p>}
    {valid && <InsuranceBreakdown rows={simulateScenario(input).retirementRows} streams={streams} />}
  </>
}
function change(label: string | RegExp, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }) }
const breakdown = () => screen.queryByRole('heading', { name: 'Monatliche KV/PV-Aufschlüsselung' })
function confirmKvdr() {
  change('Versicherungsstatus – Rentenphase', 'kvdr')
  change('Versicherungsumstände – Rentenphase', 'standard')
  change('Art bestätigen – Pension', 'standard')
  change('Kassenindividueller Zusatzbeitrag (%)', '2.9')
  change('Dauerhafte anerkannte PV-Elterneigenschaft', 'false')
}

describe('guided insurance fields and ledger breakdown', () => {
  it('starts unanswered, requires confirmation, and removes the forecast when an answer is cleared', () => {
    render(<Harness />)
    expect(breakdown()).not.toBeInTheDocument()
    expect(screen.getByLabelText('Versicherungsstatus – Rentenphase')).toHaveValue('')
    expect(screen.queryByText(/Schätzung aktivieren/)).not.toBeInTheDocument()
    confirmKvdr()
    expect(breakdown()).toBeInTheDocument()
    change('Kassenindividueller Zusatzbeitrag (%)', '')
    expect(breakdown()).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Zusatzbeitrag angeben')
    change('Kassenindividueller Zusatzbeitrag (%)', '0')
    expect(breakdown()).toBeInTheDocument()
    change('Kassenindividueller Zusatzbeitrag (%)', '-1')
    expect(screen.getByLabelText('Kassenindividueller Zusatzbeitrag (%)')).toHaveAttribute('aria-invalid', 'true')
    expect(breakdown()).not.toBeInTheDocument()
  })
  it('requires unknown-status capital and subsidy answers, allows explicit zero, hides them under KVdR', () => {
    render(<Harness />)
    confirmKvdr()
    change('Versicherungsstatus – Rentenphase', 'unknown')
    expect(screen.getByText(/Konservative Annahme: freiwillige GKV/)).toBeVisible()
    expect(breakdown()).not.toBeInTheDocument()
    change('Kapitalbasis – Rentenphase', 'manual')
    change('Beitragsrelevante Kapitalerträge – Rentenphase (€/Monat heute)', '0')
    expect(breakdown()).not.toBeInTheDocument()
    change('DRV-Zuschuss – Rentenphase', 'not-received')
    expect(breakdown()).toBeInTheDocument()
    change('Versicherungsstatus – Rentenphase', 'kvdr')
    expect(screen.queryByLabelText(/Beitragsrelevante Kapitalerträge/)).not.toBeInTheDocument()
    expect(screen.queryByLabelText('DRV-Zuschuss – Rentenphase')).not.toBeInTheDocument()
  })
  it('keeps a saved manual phase in manual mode when its estimate is cleared', () => {
    render(<Harness initial={pension()} config={automaticInsurance({ pension: { status: 'voluntary', circumstances: 'standard', capitalMonthlyToday: 100, drvSubsidy: 'not-received' } })} />)
    change('Beitragsrelevante Kapitalerträge – Rentenphase (€/Monat heute)', '')
    expect(screen.getByLabelText('Kapitalbasis – Rentenphase')).toHaveValue('manual')
    expect(screen.getByLabelText('Beitragsrelevante Kapitalerträge – Rentenphase (€/Monat heute)')).toHaveValue(null)
    expect(breakdown()).not.toBeInTheDocument()
  })
  it('lets users correct child years, confirm the list, and edit consistent total rate assumptions', () => {
    render(<Harness config={automaticInsurance()} initial={pension()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Anerkanntes Kind hinzufügen' }))
    expect(screen.getByLabelText('Geburtsjahr Kind 1')).toHaveValue(null)
    expect(breakdown()).not.toBeInTheDocument()
    change('Geburtsjahr Kind 1', '2002')
    fireEvent.click(screen.getByLabelText('Kinderliste vollständig bestätigt (auch ohne Kinder unter 25)'))
    expect(breakdown()).toBeInTheDocument()
    change('Geburtsjahr Kind 1', '')
    expect(breakdown()).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Kind 1 entfernen' }))
    fireEvent.click(screen.getByLabelText('Kinderliste vollständig bestätigt (auch ohne Kinder unter 25)'))
    fireEvent.click(screen.getByText('Erweitert – gesetzliche Satzannahmen ändern'))
    change(/Allgemeiner KV-Satz/, '16')
    expect(screen.getAllByText('189 €').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: 'Gesetzliche Standards verwenden' }))
    expect(screen.getAllByText('175 €').length).toBeGreaterThan(0)
  })
  it('requires only manual totals for unsupported phases and allows returning to automatic coverage', () => {
    render(<Harness initial={pension({ kind: 'private-rente' })} />)
    expect(screen.queryByLabelText('Kassenindividueller Zusatzbeitrag (%)')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Kapitalerträge/)).not.toBeInTheDocument()
    change('Eigene KV nach allen Zuschüssen – Rentenphase (€/Monat heute)', '200')
    change('Eigene PV nach allen Zuschüssen – Rentenphase (€/Monat heute)', '50')
    expect(breakdown()).toBeInTheDocument()
    expect(screen.getByText(/Gesamte Phase manuell nach allen Zuschüssen/)).toBeVisible()
    expect(screen.getByText('1.750 €')).toBeVisible()
    change('Kategorie von Pension', 'gesetzliche-rente')
    expect(breakdown()).not.toBeInTheDocument()
    expect(screen.getByLabelText('Kassenindividueller Zusatzbeitrag (%)')).toBeVisible()
    confirmKvdr()
    expect(breakdown()).toBeInTheDocument()
  })
  it.each(['gesetzliche-rente', 'betriebsrente'] as const)('clears special classification when changing %s to rental and requires fresh pension confirmation', kind => {
    render(<Harness initial={pension({ kind })} config={automaticInsurance()} />)
    change('Art bestätigen – Pension', 'unsupported')
    expect(breakdown()).not.toBeInTheDocument()
    expect(screen.getByLabelText(/Eigene KV nach allen Zuschüssen/)).toBeVisible()
    change('Kategorie von Pension', 'rental-income')
    expect(screen.queryByLabelText('Art bestätigen – Pension')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Eigene KV nach allen Zuschüssen/)).not.toBeInTheDocument()
    expect(breakdown()).toBeInTheDocument()
    change('Versicherungsstatus – Rentenphase', 'voluntary')
    expect(screen.getByLabelText(/Beitragsrelevanter Mietüberschuss/)).toBeVisible()
    change(/Beitragsrelevanter Mietüberschuss/, '1500')
    change('Kapitalbasis – Rentenphase', 'manual')
    change('Beitragsrelevante Kapitalerträge – Rentenphase (€/Monat heute)', '0')
    change('DRV-Zuschuss – Rentenphase', 'not-received')
    expect(breakdown()).toBeInTheDocument()
    change('Kategorie von Pension', kind)
    expect(screen.getByLabelText('Art bestätigen – Pension')).toHaveValue('')
    expect(breakdown()).not.toBeInTheDocument()
    change('Art bestätigen – Pension', 'standard')
    expect(breakdown()).toBeInTheDocument()
  })
  it('preserves valid rate overrides when an invalid rate is hidden by manual mode and returns to automatic', () => {
    render(<Harness initial={pension()} config={automaticInsurance()} />)
    fireEvent.click(screen.getByText('Erweitert – gesetzliche Satzannahmen ändern'))
    change(/Allgemeiner KV-Satz/, '16')
    change(/PV-Basissatz/, '4')
    change(/Ermäßigter KV-Satz/, '-1')
    expect(breakdown()).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('Erweitert – eigene Gesamtannahme'))
    fireEvent.click(screen.getByLabelText('Gesamte Rentenphase manuell berechnen'))
    expect(screen.queryByLabelText(/Allgemeiner KV-Satz/)).not.toBeInTheDocument()
    change('Eigene KV nach allen Zuschüssen – Rentenphase (€/Monat heute)', '100')
    change('Eigene PV nach allen Zuschüssen – Rentenphase (€/Monat heute)', '20')
    expect(breakdown()).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('Gesamte Rentenphase manuell berechnen'))
    expect(breakdown()).toBeInTheDocument()
    fireEvent.click(screen.getByText('Erweitert – gesetzliche Satzannahmen ändern'))
    expect(screen.getByLabelText(/Allgemeiner KV-Satz/)).toHaveValue(16)
    expect(screen.getByLabelText(/PV-Basissatz/)).toHaveValue(4)
    expect(screen.getByLabelText(/Ermäßigter KV-Satz/)).toHaveValue(null)
    const section = screen.getByRole('region', { name: 'Monatliche KV/PV-Aufschlüsselung' })
    expect(within(section).getAllByText('189 €').length).toBeGreaterThan(0)
    expect(within(section).getAllByText('80 €').length).toBeGreaterThan(0)
  })
  it('offers phase navigation with independent bridge totals and shows negative available income', () => {
    render(<Harness initial={pension()} config={automaticInsurance()} workStop={65} />)
    expect(screen.getByLabelText('Berechnungsjahr auswählen')).toHaveValue('67')
    fireEvent.click(screen.getByRole('button', { name: 'Erstes Brückenjahr' }))
    expect(screen.getByLabelText('Berechnungsjahr auswählen')).toHaveValue('65')
    expect(screen.getByText(/Die Beiträge übersteigen das Einkommen/)).toBeVisible()
    change('Versicherungsstatus – Brücke', 'unsupported')
    expect(screen.queryByLabelText('Versicherungsumstände – Brücke')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Beitragsrelevante Kapitalerträge – Brücke (€/Monat heute)')).not.toBeInTheDocument()
    change('Eigene KV nach allen Zuschüssen – Brücke (€/Monat heute)', '100')
    change('Eigene PV nach allen Zuschüssen – Brücke (€/Monat heute)', '0')
    expect(breakdown()).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Erstes Rentenjahr' }))
    expect(screen.getByLabelText('Berechnungsjahr auswählen')).toHaveValue('67')
  })
  it('shows rental assessment only when needed and keeps excluded net income usable', () => {
    render(<Harness initial={pension({ id: 'rent', kind: 'rental-income', amountBasis: 'net' })} config={automaticInsurance()} />)
    expect(breakdown()).toBeInTheDocument()
    expect(screen.queryByLabelText(/Beitragsrelevanter Mietüberschuss/)).not.toBeInTheDocument()
    change('Versicherungsstatus – Rentenphase', 'voluntary')
    expect(screen.getByLabelText(/Beitragsrelevanter Mietüberschuss/)).toBeVisible()
    change('Betragsart von Pension', 'gross')
    change(/Beitragsrelevanter Mietüberschuss/, '1500')
    change('Kapitalbasis – Rentenphase', 'manual')
    change('Beitragsrelevante Kapitalerträge – Rentenphase (€/Monat heute)', '0')
    change('DRV-Zuschuss – Rentenphase', 'not-received')
    expect(breakdown()).toBeInTheDocument()
    fireEvent.click(screen.getByText('Erweitert – eigene Gesamtannahme'))
    fireEvent.click(screen.getByLabelText('Gesamte Rentenphase manuell berechnen'))
    expect(screen.queryByLabelText(/Beitragsrelevanter Mietüberschuss/)).not.toBeInTheDocument()
  })
  it('displays the selected ledger funding shortfall including insurance', () => {
    const input = insuredInput({ currentCapital: 100, monthlyDesiredSpendingToday: 100000 })
    const result = simulateScenario(input)
    render(<InsuranceBreakdown rows={result.retirementRows} streams={input.retirementIncomeStreams!} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/Vermögenslücke:.*einschließlich KV\/PV/)
  })
  it('displays separate assessment and subsidy values directly from the selected ledger row', () => {
    const input = insuredInput()
    const rows = simulateScenario(input).retirementRows
    render(<InsuranceBreakdown rows={rows} streams={input.retirementIncomeStreams!} />)
    const section = screen.getByRole('region', { name: 'Monatliche KV/PV-Aufschlüsselung' })
    expect(within(section).getByText('2.000 € / 2.000 €')).toBeVisible()
    expect(within(section).getByText('1.753 €')).toBeVisible()
    fireEvent.click(screen.getByText('Bemessung und Grenzen erklären'))
    expect(screen.getByText(/ein gemeinsamer Betriebsrenten-KV-Freibetrag/)).toBeVisible()
  })
})
