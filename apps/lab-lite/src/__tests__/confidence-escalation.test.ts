import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ConfidenceLevel } from '../lib/confidence'
import { triggerAutoEscalation } from '../lib/confidence-escalation'

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockEmitClientAudit = vi.fn()
vi.mock('@ultranos/audit-logger/client', () => ({
  emitClientAudit: (...args: unknown[]) => mockEmitClientAudit(...args),
}))

const mockGetState = vi.fn()
vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: { getState: (...args: unknown[]) => mockGetState(...args) },
}))

const mockHlcNow = vi.fn(() => ({ wallTime: 1000, counter: 0, nodeId: 'test' }))
const mockSerializeHlc = vi.fn(() => 'hlc-test-string')
vi.mock('@/lib/hlc', () => ({
  hlc: { now: (...args: unknown[]) => mockHlcNow(...args) },
  serializeHlc: (...args: unknown[]) => mockSerializeHlc(...args),
}))

vi.mock('@/lib/trpc', () => ({
  getHubApiUrl: () => 'https://hub.test',
}))

vi.mock('@/lib/supabase', () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: async () => ({
        data: { session: { access_token: 'test-token' } },
      }),
    },
  }),
}))

// ── Tests ──────────────────────────────────────────────────────────────────

describe('triggerAutoEscalation()', () => {
  const basePayload = {
    confidence: ConfidenceLevel.LOW,
    aiOutputSummary: 'Anomaly detection on CBC result set',
    sourceFeature: 'anomaly-detection',
    sampleId: 'sample-abc-123',
    escalationReason: 'confidence.escalation.belowThreshold',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetState.mockReturnValue({
      session: { userId: 'user-123', role: 'LAB_TECH' },
    })
  })

  it('calls emitClientAudit with AI_AUTO_ESCALATION action', () => {
    triggerAutoEscalation(basePayload)
    expect(mockEmitClientAudit).toHaveBeenCalledOnce()
    const [auditInput] = mockEmitClientAudit.mock.calls[0]
    expect(auditInput.action).toBe('AI_AUTO_ESCALATION')
  })

  it('includes sourceFeature, confidence, and sampleId in audit metadata', () => {
    triggerAutoEscalation(basePayload)
    const [auditInput] = mockEmitClientAudit.mock.calls[0]
    expect(auditInput.metadata.sourceFeature).toBe('anomaly-detection')
    expect(auditInput.metadata.confidence).toBe(ConfidenceLevel.LOW)
    expect(auditInput.metadata.sampleId).toBe('sample-abc-123')
  })

  it('does not include PHI in audit metadata — only opaque sampleId and safe summary', () => {
    triggerAutoEscalation(basePayload)
    const [auditInput] = mockEmitClientAudit.mock.calls[0]
    expect(auditInput.metadata.aiOutputSummary).toBe('Anomaly detection on CBC result set')
    expect(auditInput.metadata.patientName).toBeUndefined()
    expect(auditInput.metadata.diagnosis).toBeUndefined()
  })

  it('reads actorRole from session rather than hardcoding LAB_TECH', () => {
    mockGetState.mockReturnValue({
      session: { userId: 'doctor-456', role: 'DOCTOR' },
    })
    triggerAutoEscalation(basePayload)
    const [auditInput] = mockEmitClientAudit.mock.calls[0]
    expect(auditInput.actorRole).toBe('DOCTOR')
  })

  it('uses unknown actorId and skips Hub post when session is null', () => {
    mockGetState.mockReturnValue({ session: null })
    const fetchSpy = vi.spyOn(global, 'fetch')
    triggerAutoEscalation(basePayload)
    const [auditInput] = mockEmitClientAudit.mock.calls[0]
    expect(auditInput.actorId).toBe('unknown')
    // Hub post must NOT fire when session is null (no userId)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('emits audit event even when score is undefined', () => {
    triggerAutoEscalation({ ...basePayload, score: undefined } as typeof basePayload)
    expect(mockEmitClientAudit).toHaveBeenCalledOnce()
    const [auditInput] = mockEmitClientAudit.mock.calls[0]
    expect(auditInput.metadata.score).toBeUndefined()
  })
})
