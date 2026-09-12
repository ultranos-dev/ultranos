import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ReceiveStockItemRow, type ReceiveLineItem } from '@/components/pharmacy/inventory/ReceiveStockItemRow'
import type { CatalogItem } from '@/lib/inventory/types'

// next-intl passthrough already set up in setup.ts (returns the key string)
// Override locally to keep assertions readable (key passthrough is fine).

vi.mock('@/components/pharmacy/PriceCard', () => ({
  PriceCard: () => null,
}))

const mockCatalogItem: CatalogItem = {
  id: 'cat-qc-1',
  name: 'Amoxicillin',
  form: 'capsule',
  strength: '500',
  strengthUnit: 'mg',
  packSize: 14,
  category: 'Antibiotics',
  defaultSellingPrice: 1200,
  reorderPoint: 20,
  isActive: true,
  lastSyncedAt: '2026-01-01T00:00:00Z',
  atcCode: 'J01CA04',
}

function makeItem(overrides: Partial<ReceiveLineItem> = {}): ReceiveLineItem {
  return {
    catalogItem: mockCatalogItem,
    batchNumber: 'BATCH-QC',
    lotNumber: '',
    expiryDate: '2028-06-30',
    quantity: 50,
    costPrice: 1000,
    sellingPrice: 1200,
    qcDecision: 'accept',
    heldReason: '',
    ...overrides,
  }
}

describe('ReceiveStockItemRow — QC accept/hold control', () => {
  const onUpdate = vi.fn()
  const onRemove = vi.fn()

  beforeEach(() => {
    onUpdate.mockReset()
    onRemove.mockReset()
  })

  it('renders the qc-decision select for index 0', () => {
    render(
      <ReceiveStockItemRow
        item={makeItem()}
        index={0}
        currencyMinorUnits={2}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />,
    )
    expect(screen.getByTestId('qc-decision-0')).toBeTruthy()
  })

  it('defaults qc-decision to accept and does NOT show heldReason input', () => {
    render(
      <ReceiveStockItemRow
        item={makeItem({ qcDecision: 'accept' })}
        index={0}
        currencyMinorUnits={2}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />,
    )
    const select = screen.getByTestId('qc-decision-0') as HTMLSelectElement
    expect(select.value).toBe('accept')
    expect(screen.queryByTestId('qc-held-reason-0')).toBeNull()
  })

  it('switching to hold reveals the qc-held-reason input', () => {
    const { rerender } = render(
      <ReceiveStockItemRow
        item={makeItem({ qcDecision: 'accept' })}
        index={0}
        currencyMinorUnits={2}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />,
    )

    // Simulate selecting "hold" — calls onUpdate
    fireEvent.change(screen.getByTestId('qc-decision-0'), { target: { value: 'hold' } })
    expect(onUpdate).toHaveBeenCalledWith(0, { qcDecision: 'hold' })

    // Re-render with hold state to verify held-reason appears
    rerender(
      <ReceiveStockItemRow
        item={makeItem({ qcDecision: 'hold', heldReason: '' })}
        index={0}
        currencyMinorUnits={2}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />,
    )
    expect(screen.getByTestId('qc-held-reason-0')).toBeTruthy()
  })

  it('heldReason input calls onUpdate when changed', () => {
    render(
      <ReceiveStockItemRow
        item={makeItem({ qcDecision: 'hold', heldReason: '' })}
        index={0}
        currencyMinorUnits={2}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />,
    )
    fireEvent.change(screen.getByTestId('qc-held-reason-0'), { target: { value: 'Damaged packaging' } })
    expect(onUpdate).toHaveBeenCalledWith(0, { heldReason: 'Damaged packaging' })
  })

  it('does not render qc-held-reason when decision is accept', () => {
    render(
      <ReceiveStockItemRow
        item={makeItem({ qcDecision: 'accept' })}
        index={0}
        currencyMinorUnits={2}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />,
    )
    expect(screen.queryByTestId('qc-held-reason-0')).toBeNull()
  })

  it('uses the correct index for data-testid attributes (index 2)', () => {
    render(
      <ReceiveStockItemRow
        item={makeItem({ qcDecision: 'hold', heldReason: 'reason' })}
        index={2}
        currencyMinorUnits={2}
        onUpdate={onUpdate}
        onRemove={onRemove}
      />,
    )
    expect(screen.getByTestId('qc-decision-2')).toBeTruthy()
    expect(screen.getByTestId('qc-held-reason-2')).toBeTruthy()
  })
})
