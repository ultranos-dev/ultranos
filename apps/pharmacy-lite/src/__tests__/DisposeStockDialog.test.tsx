import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import { DisposeStockDialog } from '@/components/pharmacy/inventory/DisposeStockDialog'
import type { StockBatch } from '@/lib/inventory/types'

const recordDisposal = vi.fn()
vi.mock('@/lib/inventory/stock-movement', () => ({
  recordDisposal: (...a: unknown[]) => recordDisposal(...a),
}))

const BATCH: StockBatch = {
  id: 'batch-1', catalogItemId: 'cat-1', batchNumber: 'B1', expiryDate: '2020-01-01',
  quantityOnHand: 8, costPrice: 100, sellingPrice: 200, receivedAt: '2026-01-01T00:00:00.000Z',
  status: 'quarantined', locationId: 'default', hlcTimestamp: '2026-01-01T00:00:00.000Z',
}

function renderDialog() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <DisposeStockDialog open onOpenChange={() => {}} batch={BATCH} performedBy="u1" onSaved={() => {}} />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => recordDisposal.mockReset())

describe('DisposeStockDialog', () => {
  it('defaults quantity to full batch and submits reason', async () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('dispose-reason'), { target: { value: 'expired' } })
    fireEvent.click(screen.getByTestId('dispose-submit'))
    await waitFor(() =>
      expect(recordDisposal).toHaveBeenCalledWith(
        expect.objectContaining({ stockBatchId: 'batch-1', quantity: 8, reasonCode: 'expired', performedBy: 'u1' }),
      ),
    )
  })

  it('rejects disposing more than on-hand', async () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('dispose-qty'), { target: { value: '99' } })
    fireEvent.change(screen.getByTestId('dispose-reason'), { target: { value: 'expired' } })
    fireEvent.click(screen.getByTestId('dispose-submit'))
    await waitFor(() => expect(recordDisposal).not.toHaveBeenCalled())
  })
})
