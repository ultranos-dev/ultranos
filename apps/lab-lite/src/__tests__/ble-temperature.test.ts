import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isBleAvailable, scanForSensors } from '@/lib/safety/ble-temperature'

describe('BLE Temperature', () => {
  describe('isBleAvailable', () => {
    it('returns false when Web Bluetooth is not available', () => {
      // jsdom does not expose navigator.bluetooth
      expect(isBleAvailable()).toBe(false)
    })

    it('returns true when navigator.bluetooth is present', () => {
      // Temporarily mock
      Object.defineProperty(navigator, 'bluetooth', {
        value: {},
        writable: true,
        configurable: true,
      })
      expect(isBleAvailable()).toBe(true)
      // Cleanup
      Object.defineProperty(navigator, 'bluetooth', {
        value: undefined,
        writable: true,
        configurable: true,
      })
    })
  })

  describe('scanForSensors', () => {
    it('returns empty array when BLE is unavailable', async () => {
      const sensors = await scanForSensors()
      expect(sensors).toEqual([])
    })

    it('returns empty array when user cancels device dialog', async () => {
      Object.defineProperty(navigator, 'bluetooth', {
        value: {
          requestDevice: vi.fn().mockRejectedValue(new Error('User cancelled')),
        },
        writable: true,
        configurable: true,
      })

      const sensors = await scanForSensors()
      expect(sensors).toEqual([])

      Object.defineProperty(navigator, 'bluetooth', {
        value: undefined,
        writable: true,
        configurable: true,
      })
    })

    it('returns sensor when device is found', async () => {
      const mockDevice = {
        id: 'device-123',
        name: 'BLE Thermometer',
        gatt: {
          connect: vi.fn(),
        },
      }

      Object.defineProperty(navigator, 'bluetooth', {
        value: {
          requestDevice: vi.fn().mockResolvedValue(mockDevice),
        },
        writable: true,
        configurable: true,
      })

      const sensors = await scanForSensors()
      expect(sensors).toHaveLength(1)
      expect(sensors[0].id).toBe('device-123')
      expect(sensors[0].name).toBe('BLE Thermometer')

      Object.defineProperty(navigator, 'bluetooth', {
        value: undefined,
        writable: true,
        configurable: true,
      })
    })
  })
})
