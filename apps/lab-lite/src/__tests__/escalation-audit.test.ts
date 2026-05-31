/**
 * Story 48.4 — Escalation Audit Event Tests
 * AC: 7 — Every escalation step must be audit-logged.
 * PHI rule: critical values must NEVER appear in audit metadata.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { reportEscalationEvent } from '../lib/audit-client'

vi.mock('@ultranos/audit-logger/client', () => ({
  emitClientAudit: vi.fn().mockResolvedValue(undefined),
  setAuditStoreAdapter: vi.fn(),
}))
vi.mock('@ultranos/audit-logger/adapters/dexie', () => ({
  DexieAuditAdapter: vi.fn(),
}))
vi.mock('@ultranos/audit-logger/drain', () => ({
  AuditDrainWorker: vi.fn(),
}))
vi.mock('../lib/db', () => ({
  getDb: () => ({ clientAuditLog: {} }),
}))
vi.mock('../lib/hlc', () => ({
  hlc: { now: () => ({ wallTime: 1000, counter: 0, nodeId: 'test' }) },
  serializeHlc: () => '2026-05-31T00:00:00.000Z-0-test',
}))
vi.mock('../lib/trpc', () => ({ getHubApiUrl: () => 'http://localhost:3001' }))
vi.mock('../stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({ session: { userId: 'tech-001', labRole: 'LAB_TECH' } }),
  },
}))

import { emitClientAudit } from '@ultranos/audit-logger/client'

describe('reportEscalationEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const basePayload = {
    action: 'ESCALATION_INITIATED' as const,
    chainId: 'chain-uuid-001',
    resultId: 'result-uuid-001',
    stepNumber: 1,
    recipientRole: 'lab_tech',
    notificationType: 'tech_alert',
    timestamp: '2026-05-31T08:00:00.000Z',
  }

  it('calls emitClientAudit for ESCALATION_INITIATED', () => {
    reportEscalationEvent(basePayload)
    expect(emitClientAudit).toHaveBeenCalledOnce()
  })

  it('calls emitClientAudit for ESCALATION_STEP_ACKNOWLEDGED', () => {
    reportEscalationEvent({ ...basePayload, action: 'ESCALATION_STEP_ACKNOWLEDGED' })
    expect(emitClientAudit).toHaveBeenCalledOnce()
  })

  it('calls emitClientAudit for ESCALATION_EXPIRED', () => {
    reportEscalationEvent({ ...basePayload, action: 'ESCALATION_EXPIRED' })
    expect(emitClientAudit).toHaveBeenCalledOnce()
  })

  it('does NOT include critical value in audit metadata (PHI rule)', () => {
    reportEscalationEvent(basePayload)
    const callArg = vi.mocked(emitClientAudit).mock.calls[0][0]
    const metadataStr = JSON.stringify(callArg.metadata)
    // The critical value (a number) should not appear in metadata
    // Verify that only allowed fields are in metadata
    expect(callArg.metadata).not.toHaveProperty('criticalValue')
    expect(callArg.metadata).not.toHaveProperty('value')
    expect(callArg.metadata).not.toHaveProperty('analyte') // only IDs, not clinical data
    // Confirm opaque IDs ARE present
    expect(callArg.metadata.chainId).toBe('chain-uuid-001')
    expect(callArg.metadata.resultId).toBe('result-uuid-001')
  })

  it('includes chainId and resultId in every event', () => {
    const actions = [
      'CRITICAL_VALUE_DETECTED',
      'ESCALATION_INITIATED',
      'ESCALATION_STEP_SENT',
      'ESCALATION_STEP_ACKNOWLEDGED',
      'ESCALATION_STEP_ESCALATED',
      'ESCALATION_COMPLETED',
      'ESCALATION_EXPIRED',
    ] as const

    for (const action of actions) {
      vi.clearAllMocks()
      reportEscalationEvent({ ...basePayload, action })
      const callArg = vi.mocked(emitClientAudit).mock.calls[0][0]
      expect(callArg.metadata.chainId).toBe('chain-uuid-001')
      expect(callArg.metadata.resultId).toBe('result-uuid-001')
    }
  })
})
