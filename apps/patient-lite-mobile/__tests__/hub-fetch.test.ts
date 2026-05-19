/**
 * Tests for hub-fetch.ts — certificate-pinned, compromise-aware Hub API client.
 *
 * Story 21.5 AC#2: Write operations blocked on compromised devices.
 * Story 21.5 AC#3: All Hub API connections use certificate pinning.
 */
import { Platform } from 'react-native'

// Import hubFetch directly (no resetModules — store must be shared)
import { hubFetch, CompromisedDeviceError } from '@/lib/hub-fetch'
import { useDeviceSecurityStore } from '@/stores/device-security-store'

describe('hubFetch', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    // Reset store to clean device
    useDeviceSecurityStore.setState({
      checked: true,
      isCompromised: false,
      reasons: [],
      checkedAt: '2026-05-12T00:00:00.000Z',
    })
  })

  it('delegates to pinnedFetch for GET requests', async () => {
    const sslPinning = require('react-native-ssl-pinning')
    sslPinning.fetch.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'application/json' },
      bodyString: '{"result":"ok"}',
    })

    const response = await hubFetch('https://hub.example.com/api/test', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer token' },
    })

    expect(response.ok).toBe(true)
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.result).toBe('ok')
  })

  it('allows GET requests on compromised devices', async () => {
    useDeviceSecurityStore.setState({ isCompromised: true, reasons: ['rooted'] })

    const sslPinning = require('react-native-ssl-pinning')
    sslPinning.fetch.mockResolvedValue({
      status: 200,
      headers: {},
      bodyString: '{"data":"read-allowed"}',
    })

    const response = await hubFetch('https://hub.example.com/api/data')

    expect(response.ok).toBe(true)
  })

  it('blocks POST requests on compromised devices', async () => {
    useDeviceSecurityStore.setState({ isCompromised: true, reasons: ['rooted'] })

    await expect(
      hubFetch('https://hub.example.com/api/write', {
        method: 'POST',
        body: '{}',
      }),
    ).rejects.toThrow(CompromisedDeviceError)
  })

  it('blocks PUT requests on compromised devices', async () => {
    useDeviceSecurityStore.setState({ isCompromised: true, reasons: ['rooted'] })

    await expect(
      hubFetch('https://hub.example.com/api/update', {
        method: 'PUT',
        body: '{}',
      }),
    ).rejects.toThrow(CompromisedDeviceError)
  })

  it('blocks DELETE requests on compromised devices', async () => {
    useDeviceSecurityStore.setState({ isCompromised: true, reasons: ['rooted'] })

    await expect(
      hubFetch('https://hub.example.com/api/resource', {
        method: 'DELETE',
      }),
    ).rejects.toThrow(CompromisedDeviceError)
  })

  it('allows POST requests on clean devices', async () => {
    const sslPinning = require('react-native-ssl-pinning')
    sslPinning.fetch.mockResolvedValue({
      status: 200,
      headers: {},
      bodyString: '{"success":true}',
    })

    const response = await hubFetch('https://hub.example.com/api/write', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: 'test' }),
    })

    expect(response.ok).toBe(true)
  })

  it('passes headers through to pinnedFetch', async () => {
    const sslPinning = require('react-native-ssl-pinning')
    sslPinning.fetch.mockResolvedValue({
      status: 200,
      headers: {},
      bodyString: '{}',
    })

    await hubFetch('https://hub.example.com/api', {
      method: 'GET',
      headers: { 'Authorization': 'Bearer test-token', 'X-Custom': 'value' },
    })

    expect(sslPinning.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token',
          'X-Custom': 'value',
        }),
      }),
    )
  })

  it('returns response with ok=false for non-2xx status', async () => {
    const sslPinning = require('react-native-ssl-pinning')
    sslPinning.fetch.mockResolvedValue({
      status: 401,
      headers: {},
      bodyString: '{"error":"unauthorized"}',
    })

    const response = await hubFetch('https://hub.example.com/api')

    expect(response.ok).toBe(false)
    expect(response.status).toBe(401)
  })

  it('blocks POST requests before integrity check completes', async () => {
    // Store not yet checked (initial state)
    useDeviceSecurityStore.setState({
      checked: false,
      isCompromised: false,
      reasons: [],
      checkedAt: null,
    })

    await expect(
      hubFetch('https://hub.example.com/api/write', {
        method: 'POST',
        body: '{}',
      }),
    ).rejects.toThrow(CompromisedDeviceError)
  })

  it('throws TypeError on non-string body', async () => {
    await expect(
      hubFetch('https://hub.example.com/api/write', {
        method: 'POST',
        body: new FormData() as unknown as string,
      }),
    ).rejects.toThrow(TypeError)
  })
})
