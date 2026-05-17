/**
 * Tests for device-security.ts — root/jailbreak detection.
 *
 * Story 21.5 AC#1: Root/jailbreak detection runs on app launch.
 * Story 21.5 AC#2: Compromised devices trigger warning + read-only mode.
 */
import { Platform } from 'react-native'

describe('checkDeviceIntegrity', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.resetModules()
  })

  it('returns clean result when no compromise is detected', async () => {
    const JailMonkey = require('jail-monkey').default
    JailMonkey.isJailBroken.mockReturnValue(false)
    JailMonkey.canMockLocation.mockReturnValue(false)
    JailMonkey.isDebuggedMode.mockReturnValue(false)
    JailMonkey.isOnExternalStorage.mockReturnValue(false)

    const { checkDeviceIntegrity } = require('@/lib/device-security')
    const result = await checkDeviceIntegrity()

    expect(result.isCompromised).toBe(false)
    expect(result.reasons).toEqual([])
  })

  it('detects rooted/jailbroken device', async () => {
    const JailMonkey = require('jail-monkey').default
    JailMonkey.isJailBroken.mockReturnValue(true)
    JailMonkey.canMockLocation.mockReturnValue(false)
    JailMonkey.isDebuggedMode.mockReturnValue(false)

    const { checkDeviceIntegrity } = require('@/lib/device-security')
    const result = await checkDeviceIntegrity()

    expect(result.isCompromised).toBe(true)
    expect(result.reasons).toContain('rooted')
  })

  it('detects mock location', async () => {
    const JailMonkey = require('jail-monkey').default
    JailMonkey.isJailBroken.mockReturnValue(false)
    JailMonkey.canMockLocation.mockReturnValue(true)
    JailMonkey.isDebuggedMode.mockReturnValue(false)

    const { checkDeviceIntegrity } = require('@/lib/device-security')
    const result = await checkDeviceIntegrity()

    expect(result.isCompromised).toBe(true)
    expect(result.reasons).toContain('mock-location')
  })

  it('detects debug mode', async () => {
    const JailMonkey = require('jail-monkey').default
    JailMonkey.isJailBroken.mockReturnValue(false)
    JailMonkey.canMockLocation.mockReturnValue(false)
    JailMonkey.isDebuggedMode.mockReturnValue(true)

    const { checkDeviceIntegrity } = require('@/lib/device-security')
    const result = await checkDeviceIntegrity()

    expect(result.isCompromised).toBe(true)
    expect(result.reasons).toContain('debug-mode')
  })

  it('detects external storage on Android', async () => {
    const originalPlatform = Platform.OS
    Object.defineProperty(Platform, 'OS', { value: 'android', writable: true })

    const JailMonkey = require('jail-monkey').default
    JailMonkey.isJailBroken.mockReturnValue(false)
    JailMonkey.canMockLocation.mockReturnValue(false)
    JailMonkey.isDebuggedMode.mockReturnValue(false)
    JailMonkey.isOnExternalStorage.mockReturnValue(true)

    const { checkDeviceIntegrity } = require('@/lib/device-security')
    const result = await checkDeviceIntegrity()

    expect(result.isCompromised).toBe(true)
    expect(result.reasons).toContain('external-storage')

    Object.defineProperty(Platform, 'OS', { value: originalPlatform, writable: true })
  })

  it('returns multiple reasons when multiple compromises detected', async () => {
    const JailMonkey = require('jail-monkey').default
    JailMonkey.isJailBroken.mockReturnValue(true)
    JailMonkey.canMockLocation.mockReturnValue(true)
    JailMonkey.isDebuggedMode.mockReturnValue(true)

    const { checkDeviceIntegrity } = require('@/lib/device-security')
    const result = await checkDeviceIntegrity()

    expect(result.isCompromised).toBe(true)
    expect(result.reasons).toHaveLength(3)
    expect(result.reasons).toContain('rooted')
    expect(result.reasons).toContain('mock-location')
    expect(result.reasons).toContain('debug-mode')
  })

  it('returns clean result on web platform', async () => {
    const originalPlatform = Platform.OS
    Object.defineProperty(Platform, 'OS', { value: 'web', writable: true })

    const { checkDeviceIntegrity } = require('@/lib/device-security')
    const result = await checkDeviceIntegrity()

    expect(result.isCompromised).toBe(false)
    expect(result.reasons).toEqual([])

    Object.defineProperty(Platform, 'OS', { value: originalPlatform, writable: true })
  })

  it('treats detection library unavailability as compromised in production (fail-closed)', async () => {
    const originalDev = (global as any).__DEV__
    ;(global as any).__DEV__ = false

    jest.mock('jail-monkey', () => {
      throw new Error('Module not found')
    })

    const { checkDeviceIntegrity } = require('@/lib/device-security')
    const result = await checkDeviceIntegrity()

    expect(result.isCompromised).toBe(true)
    expect(result.reasons).toContain('detection-unavailable')

    ;(global as any).__DEV__ = originalDev
  })

  it('passes cleanly in __DEV__ when detection library is unavailable', async () => {
    const originalDev = (global as any).__DEV__
    ;(global as any).__DEV__ = true

    jest.mock('jail-monkey', () => {
      throw new Error('Module not found')
    })

    const { checkDeviceIntegrity } = require('@/lib/device-security')
    const result = await checkDeviceIntegrity()

    expect(result.isCompromised).toBe(false)
    expect(result.reasons).toEqual([])

    ;(global as any).__DEV__ = originalDev
  })
})
