import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'

// next-intl is mocked globally in setup.ts (returns key strings)

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ session: { userId: 'u1' } }),
}))

vi.mock('@/stores/location-store', () => ({
  useLocationStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ locations: [], currentLocationId: null }),
}))

vi.mock('@/lib/inventory/resolve-write-location', () => ({
  resolveWriteLocation: vi.fn().mockReturnValue('default'),
}))

const { mockGetTransfers } = vi.hoisted(() => ({
  mockGetTransfers: vi.fn(),
}))

vi.mock('@/lib/transfers/transfer-service', () => ({
  getTransfers: mockGetTransfers,
  approveTransfer: vi.fn(),
  shipTransfer: vi.fn(),
  receiveTransfer: vi.fn(),
  cancelTransfer: vi.fn(),
}))

import { TransfersPage } from '@/components/pharmacy/transfers/TransfersPage'

describe('TransfersPage — 4-state loading (loading → error → empty → data)', () => {
  beforeEach(() => {
    mockGetTransfers.mockReset()
  })

  it('shows loading state while transfers are fetching', async () => {
    let resolve!: (v: unknown[]) => void
    mockGetTransfers.mockReturnValueOnce(new Promise((res) => { resolve = res }))

    render(<TransfersPage />)

    // Loading state visible immediately
    expect(screen.getByText('loading')).toBeInTheDocument()
    // Empty state must NOT appear while loading
    expect(screen.queryByText('noTransfers')).toBeNull()

    await act(async () => { resolve([]) })
    // After load settles with empty list the genuine empty state appears
    await waitFor(() => expect(screen.getByText('noTransfers')).toBeInTheDocument())
  })

  it('shows loadError state (not the empty state) when getTransfers rejects', async () => {
    mockGetTransfers.mockRejectedValueOnce(new Error('Network error'))

    render(<TransfersPage />)

    await waitFor(() => expect(screen.getByText('loadError')).toBeInTheDocument())
    // Empty state must NOT appear on error
    expect(screen.queryByText('noTransfers')).toBeNull()
  })

  it('shows transfer data when getTransfers resolves with items', async () => {
    const transfer = {
      id: 't1',
      status: 'pending',
      fromLocationId: 'loc1',
      fromLocationName: 'Pharmacy A',
      toLocationId: 'loc2',
      toLocationName: 'Pharmacy B',
      requestedById: 'u1',
      requestedAt: new Date().toISOString(),
      items: [{ catalogItemId: 'ci1', catalogItemName: 'Amoxicillin', quantity: 10 }],
    }
    mockGetTransfers.mockResolvedValueOnce([transfer])

    render(<TransfersPage />)

    await waitFor(() => expect(screen.getByText('Pharmacy A')).toBeInTheDocument())
    expect(screen.queryByText('noTransfers')).toBeNull()
    expect(screen.queryByText('loadError')).toBeNull()
  })
})
