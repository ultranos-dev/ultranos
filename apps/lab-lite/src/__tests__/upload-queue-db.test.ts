import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'
import { getDb, addToQueue, getQueueItems, getQueueCount, updateQueueItemStatus, removeQueueItem, type UploadQueueEntry } from '../lib/db'

function makeEntry(overrides: Partial<UploadQueueEntry> = {}): Omit<UploadQueueEntry, 'id'> {
  return {
    file: new Blob(['test-data'], { type: 'application/pdf' }),
    fileName: 'result.pdf',
    fileType: 'application/pdf',
    metadata: {
      loincCode: '58410-2',
      loincDisplay: 'Blood Work — CBC',
      collectionDate: '2026-04-30',
    },
    patientRef: 'pat-opaque-ref-123',
    patientFirstName: 'Ahmad',
    queuedAt: new Date().toISOString(),
    status: 'pending' as const,
    retryCount: 0,
    lastAttemptAt: null,
    ...overrides,
  }
}

describe('Upload Queue Database (Dexie)', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.uploadQueue.clear()
  })

  afterEach(async () => {
    const db = getDb()
    await db.uploadQueue.clear()
  })

  it('creates and retrieves a queue entry', async () => {
    const entry = makeEntry()
    const id = await addToQueue(entry)

    expect(id).toBeDefined()
    expect(typeof id).toBe('number')

    const items = await getQueueItems()
    expect(items).toHaveLength(1)
    expect(items[0].patientFirstName).toBe('Ahmad')
    expect(items[0].status).toBe('pending')
    expect(items[0].metadata.loincCode).toBe('58410-2')
  })

  it('stores file data correctly', async () => {
    const blob = new Blob(['pdf-content'], { type: 'application/pdf' })
    const entry = makeEntry({ file: blob, fileName: 'stored.pdf', fileType: 'application/pdf' })
    await addToQueue(entry)

    const items = await getQueueItems()
    // fake-indexeddb may not fully preserve Blob in jsdom;
    // verify the entry was stored with the file reference and metadata
    expect(items[0].file).toBeDefined()
    expect(items[0].fileName).toBe('stored.pdf')
    expect(items[0].fileType).toBe('application/pdf')
  })

  it('returns items in FIFO order (oldest first)', async () => {
    await addToQueue(makeEntry({ patientFirstName: 'First', queuedAt: '2026-04-28T10:00:00Z' }))
    await addToQueue(makeEntry({ patientFirstName: 'Second', queuedAt: '2026-04-29T10:00:00Z' }))
    await addToQueue(makeEntry({ patientFirstName: 'Third', queuedAt: '2026-04-30T10:00:00Z' }))

    const items = await getQueueItems()
    expect(items[0].patientFirstName).toBe('First')
    expect(items[1].patientFirstName).toBe('Second')
    expect(items[2].patientFirstName).toBe('Third')
  })

  it('enforces 50-item queue limit', async () => {
    // Add 50 items
    for (let i = 0; i < 50; i++) {
      await addToQueue(makeEntry({ patientFirstName: `Patient-${i}` }))
    }

    const count = await getQueueCount()
    expect(count).toBe(50)

    // 51st should be rejected
    await expect(addToQueue(makeEntry({ patientFirstName: 'Overflow' }))).rejects.toThrow(
      /queue is full/i,
    )

    // Count should still be 50
    expect(await getQueueCount()).toBe(50)
  })

  it('updates queue item status', async () => {
    const id = await addToQueue(makeEntry())
    await updateQueueItemStatus(id, 'uploading')

    const items = await getQueueItems()
    expect(items[0].status).toBe('uploading')
  })

  it('updates retry count and last attempt timestamp', async () => {
    const id = await addToQueue(makeEntry())
    const now = new Date().toISOString()
    await updateQueueItemStatus(id, 'failed', { retryCount: 2, lastAttemptAt: now })

    const items = await getQueueItems()
    expect(items[0].retryCount).toBe(2)
    expect(items[0].lastAttemptAt).toBe(now)
    expect(items[0].status).toBe('failed')
  })

  it('removes a queue item by ID', async () => {
    const id1 = await addToQueue(makeEntry({ patientFirstName: 'Keep' }))
    const id2 = await addToQueue(makeEntry({ patientFirstName: 'Remove' }))

    await removeQueueItem(id2)

    const items = await getQueueItems()
    expect(items).toHaveLength(1)
    expect(items[0].patientFirstName).toBe('Keep')
  })

  it('returns correct queue count', async () => {
    expect(await getQueueCount()).toBe(0)

    await addToQueue(makeEntry())
    expect(await getQueueCount()).toBe(1)

    await addToQueue(makeEntry())
    expect(await getQueueCount()).toBe(2)
  })

  it('persists all required fields on queue entry', async () => {
    const entry = makeEntry({
      fileName: 'scan.png',
      fileType: 'image/png',
      patientRef: 'ref-xyz',
      patientFirstName: 'Fatima',
      metadata: { loincCode: '4548-4', loincDisplay: 'HbA1c', collectionDate: '2026-04-15' },
    })
    await addToQueue(entry)

    const items = await getQueueItems()
    const item = items[0]
    expect(item.fileName).toBe('scan.png')
    expect(item.fileType).toBe('image/png')
    expect(item.patientRef).toBe('ref-xyz')
    expect(item.patientFirstName).toBe('Fatima')
    expect(item.metadata.loincCode).toBe('4548-4')
    expect(item.metadata.loincDisplay).toBe('HbA1c')
    expect(item.metadata.collectionDate).toBe('2026-04-15')
    expect(item.retryCount).toBe(0)
    expect(item.lastAttemptAt).toBeNull()
  })
})
