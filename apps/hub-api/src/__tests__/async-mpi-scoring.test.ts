import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.stubEnv('FIELD_ENCRYPTION_KEY', 'a'.repeat(64))
vi.stubEnv('FIELD_ENCRYPTION_HMAC_KEY', 'b'.repeat(64))

const mockComputeMpiResult = vi.fn()
const mockFetchMpiCandidates = vi.fn()

vi.mock('@ultranos/mpi-engine', () => ({
  computeMpiResult: (...args: unknown[]) => mockComputeMpiResult(...args),
}))

vi.mock('@/lib/mpi-candidate-query', () => ({
  fetchMpiCandidates: (...args: unknown[]) => mockFetchMpiCandidates(...args),
}))

const { runAsyncMpiScoring } = await import('../lib/async-mpi-scoring')

describe('runAsyncMpiScoring', () => {
  const PATIENT_ID = '11111111-1111-1111-1111-111111111111'
  const PATIENT_FIELDS = {
    nameGiven: 'Ahmad',
    nameFather: 'Mohammad',
    birthYear: 1985,
  }

  let mockSupabase: {
    from: ReturnType<typeof vi.fn>
    rpc: ReturnType<typeof vi.fn>
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchMpiCandidates.mockResolvedValue([])
    mockComputeMpiResult.mockReturnValue({ decision: 'ALLOW', topScore: 20, candidates: [] })
    mockSupabase = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
        insert: vi.fn().mockResolvedValue({ error: null }),
      }),
      rpc: vi.fn(),
    }
  })

  it('sets mpi_score on ALLOW without creating a review', async () => {
    await runAsyncMpiScoring(PATIENT_ID, PATIENT_FIELDS, mockSupabase as never)

    // Should update patients with mpi_score
    expect(mockSupabase.from).toHaveBeenCalledWith('patients')
    const updateCall = mockSupabase.from.mock.results[0].value.update
    expect(updateCall).toHaveBeenCalledWith(
      expect.objectContaining({ mpi_score: 20 })
    )
    // Should NOT insert a duplicate_reviews row
    expect(mockSupabase.from).not.toHaveBeenCalledWith('duplicate_reviews')
  })

  it('creates duplicate_reviews row on WARN', async () => {
    mockFetchMpiCandidates.mockResolvedValue([{ id: 'candidate-1' }])
    mockComputeMpiResult.mockReturnValue({
      decision: 'WARN',
      topScore: 75,
      candidates: [{ candidate: { id: 'candidate-1' }, score: 75, breakdown: {}, hardIdMatch: false }],
    })

    // Mock both from() calls — first for patients update, second for duplicate_reviews insert
    let callCount = 0
    mockSupabase.from.mockImplementation((table: string) => {
      callCount++
      if (table === 'patients') {
        return {
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      if (table === 'duplicate_reviews') {
        return { insert: vi.fn().mockResolvedValue({ error: null }) }
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    })

    await runAsyncMpiScoring(PATIENT_ID, PATIENT_FIELDS, mockSupabase as never)

    // Should have called from('duplicate_reviews')
    const calls = mockSupabase.from.mock.calls.map((c: unknown[]) => c[0])
    expect(calls).toContain('duplicate_reviews')
  })

  it('creates duplicate_reviews row on BLOCK', async () => {
    mockFetchMpiCandidates.mockResolvedValue([{ id: 'candidate-2' }])
    mockComputeMpiResult.mockReturnValue({
      decision: 'BLOCK',
      topScore: 95,
      candidates: [{ candidate: { id: 'candidate-2' }, score: 95, breakdown: {}, hardIdMatch: true }],
    })

    let callCount = 0
    mockSupabase.from.mockImplementation((table: string) => {
      callCount++
      if (table === 'patients') {
        return {
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        }
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    })

    await runAsyncMpiScoring(PATIENT_ID, PATIENT_FIELDS, mockSupabase as never)

    const calls = mockSupabase.from.mock.calls.map((c: unknown[]) => c[0])
    expect(calls).toContain('duplicate_reviews')
  })

  it('logs error but does not throw on failure', async () => {
    mockFetchMpiCandidates.mockRejectedValue(new Error('DB connection lost'))
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Should NOT throw
    await expect(runAsyncMpiScoring(PATIENT_ID, PATIENT_FIELDS, mockSupabase as never)).resolves.toBeUndefined()

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[ASYNC_MPI]'),
      expect.any(Object),
    )
    consoleSpy.mockRestore()
  })
})
