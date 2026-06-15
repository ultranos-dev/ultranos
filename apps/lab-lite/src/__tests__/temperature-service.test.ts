import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import {
  getDb,
  addTemperatureReading,
  getReadingsByLocation,
  getReadingsByDateRange,
  getTemperatureLocations,
  putTemperatureLocation,
  deleteTemperatureLocation,
  addExcursion,
  getActiveExcursions,
  getOngoingExcursionForLocation,
  acknowledgeExcursion,
  getExcursionsByDateRange,
} from '../lib/db'
import type {
  TemperatureReading,
  TemperatureLocation,
  TemperatureExcursion,
} from '@/types/temperature-monitoring'
import { TemperatureSource, ExcursionSeverity } from '@/types/temperature-monitoring'

// Mock audit client
vi.mock('@/lib/audit-client', () => ({
  reportTemperatureEvent: vi.fn(),
  reportWasteEvent: vi.fn(),
}))

// Mock hlc
vi.mock('@/lib/hlc', () => ({
  hlc: { now: () => ({ wallMs: Date.now(), counter: 0, nodeId: 'test-node' }) },
  serializeHlc: () => 'hlc-test-timestamp',
}))

// Mock auth session store
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({ session: { userId: 'test-user', labRole: 'LAB_TECH' } }),
  },
}))

// Mock enqueueSyncEvent to avoid unintended side effects
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  return {
    ...actual,
    enqueueSyncEvent: vi.fn(),
  }
})

function makeLocation(overrides: Partial<TemperatureLocation> = {}): TemperatureLocation {
  return {
    id: crypto.randomUUID(),
    name: 'Reagent Fridge 1',
    minTemp: 2,
    maxTemp: 8,
    type: 'FRIDGE',
    sensorId: null,
    ...overrides,
  }
}

function makeReading(overrides: Partial<TemperatureReading> = {}): TemperatureReading {
  return {
    id: crypto.randomUUID(),
    locationId: 'loc-1',
    locationName: 'Reagent Fridge 1',
    temperatureCelsius: 5.0,
    timestamp: new Date().toISOString(),
    source: TemperatureSource.MANUAL,
    sensorId: null,
    recordedBy: 'test-user',
    hlcTimestamp: 'hlc-test',
    ...overrides,
  }
}

function makeExcursion(overrides: Partial<TemperatureExcursion> = {}): TemperatureExcursion {
  return {
    id: crypto.randomUUID(),
    locationId: 'loc-1',
    locationName: 'Reagent Fridge 1',
    startTime: new Date().toISOString(),
    endTime: null,
    peakTemperature: 10,
    durationMinutes: null,
    severity: ExcursionSeverity.CRITICAL,
    acknowledged: false,
    acknowledgedBy: null,
    affectedReagents: [],
    ...overrides,
  }
}

describe('Temperature Monitoring DB Helpers', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.temperature_readings.clear()
    await db.temperature_locations.clear()
    await db.temperature_excursions.clear()
  })

  describe('Temperature Locations', () => {
    it('creates and retrieves a location', async () => {
      const loc = makeLocation()
      await putTemperatureLocation(loc)
      const all = await getTemperatureLocations()
      expect(all).toHaveLength(1)
      expect(all[0].name).toBe('Reagent Fridge 1')
    })

    it('upserts an existing location', async () => {
      const loc = makeLocation()
      await putTemperatureLocation(loc)
      await putTemperatureLocation({ ...loc, name: 'Updated Name' })
      const all = await getTemperatureLocations()
      expect(all).toHaveLength(1)
      expect(all[0].name).toBe('Updated Name')
    })

    it('deletes a location', async () => {
      const loc = makeLocation()
      await putTemperatureLocation(loc)
      await deleteTemperatureLocation(loc.id)
      const all = await getTemperatureLocations()
      expect(all).toHaveLength(0)
    })
  })

  describe('Temperature Readings', () => {
    it('adds and retrieves readings by location', async () => {
      const r1 = makeReading({ locationId: 'loc-1', temperatureCelsius: 5.0 })
      const r2 = makeReading({ locationId: 'loc-1', temperatureCelsius: 6.0 })
      const r3 = makeReading({ locationId: 'loc-2', temperatureCelsius: 20.0 })

      await addTemperatureReading(r1)
      await addTemperatureReading(r2)
      await addTemperatureReading(r3)

      const loc1Readings = await getReadingsByLocation('loc-1')
      expect(loc1Readings).toHaveLength(2)

      const loc2Readings = await getReadingsByLocation('loc-2')
      expect(loc2Readings).toHaveLength(1)
    })

    it('retrieves readings by date range', async () => {
      const pastDate = new Date('2025-01-01T00:00:00Z').toISOString()
      const recentDate = new Date().toISOString()

      const old = makeReading({ timestamp: pastDate })
      const recent = makeReading({ timestamp: recentDate })
      await addTemperatureReading(old)
      await addTemperatureReading(recent)

      const rangeReadings = await getReadingsByDateRange(
        new Date('2024-12-31').toISOString(),
        new Date('2025-01-02').toISOString(),
      )
      expect(rangeReadings).toHaveLength(1)
      expect(rangeReadings[0].id).toBe(old.id)
    })
  })

  describe('Temperature Excursions', () => {
    it('creates and retrieves active excursions', async () => {
      const exc = makeExcursion()
      await addExcursion(exc)
      const active = await getActiveExcursions()
      expect(active).toHaveLength(1)
      expect(active[0].severity).toBe(ExcursionSeverity.CRITICAL)
    })

    it('finds ongoing excursion for a location', async () => {
      const exc = makeExcursion({ locationId: 'loc-1', endTime: null })
      await addExcursion(exc)

      const ongoing = await getOngoingExcursionForLocation('loc-1')
      expect(ongoing).toBeDefined()
      expect(ongoing!.id).toBe(exc.id)

      const noOngoing = await getOngoingExcursionForLocation('loc-999')
      expect(noOngoing).toBeUndefined()
    })

    it('acknowledges an excursion', async () => {
      const exc = makeExcursion()
      await addExcursion(exc)

      await acknowledgeExcursion(exc.id, 'manager-1', ['Reagent A', 'Reagent B'])

      const updated = await getDb().temperature_excursions.get(exc.id)
      expect(updated!.acknowledged).toBe(true)
      expect(updated!.acknowledgedBy).toBe('manager-1')
      expect(updated!.affectedReagents).toEqual(['Reagent A', 'Reagent B'])
    })

    it('retrieves excursions by date range', async () => {
      const exc = makeExcursion({ startTime: '2025-06-01T10:00:00Z' })
      await addExcursion(exc)

      const found = await getExcursionsByDateRange('2025-06-01T00:00:00Z', '2025-06-02T00:00:00Z')
      expect(found).toHaveLength(1)

      const notFound = await getExcursionsByDateRange('2025-07-01T00:00:00Z', '2025-07-02T00:00:00Z')
      expect(notFound).toHaveLength(0)
    })
  })
})
