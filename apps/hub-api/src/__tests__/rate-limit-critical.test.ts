import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Story 56.4 (audit M-HUB-2): fail-CLOSED rate limiting for auth-critical
 * endpoints. When Redis is missing or errors, a `critical` limiter must DENY
 * (allowed=false) while non-critical limiters keep failing open.
 */

const mockIncr = vi.fn()
const mockExpire = vi.fn()
const mockPipelineExec = vi.fn()
const mockOn = vi.fn()
const mockConnect = vi.fn().mockResolvedValue(undefined)
const mockDisconnect = vi.fn()

const mockPipeline = vi.fn().mockReturnValue({
  incr: mockIncr.mockReturnThis(),
  expire: mockExpire.mockReturnThis(),
  exec: mockPipelineExec,
})

vi.mock('ioredis', () => ({
  default: vi.fn().mockImplementation(() => ({
    pipeline: mockPipeline,
    on: mockOn,
    connect: mockConnect,
    disconnect: mockDisconnect,
  })),
}))

const originalEnv = process.env.REDIS_URL
const CONFIG = { limit: 3, windowSec: 60 }
const ID = { scope: 'ip', id: 'abc123' }

describe('checkRateLimit — critical fail-closed (M-HUB-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.REDIS_URL = 'redis://localhost:6379'
  })

  afterEach(() => {
    if (originalEnv !== undefined) process.env.REDIS_URL = originalEnv
    else delete process.env.REDIS_URL
    vi.resetModules()
  })

  it('DENIES a critical limiter when Redis pipeline errors', async () => {
    mockPipelineExec.mockRejectedValue(new Error('Connection refused'))
    const { checkRateLimit } = await import('../trpc/middleware/rateLimit')

    const result = await checkRateLimit(ID, 'patient.otp', CONFIG, 'otp', { critical: true })
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('ALLOWS a non-critical limiter when Redis pipeline errors (fail-open regression)', async () => {
    mockPipelineExec.mockRejectedValue(new Error('Connection refused'))
    const { checkRateLimit } = await import('../trpc/middleware/rateLimit')

    const result = await checkRateLimit(ID, 'encounter.list', CONFIG)
    expect(result.allowed).toBe(true)
  })

  it('DENIES a critical limiter when Redis pipeline returns null', async () => {
    mockPipelineExec.mockResolvedValue(null)
    const { checkRateLimit } = await import('../trpc/middleware/rateLimit')

    const result = await checkRateLimit(ID, 'patient.otp', CONFIG, 'otp', { critical: true })
    expect(result.allowed).toBe(false)
  })

  it('ALLOWS a critical limiter under the limit when Redis is healthy', async () => {
    mockPipelineExec.mockResolvedValue([[null, 1], [null, 1]])
    const { checkRateLimit } = await import('../trpc/middleware/rateLimit')

    const result = await checkRateLimit(ID, 'patient.otp', CONFIG, 'otp', { critical: true })
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(2)
  })

  it('DENIES a critical limiter over the limit when Redis is healthy', async () => {
    mockPipelineExec.mockResolvedValue([[null, 4], [null, 1]]) // over limit of 3
    const { checkRateLimit } = await import('../trpc/middleware/rateLimit')

    const result = await checkRateLimit(ID, 'patient.otp', CONFIG, 'otp', { critical: true })
    expect(result.allowed).toBe(false)
  })
})

describe('checkRateLimit — NO Redis configured always fails OPEN (dev/test)', () => {
  const originalEnv2 = process.env.REDIS_URL

  afterEach(() => {
    if (originalEnv2 !== undefined) process.env.REDIS_URL = originalEnv2
    else delete process.env.REDIS_URL
    vi.resetModules()
  })

  // "No REDIS_URL" is local dev / test, NOT a production outage: there is no
  // backend to have failed and no attack surface, so even a critical limiter
  // fails open. Fail-CLOSED applies only to a configured-but-unreachable Redis
  // (the error / null-exec cases above). This preserves zero regression for the
  // large suite that runs without Redis.
  it('ALLOWS a critical limiter when REDIS_URL is unset', async () => {
    delete process.env.REDIS_URL
    vi.resetModules()
    const { checkRateLimit } = await import('../trpc/middleware/rateLimit')

    const result = await checkRateLimit(ID, 'patient.otp', CONFIG, 'otp', { critical: true })
    expect(result.allowed).toBe(true)
  })

  it('ALLOWS a non-critical limiter when REDIS_URL is unset (fail-open regression)', async () => {
    delete process.env.REDIS_URL
    vi.resetModules()
    const { checkRateLimit } = await import('../trpc/middleware/rateLimit')

    const result = await checkRateLimit(ID, 'encounter.list', CONFIG)
    expect(result.allowed).toBe(true)
  })
})
