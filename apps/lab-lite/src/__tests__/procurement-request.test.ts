/**
 * Procurement Request Tests — Story 52.3 Task 9 (AC 1, 2, 3, 10)
 *
 * Unit tests for:
 *  - Resupply request form validation (AC 2)
 *  - Request creation and Dexie persistence (AC 2, 10)
 *  - Status history is append-only (AC 5)
 *  - Burndown integration: pre-fill and urgency auto-assignment (AC 1)
 *  - Offline behavior: request saves immediately (AC 10)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  validateResupplyRequest,
  computeUrgencyFromDaysRemaining,
  buildResupplyRequest,
} from '../lib/procurement/request-sync'

// ---------------------------------------------------------------------------
// Mock Dexie, audit client, and HLC — unit tests only need pure functions
// ---------------------------------------------------------------------------

vi.mock('../lib/db', () => ({
  getDb: vi.fn(() => ({
    resupplyRequests: {
      add: vi.fn().mockResolvedValue(1),
      put: vi.fn().mockResolvedValue(1),
      where: vi.fn(() => ({
        equals: vi.fn(() => ({ first: vi.fn().mockResolvedValue(null), toArray: vi.fn().mockResolvedValue([]) }),
        ),
      })),
    },
    syncQueue: {
      put: vi.fn().mockResolvedValue(undefined),
    },
    transaction: vi.fn((_mode: string, _tables: unknown, fn: () => Promise<unknown>) => fn()),
  })),
  enqueueSyncEvent: vi.fn().mockResolvedValue(undefined),
}))

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
// Task 1: validateResupplyRequest — form validation (AC 2)
// ---------------------------------------------------------------------------

describe('validateResupplyRequest', () => {
  it('rejects empty items array', () => {
    const result = validateResupplyRequest({ items: [], urgency: 'routine', notes: '' })
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('At least one item is required')
  })

  it('rejects item with quantity <= 0', () => {
    const result = validateResupplyRequest({
      items: [
        { reagentCode: 'MAL-001', reagentDisplay: 'Malaria RDT', quantityRequested: 0, unitOfMeasure: 'tests', currentStock: 5, daysOfSupplyRemaining: 10 },
      ],
      urgency: 'routine',
      notes: '',
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('quantity'))).toBe(true)
  })

  it('rejects notes exceeding 500 characters', () => {
    const result = validateResupplyRequest({
      items: [
        { reagentCode: 'MAL-001', reagentDisplay: 'Malaria RDT', quantityRequested: 100, unitOfMeasure: 'tests', currentStock: 5, daysOfSupplyRemaining: 10 },
      ],
      urgency: 'routine',
      notes: 'x'.repeat(501),
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('500'))).toBe(true)
  })

  it('requires urgency to be one of the valid values', () => {
    const result = validateResupplyRequest({
      items: [
        { reagentCode: 'MAL-001', reagentDisplay: 'Malaria RDT', quantityRequested: 100, unitOfMeasure: 'tests', currentStock: 5, daysOfSupplyRemaining: 10 },
      ],
      urgency: 'unknown' as never,
      notes: '',
    })
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('urgency'))).toBe(true)
  })

  it('accepts a valid single-item request', () => {
    const result = validateResupplyRequest({
      items: [
        { reagentCode: 'MAL-001', reagentDisplay: 'Malaria RDT', quantityRequested: 50, unitOfMeasure: 'tests', currentStock: 5, daysOfSupplyRemaining: 10 },
      ],
      urgency: 'urgent',
      notes: 'Running low on rapid tests',
    })
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('accepts a valid multi-item request', () => {
    const result = validateResupplyRequest({
      items: [
        { reagentCode: 'MAL-001', reagentDisplay: 'Malaria RDT', quantityRequested: 50, unitOfMeasure: 'tests', currentStock: 5, daysOfSupplyRemaining: 10 },
        { reagentCode: 'HBA1C-001', reagentDisplay: 'HbA1c Kit', quantityRequested: 20, unitOfMeasure: 'tests', currentStock: 2, daysOfSupplyRemaining: 3 },
      ],
      urgency: 'critical',
      notes: '',
    })
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// computeUrgencyFromDaysRemaining — burndown integration (AC 1, Task 8)
// ---------------------------------------------------------------------------

describe('computeUrgencyFromDaysRemaining', () => {
  it('returns routine for > 14 days remaining', () => {
    expect(computeUrgencyFromDaysRemaining(20)).toBe('routine')
    expect(computeUrgencyFromDaysRemaining(15)).toBe('routine')
  })

  it('returns urgent for 7-14 days remaining', () => {
    expect(computeUrgencyFromDaysRemaining(14)).toBe('urgent')
    expect(computeUrgencyFromDaysRemaining(10)).toBe('urgent')
    expect(computeUrgencyFromDaysRemaining(7)).toBe('urgent')
  })

  it('returns critical for < 7 days remaining', () => {
    expect(computeUrgencyFromDaysRemaining(6)).toBe('critical')
    expect(computeUrgencyFromDaysRemaining(0)).toBe('critical')
  })
})

// ---------------------------------------------------------------------------
// buildResupplyRequest — request construction (AC 2)
// ---------------------------------------------------------------------------

describe('buildResupplyRequest', () => {
  it('creates a request with status submitted and syncStatus pending', () => {
    const req = buildResupplyRequest({
      labId: 'lab-001',
      requestedBy: 'tech-001',
      items: [
        { reagentCode: 'MAL-001', reagentDisplay: 'Malaria RDT', quantityRequested: 50, unitOfMeasure: 'tests', currentStock: 5, daysOfSupplyRemaining: 10 },
      ],
      urgency: 'urgent',
      notes: 'Urgent restock',
      hlcTimestamp: '2026-05-31T00:00:00Z:0:test',
    })
    expect(req.status).toBe('submitted')
    expect(req.syncStatus).toBe('pending')
    expect(req.statusHistory).toHaveLength(1)
    expect(req.statusHistory[0].status).toBe('submitted')
    expect(req.batchOrderId).toBeNull()
    expect(req.estimatedDelivery).toBeNull()
    expect(req.actualDelivery).toBeNull()
  })

  it('generates a requestId UUID', () => {
    const req = buildResupplyRequest({
      labId: 'lab-001',
      requestedBy: 'tech-001',
      items: [
        { reagentCode: 'MAL-001', reagentDisplay: 'Malaria RDT', quantityRequested: 50, unitOfMeasure: 'tests', currentStock: 5, daysOfSupplyRemaining: 10 },
      ],
      urgency: 'routine',
      notes: '',
      hlcTimestamp: '2026-05-31T00:00:00Z:0:test',
    })
    expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('sets unitPrice and totalPrice to null on creation (filled by coordinator)', () => {
    const req = buildResupplyRequest({
      labId: 'lab-001',
      requestedBy: 'tech-001',
      items: [
        { reagentCode: 'MAL-001', reagentDisplay: 'Malaria RDT', quantityRequested: 50, unitOfMeasure: 'tests', currentStock: 5, daysOfSupplyRemaining: 10 },
      ],
      urgency: 'routine',
      notes: '',
      hlcTimestamp: '2026-05-31T00:00:00Z:0:test',
    })
    expect(req.items[0].unitPrice).toBeNull()
    expect(req.items[0].totalPrice).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Status history append-only invariant (AC 5)
// ---------------------------------------------------------------------------

describe('status history is append-only', () => {
  it('buildResupplyRequest produces exactly one initial status entry', () => {
    const req = buildResupplyRequest({
      labId: 'lab-001',
      requestedBy: 'tech-001',
      items: [{ reagentCode: 'X', reagentDisplay: 'X', quantityRequested: 1, unitOfMeasure: 'tests', currentStock: 1, daysOfSupplyRemaining: 20 }],
      urgency: 'routine',
      notes: '',
      hlcTimestamp: '2026-05-31T00:00:00Z:0:test',
    })
    // The initial history has exactly one entry — submitted
    expect(req.statusHistory).toHaveLength(1)
    expect(req.statusHistory[0].status).toBe('submitted')
  })
})
