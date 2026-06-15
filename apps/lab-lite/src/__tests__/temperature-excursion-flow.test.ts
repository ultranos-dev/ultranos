import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import {
  getDb,
  putTemperatureLocation,
  getActiveExcursions,
  getOngoingExcursionForLocation,
} from '../lib/db'
import { TemperatureSource, ExcursionSeverity } from '@/types/temperature-monitoring'
import { logReading, getExcursionDuration } from '@/lib/safety/temperature-service'

// Mock audit client
vi.mock('@/lib/audit-client', () => ({
  reportTemperatureEvent: vi.fn(),
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

// Mock enqueueSyncEvent
vi.mock('@/lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db')>()
  return {
    ...actual,
    enqueueSyncEvent: vi.fn(),
  }
})

describe('Temperature Excursion Flow (Integration)', () => {
  const locationId = 'loc-fridge-1'

  beforeEach(async () => {
    const db = getDb()
    await db.temperature_readings.clear()
    await db.temperature_locations.clear()
    await db.temperature_excursions.clear()

    // Seed a fridge location (2-8°C)
    await putTemperatureLocation({
      id: locationId,
      name: 'Reagent Fridge 1',
      minTemp: 2,
      maxTemp: 8,
      type: 'FRIDGE',
      sensorId: null,
    })
  })

  it('logs a normal reading without creating an excursion', async () => {
    const { reading, excursion } = await logReading({
      locationId,
      temperatureCelsius: 5.0,
      source: TemperatureSource.MANUAL,
    })

    expect(reading.temperatureCelsius).toBe(5.0)
    expect(excursion).toBeNull()
  })

  it('creates a WARNING excursion when temperature approaches limit', async () => {
    const { excursion } = await logReading({
      locationId,
      temperatureCelsius: 8.5, // Within 1°C of max limit
      source: TemperatureSource.MANUAL,
    })

    expect(excursion).not.toBeNull()
    expect(excursion!.severity).toBe(ExcursionSeverity.WARNING)
  })

  it('creates a CRITICAL excursion when temperature exceeds limit by > 1°C', async () => {
    const { excursion } = await logReading({
      locationId,
      temperatureCelsius: 12.0, // Exceeds 8°C by more than 1°C
      source: TemperatureSource.MANUAL,
    })

    expect(excursion).not.toBeNull()
    expect(excursion!.severity).toBe(ExcursionSeverity.CRITICAL)
    expect(excursion!.peakTemperature).toBe(12.0)
  })

  it('updates existing excursion with worse peak temperature', async () => {
    // First critical reading
    const { excursion: first } = await logReading({
      locationId,
      temperatureCelsius: 10.0,
      source: TemperatureSource.MANUAL,
    })
    expect(first).not.toBeNull()

    // Second critical reading with higher temp
    const { excursion: second } = await logReading({
      locationId,
      temperatureCelsius: 15.0,
      source: TemperatureSource.MANUAL,
    })
    expect(second).not.toBeNull()
    expect(second!.peakTemperature).toBe(15.0)
    expect(second!.id).toBe(first!.id) // Same excursion
  })

  it('resolves excursion when temperature returns to normal', async () => {
    // Create excursion
    await logReading({
      locationId,
      temperatureCelsius: 12.0,
      source: TemperatureSource.MANUAL,
    })

    // Verify excursion exists
    let ongoing = await getOngoingExcursionForLocation(locationId)
    expect(ongoing).toBeDefined()

    // Normal reading resolves it
    const { excursion } = await logReading({
      locationId,
      temperatureCelsius: 5.0,
      source: TemperatureSource.MANUAL,
    })
    expect(excursion).toBeNull()

    // Verify excursion now has endTime
    ongoing = await getOngoingExcursionForLocation(locationId)
    expect(ongoing).toBeUndefined() // No more ongoing
  })

  it('creates excursion for cold temperature (below min)', async () => {
    const { excursion } = await logReading({
      locationId,
      temperatureCelsius: 0.5, // Below 2°C by > 1°C
      source: TemperatureSource.MANUAL,
    })

    expect(excursion).not.toBeNull()
    expect(excursion!.severity).toBe(ExcursionSeverity.CRITICAL)
  })

  it('getExcursionDuration calculates correctly', () => {
    const now = Date.now()
    const duration = getExcursionDuration({
      id: 'test',
      locationId: 'loc',
      locationName: 'Test',
      startTime: new Date(now - 90 * 60 * 1000).toISOString(), // 90 min ago
      endTime: new Date(now).toISOString(),
      peakTemperature: 10,
      durationMinutes: null,
      severity: ExcursionSeverity.CRITICAL,
      acknowledged: false,
      acknowledgedBy: null,
      affectedReagents: [],
    })
    expect(duration).toBe(90)
  })

  it('getExcursionDuration uses current time when no endTime', () => {
    const duration = getExcursionDuration({
      id: 'test',
      locationId: 'loc',
      locationName: 'Test',
      startTime: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      endTime: null,
      peakTemperature: 10,
      durationMinutes: null,
      severity: ExcursionSeverity.CRITICAL,
      acknowledged: false,
      acknowledgedBy: null,
      affectedReagents: [],
    })
    expect(duration).toBeGreaterThanOrEqual(44)
    expect(duration).toBeLessThanOrEqual(46)
  })
})
