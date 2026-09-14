import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db'
import { useLocationStore } from '@/stores/location-store'
import { ALL_LOCATIONS, DEFAULT_LOCATION_ID } from '@/lib/inventory/types'

beforeEach(async () => {
  await db.delete(); await db.open()
  useLocationStore.setState({ locations: [], currentLocationId: '' })
})

const row = (id: string, isPrimary = false, isActive = true) => ({ id, facilityId: 'f1', name: id, kind: 'store' as const, isPrimary, isActive, lastSyncedAt: 'h' })

describe('useLocationStore', () => {
  it('loadLocations defaults the selection to the primary', async () => {
    await db.stockLocations.bulkPut([row('main', true), row('fridge')])
    await useLocationStore.getState().loadLocations()
    expect(useLocationStore.getState().locations.map((l) => l.id).sort()).toEqual(['fridge', 'main'])
    expect(useLocationStore.getState().currentLocationId).toBe('main')
  })
  it('defaults to the DEFAULT fallback when the cache is empty', async () => {
    await useLocationStore.getState().loadLocations()
    expect(useLocationStore.getState().currentLocationId).toBe(DEFAULT_LOCATION_ID)
  })
  it('re-defaults a now-invalid current id to the primary', async () => {
    await db.stockLocations.bulkPut([row('main', true)])
    useLocationStore.setState({ currentLocationId: 'ghost' })
    await useLocationStore.getState().loadLocations()
    expect(useLocationStore.getState().currentLocationId).toBe('main')
  })
  it('holds the ALL sentinel when set', () => {
    useLocationStore.getState().setCurrentLocation(ALL_LOCATIONS)
    expect(useLocationStore.getState().currentLocationId).toBe(ALL_LOCATIONS)
  })
})
