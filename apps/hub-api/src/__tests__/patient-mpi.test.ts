import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateKeyPair, exportPKCS8, exportSPKI } from 'jose'

vi.stubEnv('MPI_TOKEN_PRIVATE_KEY', '')
vi.stubEnv('MPI_TOKEN_PUBLIC_KEY', '')

vi.mock('@/lib/redis', () => ({
  getRedisClient: vi.fn(),
}))

import { signProceedToken, verifyProceedToken, consumeProceedToken } from '@/lib/mpi-proceed-token'
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

  it('verifyProceedToken throws when Redis is unavailable', async () => {
    vi.mocked(getRedisClient).mockReturnValue(null as never)
    const token = await signProceedToken({
      candidateIds: ['p6'],
      maxScore: 65,
      issuedTo: 'user-uuid-006',
    })
    await expect(verifyProceedToken(token)).rejects.toThrow(/Redis required/)
  })
})
