import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Story 59.1 disposition (C-SYS-5): `lib/queue-audit.ts` previously POSTed to
 * `lab.reportQueueEvent` — a Hub procedure that never existed, so every queue
 * audit event was silently lost. It now records through the client Dexie audit
 * ledger (audit-client.reportQueueAuditEvent), whose drain worker syncs to the
 * Hub's real `audit.sync` endpoint. These tests assert the delegation.
 */

const mockLedgerReport = vi.fn()
vi.mock('../lib/audit-client', () => ({
  reportQueueAuditEvent: (...args: unknown[]) => mockLedgerReport(...args),
}))

const { reportQueueAuditEvent } = await import('../lib/queue-audit')

describe('Queue Audit Events (Story 59.1 — local ledger disposition)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('records QUEUE_ENTRY_CREATED through the client audit ledger', async () => {
    await reportQueueAuditEvent({
      action: 'QUEUE_ENTRY_CREATED',
      queueEntryId: 1,
      testCategory: 'Blood Work — CBC',
      patientRef: 'ref-123',
      timestamp: '2026-04-30T10:00:00Z',
    })

    expect(mockLedgerReport).toHaveBeenCalledTimes(1)
    const [payload] = mockLedgerReport.mock.calls[0]
    expect(payload.action).toBe('QUEUE_ENTRY_CREATED')
    expect(payload.queueEntryId).toBe(1)
    expect(payload.testCategory).toBe('Blood Work — CBC')
    expect(payload.patientRef).toBe('ref-123')
    expect(payload.timestamp).toBe('2026-04-30T10:00:00Z')
  })

  it.each([
    'QUEUE_DRAIN_SUCCESS',
    'QUEUE_ITEM_EXPIRED',
    'QUEUE_ITEM_DISCARDED',
  ] as const)('records %s through the client audit ledger', async (action) => {
    await reportQueueAuditEvent({
      action,
      queueEntryId: 7,
      testCategory: 'HbA1c',
      patientRef: 'ref-456',
      timestamp: '2026-04-30T11:00:00Z',
    })

    expect(mockLedgerReport).toHaveBeenCalledTimes(1)
    expect(mockLedgerReport.mock.calls[0][0].action).toBe(action)
  })

  it('never performs a network fetch (no dead lab.reportQueueEvent call)', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)
    try {
      await reportQueueAuditEvent({
        action: 'QUEUE_ENTRY_CREATED',
        queueEntryId: 2,
        testCategory: 'CBC',
        patientRef: 'ref-123',
        timestamp: '2026-04-30T10:00:00Z',
      })
      expect(mockFetch).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('includes technicianId when provided', async () => {
    await reportQueueAuditEvent(
      {
        action: 'QUEUE_DRAIN_SUCCESS',
        queueEntryId: 42,
        testCategory: 'Thyroid Function — TSH',
        patientRef: 'ref-full',
        timestamp: '2026-04-30T14:00:00Z',
        technicianId: 'tech-001',
      },
      'ignored-token',
    )

    const [payload] = mockLedgerReport.mock.calls[0]
    expect(payload.queueEntryId).toBe(42)
    expect(payload.technicianId).toBe('tech-001')
  })

  it('never throws when the ledger write fails (fire-and-forget)', async () => {
    mockLedgerReport.mockImplementationOnce(() => {
      throw new Error('ledger unavailable')
    })

    await expect(
      reportQueueAuditEvent({
        action: 'QUEUE_ENTRY_CREATED',
        queueEntryId: 1,
        testCategory: 'CBC',
        patientRef: 'ref-123',
        timestamp: '2026-04-30T10:00:00Z',
      }),
    ).resolves.toBeUndefined()
  })
})
