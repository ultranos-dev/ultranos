import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Store original env
const originalEnv = { ...process.env }

describe('scanFile', () => {
  beforeEach(() => {
    vi.resetModules()
    // Clear ClamAV env vars
    delete process.env.CLAMAV_HOST
    delete process.env.CLAMAV_PORT
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('returns deferred status when CLAMAV_HOST is not set', async () => {
    const { scanFile } = await import('../lib/virus-scanner')
    const buffer = Buffer.from('test file content')

    const result = await scanFile(buffer)

    expect(result.status).toBe('deferred')
    expect(result.hash).toBeDefined()
    expect(result.hash.length).toBe(64) // SHA-256 hex
    if (result.status === 'deferred') {
      expect(result.reason).toContain('not configured')
    }
  })

  it('computes SHA-256 hash of file content', async () => {
    const { scanFile } = await import('../lib/virus-scanner')
    const buffer = Buffer.from('consistent content')

    const result1 = await scanFile(buffer)
    const result2 = await scanFile(buffer)

    // Same content → same hash
    expect(result1.hash).toBe(result2.hash)
    expect(result1.hash.length).toBe(64)
  })

  it('returns different hashes for different file content', async () => {
    const { scanFile } = await import('../lib/virus-scanner')
    const buffer1 = Buffer.from('content A')
    const buffer2 = Buffer.from('content B')

    const result1 = await scanFile(buffer1)
    const result2 = await scanFile(buffer2)

    expect(result1.hash).not.toBe(result2.hash)
  })

  it('returns deferred status when ClamAV connection fails', async () => {
    process.env.CLAMAV_HOST = '127.0.0.1'
    process.env.CLAMAV_PORT = '19999' // Non-existent port

    const { scanFile } = await import('../lib/virus-scanner')
    const buffer = Buffer.from('test file')

    const result = await scanFile(buffer)

    // Should return deferred, not crash
    expect(['deferred', 'error']).toContain(result.status)
    expect(result.hash).toBeDefined()
  })
})
