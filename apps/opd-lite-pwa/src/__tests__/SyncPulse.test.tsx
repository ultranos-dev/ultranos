import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useFulfillmentStore } from '@/stores/fulfillment-store'
import { SyncPulse } from '@/components/pharmacy/SyncPulse'
import { db } from '@/lib/db'

// Mock fetch to prevent unhandled rejections
vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
  ok: true,
  json: async () => ({ result: { data: { json: { success: true } } } }),
}))

beforeEach(async () => {
  useFulfillmentStore.getState().reset()
  await db.delete()
  await db.open()
})

describe('SyncPulse', () => {
  it('renders green pulse when no pending sync items', () => {
    render(<SyncPulse />)

    const pulse = screen.getByTestId('sync-pulse')
    expect(pulse).toBeInTheDocument()
    expect(pulse.className).toContain('green')
  })

  it('renders amber pulse when fulfillment sync is pending (AC 4)', () => {
    // Simulate pending sync state
    useFulfillmentStore.setState({
      syncStatus: { isPending: true, pendingCount: 2, lastSyncResult: null },
    })

    render(<SyncPulse />)

    const pulse = screen.getByTestId('sync-pulse')
    expect(pulse.className).toContain('amber')
  })

  it('renders amber when last sync result was queued (offline fallback)', () => {
    useFulfillmentStore.setState({
      syncStatus: {
        isPending: false,
        pendingCount: 0,
        lastSyncResult: { synced: false, queued: true },
      },
    })

    render(<SyncPulse />)

    const pulse = screen.getByTestId('sync-pulse')
    expect(pulse.className).toContain('amber')
  })

  it('returns to green when sync completes successfully', () => {
    useFulfillmentStore.setState({
      syncStatus: {
        isPending: false,
        pendingCount: 0,
        lastSyncResult: { synced: true, queued: false },
      },
    })

    render(<SyncPulse />)

    const pulse = screen.getByTestId('sync-pulse')
    expect(pulse.className).toContain('green')
  })

  it('shows pending count when items are being synced', () => {
    useFulfillmentStore.setState({
      syncStatus: { isPending: true, pendingCount: 3, lastSyncResult: null },
    })

    render(<SyncPulse />)

    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('has accessible label describing sync status', () => {
    render(<SyncPulse />)

    const pulse = screen.getByTestId('sync-pulse')
    expect(pulse.getAttribute('aria-label')).toBeTruthy()
  })
})
