/**
 * Donor Report Audit Event Tests — Story 50.2 (AC 11)
 *
 * Ensures audit events:
 *  - Are emitted for program registration, report generation, finalization, export
 *  - Contain no PHI (no patient names, IDs, diagnoses)
 *  - Include the required non-PHI fields (programCode, reportId, etc.)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoist the mock function so it can be referenced in vi.mock factories
const mockEmitClientAudit = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

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
    vi.fn((selector: (state: { session: { userId: string; labRole: string } }) => unknown) =>
      selector({ session: { userId: 'tech-1', labRole: 'LAB_TECH' } }),
    ),
    {
      getState: vi.fn().mockReturnValue({
        session: { userId: 'tech-1', labRole: 'LAB_TECH' },
      }),
    },
  ),
}))

vi.mock('../lib/hlc', () => ({
  hlc: { now: vi.fn(() => ({ wallTime: 0, logicalTime: 0, nodeId: 'test' })) },
  serializeHlc: vi.fn(() => '2026-06-01T00:00:00Z:0:test'),
}))

import { reportDonorAuditEvent } from '../lib/audit-client'

beforeEach(() => {
  mockEmitClientAudit.mockClear()
})

describe('reportDonorAuditEvent', () => {
  it('emits DONOR_PROGRAM_REGISTERED with programCode and programId', () => {
    reportDonorAuditEvent({
      action: 'DONOR_PROGRAM_REGISTERED',
      programCode: 'WHO_TB',
      programId: 'prog-uuid-123',
    })

    expect(mockEmitClientAudit).toHaveBeenCalledOnce()
    const call = mockEmitClientAudit.mock.calls[0]![0] as Record<string, unknown>
    const meta = call.metadata as Record<string, unknown>
    expect(meta.donorEvent).toBe('DONOR_PROGRAM_REGISTERED')
    expect(meta.programCode).toBe('WHO_TB')
    expect(meta.programId).toBe('prog-uuid-123')
  })

  it('emits DONOR_REPORT_GENERATED with reportId and period — no PHI', () => {
    reportDonorAuditEvent({
      action: 'DONOR_REPORT_GENERATED',
      reportId: 'report-uuid-456',
      programCode: 'MSF_MALARIA',
      periodStart: '2026-03-01',
      periodEnd: '2026-03-31',
    })

    expect(mockEmitClientAudit).toHaveBeenCalledOnce()
    const call = mockEmitClientAudit.mock.calls[0]![0] as Record<string, unknown>
    const meta = call.metadata as Record<string, unknown>
    expect(meta.donorEvent).toBe('DONOR_REPORT_GENERATED')
    expect(meta.reportId).toBe('report-uuid-456')
    expect(meta.periodStart).toBe('2026-03-01')
    // PHI check — no patient-level fields
    expect(meta).not.toHaveProperty('patientId')
    expect(meta).not.toHaveProperty('patientName')
    expect(meta).not.toHaveProperty('diagnosis')
  })

  it('emits DONOR_REPORT_FINALIZED with finalizerId', () => {
    reportDonorAuditEvent({
      action: 'DONOR_REPORT_FINALIZED',
      reportId: 'report-uuid-789',
      programCode: 'WHO_TB',
      finalizerId: 'user-abc',
    })

    expect(mockEmitClientAudit).toHaveBeenCalledOnce()
    const meta = (mockEmitClientAudit.mock.calls[0]![0] as Record<string, unknown>).metadata as Record<string, unknown>
    expect(meta.donorEvent).toBe('DONOR_REPORT_FINALIZED')
    expect(meta.finalizerId).toBe('user-abc')
  })

  it('emits DONOR_REPORT_EXPORTED with format pdf', () => {
    reportDonorAuditEvent({
      action: 'DONOR_REPORT_EXPORTED',
      reportId: 'report-uuid-789',
      format: 'pdf',
    })

    const meta = (mockEmitClientAudit.mock.calls[0]![0] as Record<string, unknown>).metadata as Record<string, unknown>
    expect(meta.donorEvent).toBe('DONOR_REPORT_EXPORTED')
    expect(meta.format).toBe('pdf')
  })

  it('emits DONOR_REPORT_EXPORTED with format share', () => {
    reportDonorAuditEvent({
      action: 'DONOR_REPORT_EXPORTED',
      reportId: 'report-uuid-789',
      format: 'share',
    })

    const meta = (mockEmitClientAudit.mock.calls[0]![0] as Record<string, unknown>).metadata as Record<string, unknown>
    expect(meta.format).toBe('share')
  })

  it('does not include PHI fields in any donor audit event', () => {
    reportDonorAuditEvent({
      action: 'DONOR_REPORT_GENERATED',
      reportId: 'r-1',
      programCode: 'WHO_TB',
    })

    const call = mockEmitClientAudit.mock.calls[0]![0] as Record<string, unknown>
    // Only inspect metadata — the payload must not include patient data
    const prohibited = ['patientId', 'patientName', 'patientRef', 'diagnosis', 'medication', 'dob', 'allergy']
    for (const key of prohibited) {
      expect(call).not.toHaveProperty(key)
      expect(call.metadata).not.toHaveProperty(key)
    }
  })
})
