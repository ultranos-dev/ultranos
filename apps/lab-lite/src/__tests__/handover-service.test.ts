import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import {
  getDb,
  putHandoverReport,
  getPendingHandoverReports,
  getHandoverReport,
  type HandoverReport,
} from '../lib/db'
import {
  generateHandoverReport,
  finalizeHandover,
  acknowledgeHandover,
} from '../lib/handover-service'

// Prevent real audit events from firing during tests
vi.mock('../lib/audit-client', () => ({
  reportHandoverAuditEvent: vi.fn(),
}))

// Mock crypto.randomUUID for deterministic IDs
let uuidCounter = 0
vi.stubGlobal('crypto', {
  randomUUID: () => `test-uuid-${++uuidCounter}`,
})

function makeReport(overrides: Partial<HandoverReport> = {}): HandoverReport {
  return {
    id: `report-${++uuidCounter}`,
    outgoingTechId: 'tech-001',
    outgoingTechName: 'Alice',
    incomingTechId: null,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
    acknowledgedAt: null,
    pendingSamples: { stat: 2, routine: 5, sampleIds: ['LAB-001', 'LAB-002'] },
    equipmentAlerts: [],
    qcStatus: [],
    incompleteOrders: [],
    outgoingNotes: '',
    incomingNotes: null,
    shiftDate: new Date().toISOString().slice(0, 10),
    ...overrides,
  }
}

describe('Handover DB helpers', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.handover_reports.clear()
    await db.shift_sessions.clear()
  })

  it('puts and retrieves a handover report', async () => {
    const report = makeReport()
    await putHandoverReport(report)

    const retrieved = await getHandoverReport(report.id)
    expect(retrieved).toBeDefined()
    expect(retrieved!.outgoingTechName).toBe('Alice')
    expect(retrieved!.status).toBe('PENDING')
  })

  it('getPendingHandoverReports returns only PENDING reports', async () => {
    const pending = makeReport({ status: 'PENDING' })
    const acknowledged = makeReport({ status: 'ACKNOWLEDGED' })
    await putHandoverReport(pending)
    await putHandoverReport(acknowledged)

    const results = await getPendingHandoverReports()
    expect(results).toHaveLength(1)
    expect(results[0].id).toBe(pending.id)
  })
})

describe('generateHandoverReport', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.handover_reports.clear()
    await db.shift_sessions.clear()
    await db.orders.clear()
    await db.temperature_excursions.clear()
    uuidCounter = 0
  })

  it('creates a PENDING report with correct metadata', async () => {
    const report = await generateHandoverReport('tech-001', 'Alice')

    expect(report.status).toBe('PENDING')
    expect(report.outgoingTechId).toBe('tech-001')
    expect(report.outgoingTechName).toBe('Alice')
    expect(report.incomingTechId).toBeNull()
    expect(report.acknowledgedAt).toBeNull()
    expect(report.shiftDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('stores the report in Dexie', async () => {
    const report = await generateHandoverReport('tech-001', 'Alice')
    const stored = await getHandoverReport(report.id)
    expect(stored).toBeDefined()
    expect(stored!.id).toBe(report.id)
  })

  it('aggregates incomplete RECEIVED orders', async () => {
    const db = getDb()
    await db.orders.put({
      orderId: 'order-001',
      patientFirstName: 'X',
      patientAge: 30,
      patientRef: 'Patient/abc',
      testsRequested: [],
      urgency: 'routine',
      orderingPhysicianName: 'Dr Y',
      specialInstructions: null,
      status: 'RECEIVED',
      authoredOn: new Date().toISOString(),
      receivedAt: new Date().toISOString(),
      syncedAt: new Date().toISOString(),
    } as any)

    const report = await generateHandoverReport('tech-001', 'Alice')
    expect(report.incompleteOrders).toHaveLength(1)
    expect(report.incompleteOrders[0].orderId).toBe('order-001')
    expect(report.incompleteOrders[0].urgency).toBe('routine')
  })

  it('does not include patient names or diagnoses in the report', async () => {
    const report = await generateHandoverReport('tech-001', 'Alice')
    const reportStr = JSON.stringify(report)
    // Sample IDs are fine; patient names should never appear
    expect(reportStr).not.toContain('diagnosis')
    expect(reportStr).not.toContain('firstName')
  })
})

describe('finalizeHandover', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.handover_reports.clear()
    await db.shift_sessions.clear()
    uuidCounter = 0
  })

  it('updates outgoing notes on the report', async () => {
    const report = await generateHandoverReport('tech-001', 'Alice')
    await finalizeHandover(report.id, 'Check freezer A')

    const updated = await getHandoverReport(report.id)
    expect(updated!.outgoingNotes).toBe('Check freezer A')
  })

  it('ends the active shift session for the outgoing tech', async () => {
    const db = getDb()
    // Create an active shift session
    await db.shift_sessions.put({
      id: 'session-001',
      techId: 'tech-001',
      startedAt: new Date().toISOString(),
      endedAt: null,
      status: 'ACTIVE',
    })

    const report = await generateHandoverReport('tech-001', 'Alice')
    await finalizeHandover(report.id, '')

    const sessions = await db.shift_sessions.toArray()
    const techSession = sessions.find((s) => s.techId === 'tech-001')
    expect(techSession?.status).toBe('ENDED')
    expect(techSession?.endedAt).not.toBeNull()
  })

  it('throws when report does not exist', async () => {
    await expect(finalizeHandover('non-existent', '')).rejects.toThrow(
      'Handover report non-existent not found',
    )
  })
})

describe('acknowledgeHandover', () => {
  beforeEach(async () => {
    const db = getDb()
    await db.handover_reports.clear()
    await db.shift_sessions.clear()
    uuidCounter = 0
  })

  it('marks report as ACKNOWLEDGED with incoming tech and timestamp', async () => {
    const report = await generateHandoverReport('tech-001', 'Alice')
    await acknowledgeHandover(report.id, 'tech-002', 'All noted')

    const updated = await getHandoverReport(report.id)
    expect(updated!.status).toBe('ACKNOWLEDGED')
    expect(updated!.incomingTechId).toBe('tech-002')
    expect(updated!.acknowledgedAt).not.toBeNull()
    expect(updated!.incomingNotes).toBe('All noted')
  })

  it('creates a new ACTIVE shift session for the incoming tech', async () => {
    const db = getDb()
    const report = await generateHandoverReport('tech-001', 'Alice')
    await acknowledgeHandover(report.id, 'tech-002')

    const sessions = await db.shift_sessions.where('techId').equals('tech-002').toArray()
    expect(sessions).toHaveLength(1)
    expect(sessions[0].status).toBe('ACTIVE')
    expect(sessions[0].endedAt).toBeNull()
  })

  it('allows acknowledgment without optional notes', async () => {
    const report = await generateHandoverReport('tech-001', 'Alice')
    await acknowledgeHandover(report.id, 'tech-002')

    const updated = await getHandoverReport(report.id)
    expect(updated!.incomingNotes).toBeNull()
  })

  it('throws when acknowledging a non-existent report', async () => {
    await expect(acknowledgeHandover('bad-id', 'tech-002')).rejects.toThrow(
      'Handover report bad-id not found',
    )
  })
})
