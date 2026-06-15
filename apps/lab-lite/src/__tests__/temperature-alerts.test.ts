import { describe, it, expect } from 'vitest'
import type { TemperatureExcursion, TemperatureLocation } from '@/types/temperature-monitoring'
import { ExcursionSeverity } from '@/types/temperature-monitoring'
import {
  generateAlert,
  classifySeverity,
  checkEscalation,
} from '@/lib/safety/temperature-alerts'

function makeFridgeLocation(overrides: Partial<TemperatureLocation> = {}): TemperatureLocation {
  return {
    id: 'loc-fridge',
    name: 'Reagent Fridge 1',
    minTemp: 2,
    maxTemp: 8,
    type: 'FRIDGE',
    sensorId: null,
    ...overrides,
  }
}

function makeExcursion(overrides: Partial<TemperatureExcursion> = {}): TemperatureExcursion {
  return {
    id: 'exc-1',
    locationId: 'loc-fridge',
    locationName: 'Reagent Fridge 1',
    startTime: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
    endTime: null,
    peakTemperature: 10,
    durationMinutes: 30,
    severity: ExcursionSeverity.CRITICAL,
    acknowledged: false,
    acknowledgedBy: null,
    affectedReagents: [],
    ...overrides,
  }
}

describe('Temperature Alerts', () => {
  describe('generateAlert', () => {
    it('generates alert message for high temperature excursion', () => {
      const exc = makeExcursion({ peakTemperature: 12 })
      const loc = makeFridgeLocation()
      const alert = generateAlert(exc, loc)

      expect(alert.message).toContain('exceeded')
      expect(alert.message).toContain('8°C')
      expect(alert.message).toContain('Affected reagents may be compromised')
      expect(alert.severity).toBe(ExcursionSeverity.CRITICAL)
    })

    it('generates alert message for low temperature excursion', () => {
      const exc = makeExcursion({ peakTemperature: 0 })
      const loc = makeFridgeLocation()
      const alert = generateAlert(exc, loc)

      expect(alert.message).toContain('fell below')
      expect(alert.message).toContain('2°C')
    })

    it('sets notifyLabManager true for CRITICAL severity', () => {
      const exc = makeExcursion({ severity: ExcursionSeverity.CRITICAL })
      const alert = generateAlert(exc, makeFridgeLocation())
      expect(alert.notifyLabManager).toBe(true)
    })

    it('sets notifyLabManager true for EXTENDED severity', () => {
      const exc = makeExcursion({ severity: ExcursionSeverity.EXTENDED })
      const alert = generateAlert(exc, makeFridgeLocation())
      expect(alert.notifyLabManager).toBe(true)
    })

    it('sets notifyLabManager false for WARNING severity', () => {
      const exc = makeExcursion({ severity: ExcursionSeverity.WARNING })
      const alert = generateAlert(exc, makeFridgeLocation())
      expect(alert.notifyLabManager).toBe(false)
    })
  })

  describe('classifySeverity', () => {
    const loc = makeFridgeLocation() // 2-8°C

    it('returns null for normal temperature', () => {
      expect(classifySeverity(5, loc)).toBeNull()
    })

    it('returns null at exact boundary', () => {
      // Exact boundary (2°C and 8°C) is still within range
      expect(classifySeverity(2, loc)).toBeNull()
      expect(classifySeverity(8, loc)).toBeNull()
    })

    it('returns WARNING when within 1°C of limit (approaching)', () => {
      expect(classifySeverity(1.5, loc)).toBe(ExcursionSeverity.WARNING)
      expect(classifySeverity(8.5, loc)).toBe(ExcursionSeverity.WARNING)
    })

    it('returns CRITICAL when exceeding limit by > 1°C', () => {
      expect(classifySeverity(0, loc)).toBe(ExcursionSeverity.CRITICAL)
      expect(classifySeverity(10, loc)).toBe(ExcursionSeverity.CRITICAL)
    })

    it('returns WARNING at exact boundary crossing (minTemp - 1)', () => {
      // At exactly minTemp (2), it's normal. Below, it's warning
      expect(classifySeverity(1, loc)).toBe(ExcursionSeverity.WARNING)
    })

    it('returns CRITICAL at exactly minTemp - 1 boundary', () => {
      // Below minTemp - 1 (i.e., < 1) is CRITICAL
      expect(classifySeverity(0.9, loc)).toBe(ExcursionSeverity.CRITICAL)
    })
  })

  describe('checkEscalation', () => {
    it('escalates to EXTENDED after 120 minutes', () => {
      const exc = makeExcursion({
        startTime: new Date(Date.now() - 150 * 60 * 1000).toISOString(),
        severity: ExcursionSeverity.CRITICAL,
      })
      expect(checkEscalation(exc)).toBe(ExcursionSeverity.EXTENDED)
    })

    it('does not escalate before 120 minutes', () => {
      const exc = makeExcursion({
        startTime: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
        severity: ExcursionSeverity.CRITICAL,
      })
      expect(checkEscalation(exc)).toBe(ExcursionSeverity.CRITICAL)
    })

    it('keeps EXTENDED if already escalated', () => {
      const exc = makeExcursion({
        startTime: new Date(Date.now() - 200 * 60 * 1000).toISOString(),
        severity: ExcursionSeverity.EXTENDED,
      })
      expect(checkEscalation(exc)).toBe(ExcursionSeverity.EXTENDED)
    })
  })
})
