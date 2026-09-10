import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import en from '../../messages/en.json'
import { AdjustStockDialog } from '@/components/pharmacy/inventory/AdjustStockDialog'
import type { StockBatch } from '@/lib/inventory/types'

const recordAdjustment = vi.fn()
vi.mock('@/lib/inventory/stock-movement', () => ({
  recordAdjustment: (...a: unknown[]) => recordAdjustment(...a),
}))

const BATCH: StockBatch = {
  id: 'batch-1', catalogItemId: 'cat-1', batchNumber: 'B1', expiryDate: '2030-01-01',
  quantityOnHand: 10, costPrice: 100, sellingPrice: 200, receivedAt: '2026-01-01T00:00:00.000Z',
  status: 'active', locationId: 'default', hlcTimestamp: '2026-01-01T00:00:00.000Z',
}

function renderDialog() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <AdjustStockDialog open onOpenChange={() => {}} batch={BATCH} performedBy="u1" onSaved={() => {}} />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => recordAdjustment.mockReset())

describe('AdjustStockDialog', () => {
  it('submits a new quantity + reason to recordAdjustment', async () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('adjust-new-qty'), { target: { value: '7' } })
    fireEvent.change(screen.getByTestId('adjust-reason'), { target: { value: 'miscount' } })
    fireEvent.click(screen.getByTestId('adjust-submit'))
    await waitFor(() =>
      expect(recordAdjustment).toHaveBeenCalledWith(
        expect.objectContaining({ stockBatchId: 'batch-1', newQuantity: 7, reasonCode: 'miscount', performedBy: 'u1' }),
      ),
    )
  })

  it('blocks submit until a reason is chosen', async () => {
    renderDialog()
    fireEvent.change(screen.getByTestId('adjust-new-qty'), { target: { value: '7' } })
    fireEvent.click(screen.getByTestId('adjust-submit'))
    await waitFor(() => expect(recordAdjustment).not.toHaveBeenCalled())
  })
})
