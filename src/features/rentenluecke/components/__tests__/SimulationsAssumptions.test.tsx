// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SimulationsAssumptions } from '../InputPanel/SimulationsAssumptions'

describe('SimulationsAssumptions', () => {
  it('renders the default count and reports changes', () => {
    const onChange = vi.fn()
    render(<SimulationsAssumptions simulations={1000} onChange={onChange} />)
    const select = screen.getByLabelText('Anzahl simulierter Verläufe (Monte Carlo)') as HTMLSelectElement
    expect(select.value).toBe('1000')
    fireEvent.change(select, { target: { value: '250' } })
    expect(onChange).toHaveBeenCalledWith(250)
  })

  it('shows a non-standard persisted count as an extra option', () => {
    render(<SimulationsAssumptions simulations={137} onChange={() => {}} />)
    const select = screen.getByLabelText('Anzahl simulierter Verläufe (Monte Carlo)') as HTMLSelectElement
    expect(select.value).toBe('137')
    expect(screen.getByRole('option', { name: '137' })).toBeInTheDocument()
  })

  it('explains the tradeoff and the reference-path independence', () => {
    render(<SimulationsAssumptions simulations={1000} onChange={() => {}} />)
    expect(screen.getByText(/insbesondere die P10-Schwelle wird bei kleinen Anzahlen ungenauer/i)).toBeInTheDocument()
    expect(screen.getByText(/Referenzpfad \(Planwert\) und die benötigte Kapitalsuche sind davon unabhängig/i)).toBeInTheDocument()
  })
})
