import { describe, it, expect, beforeEach, vi, type MockInstance } from 'vitest'
import 'fake-indexeddb/auto'

vi.mock('../lib/audit-client', () => ({
  reportSampleAuditEvent: vi.fn(),
}))

vi.mock('../lib/hlc', () => ({
  hlc: { now: () => ({ wallMs: Date.now(), counter: 0, nodeId: 'test-node' }) },
  serializeHlc: vi.fn().mockReturnValue('mock-hlc-ts'),
}))

vi.mock('../stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: () => ({ session: { practitionerId: 'tech-001', userId: 'user-001' } }),
  },
}))

// navigator.onLine is true in test env
Object.defineProperty(navigator, 'onLine', { value: true, writable: true })

import { getDb } from '../lib/db'
import {
  accessionSample,
  transitionSampleStatus,
  rejectSample,
  recordHandoff,
  setSampleArchived,
} from '../lib/sample-service'
import { reportSampleAuditEvent } from '../lib/audit-client'
import { getCustodyEventsForSample, getReceivedSampleForOrder, putOrders, getOrders, type LabOrderEntry } from '../lib/db'

const BASE_INPUT = {
  orderId: 'order-abc',
  sampleType: 'blood',
  condition: 'acceptable' as const,
  receivedFromId: 'courier-001',
  patientRef: 'Patient/patient-uuid-001',
}

function makeLabOrder(overrides: Partial<LabOrderEntry> = {}): LabOrderEntry {
  return {
    orderId: 'order-abc',
    patientFirstName: 'Ahmad',
    patientAge: 30,
    patientRef: 'Patient/patient-uuid-001',
    testsRequested: [{ loincCode: '58410-2', loincDisplay: 'CBC' }],
    urgency: 'routine',
    orderingPhysicianName: 'Dr. Yusuf',
    specialInstructions: null,
    status: 'RECEIVED',
    authoredOn: '2026-09-14T08:00:00.000Z',
    receivedAt: '2026-09-14T08:05:00.000Z',
    syncedAt: '2026-09-14T08:05:00.000Z',
    ...overrides,
  }
}

describe('accessionSample', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.samples.clear()
    await db.custody_events.clear()
    await db.syncQueue.clear()
    await db.orders.clear()
    vi.clearAllMocks()
  })

  it('creates a FHIR Specimen with the correct structure', async () => {
    const specimen = await accessionSample(BASE_INPUT)

    expect(specimen.resourceType).toBe('Specimen')
    expect(specimen.status).toBe('available')
    expect(specimen._ultranos.pipelineStatus).toBe('received')
    expect(specimen._ultranos.labSampleId).toMatch(/^LAB-\d{8}-\d{4}$/)
    expect(specimen.subject.reference).toBe('Patient/patient-uuid-001')
    expect(specimen.request?.[0]?.reference).toBe('ServiceRequest/order-abc')
  })

  it('persists specimen to Dexie', async () => {
    const specimen = await accessionSample(BASE_INPUT)
    const db = getDb()
    const stored = await db.samples.get(specimen.id)
    expect(stored).toBeDefined()
    expect(stored!._ultranos.labSampleId).toBe(specimen._ultranos.labSampleId)
  })

  it('creates initial custody event of type received', async () => {
    const specimen = await accessionSample(BASE_INPUT)
    const events = await getCustodyEventsForSample(specimen.id)
    expect(events).toHaveLength(1)
    expect(events[0]!.eventType).toBe('received')
    expect(events[0]!.fromActorId).toBe('courier-001')
    expect(events[0]!.sampleId).toBe(specimen.id)
  })

  it('emits SAMPLE_ACCESSIONED audit event', async () => {
    await accessionSample(BASE_INPUT)
    expect(reportSampleAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SAMPLE_ACCESSIONED' }),
    )
  })

  it('enqueues Specimen sync event', async () => {
    await accessionSample(BASE_INPUT)
    const db = getDb()
    const queue = await db.syncQueue.toArray()
    const specimenSync = queue.find((q) => q.resourceType === 'Specimen')
    expect(specimenSync).toBeDefined()
  })

  it('stores notes in the specimen', async () => {
    const specimen = await accessionSample({ ...BASE_INPUT, notes: 'Tech note' })
    expect(specimen.note?.[0]?.text).toBe('Tech note')
  })

  it('stamps data-minimized patient + ordered test onto the specimen when provided', async () => {
    const specimen = await accessionSample({
      ...BASE_INPUT,
      patientFirstName: 'Ahmad',
      patientAge: 30,
      orderedTests: [{ loincCode: '58410-2', loincDisplay: 'CBC' }],
    })
    expect(specimen._ultranos.patientFirstName).toBe('Ahmad')
    expect(specimen._ultranos.patientAge).toBe(30)
    expect(specimen._ultranos.orderedTests?.[0]?.loincCode).toBe('58410-2')
    expect(specimen._ultranos.orderedTests?.[0]?.loincDisplay).toBe('CBC')
  })

  it('omits stamp fields when not provided (backward compatible)', async () => {
    const specimen = await accessionSample(BASE_INPUT)
    expect(specimen._ultranos.patientFirstName).toBeUndefined()
    expect(specimen._ultranos.orderedTests).toBeUndefined()
  })

  it('advances linked order from RECEIVED to IN_PROGRESS after accessioning', async () => {
    // Seed a local RECEIVED order for the same orderId
    await putOrders([makeLabOrder({ orderId: BASE_INPUT.orderId, status: 'RECEIVED' })])

    await accessionSample(BASE_INPUT)

    const orders = await getOrders()
    const linked = orders.find((o) => o.orderId === BASE_INPUT.orderId)
    expect(linked?.status).toBe('IN_PROGRESS')
  })

  it('still succeeds when the order is not cached locally (non-fatal path)', async () => {
    // No order seeded — order table is empty
    const db = getDb()
    const count = await db.orders.count()
    expect(count).toBe(0)

    // Must not throw even though there is no cached order to advance
    await expect(accessionSample(BASE_INPUT)).resolves.not.toThrow()
  })

  it('first-time accession produces exactly one "received" specimen and rejects nothing', async () => {
    const db = getDb()
    const specimen = await accessionSample(BASE_INPUT)

    const allSamples = await db.samples.toArray()
    expect(allSamples).toHaveLength(1)
    expect(allSamples[0]!._ultranos.pipelineStatus).toBe('received')
    expect(allSamples[0]!.id).toBe(specimen.id)
  })
})

describe('setSampleArchived', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.samples.clear()
    await db.custody_events.clear()
    await db.syncQueue.clear()
    await db.archived_samples.clear()
    vi.clearAllMocks()
  })

  it('records the sample in the durable archived_samples table', async () => {
    const specimen = await accessionSample(BASE_INPUT)
    await setSampleArchived(specimen.id, true, 'tech-001')
    const row = await getDb().archived_samples.get(specimen.id)
    expect(row).toBeDefined()
  })

  it('removes the archived_samples row on unarchive', async () => {
    const specimen = await accessionSample(BASE_INPUT)
    await setSampleArchived(specimen.id, true, 'tech-001')
    await setSampleArchived(specimen.id, false, 'tech-001')
    const row = await getDb().archived_samples.get(specimen.id)
    expect(row).toBeUndefined()
  })

  it('sets archived=true on the specimen', async () => {
    const specimen = await accessionSample(BASE_INPUT)
    await setSampleArchived(specimen.id, true, 'tech-001')

    const stored = await getDb().samples.get(specimen.id)
    expect(stored!._ultranos.archived).toBe(true)
  })

  it('reverses archived back to false (unarchive)', async () => {
    const specimen = await accessionSample(BASE_INPUT)
    await setSampleArchived(specimen.id, true, 'tech-001')
    await setSampleArchived(specimen.id, false, 'tech-001')

    const stored = await getDb().samples.get(specimen.id)
    expect(stored!._ultranos.archived).toBe(false)
  })

  it('does NOT change pipelineStatus when archiving', async () => {
    const specimen = await accessionSample(BASE_INPUT)
    await setSampleArchived(specimen.id, true, 'tech-001')

    const stored = await getDb().samples.get(specimen.id)
    expect(stored!._ultranos.pipelineStatus).toBe('received')
  })

  it('emits a SAMPLE_ARCHIVED audit event on archive', async () => {
    const specimen = await accessionSample(BASE_INPUT)
    vi.clearAllMocks()
    await setSampleArchived(specimen.id, true, 'tech-001')

    expect(reportSampleAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SAMPLE_ARCHIVED', sampleId: specimen.id }),
    )
  })

  it('emits a SAMPLE_UNARCHIVED audit event on unarchive', async () => {
    const specimen = await accessionSample(BASE_INPUT)
    await setSampleArchived(specimen.id, true, 'tech-001')
    vi.clearAllMocks()
    await setSampleArchived(specimen.id, false, 'tech-001')

    expect(reportSampleAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SAMPLE_UNARCHIVED', sampleId: specimen.id }),
    )
  })

  it('writes an append-only custody event for the archive action', async () => {
    const specimen = await accessionSample(BASE_INPUT)
    await setSampleArchived(specimen.id, true, 'tech-001')

    const events = await getCustodyEventsForSample(specimen.id)
    expect(events.some((e) => e.eventType === 'archive')).toBe(true)
  })

  it('enqueues a Specimen sync event on archive', async () => {
    const specimen = await accessionSample(BASE_INPUT)
    await getDb().syncQueue.clear()
    await setSampleArchived(specimen.id, true, 'tech-001')

    const queue = await getDb().syncQueue.toArray()
    expect(queue.some((q) => q.resourceType === 'Specimen' && q.resourceId === specimen.id)).toBe(true)
  })

  it('is a no-op (no audit) when archiving an already-archived sample', async () => {
    const specimen = await accessionSample(BASE_INPUT)
    await setSampleArchived(specimen.id, true, 'tech-001')
    vi.clearAllMocks()
    await setSampleArchived(specimen.id, true, 'tech-001')

    expect(reportSampleAuditEvent).not.toHaveBeenCalled()
  })

  it('throws when the sample does not exist', async () => {
    await expect(setSampleArchived('nonexistent-id', true, 'tech-001')).rejects.toThrow(
      /Sample not found/,
    )
  })
})

describe('accessionSample — re-collection supersede (Fix #5)', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.samples.clear()
    await db.custody_events.clear()
    await db.syncQueue.clear()
    await db.orders.clear()
    vi.clearAllMocks()
  })

  it('second accession for same order supersedes first: first specimen ends up rejected', async () => {
    const first = await accessionSample(BASE_INPUT)
    expect(first._ultranos.pipelineStatus).toBe('received')

    // Re-accession the same orderId
    await accessionSample(BASE_INPUT)

    const db = getDb()
    const firstStored = await db.samples.get(first.id)
    expect(firstStored!._ultranos.pipelineStatus).toBe('rejected')
    expect(firstStored!._ultranos.rejectionReason).toBe('superseded-by-recollection')
    expect(firstStored!.status).toBe('unsatisfactory')
  })

  it('second accession for same order: second specimen is "received"', async () => {
    await accessionSample(BASE_INPUT)
    const second = await accessionSample(BASE_INPUT)

    expect(second._ultranos.pipelineStatus).toBe('received')
    expect(second.status).toBe('available')
  })

  it('getReceivedSampleForOrder returns the SECOND (active) specimen after re-collection', async () => {
    const first = await accessionSample(BASE_INPUT)
    const second = await accessionSample(BASE_INPUT)

    const active = await getReceivedSampleForOrder(BASE_INPUT.orderId)
    expect(active).toBeDefined()
    expect(active!.id).toBe(second.id)
    expect(active!.id).not.toBe(first.id)
  })

  it('worklist samples-path yields exactly ONE active item for the order after re-collection', async () => {
    await accessionSample(BASE_INPUT)
    await accessionSample(BASE_INPUT)

    const db = getDb()
    const ACTIVE_STATUSES = new Set(['received', 'in-processing'])
    const activeSamples = await db.samples
      .filter((s: any) => ACTIVE_STATUSES.has(s._ultranos?.pipelineStatus))
      .toArray()

    // Only the second (replacement) specimen is active; the first is rejected
    expect(activeSamples).toHaveLength(1)
  })

  it('superseded specimen has a rejection custody event', async () => {
    const first = await accessionSample(BASE_INPUT)
    await accessionSample(BASE_INPUT)

    const events = await getCustodyEventsForSample(first.id)
    const rejectionEvent = events.find((e) => e.eventType === 'rejection')
    expect(rejectionEvent).toBeDefined()
    expect(rejectionEvent!.notes).toBe('superseded-by-recollection')
  })

  it('append-only: rejected (superseded) specimen is still in the db, not deleted', async () => {
    const first = await accessionSample(BASE_INPUT)
    await accessionSample(BASE_INPUT)

    const db = getDb()
    const firstStored = await db.samples.get(first.id)
    // Must still exist — append-only history
    expect(firstStored).toBeDefined()
  })
})

describe('accessionSample — supersede putSample failure aborts new specimen creation', () => {
  // This suite verifies the critical invariant: if the putSample that marks the
  // prior specimen as rejected/superseded throws, accessionSample must throw too
  // and must NOT create a new specimen — the system must never be left with two
  // active rows for the same order.

  let putSampleSpy: MockInstance

  beforeEach(async () => {
    const db = getDb()
    await db.samples.clear()
    await db.custody_events.clear()
    await db.syncQueue.clear()
    await db.orders.clear()
    vi.clearAllMocks()
    // Restore any spy installed by a previous test so the real db is in effect.
    putSampleSpy?.mockRestore()
  })

  it('accessionSample throws when the supersede putSample write fails', async () => {
    // Seed a prior 'received' specimen so the supersede path is taken.
    const first = await accessionSample(BASE_INPUT)
    expect(first._ultranos.pipelineStatus).toBe('received')

    // Capture the real implementation BEFORE installing the spy.
    const dbModule = await import('../lib/db')
    const realPutSample = dbModule.putSample.bind(dbModule)
    let callCount = 0
    putSampleSpy = vi.spyOn(dbModule, 'putSample').mockImplementation(async (...args) => {
      callCount++
      if (callCount === 1) {
        // First call in accessionSample = supersede status-write → simulate failure.
        throw new Error('DB write failure — supersede putSample')
      }
      return realPutSample(...args)
    })

    await expect(accessionSample(BASE_INPUT)).rejects.toThrow()
  })

  it('no new specimen is created when the supersede putSample write fails', async () => {
    // Seed a prior 'received' specimen so the supersede path is taken.
    await accessionSample(BASE_INPUT)

    const dbModule = await import('../lib/db')
    const realPutSample = dbModule.putSample.bind(dbModule)
    let callCount = 0
    putSampleSpy = vi.spyOn(dbModule, 'putSample').mockImplementation(async (...args) => {
      callCount++
      if (callCount === 1) {
        // First call = supersede status-write → fail so new specimen is NOT created.
        throw new Error('DB write failure — supersede putSample')
      }
      return realPutSample(...args)
    })

    // accessionSample must throw — swallow the error; we assert the side-effect below.
    await accessionSample(BASE_INPUT).catch(() => { /* expected */ })

    // Restore the spy before reading the DB so helper reads go through real impl.
    putSampleSpy.mockRestore()

    const db = getDb()
    const allSamples = await db.samples.toArray()

    // Still exactly ONE specimen (the original), still 'received' — NOT two active rows.
    expect(allSamples).toHaveLength(1)
    expect(allSamples[0]!._ultranos.pipelineStatus).toBe('received')
  })
})

describe('transitionSampleStatus', () => {
  let specimenId: string

  beforeEach(async () => {
    const db = getDb()
    await db.samples.clear()
    await db.custody_events.clear()
    await db.syncQueue.clear()
    vi.clearAllMocks()
    const specimen = await accessionSample(BASE_INPUT)
    specimenId = specimen.id
  })

  it('transitions received → in-processing', async () => {
    await transitionSampleStatus(specimenId, 'in-processing', 'tech-001')
    const db = getDb()
    const updated = await db.samples.get(specimenId)
    expect(updated?._ultranos.pipelineStatus).toBe('in-processing')
  })

  it('creates status-change custody event', async () => {
    await transitionSampleStatus(specimenId, 'in-processing', 'tech-001')
    const events = await getCustodyEventsForSample(specimenId)
    const statusChange = events.find((e) => e.eventType === 'status-change')
    expect(statusChange).toBeDefined()
    expect(statusChange!.fromStatus).toBe('received')
    expect(statusChange!.toStatus).toBe('in-processing')
  })

  it('emits SAMPLE_STATUS_CHANGED audit event', async () => {
    await transitionSampleStatus(specimenId, 'in-processing', 'tech-001')
    expect(reportSampleAuditEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'SAMPLE_STATUS_CHANGED' }),
    )
  })

  it('rejects backward transition (in-processing → received)', async () => {
    await transitionSampleStatus(specimenId, 'in-processing', 'tech-001')
    await expect(
      transitionSampleStatus(specimenId, 'received', 'tech-001'),
    ).rejects.toThrow(/Invalid transition/)
  })

  it('enforces full pipeline: received → in-processing → completed → reported', async () => {
    await transitionSampleStatus(specimenId, 'in-processing', 'tech-001')
    await transitionSampleStatus(specimenId, 'completed', 'tech-001')
    await transitionSampleStatus(specimenId, 'reported', 'tech-001')

    const db = getDb()
    const updated = await db.samples.get(specimenId)
    expect(updated?._ultranos.pipelineStatus).toBe('reported')
  })

  it('throws for unknown sample id', async () => {
    await expect(
      transitionSampleStatus('non-existent-id', 'in-processing', 'tech-001'),
    ).rejects.toThrow(/not found/)
  })
})

describe('rejectSample', () => {
  let specimenId: string

  beforeEach(async () => {
    const db = getDb()
    await db.samples.clear()
    await db.custody_events.clear()
    await db.syncQueue.clear()
    vi.clearAllMocks()
    const specimen = await accessionSample(BASE_INPUT)
    specimenId = specimen.id
  })

  it('sets FHIR status to unsatisfactory and pipeline to rejected', async () => {
    await rejectSample(specimenId, 'Hemolysis detected', 'tech-001')
    const db = getDb()
    const updated = await db.samples.get(specimenId)
    expect(updated?.status).toBe('unsatisfactory')
    expect(updated?._ultranos.pipelineStatus).toBe('rejected')
    expect(updated?._ultranos.rejectionReason).toBe('Hemolysis detected')
  })

  it('creates rejection custody event', async () => {
    await rejectSample(specimenId, 'Hemolysis detected', 'tech-001')
    const events = await getCustodyEventsForSample(specimenId)
    const rejection = events.find((e) => e.eventType === 'rejection')
    expect(rejection).toBeDefined()
    expect(rejection!.notes).toBe('Hemolysis detected')
  })

  it('emits SAMPLE_REJECTED audit event', async () => {
    await rejectSample(specimenId, 'Clotted', 'tech-001')
    expect(reportSampleAuditEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'SAMPLE_REJECTED' }),
    )
  })

  it('queues a RejectionNotification sync event', async () => {
    await rejectSample(specimenId, 'Mislabeled', 'tech-001')
    const db = getDb()
    const queue = await db.syncQueue.toArray()
    const notification = queue.find((q) => q.resourceType === 'RejectionNotification')
    expect(notification).toBeDefined()
    expect(notification!.payload.type).toBe('SAMPLE_REJECTED')
    expect(notification!.payload.reason).toBe('Mislabeled')
    // Must NOT contain patient name (data minimization)
    expect(JSON.stringify(notification!.payload)).not.toMatch(/patient-uuid-001/)
  })
})

describe('recordHandoff', () => {
  let specimenId: string

  beforeEach(async () => {
    const db = getDb()
    await db.samples.clear()
    await db.custody_events.clear()
    await db.syncQueue.clear()
    vi.clearAllMocks()
    const specimen = await accessionSample(BASE_INPUT)
    specimenId = specimen.id
  })

  it('creates a handoff custody event', async () => {
    await recordHandoff(specimenId, 'tech-001', 'senior-tech-002', 'Shift change')
    const events = await getCustodyEventsForSample(specimenId)
    const handoff = events.find((e) => e.eventType === 'handoff')
    expect(handoff).toBeDefined()
    expect(handoff!.fromActorId).toBe('tech-001')
    expect(handoff!.toActorId).toBe('senior-tech-002')
    expect(handoff!.notes).toBe('Shift change')
  })

  it('emits SAMPLE_HANDOFF audit event', async () => {
    await recordHandoff(specimenId, 'tech-001', 'senior-tech-002')
    expect(reportSampleAuditEvent).toHaveBeenLastCalledWith(
      expect.objectContaining({ action: 'SAMPLE_HANDOFF' }),
    )
  })

  it('enqueues CustodyEvent sync event', async () => {
    await recordHandoff(specimenId, 'tech-001', 'senior-tech-002')
    const db = getDb()
    const queue = await db.syncQueue.toArray()
    const custodySync = queue.find((q) => q.resourceType === 'CustodyEvent')
    expect(custodySync).toBeDefined()
  })
})

describe('getReceivedSampleForOrder', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.samples.clear()
    await db.custody_events.clear()
    await db.syncQueue.clear()
    vi.clearAllMocks()
  })

  it('finds a non-rejected specimen accessioned for the order', async () => {
    const { getReceivedSampleForOrder } = await import('../lib/db')
    const specimen = await accessionSample({ ...BASE_INPUT, orderId: 'order-xyz' })
    const found = await getReceivedSampleForOrder('order-xyz')
    expect(found?.id).toBe(specimen.id)
  })

  it('returns undefined for an order with no accessioned sample', async () => {
    const { getReceivedSampleForOrder } = await import('../lib/db')
    expect(await getReceivedSampleForOrder('no-such-order')).toBeUndefined()
  })

  it('excludes a rejected specimen (order remains re-receivable)', async () => {
    const { getReceivedSampleForOrder } = await import('../lib/db')
    const specimen = await accessionSample({ ...BASE_INPUT, orderId: 'order-rej' })
    await rejectSample(specimen.id, 'Hemolysis detected', 'tech-001')
    expect(await getReceivedSampleForOrder('order-rej')).toBeUndefined()
  })
})
