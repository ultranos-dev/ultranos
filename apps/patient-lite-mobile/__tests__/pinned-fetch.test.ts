/**
 * Tests for pinned-fetch.ts — certificate-pinned HTTP client.
 *
 * Story 21.5 AC#3: Certificate pinning enforced on Hub API connections.
 * Valid cert → passes, wrong cert → rejects.
 */
import { Platform } from 'react-native'

describe('pinnedFetch', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.resetModules()
  })

  it('returns response on successful pinned connection', async () => {
    const sslPinning = require('react-native-ssl-pinning')
    sslPinning.fetch.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'application/json' },
      bodyString: '{"result":"ok"}',
    })

    const { pinnedFetch } = require('@/lib/pinned-fetch')
    const response = await pinnedFetch('https://hub.example.com/api/trpc/test')

    expect(response.status).toBe(200)
    const data = await response.json<{ result: string }>()
    expect(data.result).toBe('ok')
  })

  it('passes certificate pins to ssl pinning library', async () => {
    const sslPinning = require('react-native-ssl-pinning')
    sslPinning.fetch.mockResolvedValue({
      status: 200,
      headers: {},
      bodyString: '{}',
    })

    const { pinnedFetch } = require('@/lib/pinned-fetch')
    await pinnedFetch('https://hub.example.com/api', { method: 'POST', body: '{}' })

    expect(sslPinning.fetch).toHaveBeenCalledWith(
      'https://hub.example.com/api',
      expect.objectContaining({
        method: 'POST',
        body: '{}',
        sslPinning: expect.objectContaining({
          certs: expect.any(Array),
        }),
      }),
    )

    // Verify at least 2 pins (leaf + backup)
    const callArgs = sslPinning.fetch.mock.calls[0][1]
    expect(callArgs.sslPinning.certs.length).toBeGreaterThanOrEqual(2)
  })

  it('throws CertificatePinningError on SSL pinning failure', async () => {
    const sslPinning = require('react-native-ssl-pinning')
    sslPinning.fetch.mockRejectedValue(new Error('SSL certificate verification failed'))

    const { pinnedFetch, CertificatePinningError } = require('@/lib/pinned-fetch')

    await expect(
      pinnedFetch('https://hub.example.com/api'),
    ).rejects.toThrow(CertificatePinningError)
  })

  it('throws CertificatePinningError on certificate mismatch', async () => {
    const sslPinning = require('react-native-ssl-pinning')
    sslPinning.fetch.mockRejectedValue(new Error('pin verification failed'))

    const { pinnedFetch, CertificatePinningError } = require('@/lib/pinned-fetch')

    await expect(
      pinnedFetch('https://hub.example.com/api'),
    ).rejects.toThrow(CertificatePinningError)
  })

  it('wraps all sslFetch errors as CertificatePinningError (fail-closed)', async () => {
    const sslPinning = require('react-native-ssl-pinning')
    sslPinning.fetch.mockRejectedValue(new Error('Network timeout'))

    const { pinnedFetch, CertificatePinningError } = require('@/lib/pinned-fetch')

    await expect(
      pinnedFetch('https://hub.example.com/api'),
    ).rejects.toThrow(CertificatePinningError)
  })

  it('falls back to standard fetch on web platform', async () => {
    const originalPlatform = Platform.OS
    Object.defineProperty(Platform, 'OS', { value: 'web', writable: true })

    // Mock global fetch for web fallback
    const mockResponse = {
      status: 200,
      text: jest.fn().mockResolvedValue('{"data":"web"}'),
      headers: new Map([['content-type', 'application/json']]),
    }
    ;(global as any).fetch = jest.fn().mockResolvedValue(mockResponse)

    const { pinnedFetch } = require('@/lib/pinned-fetch')
    const response = await pinnedFetch('https://hub.example.com/api')

    expect(response.status).toBe(200)
    expect(require('react-native-ssl-pinning').fetch).not.toHaveBeenCalled()

    Object.defineProperty(Platform, 'OS', { value: originalPlatform, writable: true })
  })

  it('passes custom headers through to the pinned fetch', async () => {
    const sslPinning = require('react-native-ssl-pinning')
    sslPinning.fetch.mockResolvedValue({
      status: 200,
      headers: {},
      bodyString: '{}',
    })

    const { pinnedFetch } = require('@/lib/pinned-fetch')
    await pinnedFetch('https://hub.example.com/api', {
      headers: { Authorization: 'Bearer test-token' },
    })

    expect(sslPinning.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
        }),
      }),
    )
  })
})
