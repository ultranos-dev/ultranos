import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { getDb, addToQueue, type UploadQueueEntry } from '../lib/db'
import { reportQueueAuditEvent, type QueueAuditEventType } from '../lib/queue-audit'

function makeEntry(overrides: Partial<UploadQueueEntry> = {}): Omit<UploadQueueEntry, 'id'> {
  return {
    file: new Blob(['data'], { type: 'application/pdf' }),
    fileName: 'result.pdf',
    fileType: 'application/pdf',
    metadata: {
      loincCode: '58410-2',
      loincDisplay: 'Blood Work — CBC',
      collectionDate: '2026-04-30',
    },
    patientRef: 'pat-ref-123',
    patientFirstName: 'Ahmad',
    queuedAt: new Date().toISOString(),
    status: 'pending' as const,
    retryCount: 0,
    lastAttemptAt: null,
    ...overrides,
  }
}

// Mock fetch globally
const mockFetch = vi.fn().mockResolvedValue({ ok: true })

describe('Queue Audit Events', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.uploadQueue.clear()
    vi.stubGlobal('fetch', mockFetch)
    mockFetch.mockClear()
  })

  afterEach(async () => {
    const db = getDb()
    await db.uploadQueue.clear()
    vi.unstubAllGlobals()
  })

  it('reports QUEUE_ENTRY_CREATED audit event', async () => {
    await reportQueueAuditEvent({
      action: 'QUEUE_ENTRY_CREATED',
      queueEntryId: 1,
      testCategory: 'Blood Work — CBC',
      patientRef: 'ref-123',
      timestamp: '2026-04-30T10:00:00Z',
    })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toContain('lab.reportQueueEvent')
    const body = JSON.parse(opts.body)
    expect(body.json.event).toBe('QUEUE_ENTRY_CREATED')
    expect(body.json.queueEntryId).toBe(1)
    expect(body.json.testCategory).toBe('Blood Work — CBC')
    expect(body.json.patientRef).toBe('ref-123')
  })

  it('reports QUEUE_DRAIN_SUCCESS audit event', async () => {
    await reportQueueAuditEvent({
      action: 'QUEUE_DRAIN_SUCCESS',
      queueEntryId: 2,
      testCategory: 'HbA1c',
      patientRef: 'ref-456',
      timestamp: '2026-04-30T11:00:00Z',
    })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.json.event).toBe('QUEUE_DRAIN_SUCCESS')
  })

  it('reports QUEUE_ITEM_EXPIRED audit event', async () => {
    await reportQueueAuditEvent({
      action: 'QUEUE_ITEM_EXPIRED',
      queueEntryId: 3,
      testCategory: 'Lipid Panel',
      patientRef: 'ref-789',
      timestamp: '2026-04-30T12:00:00Z',
    })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.json.event).toBe('QUEUE_ITEM_EXPIRED')
  })

  it('reports QUEUE_ITEM_DISCARDED audit event', async () => {
    await reportQueueAuditEvent({
      action: 'QUEUE_ITEM_DISCARDED',
      queueEntryId: 4,
      testCategory: 'Urinalysis',
      patientRef: 'ref-xyz',
      timestamp: '2026-04-30T13:00:00Z',
    })

    expect(mockFetch).toHaveBeenCalledTimes(1)
    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.json.event).toBe('QUEUE_ITEM_DISCARDED')
  })

  it('never throws on audit failure (fire-and-forget)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    // Should not throw
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

  it('includes all required fields: queue entry ID, test category, patient ref, timestamp', async () => {
    await reportQueueAuditEvent({
      action: 'QUEUE_DRAIN_SUCCESS',
      queueEntryId: 42,
      testCategory: 'Thyroid Function — TSH',
      patientRef: 'ref-full',
      timestamp: '2026-04-30T14:00:00Z',
      technicianId: 'tech-001',
    })

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.json.queueEntryId).toBe(42)
    expect(body.json.testCategory).toBe('Thyroid Function — TSH')
    expect(body.json.patientRef).toBe('ref-full')
    expect(body.json.timestamp).toBe('2026-04-30T14:00:00Z')
    expect(body.json.technicianId).toBe('tech-001')
  })
})
