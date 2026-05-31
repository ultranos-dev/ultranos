import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { TemperatureReading } from '@/types/temperature-monitoring'
import { TemperatureSource } from '@/types/temperature-monitoring'
import { getNextPromptTime } from '@/lib/safety/temperature-prompts'

function makeReading(overrides: Partial<TemperatureReading> = {}): TemperatureReading {
  return {
    id: crypto.randomUUID(),
    locationId: 'loc-1',
    locationName: 'Fridge 1',
    temperatureCelsius: 5.0,
    timestamp: new Date().toISOString(),
    source: TemperatureSource.MANUAL,
    sensorId: null,
    recordedBy: 'test-user',
    hlcTimestamp: 'hlc-test',
    ...overrides,
  }
}

describe('Temperature Prompts', () => {
  describe('getNextPromptTime', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('returns 8:00 AM prompt when no last reading and before morning window', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 4, 30, 6, 0)) // 6:00 AM

      const nextPrompt = getNextPromptTime(null)
      expect(nextPrompt.getHours()).toBe(8)
    })

    it('returns 2:00 PM prompt when no last reading and after morning window', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 4, 30, 11, 0)) // 11:00 AM

      const nextPrompt = getNextPromptTime(null)
      expect(nextPrompt.getHours()).toBe(14)
    })

    it('returns next morning when no last reading and after both windows', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 4, 30, 17, 0)) // 5:00 PM

      const nextPrompt = getNextPromptTime(null)
      expect(nextPrompt.getHours()).toBe(8)
      expect(nextPrompt.getDate()).toBe(31) // Next day
    })

    it('returns afternoon prompt when last reading was this morning', () => {
      vi.useFakeTimers()
      const now = new Date(2026, 4, 30, 9, 0)
      vi.setSystemTime(now)

      const lastReading = makeReading({
        timestamp: new Date(2026, 4, 30, 8, 30).toISOString(),
      })

      const nextPrompt = getNextPromptTime(lastReading)
      expect(nextPrompt.getHours()).toBe(14)
    })

    it('returns next morning when last reading was this afternoon', () => {
      vi.useFakeTimers()
      const now = new Date(2026, 4, 30, 15, 0)
      vi.setSystemTime(now)

      const lastReading = makeReading({
        timestamp: new Date(2026, 4, 30, 14, 30).toISOString(),
      })

      const nextPrompt = getNextPromptTime(lastReading)
      expect(nextPrompt.getHours()).toBe(8)
      expect(nextPrompt.getDate()).toBe(31)
    })

    it('returns morning prompt when last reading was yesterday', () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date(2026, 4, 30, 7, 0))

      const lastReading = makeReading({
        timestamp: new Date(2026, 4, 29, 14, 0).toISOString(),
      })

      const nextPrompt = getNextPromptTime(lastReading)
      expect(nextPrompt.getHours()).toBe(8)
      expect(nextPrompt.getDate()).toBe(30)
    })
  })
})
