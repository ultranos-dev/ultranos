import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock Dexie db — use vi.hoisted so mocks are available at vi.mock hoist time
const {
  mockDispensesToArray,
  mockDispensesWhere,
  mockSyncQueueToArray,
} = vi.hoisted(() => ({
  mockDispensesToArray: vi.fn().mockResolvedValue([]),
  mockDispensesWhere: vi.fn(),
  mockSyncQueueToArray: vi.fn().mockResolvedValue([]),
}))

vi.mock('@/lib/db', () => ({
  db: {
    dispenses: {
      where: mockDispensesWhere,
      toArray: mockDispensesToArray,
    },
    syncQueue: {
      toArray: mockSyncQueueToArray,
    },
  },
}))

vi.mock('@/lib/audit', () => ({
  auditPhiAccess: vi.fn(),
  AuditAction: { READ: 'READ' },
  AuditResourceType: { PRESCRIPTION: 'PRESCRIPTION' },
}))

import {
  getActiveItems,
  getCompletedItems,
  getFailedItems,
} from '@/lib/queue-data'
import { auditPhiAccess } from '@/lib/audit'

function makeDispense(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    resourceType: 'MedicationDispense',
    status: 'completed',
    subject: { reference: 'Patient/pat1', display: 'Ahmad' },
    medicationCodeableConcept: {
      coding: [{ system: 'urn:ultranos:medication', code: 'med1', display: 'Amoxicillin 500mg' }],
      text: 'Amoxicillin 500mg Capsule',
    },
    performer: [{ actor: { reference: 'Practitioner/p1' } }],
    authorizingPrescription: [{ reference: 'MedicationRequest/rx1' }],
    whenHandedOver: new Date().toISOString(),
    dosageInstruction: [{ text: '1 tablet, 3x per day, for 7 days' }],
    _ultranos: {
      hlcTimestamp: '2026-05-12T10:00:00.000Z:0:node1',
      createdAt: new Date().toISOString(),
      isOfflineCreated: false,
    },
    meta: {
      lastUpdated: new Date().toISOString(),
      versionId: '1',
    },
    ...overrides,
  }
}

function makeSyncQueueEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    resourceType: 'MedicationDispense',
    resourceId: 'd1',
    action: 'create',
    payload: '{}',
    status: 'pending' as const,
    hlcTimestamp: '2026-05-12T10:00:00.000Z:0:node1',
    createdAt: new Date().toISOString(),
    retryCount: 0,
    ...overrides,
  }
}

describe('queue-data: getActiveItems', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDispensesToArray.mockResolvedValue([])
    mockSyncQueueToArray.mockResolvedValue([])
  })

  it('returns dispenses with status !== completed as active', async () => {
    const d1 = makeDispense({ id: 'active-1', status: 'in-progress' })
    mockDispensesToArray.mockResolvedValue([d1])

    const result = await getActiveItems()

    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('active-1')
    expect(result[0]!.phase).toBe('loaded')
  })

  it('returns empty array when no active items', async () => {
    const d1 = makeDispense({ id: 'done-1', status: 'completed' })
    mockDispensesToArray.mockResolvedValue([d1])

    const result = await getActiveItems()
    expect(result).toHaveLength(0)
  })

  it('extracts first name only from subject.display (data minimization)', async () => {
    const d1 = makeDispense({
      id: 'active-2',
      status: 'in-progress',
      subject: { reference: 'Patient/pat1', display: 'Ahmad Khan' },
    })
    mockDispensesToArray.mockResolvedValue([d1])

    const result = await getActiveItems()
    expect(result[0]!.patientFirstName).toBe('Ahmad')
  })

  it('shows medication count as 1 per dispense resource', async () => {
    const d1 = makeDispense({
      id: 'active-3',
      status: 'in-progress',
      medicationCodeableConcept: {
        coding: [
          { system: 'urn:ultranos:medication', code: 'med1', display: 'Amoxicillin 500mg' },
          { system: 'http://www.nlm.nih.gov/research/umls/rxnorm', code: '308182', display: 'Amoxicillin 500mg' },
        ],
        text: 'Amoxicillin 500mg',
      },
    })
    mockDispensesToArray.mockResolvedValue([d1])

    const result = await getActiveItems()
    expect(result[0]!.medicationCount).toBe(1)
  })

  it('emits audit event when active items are returned', async () => {
    const d1 = makeDispense({ id: 'active-4', status: 'in-progress' })
    mockDispensesToArray.mockResolvedValue([d1])

    await getActiveItems()
    expect(auditPhiAccess).toHaveBeenCalledWith(
      'pharmacy-user',
      'READ',
      'PRESCRIPTION',
      'queue-active',
      undefined,
      expect.objectContaining({ tab: 'active', itemCount: 1 }),
    )
  })

  it('does not emit audit event when no items returned', async () => {
    mockDispensesToArray.mockResolvedValue([])

    await getActiveItems()
    expect(auditPhiAccess).not.toHaveBeenCalled()
  })

  it('uses stored fulfillmentPhase from _ultranos when available', async () => {
    const d1 = makeDispense({
      id: 'active-5',
      status: 'in-progress',
      _ultranos: {
        hlcTimestamp: '2026-05-12T10:00:00.000Z:0:node1',
        createdAt: new Date().toISOString(),
        isOfflineCreated: false,
        fulfillmentPhase: 'dispensing',
      },
    })
    mockDispensesToArray.mockResolvedValue([d1])

    const result = await getActiveItems()
    expect(result[0]!.phase).toBe('dispensing')
  })

  it('returns "Unknown" when subject has no display field', async () => {
    const d1 = makeDispense({
      id: 'active-6',
      status: 'in-progress',
      subject: { reference: 'Patient/pat1' },
    })
    mockDispensesToArray.mockResolvedValue([d1])

    const result = await getActiveItems()
    expect(result[0]!.patientFirstName).toBe('Unknown')
  })
})

describe('queue-data: getCompletedItems', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDispensesWhere.mockReturnValue({
      aboveOrEqual: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([]),
      }),
    })
    mockSyncQueueToArray.mockResolvedValue([])
  })

  it('returns completed dispenses from today', async () => {
    const d1 = makeDispense({ id: 'comp-1', status: 'completed' })
    mockDispensesWhere.mockReturnValue({
      aboveOrEqual: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([d1]),
      }),
    })

    const result = await getCompletedItems()
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('comp-1')
  })

  it('marks items as synced when not in syncQueue', async () => {
    const d1 = makeDispense({ id: 'comp-2', status: 'completed' })
    mockDispensesWhere.mockReturnValue({
      aboveOrEqual: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([d1]),
      }),
    })
    mockSyncQueueToArray.mockResolvedValue([])

    const result = await getCompletedItems()
    expect(result[0]!.syncStatus).toBe('synced')
  })

  it('marks items as pending when in syncQueue with retryCount === 0', async () => {
    const d1 = makeDispense({ id: 'comp-3', status: 'completed' })
    mockDispensesWhere.mockReturnValue({
      aboveOrEqual: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([d1]),
      }),
    })
    mockSyncQueueToArray.mockResolvedValue([
      makeSyncQueueEntry({ resourceId: 'comp-3', retryCount: 0 }),
    ])

    const result = await getCompletedItems()
    expect(result[0]!.syncStatus).toBe('pending')
  })

  it('marks items as failed when in syncQueue with retryCount > 0 and status not synced', async () => {
    const d1 = makeDispense({ id: 'comp-4', status: 'completed' })
    mockDispensesWhere.mockReturnValue({
      aboveOrEqual: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([d1]),
      }),
    })
    mockSyncQueueToArray.mockResolvedValue([
      makeSyncQueueEntry({ resourceId: 'comp-4', retryCount: 3, status: 'failed' }),
    ])

    const result = await getCompletedItems()
    expect(result[0]!.syncStatus).toBe('failed')
  })

  it('marks items as synced when syncQueue entry has retryCount > 0 but status is synced', async () => {
    const d1 = makeDispense({ id: 'comp-5', status: 'completed' })
    mockDispensesWhere.mockReturnValue({
      aboveOrEqual: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([d1]),
      }),
    })
    mockSyncQueueToArray.mockResolvedValue([
      makeSyncQueueEntry({ resourceId: 'comp-5', retryCount: 2, status: 'synced' }),
    ])

    const result = await getCompletedItems()
    expect(result[0]!.syncStatus).toBe('synced')
  })

  it('emits audit event when completed items are returned', async () => {
    const d1 = makeDispense({ id: 'comp-6', status: 'completed' })
    mockDispensesWhere.mockReturnValue({
      aboveOrEqual: vi.fn().mockReturnValue({
        toArray: vi.fn().mockResolvedValue([d1]),
      }),
    })

    await getCompletedItems()
    expect(auditPhiAccess).toHaveBeenCalledWith(
      'pharmacy-user',
      'READ',
      'PRESCRIPTION',
      'queue-completed',
      undefined,
      expect.objectContaining({ tab: 'completed', itemCount: 1 }),
    )
  })
})

describe('queue-data: getFailedItems', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDispensesToArray.mockResolvedValue([])
    mockSyncQueueToArray.mockResolvedValue([])
  })

  it('returns dispenses with corresponding syncQueue entries where retryCount > 0 and status not synced', async () => {
    const d1 = makeDispense({ id: 'fail-1', status: 'completed' })
    mockDispensesToArray.mockResolvedValue([d1])
    mockSyncQueueToArray.mockResolvedValue([
      makeSyncQueueEntry({ resourceId: 'fail-1', retryCount: 2, status: 'failed' }),
    ])

    const result = await getFailedItems()
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('fail-1')
    expect(result[0]!.syncStatus).toBe('failed')
  })

  it('excludes syncQueue entries with status synced even if retryCount > 0', async () => {
    const d1 = makeDispense({ id: 'fail-ok', status: 'completed' })
    mockDispensesToArray.mockResolvedValue([d1])
    mockSyncQueueToArray.mockResolvedValue([
      makeSyncQueueEntry({ resourceId: 'fail-ok', retryCount: 1, status: 'synced' }),
    ])

    const result = await getFailedItems()
    expect(result).toHaveLength(0)
  })

  it('returns empty when no failed sync entries exist', async () => {
    mockSyncQueueToArray.mockResolvedValue([])

    const result = await getFailedItems()
    expect(result).toHaveLength(0)
  })

  it('includes syncQueueEntryId for retry', async () => {
    const d1 = makeDispense({ id: 'fail-2', status: 'completed' })
    const sqEntry = makeSyncQueueEntry({ id: 'sq-99', resourceId: 'fail-2', retryCount: 1, status: 'failed' })
    mockDispensesToArray.mockResolvedValue([d1])
    mockSyncQueueToArray.mockResolvedValue([sqEntry])

    const result = await getFailedItems()
    expect(result[0]!.syncQueueEntryId).toBe('sq-99')
  })

  it('emits audit event when failed items are returned', async () => {
    const d1 = makeDispense({ id: 'fail-3', status: 'completed' })
    mockDispensesToArray.mockResolvedValue([d1])
    mockSyncQueueToArray.mockResolvedValue([
      makeSyncQueueEntry({ resourceId: 'fail-3', retryCount: 1, status: 'failed' }),
    ])

    await getFailedItems()
    expect(auditPhiAccess).toHaveBeenCalledWith(
      'pharmacy-user',
      'READ',
      'PRESCRIPTION',
      'queue-failed',
      undefined,
      expect.objectContaining({ tab: 'failed', itemCount: 1 }),
    )
  })
})
