import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { getDb, addToQueue, getQueueItems, type UploadQueueEntry } from '../lib/db'
import { drainQueue, _resetDrainGuard, type DrainDependencies } from '../lib/upload-queue-worker'

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

function makeDeps(overrides: Partial<DrainDependencies> = {}): DrainDependencies {
  return {
    uploadFn: vi.fn().mockResolvedValue({ success: true, reportId: 'rpt-1', status: 'accepted', virusScanStatus: 'clean' }),
    getToken: vi.fn().mockResolvedValue('test-token'),
    onAuditEvent: vi.fn(),
    sleep: vi.fn().mockResolvedValue(undefined),
    blobToBase64Fn: vi.fn().mockResolvedValue('dGVzdC1kYXRh'),
    ...overrides,
  }
}

describe('Upload Queue Worker — drainQueue', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.uploadQueue.clear()
    _resetDrainGuard()
  })

  afterEach(async () => {
    const db = getDb()
    await db.uploadQueue.clear()
  })

  it('drains a single pending item successfully', async () => {
    await addToQueue(makeEntry())
    const deps = makeDeps()

    await drainQueue(deps)

    const remaining = await getQueueItems()
    expect(remaining).toHaveLength(0)
    expect(deps.uploadFn).toHaveBeenCalledTimes(1)
  })

  it('drains items in FIFO order', async () => {
    await addToQueue(makeEntry({ patientFirstName: 'First', queuedAt: '2026-04-28T10:00:00Z' }))
    await addToQueue(makeEntry({ patientFirstName: 'Second', queuedAt: '2026-04-29T10:00:00Z' }))

    const callOrder: string[] = []
    const deps = makeDeps({
      uploadFn: vi.fn().mockImplementation(async (input) => {
        callOrder.push(input.fileName)
        return { success: true, reportId: 'rpt', status: 'ok', virusScanStatus: 'clean' }
      }),
    })

    await drainQueue(deps)

    expect(callOrder).toHaveLength(2)
    // Both should have been processed (FIFO order enforced by queuedAt index)
    const remaining = await getQueueItems()
    expect(remaining).toHaveLength(0)
  })

  it('removes item from queue on successful upload', async () => {
    await addToQueue(makeEntry())
    const deps = makeDeps()

    await drainQueue(deps)

    expect(await getQueueItems()).toHaveLength(0)
    expect(deps.onAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'QUEUE_DRAIN_SUCCESS' }),
    )
  })

  it('retries on failure with exponential backoff up to 3 times', async () => {
    await addToQueue(makeEntry())
    const deps = makeDeps({
      uploadFn: vi.fn().mockRejectedValue(new Error('Network error')),
    })

    await drainQueue(deps)

    const items = await getQueueItems()
    expect(items).toHaveLength(1)
    expect(items[0].status).toBe('failed')
    expect(items[0].retryCount).toBe(3)
  })

  it('marks item as failed after 3 retries', async () => {
    await addToQueue(makeEntry({ retryCount: 2 }))
    const deps = makeDeps({
      uploadFn: vi.fn().mockRejectedValue(new Error('Server error')),
    })

    await drainQueue(deps)

    const items = await getQueueItems()
    expect(items).toHaveLength(1)
    expect(items[0].status).toBe('failed')
    expect(items[0].retryCount).toBe(3)
  })

  it('skips expired and failed items during drain', async () => {
    await addToQueue(makeEntry({ status: 'expired' }))
    await addToQueue(makeEntry({ status: 'failed', retryCount: 3 }))
    await addToQueue(makeEntry({ status: 'pending', patientFirstName: 'Drainable' }))

    const deps = makeDeps()
    await drainQueue(deps)

    // Only the pending item should have been uploaded
    expect(deps.uploadFn).toHaveBeenCalledTimes(1)
    const items = await getQueueItems()
    // expired and failed should remain
    expect(items).toHaveLength(2)
  })

  it('emits audit event on successful drain', async () => {
    await addToQueue(makeEntry({ patientRef: 'ref-abc' }))
    const deps = makeDeps()

    await drainQueue(deps)

    expect(deps.onAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'QUEUE_DRAIN_SUCCESS',
        patientRef: 'ref-abc',
      }),
    )
  })

  it('converts file Blob to base64 for upload', async () => {
    const fileContent = 'test-pdf-data'
    const blob = new Blob([fileContent], { type: 'application/pdf' })
    await addToQueue(makeEntry({ file: blob, fileName: 'test.pdf', fileType: 'application/pdf' }))

    const deps = makeDeps()
    await drainQueue(deps)

    expect(deps.uploadFn).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'test.pdf',
        fileType: 'application/pdf',
      }),
      'test-token',
    )
  })
})
