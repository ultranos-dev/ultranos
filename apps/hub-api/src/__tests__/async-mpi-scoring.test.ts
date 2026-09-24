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

// Story 60.4 (Task 3): audit + admin-notification producer for stranded MPI reviews.
const mockAuditEmit = vi.fn().mockResolvedValue({ id: 'audit-1' })
vi.mock('@ultranos/audit-logger', () => ({
  AuditLogger: vi.fn().mockImplementation(() => ({ emit: mockAuditEmit })),
}))
const mockProduceNotifications = vi.fn().mockResolvedValue({ inserted: 1, recipients: 1 })
const mockResolveOrgAdmins = vi.fn().mockResolvedValue(['prac-admin-1'])
vi.mock('@/lib/notification-producers', () => ({
  produceNotifications: (...args: unknown[]) => mockProduceNotifications(...args),
  resolveOrgAdmins: (...args: unknown[]) => mockResolveOrgAdmins(...args),
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
    const updateCall = mockSupabase.from.mock.results[0]!.value.update
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
        // Story 60.4: the insert now .select('id').single()s to capture the review id.
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'review-1' }, error: null }),
            }),
          }),
        }
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
      if (table === 'duplicate_reviews') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'review-2' }, error: null }),
            }),
          }),
        }
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    })

    await runAsyncMpiScoring(PATIENT_ID, PATIENT_FIELDS, mockSupabase as never)

    const calls = mockSupabase.from.mock.calls.map((c: unknown[]) => c[0])
    expect(calls).toContain('duplicate_reviews')
  })

  it('emits an audit event AND notifies org admins when a PENDING review is created (Story 60.4 Task 3)', async () => {
    mockFetchMpiCandidates.mockResolvedValue([{ id: 'candidate-1' }])
    mockComputeMpiResult.mockReturnValue({
      decision: 'WARN',
      topScore: 80,
      candidates: [{ candidate: { id: 'candidate-1' }, score: 80, breakdown: {}, hardIdMatch: false }],
    })
    mockSupabase.from.mockImplementation((table: string) => {
      if (table === 'patients') {
        return { update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }) }
      }
      if (table === 'duplicate_reviews') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { id: 'review-3' }, error: null }),
            }),
          }),
        }
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    })

    await runAsyncMpiScoring(PATIENT_ID, PATIENT_FIELDS, mockSupabase as never, 'org-1')

    // Audit event for the created review (patient-scoped, non-PHI metadata).
    expect(mockAuditEmit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        metadata: expect.objectContaining({ operation: 'mpi_duplicate_review_created', reviewId: 'review-3' }),
      }),
    )
    // Admin notification produced — MPI_REVIEW_PENDING, ADMIN role, non-PHI payload.
    expect(mockResolveOrgAdmins).toHaveBeenCalledWith(expect.anything(), 'org-1')
    expect(mockProduceNotifications).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'MPI_REVIEW_PENDING', recipientRole: 'ADMIN' }),
    )
    const notifyArg = mockProduceNotifications.mock.calls[0]![0] as { payload: Record<string, unknown> }
    // PHI-free: payload carries only the opaque reviewId + decision enum.
    expect(JSON.stringify(notifyArg.payload)).not.toContain('Ahmad')
    expect(notifyArg.payload).toMatchObject({ reviewId: 'review-3', status: 'WARN' })
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
