import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the audit-logger and its subpaths before any imports
const mockEmitClientAudit = vi.fn().mockResolvedValue(undefined)

vi.mock('@ultranos/audit-logger/client', () => ({
  emitClientAudit: mockEmitClientAudit,
  setAuditStoreAdapter: vi.fn(),
}))

vi.mock('@ultranos/audit-logger/adapters/dexie', () => ({
  DexieAuditAdapter: vi.fn(),
}))

vi.mock('@ultranos/audit-logger/drain', () => ({
  AuditDrainWorker: vi.fn(),
}))

vi.mock('../lib/db', () => ({
  getDb: vi.fn().mockReturnValue({ clientAuditLog: {} }),
}))

vi.mock('../lib/trpc', () => ({
  getHubApiUrl: vi.fn().mockReturnValue('http://localhost:3000'),
}))

vi.mock('../lib/supabase', () => ({
  getSupabaseBrowserClient: vi.fn(),
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: Object.assign(
    vi.fn((selector: (state: any) => any) =>
      selector({ session: { userId: 'tech-1', email: 'tech@lab.com', role: 'LAB_TECH' }, isAuthenticated: true }),
    ),
    {
      getState: vi.fn().mockReturnValue({
        session: { userId: 'tech-1', email: 'tech@lab.com', role: 'LAB_TECH' },
        isAuthenticated: true,
      }),
    },
  ),
}))

describe('Consent Audit Events (Task 10.8)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('emits CONSENT_GRANT event with correct metadata', async () => {
    const { reportConsentAuditEvent } = await import('../lib/audit-client')

    reportConsentAuditEvent({
      action: 'CONSENT_GRANT',
      consentRecordId: 42,
      patientRef: 'Patient/abc-123',
      method: 'audio',
      language: 'ar',
      consentTextVersion: '1.0.0',
      technicianId: 'tech-1',
    })

    expect(mockEmitClientAudit).toHaveBeenCalledTimes(1)
    const call = mockEmitClientAudit.mock.calls[0]![0]

    expect(call.action).toBe('CONSENT_GRANT')
    expect(call.resourceType).toBe('CONSENT')
    expect(call.resourceId).toBe('42')
    expect(call.actorId).toBe('tech-1')
    expect(call.metadata).toMatchObject({
      consentEvent: 'CONSENT_GRANT',
      outcome: 'SUCCESS',
      consentRecordId: 42,
      patientRef: 'Patient/abc-123',
      method: 'audio',
      language: 'ar',
      consentTextVersion: '1.0.0',
      source: 'lab-lite',
    })
  })

  it('emits CONSENT_REVOKE event with reason', async () => {
    const { reportConsentAuditEvent } = await import('../lib/audit-client')

    reportConsentAuditEvent({
      action: 'CONSENT_REVOKE',
      consentRecordId: 99,
      patientRef: 'Patient/xyz-789',
      reason: 'Patient withdrew consent verbally',
    })

    expect(mockEmitClientAudit).toHaveBeenCalledTimes(1)
    const call = mockEmitClientAudit.mock.calls[0]![0]

    expect(call.action).toBe('CONSENT_REVOKE')
    expect(call.resourceType).toBe('CONSENT')
    expect(call.resourceId).toBe('99')
    expect(call.metadata).toMatchObject({
      consentEvent: 'CONSENT_REVOKE',
      outcome: 'SUCCESS',
      patientRef: 'Patient/xyz-789',
      reason: 'Patient withdrew consent verbally',
      source: 'lab-lite',
    })
  })

  it('never throws — consent audit is fire-and-forget', async () => {
    const { reportConsentAuditEvent } = await import('../lib/audit-client')

    // Even if emitClientAudit rejects, the function itself must not throw
    // because it uses `void emitClientAudit(...)` (fire-and-forget)
    expect(() => {
      reportConsentAuditEvent({
        action: 'CONSENT_GRANT',
        consentRecordId: 1,
        patientRef: 'Patient/test',
      })
    }).not.toThrow()

    // Verify the call was still made
    expect(mockEmitClientAudit).toHaveBeenCalled()
  })

  it('includes consentTextVersion in metadata when provided', async () => {
    const { reportConsentAuditEvent } = await import('../lib/audit-client')

    reportConsentAuditEvent({
      action: 'CONSENT_GRANT',
      consentRecordId: 5,
      patientRef: 'Patient/test',
      consentTextVersion: '1.0.0',
    })

    const call = mockEmitClientAudit.mock.calls[0]![0]
    expect(call.metadata.consentTextVersion).toBe('1.0.0')
  })
})
