import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

const loadLocations = vi.fn(async () => {})
const syncLocationsFromHub = vi.fn(async (_signal?: AbortSignal) => ({ locationsSynced: 0, lastSyncedAt: 'h' }))
vi.mock('@/stores/location-store', () => ({ useLocationStore: { getState: () => ({ loadLocations }) } }))
vi.mock('@/lib/inventory/location-sync', () => ({ syncLocationsFromHub: (signal?: AbortSignal) => syncLocationsFromHub(signal) }))

import { useLocationSync } from '@/hooks/useLocationSync'

beforeEach(() => { loadLocations.mockClear(); syncLocationsFromHub.mockClear() })

describe('useLocationSync', () => {
  it('loads the cache on mount and pulls when online', async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
    renderHook(() => useLocationSync())
    await waitFor(() => expect(loadLocations).toHaveBeenCalled())
    await waitFor(() => expect(syncLocationsFromHub).toHaveBeenCalled())
  })
  it('loads the cache but skips the pull when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
    renderHook(() => useLocationSync())
    await waitFor(() => expect(loadLocations).toHaveBeenCalled())
    expect(syncLocationsFromHub).not.toHaveBeenCalled()
  })
})
