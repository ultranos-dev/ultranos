import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateKeyPair, exportPKCS8, exportSPKI } from 'jose'

vi.stubEnv('MPI_TOKEN_PRIVATE_KEY', '')
vi.stubEnv('MPI_TOKEN_PUBLIC_KEY', '')

vi.mock('@/lib/redis', () => ({
  getRedisClient: vi.fn(),
}))

import {
  signProceedToken,
  verifyProceedToken,
  consumeProceedToken,
  MpiReplayPreventionUnavailableError,
} from '@/lib/mpi-proceed-token'
import { getRedisClient } from '@/lib/redis'

describe('mpi-proceed-token', () => {
  let privateKeyPem: string
  let publicKeyPem: string
  let mockRedis: {
    set: ReturnType<typeof vi.fn>
    get: ReturnType<typeof vi.fn>
    del: ReturnType<typeof vi.fn>
  }

  beforeEach(async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true })
    privateKeyPem = await exportPKCS8(privateKey)
    publicKeyPem  = await exportSPKI(publicKey)

    vi.stubEnv('MPI_TOKEN_PRIVATE_KEY', privateKeyPem)
    vi.stubEnv('MPI_TOKEN_PUBLIC_KEY', publicKeyPem)

    mockRedis = {
      set: vi.fn().mockResolvedValue('OK'),
      get: vi.fn().mockResolvedValue(null),
      del: vi.fn().mockResolvedValue(1),
    }
    vi.mocked(getRedisClient).mockReturnValue(mockRedis as never)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('signs a proceed token with the expected payload shape', async () => {
    const token = await signProceedToken({
      candidateIds: ['p1', 'p2'],
      maxScore: 75,
      issuedTo: 'user-uuid-001',
    })
    expect(typeof token).toBe('string')
    expect(token.split('.').length).toBe(3)
  })

  it('verifies a valid token and returns payload', async () => {
    const token = await signProceedToken({
      candidateIds: ['p1'],
      maxScore: 65,
      issuedTo: 'user-uuid-002',
    })
    mockRedis.get.mockResolvedValue(null)

    const payload = await verifyProceedToken(token)
    expect(payload.candidateIds).toEqual(['p1'])
    expect(payload.maxScore).toBe(65)
    expect(payload.issuedTo).toBe('user-uuid-002')
    expect(payload.jti).toBeTruthy()
  })

  it('rejects a token signed with a different key', async () => {
    const { privateKey: wrongKey } = await generateKeyPair('RS256', { extractable: true })
    const wrongPem = await exportPKCS8(wrongKey)
    vi.stubEnv('MPI_TOKEN_PRIVATE_KEY', wrongPem)

    const tokenWithWrongKey = await signProceedToken({
      candidateIds: ['p3'],
      maxScore: 80,
      issuedTo: 'user-uuid-003',
    })

    vi.stubEnv('MPI_TOKEN_PRIVATE_KEY', privateKeyPem)

    await expect(verifyProceedToken(tokenWithWrongKey)).rejects.toThrow()
  })

  it('consumeProceedToken marks jti as used in Redis', async () => {
    const token = await signProceedToken({
      candidateIds: ['p4'],
      maxScore: 70,
      issuedTo: 'user-uuid-004',
    })
    const payload = await verifyProceedToken(token)
    mockRedis.get.mockResolvedValue(null)

    await consumeProceedToken(payload.jti)

    expect(mockRedis.set).toHaveBeenCalledWith(
      expect.stringContaining(payload.jti),
      'consumed',
      'EX',
      600,
    )
  })

  it('verifyProceedToken throws when jti is already consumed (replay prevention)', async () => {
    const token = await signProceedToken({
      candidateIds: ['p5'],
      maxScore: 72,
      issuedTo: 'user-uuid-005',
    })
    mockRedis.get.mockResolvedValue('consumed')
    await expect(verifyProceedToken(token)).rejects.toThrow(/already consumed|replay/)
  })

  it('throws when MPI_TOKEN_PRIVATE_KEY is not set', async () => {
    vi.stubEnv('MPI_TOKEN_PRIVATE_KEY', '')
    await expect(signProceedToken({ candidateIds: [], maxScore: 0, issuedTo: 'u' })).rejects.toThrow(/MPI_TOKEN_PRIVATE_KEY/)
  })

  it('verifyProceedToken skips replay check when Redis is unavailable in dev (fail-open)', async () => {
    // In dev/test (NODE_ENV !== 'production', flag unset) replay prevention is
    // best-effort: when Redis is unavailable the check is skipped so local work
    // does not require a running Redis. Production fails closed (see below).
    vi.mocked(getRedisClient).mockReturnValue(null as never)
    const token = await signProceedToken({
      candidateIds: ['p6'],
      maxScore: 65,
      issuedTo: 'user-uuid-006',
    })
    const payload = await verifyProceedToken(token)
    expect(payload.candidateIds).toEqual(['p6'])
    expect(payload.maxScore).toBe(65)
    expect(payload.issuedTo).toBe('user-uuid-006')
  })

  it('verifyProceedToken FAILS CLOSED when Redis unavailable and MPI_TOKEN_REQUIRE_REDIS=true', async () => {
    vi.stubEnv('MPI_TOKEN_REQUIRE_REDIS', 'true')
    vi.mocked(getRedisClient).mockReturnValue(null as never)
    const token = await signProceedToken({ candidateIds: ['p7'], maxScore: 80, issuedTo: 'user-uuid-007' })
    await expect(verifyProceedToken(token)).rejects.toThrow(MpiReplayPreventionUnavailableError)
    vi.stubEnv('MPI_TOKEN_REQUIRE_REDIS', '')
  })

  it('verifyProceedToken FAILS CLOSED in production by default when Redis unavailable', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.mocked(getRedisClient).mockReturnValue(null as never)
    const token = await signProceedToken({ candidateIds: ['p8'], maxScore: 90, issuedTo: 'user-uuid-008' })
    await expect(verifyProceedToken(token)).rejects.toThrow(/replay prevention unavailable/i)
    vi.stubEnv('NODE_ENV', 'test')
  })

  it('production fail-closed can be explicitly overridden with MPI_TOKEN_REQUIRE_REDIS=false', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('MPI_TOKEN_REQUIRE_REDIS', 'false')
    vi.mocked(getRedisClient).mockReturnValue(null as never)
    const token = await signProceedToken({ candidateIds: ['p9'], maxScore: 55, issuedTo: 'user-uuid-009' })
    const payload = await verifyProceedToken(token) // opted out -> fail-open
    expect(payload.candidateIds).toEqual(['p9'])
    vi.stubEnv('NODE_ENV', 'test')
    vi.stubEnv('MPI_TOKEN_REQUIRE_REDIS', '')
  })

  it('consumeProceedToken FAILS CLOSED when Redis unavailable and replay prevention required', async () => {
    vi.stubEnv('MPI_TOKEN_REQUIRE_REDIS', 'true')
    vi.mocked(getRedisClient).mockReturnValue(null as never)
    await expect(consumeProceedToken('some-jti')).rejects.toThrow(MpiReplayPreventionUnavailableError)
    vi.stubEnv('MPI_TOKEN_REQUIRE_REDIS', '')
  })

  it('consumeProceedToken is a no-op when Redis unavailable in dev (fail-open)', async () => {
    vi.mocked(getRedisClient).mockReturnValue(null as never)
    await expect(consumeProceedToken('some-jti')).resolves.toBeUndefined()
  })
})
