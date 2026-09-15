import { describe, it, expect, beforeEach, vi } from 'vitest'
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
} from '../lib/sample-service'
import { reportSampleAuditEvent } from '../lib/audit-client'
import { getCustodyEventsForSample, putOrders, getOrders, type LabOrderEntry } from '../lib/db'

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
    expect(events[0].eventType).toBe('received')
    expect(events[0].fromActorId).toBe('courier-001')
    expect(events[0].sampleId).toBe(specimen.id)
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
