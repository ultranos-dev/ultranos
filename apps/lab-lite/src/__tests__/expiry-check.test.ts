import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { getDb, addToQueue, getQueueItems, type UploadQueueEntry } from '../lib/db'
import { checkExpiredItems, startExpiryChecker } from '../lib/expiry-check'

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

describe('48-Hour Expiry Check', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.uploadQueue.clear()
  })

  afterEach(async () => {
    const db = getDb()
    await db.uploadQueue.clear()
  })

  it('marks items older than 48 hours as expired', async () => {
    const oldTime = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString()
    await addToQueue(makeEntry({ queuedAt: oldTime, status: 'pending' }))

    const onAuditEvent = vi.fn()
    const result = await checkExpiredItems(onAuditEvent)

    expect(result.expiredCount).toBe(1)
    const items = await getQueueItems()
    expect(items[0].status).toBe('expired')
  })

  it('does not mark items younger than 48 hours', async () => {
    const recentTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    await addToQueue(makeEntry({ queuedAt: recentTime, status: 'pending' }))

    const result = await checkExpiredItems(vi.fn())

    expect(result.expiredCount).toBe(0)
    const items = await getQueueItems()
    expect(items[0].status).toBe('pending')
  })

  it('does not re-expire already expired items', async () => {
    const oldTime = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString()
    await addToQueue(makeEntry({ queuedAt: oldTime, status: 'expired' }))

    const onAuditEvent = vi.fn()
    const result = await checkExpiredItems(onAuditEvent)

    expect(result.expiredCount).toBe(0)
    expect(onAuditEvent).not.toHaveBeenCalled()
  })

  it('does not expire failed items', async () => {
    const oldTime = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString()
    await addToQueue(makeEntry({ queuedAt: oldTime, status: 'failed', retryCount: 3 }))

    const result = await checkExpiredItems(vi.fn())

    expect(result.expiredCount).toBe(0)
    const items = await getQueueItems()
    expect(items[0].status).toBe('failed')
  })

  it('emits audit event for each expired item', async () => {
    const oldTime = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString()
    await addToQueue(makeEntry({ queuedAt: oldTime, status: 'pending', patientRef: 'ref-a' }))
    await addToQueue(makeEntry({ queuedAt: oldTime, status: 'pending', patientRef: 'ref-b' }))

    const onAuditEvent = vi.fn()
    await checkExpiredItems(onAuditEvent)

    expect(onAuditEvent).toHaveBeenCalledTimes(2)
    expect(onAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'QUEUE_ITEM_EXPIRED', patientRef: 'ref-a' }),
    )
    expect(onAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'QUEUE_ITEM_EXPIRED', patientRef: 'ref-b' }),
    )
  })

  it('handles mixed fresh and expired items', async () => {
    const oldTime = new Date(Date.now() - 49 * 60 * 60 * 1000).toISOString()
    const freshTime = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()

    await addToQueue(makeEntry({ queuedAt: oldTime, status: 'pending', patientFirstName: 'Old' }))
    await addToQueue(makeEntry({ queuedAt: freshTime, status: 'pending', patientFirstName: 'Fresh' }))

    await checkExpiredItems(vi.fn())

    const items = await getQueueItems()
    const oldItem = items.find((i) => i.patientFirstName === 'Old')
    const freshItem = items.find((i) => i.patientFirstName === 'Fresh')

    expect(oldItem!.status).toBe('expired')
    expect(freshItem!.status).toBe('pending')
  })

  it('startExpiryChecker returns cleanup function', () => {
    const cleanup = startExpiryChecker(vi.fn())
    expect(typeof cleanup).toBe('function')
    cleanup()
  })
})
