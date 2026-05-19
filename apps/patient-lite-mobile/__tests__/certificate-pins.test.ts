/**
 * Tests for certificate-pins.ts — pin configuration and validation.
 *
 * Story 21.5: Runtime guard prevents placeholder pins in production.
 */

describe('certificate-pins', () => {
  beforeEach(() => {
    jest.resetModules()
  })

  it('has at least 2 pins (leaf + backup)', () => {
    const { HUB_API_PINS } = require('@/config/certificate-pins')

    expect(HUB_API_PINS.length).toBeGreaterThanOrEqual(2)
  })

  it('each pin has a hash and label', () => {
    const { HUB_API_PINS } = require('@/config/certificate-pins')

    for (const pin of HUB_API_PINS) {
      expect(pin.hash).toBeTruthy()
      expect(typeof pin.hash).toBe('string')
      expect(pin.label).toBeTruthy()
      expect(typeof pin.label).toBe('string')
    }
  })

  it('MIN_TLS_VERSION is TLSv1.3', () => {
    const { MIN_TLS_VERSION } = require('@/config/certificate-pins')

    expect(MIN_TLS_VERSION).toBe('TLSv1.3')
  })

  it('validatePins passes in __DEV__ mode (placeholder pins allowed)', () => {
    const originalDev = (global as any).__DEV__
    ;(global as any).__DEV__ = true

    const { validatePins } = require('@/config/certificate-pins')
    expect(() => validatePins()).not.toThrow()

    ;(global as any).__DEV__ = originalDev
  })

  it('placeholder pins have low entropy (would be caught by validatePins in production)', () => {
    // Verify that the current placeholder hashes have < 4 unique characters
    // (the entropy check in validatePins would reject them in production)
    const { HUB_API_PINS } = require('@/config/certificate-pins')

    for (const pin of HUB_API_PINS) {
      const uniqueChars = new Set(pin.hash.replace(/=+$/, '')).size
      expect(uniqueChars).toBeLessThan(4)
    }
  })
})
