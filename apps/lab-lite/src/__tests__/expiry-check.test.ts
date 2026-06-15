import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import 'fake-indexeddb/auto'

// Mock audit-client to prevent initialization side effects in test environment
vi.mock('../lib/audit-client', () => ({
  reportReagentEvent: vi.fn(),
  reportQueueAuditEvent: vi.fn(),
  emitClientAudit: vi.fn(),
  startAuditDrain: vi.fn(),
  stopAuditDrain: vi.fn(),
  AuditAction: {},
  AuditResourceType: {},
}))

import {
  getDb,
  addToQueue,
  getQueueItems,
  addReagentInventory,
  getReagentByReagentId,
  type UploadQueueEntry,
  ReagentStatus,
} from '../lib/db'
import { checkExpiredItems, checkExpiredReagents, startExpiryChecker } from '../lib/expiry-check'
import { reportReagentEvent } from '../lib/audit-client'

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

// ---------------------------------------------------------------------------
// Reagent Expiry Check — checkExpiredReagents()
// ---------------------------------------------------------------------------

function makeReagentEntry(overrides: Record<string, unknown> = {}) {
  const base = {
    reagentId: `r-${Math.random().toString(36).slice(2)}`,
    name: 'Test Reagent',
    lotNumber: 'LOT-001',
    openDate: '2026-04-01',
    expiryDate: '2026-05-01', // past
    expectedTests: 100,
    testsPerformed: 10,
    unit: 'bottle',
    costPerUnit: 500,
    status: ReagentStatus.ACTIVE,
    disposalDate: null,
    disposalReason: null,
    disposalNotes: null,
    remainingAtDisposal: null,
    linkedTestCode: '58410-2',
    hlcTimestamp: '0000000000000-0000-0001',
    createdAt: '2026-04-01T08:00:00.000Z',
    syncStatus: 'pending' as const,
    ...overrides,
  }
  return base
}

describe('checkExpiredReagents', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const db = getDb()
    await db.reagent_inventory.clear()
    await db.reagent_consumption_log.clear()
  })

  afterEach(async () => {
    const db = getDb()
    await db.reagent_inventory.clear()
    await db.reagent_consumption_log.clear()
  })

  it('auto-expires ACTIVE reagents with expiryDate in the past and emits audit events', async () => {
    // Use a real past date (well before today 2026-05-31)
    const entry = makeReagentEntry({ expiryDate: '2025-01-01' })
    await addReagentInventory(entry)

    const result = await checkExpiredReagents()

    expect(result.expiredCount).toBe(1)
    const updated = await getReagentByReagentId(entry.reagentId as string)
    expect(updated?.status).toBe(ReagentStatus.EXPIRED)
    expect(reportReagentEvent).toHaveBeenCalledWith({
      action: 'REAGENT_AUTO_EXPIRED',
      reagentId: entry.reagentId,
      statusChange: 'ACTIVE → EXPIRED',
    })
  })

  it('does not expire ACTIVE reagents that expire in the future', async () => {
    const entry = makeReagentEntry({ expiryDate: '2027-12-31' })
    await addReagentInventory(entry)

    const result = await checkExpiredReagents()

    expect(result.expiredCount).toBe(0)
    const updated = await getReagentByReagentId(entry.reagentId as string)
    expect(updated?.status).toBe(ReagentStatus.ACTIVE)
    expect(reportReagentEvent).not.toHaveBeenCalled()
  })

  it('does not re-expire already EXPIRED reagents', async () => {
    const entry = makeReagentEntry({ expiryDate: '2025-01-01', status: ReagentStatus.EXPIRED })
    await addReagentInventory(entry)

    const result = await checkExpiredReagents()

    expect(result.expiredCount).toBe(0)
    expect(reportReagentEvent).not.toHaveBeenCalled()
  })

  it('does not affect DISPOSED or DEPLETED reagents', async () => {
    await addReagentInventory(makeReagentEntry({ expiryDate: '2025-01-01', status: ReagentStatus.DISPOSED }))
    await addReagentInventory(makeReagentEntry({ expiryDate: '2025-01-01', status: ReagentStatus.DEPLETED }))

    const result = await checkExpiredReagents()

    expect(result.expiredCount).toBe(0)
  })

  it('handles an empty reagent inventory gracefully', async () => {
    const result = await checkExpiredReagents()

    expect(result.expiredCount).toBe(0)
  })

  it('auto-expires multiple reagents and emits one event per reagent', async () => {
    const e1 = makeReagentEntry({ expiryDate: '2025-01-01' })
    const e2 = makeReagentEntry({ expiryDate: '2025-06-01' })
    await addReagentInventory(e1)
    await addReagentInventory(e2)

    const result = await checkExpiredReagents()

    expect(result.expiredCount).toBe(2)
    expect(reportReagentEvent).toHaveBeenCalledTimes(2)
  })
})
