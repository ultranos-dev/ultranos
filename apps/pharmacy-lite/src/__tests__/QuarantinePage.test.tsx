import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QuarantinePage } from '@/components/pharmacy/inventory/QuarantinePage'

vi.mock('next-intl', () => ({ useTranslations: () => (k: string) => k }))
const getQuarantinedBatches = vi.fn()
const releaseFromQuarantine = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/inventory/qc-service', () => ({
  getQuarantinedBatches: () => getQuarantinedBatches(),
  releaseFromQuarantine: (...a: unknown[]) => releaseFromQuarantine(...a),
  BatchNotQuarantinedError: class extends Error {},
}))
vi.mock('@/lib/inventory/stock-movement', () => ({ recordDisposal: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/stores/auth-session-store', () => ({ useAuthSessionStore: Object.assign((sel: (s: unknown) => unknown) => sel({ session: { userId: 'u1', practitionerId: 'u1' } }), { getState: () => ({ session: { userId: 'u1', practitionerId: 'u1' } }) }) }))
vi.mock('@/lib/db', () => ({ db: {
  pharmacySettings: { toCollection: () => ({ first: async () => ({ currency: 'AFN', currencyMinorUnits: 2 }) }) },
  catalogItems: { where: () => ({ anyOf: () => ({ toArray: async () => [{ id: 'c1', name: 'Amoxicillin' }] }) }) },
} }))

beforeEach(() => { getQuarantinedBatches.mockReset(); releaseFromQuarantine.mockClear() })

describe('QuarantinePage', () => {
  it('lists a quarantined batch and releases it', async () => {
    getQuarantinedBatches.mockResolvedValue([{ id: 'b1', catalogItemId: 'c1', batchNumber: 'B1', quantityOnHand: 10, expiryDate: '2027-01-01', heldReason: 'damaged', receivedAt: '2026-01-01T00:00:00.000Z', status: 'quarantined' }])
    render(<QuarantinePage />)
    expect(await screen.findByText('B1')).toBeInTheDocument()
    expect(screen.getByText('damaged')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('release-batch-b1'))
    await waitFor(() => expect(releaseFromQuarantine).toHaveBeenCalledWith('b1', 'u1'))
  })
  it('shows the empty state when nothing is quarantined', async () => {
    getQuarantinedBatches.mockResolvedValue([])
    render(<QuarantinePage />)
    expect(await screen.findByText('quarantineEmpty')).toBeInTheDocument()
  })
})
