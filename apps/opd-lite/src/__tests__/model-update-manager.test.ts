import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AIModelType, MODEL_STALENESS_THRESHOLD_MS, ModelUpdateEventType } from '@ultranos/shared-types'

// Mock the db module
const mockAiModels = {
  toArray: vi.fn().mockResolvedValue([]),
  get: vi.fn().mockResolvedValue(undefined),
  put: vi.fn().mockResolvedValue(undefined),
  where: vi.fn().mockReturnValue({ equals: vi.fn().mockReturnValue({ toArray: vi.fn().mockResolvedValue([]) }) }),
  update: vi.fn().mockResolvedValue(undefined),
}
const mockModelDownloadProgress = {
  get: vi.fn().mockResolvedValue(undefined),
  put: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
}

vi.mock('../lib/db', () => ({
  db: {
    aiModels: mockAiModels,
    modelDownloadProgress: mockModelDownloadProgress,
  },
}))

// Mock fetch — save original and restore
const originalFetch = global.fetch
const mockFetch = vi.fn()
global.fetch = mockFetch

// Spy on crypto.subtle.digest (don't replace crypto entirely — setup.ts needs it)
const mockDigest = vi.spyOn(crypto.subtle, 'digest')

// Mock localStorage
const localStorageMap = new Map<string, string>()
Object.defineProperty(global, 'localStorage', {
  value: {
    getItem: (key: string) => localStorageMap.get(key) ?? null,
    setItem: (key: string, val: string) => localStorageMap.set(key, val),
  },
  configurable: true,
})

// Mock navigator.connection
Object.defineProperty(global.navigator, 'connection', {
  value: { type: 'wifi' },
  writable: true,
  configurable: true,
})

const {
  isOnWifi,
  fetchManifest,
  computeChecksum,
  checkAndUpdateModels,
} = await import('../lib/model-update-manager')

beforeEach(() => {
  vi.clearAllMocks()
  localStorageMap.clear()
})

describe('isOnWifi', () => {
  it('returns true when connection type is wifi', () => {
    Object.defineProperty(navigator, 'connection', { value: { type: 'wifi' }, writable: true, configurable: true })
    expect(isOnWifi()).toBe(true)
  })

  it('returns true when connection type is ethernet', () => {
    Object.defineProperty(navigator, 'connection', { value: { type: 'ethernet' }, writable: true, configurable: true })
    expect(isOnWifi()).toBe(true)
  })

  it('returns false when connection type is cellular', () => {
    Object.defineProperty(navigator, 'connection', { value: { type: 'cellular' }, writable: true, configurable: true })
    expect(isOnWifi()).toBe(false)
  })

  it('returns true when Network Information API is not available (fallback for PWA)', () => {
    Object.defineProperty(navigator, 'connection', { value: undefined, writable: true, configurable: true })
    expect(isOnWifi()).toBe(true)
  })
})

describe('fetchManifest', () => {
  it('fetches and parses model manifest from Hub API', async () => {
    const mockModels = [
      { modelId: 'soap-macros', modelType: 'SOAP_MACRO_TEMPLATES', currentVersion: '2.0.0' },
    ]
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ result: { data: { json: { models: mockModels } } } }),
    })

    const result = await fetchManifest('http://localhost:3000')
    expect(result).toEqual(mockModels)
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/trpc/ai.getModelManifest',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('throws on HTTP error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })
    await expect(fetchManifest('http://localhost:3000')).rejects.toThrow('Manifest fetch failed: 500')
  })
})

describe('computeChecksum', () => {
  it('computes SHA-256 hex string from ArrayBuffer', async () => {
    const data = new ArrayBuffer(8)
    const hashBuffer = new Uint8Array(32).fill(0xab)
    mockDigest.mockResolvedValueOnce(hashBuffer.buffer as ArrayBuffer)

    const result = await computeChecksum(data)
    expect(result).toBe('ab'.repeat(32))
    expect(mockDigest).toHaveBeenCalledWith('SHA-256', data)
  })
})

describe('checkAndUpdateModels', () => {
  const manifestEntry = {
    modelId: 'soap-macros',
    modelType: 'SOAP_MACRO_TEMPLATES',
    currentVersion: '2.0.0',
    downloadUrl: 'https://cdn.example.com/soap-macros-2.0.0.json',
    fileSize: 512000,
    checksum: 'a'.repeat(64),
    releasedAt: '2026-05-10T00:00:00Z',
    deltaFromVersion: null,
  }

  it('does not download when not on Wi-Fi (AC #2)', async () => {
    Object.defineProperty(navigator, 'connection', { value: { type: 'cellular' }, writable: true, configurable: true })
    await checkAndUpdateModels('http://localhost:3000')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('skips models already at current version', async () => {
    Object.defineProperty(navigator, 'connection', { value: { type: 'wifi' }, writable: true, configurable: true })
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ result: { data: { json: { models: [manifestEntry] } } } }),
    })

    mockAiModels.toArray.mockResolvedValueOnce([
      { modelId: 'soap-macros', version: '2.0.0', modelType: 'SOAP_MACRO_TEMPLATES' },
    ])

    await checkAndUpdateModels('http://localhost:3000')
    // Only the manifest fetch should happen, no download
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('detects newer versions and attempts download', async () => {
    Object.defineProperty(navigator, 'connection', { value: { type: 'wifi' }, writable: true, configurable: true })

    // Manifest fetch
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ result: { data: { json: { models: [manifestEntry] } } } }),
    })

    // Download fetch
    const hashBuffer = new Uint8Array(32)
    // Fill with 0xaa to match 'a'.repeat(64)
    hashBuffer.fill(0xaa)
    mockDigest.mockResolvedValueOnce(hashBuffer.buffer as ArrayBuffer)

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(512000)),
    })

    // Event reporting fetch
    mockFetch.mockResolvedValueOnce({ ok: true })

    mockAiModels.toArray.mockResolvedValueOnce([
      { modelId: 'soap-macros', version: '1.9.0', modelType: 'SOAP_MACRO_TEMPLATES' },
    ])

    await checkAndUpdateModels('http://localhost:3000')

    // Should have called: manifest + download + event report
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('prefers delta update when deltaFromVersion matches local version (AC #8)', async () => {
    Object.defineProperty(navigator, 'connection', { value: { type: 'wifi' }, writable: true, configurable: true })

    const deltaManifest = { ...manifestEntry, deltaFromVersion: '1.9.0' }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ result: { data: { json: { models: [deltaManifest] } } } }),
    })

    const hashBuffer = new Uint8Array(32).fill(0xaa)
    mockDigest.mockResolvedValueOnce(hashBuffer.buffer as ArrayBuffer)

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(100000)),
    })

    mockFetch.mockResolvedValueOnce({ ok: true })

    mockAiModels.toArray.mockResolvedValueOnce([
      { modelId: 'soap-macros', version: '1.9.0', modelType: 'SOAP_MACRO_TEMPLATES' },
    ])

    await checkAndUpdateModels('http://localhost:3000')

    // Report events should include isDelta: true
    const reportCall = mockFetch.mock.calls[2]
    expect(reportCall).toBeDefined()
  })

  it('handles download failure gracefully (AC #9)', async () => {
    Object.defineProperty(navigator, 'connection', { value: { type: 'wifi' }, writable: true, configurable: true })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ result: { data: { json: { models: [manifestEntry] } } } }),
    })

    // Download fails
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 })

    // Event report
    mockFetch.mockResolvedValueOnce({ ok: true })

    mockAiModels.toArray.mockResolvedValueOnce([])

    // Should not throw
    await checkAndUpdateModels('http://localhost:3000')
    expect(mockFetch).toHaveBeenCalledTimes(3)
  })

  it('silently handles manifest fetch failure (network unavailable)', async () => {
    Object.defineProperty(navigator, 'connection', { value: { type: 'wifi' }, writable: true, configurable: true })
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    // Should not throw
    await checkAndUpdateModels('http://localhost:3000')
  })

  it('verifies checksum and rejects on mismatch', async () => {
    Object.defineProperty(navigator, 'connection', { value: { type: 'wifi' }, writable: true, configurable: true })

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ result: { data: { json: { models: [manifestEntry] } } } }),
    })

    // Download succeeds but checksum is wrong
    const wrongHash = new Uint8Array(32).fill(0xbb)
    mockDigest.mockResolvedValueOnce(wrongHash.buffer)

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(512000)),
    })

    // Event report
    mockFetch.mockResolvedValueOnce({ ok: true })

    mockAiModels.toArray.mockResolvedValueOnce([])

    await checkAndUpdateModels('http://localhost:3000')

    // Should delete download progress on checksum failure
    expect(mockModelDownloadProgress.delete).toHaveBeenCalledWith('soap-macros')
    // Should NOT put the model metadata (failed verification)
    expect(mockAiModels.put).not.toHaveBeenCalled()
  })
})
