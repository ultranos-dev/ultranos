import { describe, it, expect, vi, beforeEach } from 'vitest'

// ============================================================
// Cron Lock Tests — Story 23.0 Task 3
// Tests distributed locking via Redis SET NX EX pattern,
// lock release, and fail-open when Redis is unavailable.
// ============================================================

const mockSet = vi.fn()
const mockEval = vi.fn()
const mockRedisClient = { set: mockSet, eval: mockEval }

vi.mock('@/lib/redis', () => ({
  getRedisClient: vi.fn(() => mockRedisClient),
}))

vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>()
  return {
    ...actual,
    randomUUID: vi.fn(() => 'test-uuid-1234'),
  }
})

const { getRedisClient } = await import('@/lib/redis')
const { acquireCronLock, releaseCronLock } = await import('@/lib/cron-lock')

describe('Cron lock — Story 23.0', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(getRedisClient as ReturnType<typeof vi.fn>).mockReturnValue(mockRedisClient)
  })

  describe('acquireCronLock', () => {
    it('returns a token on first call (lock acquired)', async () => {
      mockSet.mockResolvedValue('OK')
      const result = await acquireCronLock('test-job', 600)
      expect(result).toBe('test-uuid-1234')
      expect(mockSet).toHaveBeenCalledWith(
        'cron-lock:test-job',
        'test-uuid-1234',
        'EX',
        600,
        'NX',
      )
    })

    it('returns null when lock is already held', async () => {
      mockSet.mockResolvedValue(null)
      const result = await acquireCronLock('test-job', 600)
      expect(result).toBeNull()
    })

    it('falls back to allowing execution when Redis unavailable', async () => {
      ;(getRedisClient as ReturnType<typeof vi.fn>).mockReturnValue(null)
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = await acquireCronLock('test-job', 600)
      expect(result).toBe('fail-open') // fail-open
      spy.mockRestore()
    })

    it('falls back to allowing execution on Redis error', async () => {
      mockSet.mockRejectedValue(new Error('Connection refused'))
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = await acquireCronLock('test-job', 600)
      expect(result).toBe('fail-open') // fail-open
      spy.mockRestore()
    })
  })

  describe('releaseCronLock', () => {
    it('uses Lua compare-and-delete with the lock token', async () => {
      mockEval.mockResolvedValue(1)
      await releaseCronLock('test-job', 'my-token')
      expect(mockEval).toHaveBeenCalledWith(
        expect.stringContaining('redis.call("get"'),
        1,
        'cron-lock:test-job',
        'my-token',
      )
    })

    it('allows re-acquisition after release', async () => {
      // First acquire
      mockSet.mockResolvedValue('OK')
      const token = await acquireCronLock('test-job', 600)
      expect(token).toBe('test-uuid-1234')

      // Release
      mockEval.mockResolvedValue(1)
      await releaseCronLock('test-job', token)

      // Re-acquire
      mockSet.mockResolvedValue('OK')
      const token2 = await acquireCronLock('test-job', 600)
      expect(token2).toBe('test-uuid-1234')
    })

    it('skips release when token is fail-open', async () => {
      await releaseCronLock('test-job', 'fail-open')
      expect(mockEval).not.toHaveBeenCalled()
    })

    it('skips release when token is null', async () => {
      await releaseCronLock('test-job', null)
      expect(mockEval).not.toHaveBeenCalled()
    })

    it('handles Redis unavailable gracefully', async () => {
      ;(getRedisClient as ReturnType<typeof vi.fn>).mockReturnValue(null)
      await expect(releaseCronLock('test-job', 'some-token')).resolves.toBeUndefined()
    })

    it('handles Redis error gracefully', async () => {
      mockEval.mockRejectedValue(new Error('Connection lost'))
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      await expect(releaseCronLock('test-job', 'some-token')).resolves.toBeUndefined()
      spy.mockRestore()
    })
  })
})
