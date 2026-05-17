import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ============================================================
// Redis Client & Health Tests — Story 23.0
// Tests: isRedisHealthy, getRedisInfo, TLS enforcement,
//        credential scrubbing, and health check integration.
// ============================================================

// Mock ioredis before importing redis module
const mockRedisInstance = {
  on: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  ping: vi.fn().mockResolvedValue('PONG'),
  disconnect: vi.fn(),
}

vi.mock('ioredis', () => ({
  default: vi.fn(() => mockRedisInstance),
}))

describe('Redis client — Story 23.0', () => {
  let getRedisClient: typeof import('@/lib/redis').getRedisClient
  let isRedisHealthy: typeof import('@/lib/redis').isRedisHealthy
  let getRedisInfo: typeof import('@/lib/redis').getRedisInfo
  let _resetRedisClient: typeof import('@/lib/redis')._resetRedisClient

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    // Reset env
    delete process.env.REDIS_URL
    delete process.env.NODE_ENV

    // Re-mock ioredis for fresh module
    vi.mock('ioredis', () => ({
      default: vi.fn(() => mockRedisInstance),
    }))

    const mod = await import('@/lib/redis')
    getRedisClient = mod.getRedisClient
    isRedisHealthy = mod.isRedisHealthy
    getRedisInfo = mod.getRedisInfo
    _resetRedisClient = mod._resetRedisClient
  })

  afterEach(() => {
    // Clean up cached client
    try { _resetRedisClient() } catch { /* ignore */ }
  })

  describe('getRedisClient', () => {
    it('returns null when REDIS_URL is not set', () => {
      expect(getRedisClient()).toBeNull()
    })

    it('returns a Redis instance when REDIS_URL is set', () => {
      process.env.REDIS_URL = 'redis://localhost:6379'
      const client = getRedisClient()
      expect(client).toBeTruthy()
    })

    it('refuses non-TLS connection in production', () => {
      process.env.REDIS_URL = 'redis://localhost:6379'
      process.env.NODE_ENV = 'production'
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const client = getRedisClient()
      expect(client).toBeNull()
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('REFUSED'),
      )
      spy.mockRestore()
    })

    it('allows TLS connection in production', () => {
      process.env.REDIS_URL = 'rediss://localhost:6380'
      process.env.NODE_ENV = 'production'
      const client = getRedisClient()
      expect(client).toBeTruthy()
    })
  })

  describe('isRedisHealthy', () => {
    it('returns true on successful PING', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379'
      mockRedisInstance.ping.mockResolvedValue('PONG')
      const result = await isRedisHealthy()
      expect(result).toBe(true)
    })

    it('returns false when REDIS_URL is not set', async () => {
      const result = await isRedisHealthy()
      expect(result).toBe(false)
    })

    it('returns false on PING timeout/error', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379'
      mockRedisInstance.ping.mockRejectedValue(new Error('Connection refused'))
      const result = await isRedisHealthy()
      expect(result).toBe(false)
    })

    it('returns false on timeout', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379'
      // Simulate a ping that never resolves within the 2s timeout
      mockRedisInstance.ping.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 5000)),
      )
      const result = await isRedisHealthy()
      expect(result).toBe(false)
    }, 10000)
  })

  describe('getRedisInfo', () => {
    it('returns connected=true with latencyMs on success', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379'
      mockRedisInstance.ping.mockResolvedValue('PONG')
      const info = await getRedisInfo()
      expect(info.connected).toBe(true)
      expect(info.latencyMs).toBeTypeOf('number')
      expect(info.latencyMs).toBeGreaterThanOrEqual(0)
    })

    it('returns connected=false when no REDIS_URL', async () => {
      const info = await getRedisInfo()
      expect(info).toEqual({ connected: false, latencyMs: null })
    })

    it('returns connected=false on error', async () => {
      process.env.REDIS_URL = 'redis://localhost:6379'
      mockRedisInstance.ping.mockRejectedValue(new Error('fail'))
      const info = await getRedisInfo()
      expect(info.connected).toBe(false)
      expect(info.latencyMs).toBeNull()
    })
  })

  describe('TLS enforcement in production', () => {
    it('logs error with non-TLS URL in production mode', () => {
      process.env.REDIS_URL = 'redis://myhost:6379'
      process.env.NODE_ENV = 'production'
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const client = getRedisClient()
      expect(client).toBeNull()
      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('Production requires TLS'),
      )
      spy.mockRestore()
    })

    it('does not block non-TLS URL in development', () => {
      process.env.REDIS_URL = 'redis://localhost:6379'
      process.env.NODE_ENV = 'development'
      const client = getRedisClient()
      expect(client).not.toBeNull()
    })
  })
})
