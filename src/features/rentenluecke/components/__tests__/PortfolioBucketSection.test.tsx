// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { PortfolioBucket } from '../../model/portfolioBuckets'
import { PortfolioBucketSection } from '../InputPanel/PortfolioBucketSection'

describe('PortfolioBucketSection', () => {
  it('adds, retypes, and removes a bucket through its editor callbacks', () => {
    const onAdd = vi.fn()
    const onUpdate = vi.fn()
    const onRemove = vi.fn()
    const initialBuckets: PortfolioBucket[] = [
      { id: 'equity', name: 'Aktien', value: 30_000, role: 'equity', returnSeriesId: 'synthetic-equity-assumption-v1' },
      { id: 'cash', name: 'Cash', value: 10_000, role: 'cash', returnSeriesId: 'synthetic-cash-assumption-v1' },
    ]
    const { rerender } = render(
      <PortfolioBucketSection
        buckets={initialBuckets}
        total={40_000}
        allocation={{ equity: 0.75, bonds: 0, fixed: 0.25 }}
        error={null}
        onUpdate={onUpdate}
        onAdd={onAdd}
        onRemove={onRemove}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Anlage hinzufügen/ }))
    expect(onAdd).toHaveBeenCalledOnce()

    const addedBucket: PortfolioBucket = { id: 'new-bucket', name: 'Neue Anlage', value: 0, role: 'equity', returnSeriesId: 'synthetic-equity-assumption-v1' }
    rerender(
      <PortfolioBucketSection
        buckets={[...initialBuckets, addedBucket]}
        total={40_000}
        allocation={{ equity: 0.75, bonds: 0, fixed: 0.25 }}
        error={null}
        onUpdate={onUpdate}
        onAdd={onAdd}
        onRemove={onRemove}
      />,
    )

    fireEvent.change(screen.getByLabelText('Name von Neue Anlage'), { target: { value: 'Notgroschen' } })
    fireEvent.change(screen.getByLabelText(/^Aktueller Wert von Neue Anlage/), { target: { value: '10000' } })
    fireEvent.change(screen.getByLabelText('Typ von Neue Anlage'), { target: { value: 'cash' } })
    fireEvent.change(screen.getByLabelText('Renditequelle/Proxy von Neue Anlage'), { target: { value: 'synthetic-equity-assumption-v1' } })

    expect(onUpdate).toHaveBeenNthCalledWith(1, 'new-bucket', { name: 'Notgroschen' })
    expect(onUpdate).toHaveBeenNthCalledWith(2, 'new-bucket', { value: 10_000 })
    expect(onUpdate).toHaveBeenNthCalledWith(3, 'new-bucket', { role: 'cash' })
    expect(onUpdate).toHaveBeenNthCalledWith(4, 'new-bucket', { returnSeriesId: 'synthetic-equity-assumption-v1' })

    rerender(
      <PortfolioBucketSection
        buckets={[...initialBuckets, { ...addedBucket, name: 'Notgroschen', value: 10_000, role: 'cash' }]}
        total={50_000}
        allocation={{ equity: 0.6, bonds: 0, fixed: 0.4 }}
        error={null}
        onUpdate={onUpdate}
        onAdd={onAdd}
        onRemove={onRemove}
      />,
    )

    expect(screen.getByLabelText('Portfolio-Zusammenfassung')).toHaveTextContent('Cash 40 %')
    fireEvent.click(screen.getByRole('button', { name: 'Notgroschen entfernen' }))
    expect(onRemove).toHaveBeenCalledWith('new-bucket')
  })
})
