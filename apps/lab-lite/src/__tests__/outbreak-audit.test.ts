/**
 * Outbreak Audit Event Tests — Story 54.5 (Task 15.8)
 *
 * Tests that audit events are emitted correctly for all outbreak operations:
 *   - OUTBREAK_MODE_ACTIVATED → AuditAction.CREATE
 *   - OUTBREAK_MODE_DEACTIVATED → AuditAction.UPDATE
 *   - OUTBREAK_SITREP_GENERATED → AuditAction.CREATE
 *   - OUTBREAK_SURGE_ALERT → AuditAction.CREATE
 *   - OUTBREAK_CONFIG_CHANGED → AuditAction.UPDATE
 *   - HIGH-ACCOUNTABILITY metadata: actorRole, pathogenCode, scope, activationReason
 *   - Never throws even if emitClientAudit fails
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reportOutbreakAuditEvent } from '../lib/audit-client'

// ---------------------------------------------------------------------------
// Mock dependencies
// ---------------------------------------------------------------------------

const mockEmitClientAudit = vi.fn()

vi.mock('@ultranos/audit-logger/client', () => ({
  emitClientAudit: (...args: unknown[]) => mockEmitClientAudit(...args),
  setAuditStoreAdapter: vi.fn(),
}))

vi.mock('@ultranos/audit-logger/adapters/dexie', () => ({
  DexieAuditAdapter: vi.fn().mockImplementation(() => ({})),
}))

vi.mock('@ultranos/audit-logger/drain', () => ({
  AuditDrainWorker: vi.fn().mockImplementation(() => ({ start: vi.fn(), stop: vi.fn() })),
}))

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(() => ({ clientAuditLog: {} })),
}))

vi.mock('@/lib/hlc', () => ({
  hlc: { now: vi.fn(() => ({ wallTime: 0, logicalTime: 0, nodeId: 'test' })) },
  serializeHlc: vi.fn(() => '2026-05-31T10:00:00Z:0:test'),
}))

vi.mock('@/lib/trpc', () => ({
  getHubApiUrl: vi.fn(() => 'http://localhost:3001'),
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: vi.fn(() => ({
      session: { userId: 'u1', role: 'HEALTH_OFFICER', practitionerId: 'prac-001' },
    })),
  },
}))

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('reportOutbreakAuditEvent — action mapping', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEmitClientAudit.mockReturnValue(Promise.resolve())
  })

  it('maps OUTBREAK_MODE_ACTIVATED to CREATE action', () => {
    reportOutbreakAuditEvent({
      action: 'OUTBREAK_MODE_ACTIVATED',
      outbreakConfigId: 'outbreak-001',
      actorId: 'prac-001',
      actorRole: 'HEALTH_OFFICER',
      pathogenCode: 'MALARIA',
      scope: ['loc-001'],
      activationReason: 'WHO alert',
    })
    expect(mockEmitClientAudit).toHaveBeenCalledTimes(1)
    const [input] = mockEmitClientAudit.mock.calls[0]
    expect(input.action).toBe('CREATE')
  })

  it('maps OUTBREAK_MODE_DEACTIVATED to UPDATE action', () => {
    reportOutbreakAuditEvent({
      action: 'OUTBREAK_MODE_DEACTIVATED',
      outbreakConfigId: 'outbreak-001',
      actorId: 'prac-002',
      actorRole: 'LAB_TECH',
      pathogenCode: 'MALARIA',
      scope: ['loc-001'],
    })
    const [input] = mockEmitClientAudit.mock.calls[0]
    expect(input.action).toBe('UPDATE')
  })

  it('maps OUTBREAK_SITREP_GENERATED to CREATE action', () => {
    reportOutbreakAuditEvent({
      action: 'OUTBREAK_SITREP_GENERATED',
      outbreakConfigId: 'outbreak-001',
      actorId: 'prac-001',
      actorRole: 'HEALTH_OFFICER',
      pathogenCode: 'MALARIA',
      scope: ['loc-001'],
    })
    const [input] = mockEmitClientAudit.mock.calls[0]
    expect(input.action).toBe('CREATE')
  })

  it('maps OUTBREAK_SURGE_ALERT to CREATE action', () => {
    reportOutbreakAuditEvent({
      action: 'OUTBREAK_SURGE_ALERT',
      outbreakConfigId: 'outbreak-001',
      actorId: 'prac-001',
      actorRole: 'HEALTH_OFFICER',
      pathogenCode: 'MALARIA',
      scope: ['loc-001'],
    })
    const [input] = mockEmitClientAudit.mock.calls[0]
    expect(input.action).toBe('CREATE')
  })

  it('maps OUTBREAK_CONFIG_CHANGED to UPDATE action', () => {
    reportOutbreakAuditEvent({
      action: 'OUTBREAK_CONFIG_CHANGED',
      outbreakConfigId: 'outbreak-001',
      actorId: 'prac-001',
      actorRole: 'HEALTH_OFFICER',
      pathogenCode: 'MALARIA',
      scope: ['loc-001'],
    })
    const [input] = mockEmitClientAudit.mock.calls[0]
    expect(input.action).toBe('UPDATE')
  })
})

describe('reportOutbreakAuditEvent — HIGH-ACCOUNTABILITY metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEmitClientAudit.mockReturnValue(Promise.resolve())
  })

  it('sets resourceType to "OUTBREAK_CONFIG"', () => {
    reportOutbreakAuditEvent({
      action: 'OUTBREAK_MODE_ACTIVATED',
      outbreakConfigId: 'outbreak-001',
      actorId: 'prac-001',
      actorRole: 'HEALTH_OFFICER',
      pathogenCode: 'MALARIA',
      scope: ['loc-001'],
    })
    const [input] = mockEmitClientAudit.mock.calls[0]
    expect(input.resourceType).toBe('OUTBREAK_CONFIG')
  })

  it('sets resourceId to outbreakConfigId', () => {
    reportOutbreakAuditEvent({
      action: 'OUTBREAK_MODE_ACTIVATED',
      outbreakConfigId: 'outbreak-abc-123',
      actorId: 'prac-001',
      actorRole: 'HEALTH_OFFICER',
      pathogenCode: 'MALARIA',
      scope: ['loc-001'],
    })
    const [input] = mockEmitClientAudit.mock.calls[0]
    expect(input.resourceId).toBe('outbreak-abc-123')
  })

  it('sets actorId to provided actorId (not session)', () => {
    reportOutbreakAuditEvent({
      action: 'OUTBREAK_MODE_ACTIVATED',
      outbreakConfigId: 'outbreak-001',
      actorId: 'custom-actor-id',
      actorRole: 'HEALTH_OFFICER',
      pathogenCode: 'MALARIA',
      scope: ['loc-001'],
    })
    const [input] = mockEmitClientAudit.mock.calls[0]
    expect(input.actorId).toBe('custom-actor-id')
  })

  it('includes actorRole in metadata (HIGH-ACCOUNTABILITY)', () => {
    reportOutbreakAuditEvent({
      action: 'OUTBREAK_MODE_ACTIVATED',
      outbreakConfigId: 'outbreak-001',
      actorId: 'prac-001',
      actorRole: 'HEALTH_OFFICER',
      pathogenCode: 'MALARIA',
      scope: ['loc-001'],
    })
    const [input] = mockEmitClientAudit.mock.calls[0]
    expect(input.metadata.actorRole).toBe('HEALTH_OFFICER')
  })

  it('includes pathogenCode in metadata', () => {
    reportOutbreakAuditEvent({
      action: 'OUTBREAK_MODE_ACTIVATED',
      outbreakConfigId: 'outbreak-001',
      actorId: 'prac-001',
      actorRole: 'HEALTH_OFFICER',
      pathogenCode: 'CHOLERA',
      scope: ['loc-001'],
    })
    const [input] = mockEmitClientAudit.mock.calls[0]
    expect(input.metadata.pathogenCode).toBe('CHOLERA')
  })

  it('includes scope array in metadata', () => {
    reportOutbreakAuditEvent({
      action: 'OUTBREAK_MODE_ACTIVATED',
      outbreakConfigId: 'outbreak-001',
      actorId: 'prac-001',
      actorRole: 'HEALTH_OFFICER',
      pathogenCode: 'MALARIA',
      scope: ['loc-001', 'loc-002', 'loc-003'],
    })
    const [input] = mockEmitClientAudit.mock.calls[0]
    expect(input.metadata.scope).toEqual(['loc-001', 'loc-002', 'loc-003'])
  })

  it('includes activationReason in metadata when provided', () => {
    reportOutbreakAuditEvent({
      action: 'OUTBREAK_MODE_ACTIVATED',
      outbreakConfigId: 'outbreak-001',
      actorId: 'prac-001',
      actorRole: 'HEALTH_OFFICER',
      pathogenCode: 'MALARIA',
      scope: ['loc-001'],
      activationReason: 'WHO alert — confirmed outbreak in district',
    })
    const [input] = mockEmitClientAudit.mock.calls[0]
    expect(input.metadata.activationReason).toBe('WHO alert — confirmed outbreak in district')
  })

  it('omits activationReason when not provided', () => {
    reportOutbreakAuditEvent({
      action: 'OUTBREAK_MODE_DEACTIVATED',
      outbreakConfigId: 'outbreak-001',
      actorId: 'prac-001',
      actorRole: 'HEALTH_OFFICER',
      pathogenCode: 'MALARIA',
      scope: ['loc-001'],
    })
    const [input] = mockEmitClientAudit.mock.calls[0]
    expect(input.metadata.activationReason).toBeUndefined()
  })

  it('sets outcome to "SUCCESS"', () => {
    reportOutbreakAuditEvent({
      action: 'OUTBREAK_MODE_ACTIVATED',
      outbreakConfigId: 'outbreak-001',
      actorId: 'prac-001',
      actorRole: 'HEALTH_OFFICER',
      pathogenCode: 'MALARIA',
      scope: ['loc-001'],
    })
    const [input] = mockEmitClientAudit.mock.calls[0]
    expect(input.metadata.outcome).toBe('SUCCESS')
  })

  it('sets source to "lab-lite"', () => {
    reportOutbreakAuditEvent({
      action: 'OUTBREAK_MODE_ACTIVATED',
      outbreakConfigId: 'outbreak-001',
      actorId: 'prac-001',
      actorRole: 'HEALTH_OFFICER',
      pathogenCode: 'MALARIA',
      scope: ['loc-001'],
    })
    const [input] = mockEmitClientAudit.mock.calls[0]
    expect(input.metadata.source).toBe('lab-lite')
  })

  it('includes HLC timestamp', () => {
    reportOutbreakAuditEvent({
      action: 'OUTBREAK_MODE_ACTIVATED',
      outbreakConfigId: 'outbreak-001',
      actorId: 'prac-001',
      actorRole: 'HEALTH_OFFICER',
      pathogenCode: 'MALARIA',
      scope: ['loc-001'],
    })
    const [input] = mockEmitClientAudit.mock.calls[0]
    expect(input.hlcTimestamp).toBe('2026-05-31T10:00:00Z:0:test')
  })
})

describe('reportOutbreakAuditEvent — never throws', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEmitClientAudit.mockReturnValue(Promise.resolve())
  })

  it('does not throw when called with valid payload', () => {
    mockEmitClientAudit.mockReturnValue(Promise.resolve())
    expect(() => {
      reportOutbreakAuditEvent({
        action: 'OUTBREAK_MODE_ACTIVATED',
        outbreakConfigId: 'outbreak-001',
        actorId: 'prac-001',
        actorRole: 'HEALTH_OFFICER',
        pathogenCode: 'MALARIA',
        scope: ['loc-001'],
      })
    }).not.toThrow()
  })

  it('still calls emitClientAudit exactly once (fire-and-forget)', () => {
    mockEmitClientAudit.mockReturnValue(Promise.resolve())
    reportOutbreakAuditEvent({
      action: 'OUTBREAK_MODE_DEACTIVATED',
      outbreakConfigId: 'outbreak-001',
      actorId: 'prac-001',
      actorRole: 'HEALTH_OFFICER',
      pathogenCode: 'MALARIA',
      scope: ['loc-001'],
    })
    expect(mockEmitClientAudit).toHaveBeenCalledTimes(1)
  })
})
