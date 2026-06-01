/**
 * Procurement Status Tests — Story 52.3 Task 9 (AC 5, 6, 7)
 *
 * Unit tests for:
 *  - Status receiver: all status transitions (AC 5)
 *  - Status history append-only invariant (AC 5)
 *  - Pricing update on received payload (AC 8)
 *  - Delivery completion: copy to orderHistory (AC 7)
 *  - Audit log emitted on status update (AC 9)
 *  - estimatedDelivery update (AC 5)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  applyStatusUpdate,
  type StatusUpdatePayload,
} from '../lib/procurement/status-receiver'
import type { ResupplyRequest } from '../lib/db'

// ---------------------------------------------------------------------------
// Mock Dexie, audit client, HLC, notification
// ---------------------------------------------------------------------------

const mockPut = vi.fn().mockResolvedValue(undefined)
const mockAdd = vi.fn().mockResolvedValue(1)
const mockFirst = vi.fn()
const mockUpdate = vi.fn().mockResolvedValue(1)

vi.mock('../lib/db', async () => {
  const actual = await vi.importActual<typeof import('../lib/db')>('../lib/db')
  return {
    ...actual,
    getDb: vi.fn(() => ({
      resupplyRequests: {
        where: vi.fn(() => ({
          equals: vi.fn(() => ({ first: mockFirst }),
          ),
        })),
        update: mockUpdate,
      },
      orderHistory: {
        add: mockAdd,
      },
      transaction: vi.fn((_mode: string, _tables: unknown, fn: () => Promise<unknown>) => fn()),
    })),
  }
})

vi.mock('@ultranos/audit-logger/client', () => ({
  emitClientAudit: vi.fn(),
}))

vi.mock('../lib/hlc', () => ({
  hlc: { now: vi.fn(() => ({ wallTime: 0, logicalTime: 0, nodeId: 'test' })) },
  serializeHlc: vi.fn(() => '2026-05-31T00:00:00Z:0:test'),
}))

vi.mock('../stores/auth-session-store', () => ({
  useAuthSessionStore: {
    getState: vi.fn(() => ({
      session: { userId: 'tech-001', labId: 'lab-001' },
    })),
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides: Partial<ResupplyRequest> = {}): ResupplyRequest {
  return {
    id: 1,
    requestId: 'req-uuid-001',
    labId: 'lab-001',
    requestedBy: 'tech-001',
    requestedAt: '2026-05-01T08:00:00Z',
    hlcTimestamp: '2026-05-01T08:00:00Z:0:test',
    items: [
      { reagentCode: 'MAL-001', reagentDisplay: 'Malaria RDT', quantityRequested: 50, unitOfMeasure: 'tests', currentStock: 5, daysOfSupplyRemaining: 10, unitPrice: null, totalPrice: null },
    ],
    urgency: 'urgent',
    notes: '',
    status: 'submitted',
    statusHistory: [{ status: 'submitted', updatedAt: '2026-05-01T08:00:00Z', updatedBy: 'tech-001', note: null }],
    batchOrderId: null,
    estimatedDelivery: null,
    actualDelivery: null,
    syncStatus: 'synced',
    createdAt: '2026-05-01T08:00:00Z',
    updatedAt: '2026-05-01T08:00:00Z',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Status transitions (AC 5)
// ---------------------------------------------------------------------------

describe('applyStatusUpdate — status transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('transitions from submitted to received, appends to statusHistory', async () => {
    const request = makeRequest({ status: 'submitted' })
    mockFirst.mockResolvedValue(request)

    const payload: StatusUpdatePayload = {
      requestId: 'req-uuid-001',
      newStatus: 'received',
      updatedBy: 'coordinator-001',
      note: 'Request received at Hub',
      estimatedDelivery: null,
      batchOrderId: null,
      pricing: null,
    }

    await applyStatusUpdate(payload)

    expect(mockUpdate).toHaveBeenCalledOnce()
    const updateCall = mockUpdate.mock.calls[0]
    const updates = updateCall[1] as Partial<ResupplyRequest>

    expect(updates.status).toBe('received')
    expect(updates.statusHistory).toHaveLength(2)
    expect(updates.statusHistory![1].status).toBe('received')
    expect(updates.statusHistory![1].updatedBy).toBe('coordinator-001')
    expect(updates.statusHistory![1].note).toBe('Request received at Hub')
  })

  it('transitions to approved', async () => {
    const request = makeRequest({ status: 'received' })
    mockFirst.mockResolvedValue(request)

    const payload: StatusUpdatePayload = {
      requestId: 'req-uuid-001',
      newStatus: 'approved',
      updatedBy: 'coordinator-001',
      note: null,
      estimatedDelivery: '2026-05-20',
      batchOrderId: 'batch-123',
      pricing: null,
    }

    await applyStatusUpdate(payload)

    const updates = mockUpdate.mock.calls[0][1] as Partial<ResupplyRequest>
    expect(updates.status).toBe('approved')
    expect(updates.estimatedDelivery).toBe('2026-05-20')
    expect(updates.batchOrderId).toBe('batch-123')
  })

  it('transitions to ordered with pricing', async () => {
    const request = makeRequest({ status: 'approved' })
    mockFirst.mockResolvedValue(request)

    const payload: StatusUpdatePayload = {
      requestId: 'req-uuid-001',
      newStatus: 'ordered',
      updatedBy: 'coordinator-001',
      note: 'Placed with Supplier X',
      estimatedDelivery: '2026-05-22',
      batchOrderId: 'batch-123',
      pricing: [{ itemCode: 'MAL-001', unitPrice: 45, totalPrice: 2250 }],
    }

    await applyStatusUpdate(payload)

    const updates = mockUpdate.mock.calls[0][1] as Partial<ResupplyRequest>
    expect(updates.status).toBe('ordered')
    expect(updates.items![0].unitPrice).toBe(45)
    expect(updates.items![0].totalPrice).toBe(2250)
  })

  it('transitions to shipped', async () => {
    const request = makeRequest({ status: 'ordered' })
    mockFirst.mockResolvedValue(request)

    const payload: StatusUpdatePayload = {
      requestId: 'req-uuid-001',
      newStatus: 'shipped',
      updatedBy: 'coordinator-001',
      note: 'Dispatched 2026-05-22',
      estimatedDelivery: '2026-05-25',
      batchOrderId: null,
      pricing: null,
    }

    await applyStatusUpdate(payload)

    const updates = mockUpdate.mock.calls[0][1] as Partial<ResupplyRequest>
    expect(updates.status).toBe('shipped')
    expect(updates.statusHistory).toHaveLength(2)
  })

  it('transitions to delivered: sets actualDelivery and copies to orderHistory', async () => {
    const request = makeRequest({
      status: 'shipped',
      estimatedDelivery: '2026-05-25',
      items: [
        { reagentCode: 'MAL-001', reagentDisplay: 'Malaria RDT', quantityRequested: 50, unitOfMeasure: 'tests', currentStock: 5, daysOfSupplyRemaining: 10, unitPrice: 45, totalPrice: 2250 },
      ],
    })
    mockFirst.mockResolvedValue(request)

    const payload: StatusUpdatePayload = {
      requestId: 'req-uuid-001',
      newStatus: 'delivered',
      updatedBy: 'system',
      note: null,
      estimatedDelivery: null,
      batchOrderId: null,
      pricing: null,
    }

    await applyStatusUpdate(payload)

    const updates = mockUpdate.mock.calls[0][1] as Partial<ResupplyRequest>
    expect(updates.status).toBe('delivered')
    expect(updates.actualDelivery).toBeTruthy()

    // Should copy to orderHistory
    expect(mockAdd).toHaveBeenCalledOnce()
    const orderHistoryEntry = mockAdd.mock.calls[0][0]
    expect(orderHistoryEntry.requestId).toBe('req-uuid-001')
    expect(orderHistoryEntry.deliveredAt).toBeTruthy()
    expect(typeof orderHistoryEntry.leadTimeDays).toBe('number')
    expect(orderHistoryEntry.leadTimeDays).toBeGreaterThanOrEqual(0)
  })

  it('handles rejected status with reason note', async () => {
    const request = makeRequest({ status: 'received' })
    mockFirst.mockResolvedValue(request)

    const payload: StatusUpdatePayload = {
      requestId: 'req-uuid-001',
      newStatus: 'rejected',
      updatedBy: 'coordinator-001',
      note: 'Use existing stock from Lab B first',
      estimatedDelivery: null,
      batchOrderId: null,
      pricing: null,
    }

    await applyStatusUpdate(payload)

    const updates = mockUpdate.mock.calls[0][1] as Partial<ResupplyRequest>
    expect(updates.status).toBe('rejected')
    expect(updates.statusHistory!.at(-1)!.note).toBe('Use existing stock from Lab B first')
  })

  it('is a no-op if requestId not found locally', async () => {
    mockFirst.mockResolvedValue(null)

    const payload: StatusUpdatePayload = {
      requestId: 'nonexistent-uuid',
      newStatus: 'received',
      updatedBy: 'coordinator-001',
      note: null,
      estimatedDelivery: null,
      batchOrderId: null,
      pricing: null,
    }

    await applyStatusUpdate(payload)

    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Status history append-only invariant (AC 5)
// ---------------------------------------------------------------------------

describe('status history append-only', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('never removes or replaces an existing status entry', async () => {
    const request = makeRequest({
      status: 'approved',
      statusHistory: [
        { status: 'submitted', updatedAt: '2026-05-01T08:00:00Z', updatedBy: 'tech-001', note: null },
        { status: 'received', updatedAt: '2026-05-02T08:00:00Z', updatedBy: 'coordinator-001', note: null },
        { status: 'approved', updatedAt: '2026-05-03T08:00:00Z', updatedBy: 'coordinator-001', note: null },
      ],
    })
    mockFirst.mockResolvedValue(request)

    const payload: StatusUpdatePayload = {
      requestId: 'req-uuid-001',
      newStatus: 'ordered',
      updatedBy: 'coordinator-001',
      note: null,
      estimatedDelivery: null,
      batchOrderId: null,
      pricing: null,
    }

    await applyStatusUpdate(payload)

    const updates = mockUpdate.mock.calls[0][1] as Partial<ResupplyRequest>
    // 3 existing entries + 1 new = 4
    expect(updates.statusHistory).toHaveLength(4)
    // All original entries preserved
    expect(updates.statusHistory![0].status).toBe('submitted')
    expect(updates.statusHistory![1].status).toBe('received')
    expect(updates.statusHistory![2].status).toBe('approved')
    // New entry appended
    expect(updates.statusHistory![3].status).toBe('ordered')
  })
})

// ---------------------------------------------------------------------------
// Audit log (AC 9)
// ---------------------------------------------------------------------------

describe('audit logging on status update', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('emits audit event for every status update', async () => {
    const { emitClientAudit } = await import('@ultranos/audit-logger/client')
    const request = makeRequest({ status: 'submitted' })
    mockFirst.mockResolvedValue(request)

    const payload: StatusUpdatePayload = {
      requestId: 'req-uuid-001',
      newStatus: 'received',
      updatedBy: 'coordinator-001',
      note: null,
      estimatedDelivery: null,
      batchOrderId: null,
      pricing: null,
    }

    await applyStatusUpdate(payload)

    expect(emitClientAudit).toHaveBeenCalledOnce()
    const auditArgs = (emitClientAudit as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(auditArgs.resourceId).toBe('req-uuid-001')
    expect(auditArgs.metadata.oldStatus).toBe('submitted')
    expect(auditArgs.metadata.newStatus).toBe('received')
  })
})
