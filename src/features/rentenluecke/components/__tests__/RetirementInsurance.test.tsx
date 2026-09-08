// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RetirementInsuranceSection } from '../InputPanel/RetirementInsuranceSection'
import { RetirementIncomeStreamsSection } from '../InputPanel/RetirementIncomeStreamsSection'
import { InsuranceWarnings } from '../InsuranceWarnings'
import { YearlyTable } from '../YearlyTable'
import { createDefaultRetirementInsurance, INSURANCE_REFERENCE } from '../../model/retirementInsurance'
import { DEFAULT_INPUT } from '../../model/defaults'
import { simulateScenario } from '../../model/simulateScenario'
import { rentenlueckeInputSchema } from '../../model/inputSchema'
import type { RetirementIncomeStream } from '../../model/types'

const pension: RetirementIncomeStream = { id: 'pension', name: 'Pension', kind: 'gesetzliche-rente', amountMonthlyToday: 1000,
  startAge: 67, endAge: null, amountBasis: 'gross', deductionMode: 'effectiveHaircut', effectiveDeductionRate: 0.2 }
function Harness({ initial = pension }: { initial?: RetirementIncomeStream }) {
  const [insurance, setInsurance] = useState(createDefaultRetirementInsurance)
  const [streams, setStreams] = useState([initial])
  const input = { ...DEFAULT_INPUT, currentAge: 67, retirementAge: 67, planningAge: 68, annualInflationRate: 0,
    annualReturnInRetirement: 0, retirementIncomeStreams: streams, retirementInsurance: insurance }
  const valid = rentenlueckeInputSchema.safeParse(input)
  return <>
    <RetirementInsuranceSection insurance={insurance} onChange={setInsurance} />
    <RetirementIncomeStreamsSection streams={streams} insurance={insurance}
      onUpdate={(id, patch) => setStreams((current) => current.map((stream) => stream.id === id ? { ...stream, ...patch } : stream))}
      onAdd={() => {}} onRemove={(id) => setStreams((current) => current.filter((stream) => stream.id !== id))} />
    <InsuranceWarnings insurance={insurance} streams={streams} />
    {valid.success && <YearlyTable rows={simulateScenario(valid.data).rows} />}
  </>
}
const toggle = () => screen.getByRole('checkbox', { name: 'Geführte manuelle GKV-/PV-Schätzung aktivieren' })
const status = () => screen.getByLabelText('Mein angegebener Versicherungsstatus im Ruhestand')
const treatment = () => screen.getByLabelText('KV/PV-Zuordnung von Pension')
function replaceHaircut() {
  fireEvent.click(screen.getByRole('button', { name: /Gesamtabzug für Pension geprüft:/ }))
}
function tableValues() {
  return within(screen.getAllByRole('row')[1]).getAllByRole('cell').map((cell) => cell.textContent)
}

describe('guided retirement insurance UI', () => {
  it('requires opt-in and exposes dated editable own-burden rates and explicit PV assumptions', () => {
    render(<Harness />)
    expect(toggle()).not.toBeChecked()
    expect(screen.queryByLabelText('Mein angegebener Versicherungsstatus im Ruhestand')).not.toBeInTheDocument()
    fireEvent.click(toggle())
    expect(status()).toHaveValue('unknown')
    expect(screen.getByRole('alert')).toHaveTextContent('Versicherungsstatus unbekannt')
    fireEvent.click(screen.getByText('Referenzsätze 2026 prüfen und ändern'))
    expect(screen.getByLabelText('KV-Eigenanteil gesetzliche Rente', { exact: false })).toHaveValue(8.75)
    expect(screen.getByText(/Offizielle Quellen geprüft am 2026-09-08/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'BMG: Beiträge und Einkommensarten' })).toHaveAttribute('href', INSURANCE_REFERENCE.sources.bmgContributions)
    expect(screen.getByRole('link', { name: 'DRV: Status, Rentenbeteiligung und Pflegeversicherung' })).toHaveAttribute('href', INSURANCE_REFERENCE.sources.drv)
    expect(screen.getByRole('link', { name: 'BMG: Pflegebeiträge und Ausnahmen' })).toHaveAttribute('href', INSURANCE_REFERENCE.sources.bmgCare)
    fireEvent.click(screen.getByRole('button', { name: 'PV-Annahme: kinderlos mit Zuschlag (4,2 %)' }))
    expect(screen.getByLabelText('PV-Eigenanteil im Ruhestand', { exact: false })).toHaveValue(4.2)
    fireEvent.change(screen.getByLabelText('PV-Eigenanteil im Ruhestand', { exact: false }), { target: { value: '3.8' } })
    expect(screen.getByText(/Aktuelle PV-Annahme: 3,8 %/)).toBeVisible()
    fireEvent.change(screen.getByLabelText('KV-Eigenanteil gesetzliche Rente', { exact: false }), { target: { value: '-1' } })
    expect(screen.getByLabelText('KV-Eigenanteil gesetzliche Rente', { exact: false })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('keeps all-in results until replacement and restores them when disabled', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Details anzeigen' }))
    const baseline = tableValues()
    fireEvent.click(toggle())
    fireEvent.change(status(), { target: { value: 'kvdr' } })
    expect(tableValues()).toEqual(baseline)
    expect(screen.getByRole('alert')).toHaveTextContent('Gesamtabzug noch nicht ersetzt')
    replaceHaircut()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Sonstige Abzüge ohne KV/PV von Pension', { exact: false })).toHaveValue(0)
    expect(screen.queryByLabelText('Vereinfachter Abschlag', { exact: false })).not.toBeInTheDocument()
    expect(tableValues()).toContain('1.050 €')
    expect(tableValues()).toContain('432 €')
    fireEvent.change(screen.getByLabelText('Sonstige Abzüge ohne KV/PV von Pension', { exact: false }), { target: { value: '5' } })
    expect(tableValues()).toContain('600 €')
    expect(tableValues()).toContain('9.918 €')
    fireEvent.click(toggle())
    expect(tableValues()).toEqual(baseline)
    expect(screen.getByLabelText('Vereinfachter Abschlag', { exact: false })).toHaveValue(20)
    fireEvent.click(toggle())
    expect(screen.getByLabelText('Sonstige Abzüge ohne KV/PV von Pension', { exact: false })).toHaveValue(5)
  })

  it('shows default reasons, visible overrides and review incompleteness across status changes', () => {
    render(<Harness initial={{ ...pension, kind: 'rental-income', separateDeductions: { otherRate: 0 } }} />)
    fireEvent.click(toggle())
    fireEvent.change(status(), { target: { value: 'kvdr' } })
    expect(treatment()).toHaveDisplayValue('Statusvorschlag: Nicht einbeziehen')
    fireEvent.click(screen.getByText('Warum? – Pension'))
    expect(screen.getByText(/Miete zählt bei freiwilliger GKV grundsätzlich mit/)).toBeVisible()
    fireEvent.change(treatment(), { target: { value: 'include' } })
    expect(screen.getByText(/Eigene Überschreibung: Einbeziehen/)).toBeVisible()
    fireEvent.change(status(), { target: { value: 'voluntary' } })
    expect(treatment()).toHaveValue('include')
    fireEvent.change(screen.getByLabelText('Kategorie von Pension'), { target: { value: 'other' } })
    expect(screen.getByText(/Eigene Überschreibung: Einbeziehen \(Statusvorschlag: Prüfen\)/)).toBeVisible()
    fireEvent.change(treatment(), { target: { value: 'review' } })
    expect(screen.getByRole('alert')).toHaveTextContent('keine zusätzliche Versicherung eingerechnet')
    fireEvent.change(treatment(), { target: { value: 'default' } })
    expect(treatment()).toHaveDisplayValue('Statusvorschlag: Prüfen')
    fireEvent.change(screen.getByLabelText('KV-Eigenanteil von Pension', { exact: false }), { target: { value: '0' } })
    expect(screen.getByText(/Eigene Satzüberschreibung aktiv/)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Für Pension wieder Referenzannahmen verwenden' }))
    expect(screen.getByLabelText('KV-Eigenanteil von Pension', { exact: false })).toHaveValue(17.5)
  })

  it('protects net amounts even under explicit inclusion and keeps portfolio costs separate', () => {
    render(<Harness initial={{ ...pension, amountBasis: 'net', insuranceTreatment: 'include', kvRateOverride: 1, pvRateOverride: 1 }} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Details anzeigen' }))
    fireEvent.click(toggle())
    fireEvent.change(status(), { target: { value: 'kvdr' } })
    expect(screen.getByText(/Netto ist vollständig verfügbar/)).toBeVisible()
    expect(screen.queryByLabelText('KV-Eigenanteil von Pension', { exact: false })).not.toBeInTheDocument()
    expect(tableValues()).toContain('12.000 €')
    fireEvent.change(screen.getByLabelText('Manuelle monatliche Portfolio-Beitragsbasis, heutige Kaufkraft', { exact: false }), { target: { value: '1000' } })
    expect(tableValues()).toContain('2.028 €')
    expect(tableValues()).toContain('432 €')
    expect(tableValues()).toContain('9.540 €')
    expect(screen.getByText(/Nur eine selbst geschätzte Beitragsbasis ab Rentenbeginn, kein zusätzliches Einkommen/)).toBeVisible()
  })

  it('shows reconcilable detailed totals when portfolio costs exceed income', () => {
    render(<Harness initial={{ ...pension, amountMonthlyToday: 50, amountBasis: 'net' }} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Details anzeigen' }))
    fireEvent.click(toggle())
    fireEvent.change(screen.getByLabelText('Manuelle monatliche Portfolio-Beitragsbasis, heutige Kaufkraft', { exact: false }), { target: { value: '1000' } })
    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent)
    const values = tableValues()
    const displayed = (header: string) => values[headers.indexOf(header)]
    expect(displayed('Einkommen vor Modellabzügen (Brutto + Nettoangaben)')).toBe('600 €')
    expect(displayed('Abzüge gesamt')).toBe('2.460 €')
    expect(displayed('KV-Eigenbeitrag')).toBe('2.028 €')
    expect(displayed('PV-Eigenbeitrag')).toBe('432 €')
    expect(displayed('Verfügbarer Netto-Cashflow')).toBe('-1.860 €')
    expect(displayed('Entnahmelücke')).toBe('37.860 €')
  })
})
