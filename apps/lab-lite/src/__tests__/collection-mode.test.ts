import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'

import { getDb } from '../lib/db'
import { isCollectionOnlyMode, setCurrentLocationId, getCurrentLocationId } from '../lib/collection-mode'
import type { LabLocation } from '../types/lab-network'

function makeLocation(overrides: Partial<LabLocation> = {}): LabLocation {
  const now = new Date().toISOString()
  return {
    id: 'loc-001',
    name: 'Main Lab',
    type: 'main',
    mode: 'full',
    status: 'active',
    settings: {},
    meta: { lastUpdated: now, versionId: '1' },
    _ultranos: { createdAt: now, hlcTimestamp: 'hlc-ts' },
    ...overrides,
  }
}

describe('isCollectionOnlyMode', () => {
  beforeEach(async () => {
    localStorage.clear()
    const db = getDb()
    await db.lab_locations.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('returns false when no location set', async () => {
    // No location ID in localStorage
    const result = await isCollectionOnlyMode()
    expect(result).toBe(false)
  })

  it('returns false for full-mode location', async () => {
    const db = getDb()
    const location = makeLocation({ id: 'loc-full', mode: 'full' })
    await db.lab_locations.put(location)
    localStorage.setItem('ultranos_current_location_id', 'loc-full')

    const result = await isCollectionOnlyMode()
    expect(result).toBe(false)
  })

  it('returns true for collection-only location', async () => {
    const db = getDb()
    const location = makeLocation({ id: 'loc-coll', mode: 'collection-only' })
    await db.lab_locations.put(location)
    localStorage.setItem('ultranos_current_location_id', 'loc-coll')

    const result = await isCollectionOnlyMode()
    expect(result).toBe(true)
  })
})

describe('setCurrentLocationId / getCurrentLocationId round-trip', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it('stores and retrieves the location ID correctly', () => {
    expect(getCurrentLocationId()).toBeNull()

    setCurrentLocationId('loc-abc-123')
    const retrieved = getCurrentLocationId()

    expect(retrieved).toBe('loc-abc-123')
  })
})
