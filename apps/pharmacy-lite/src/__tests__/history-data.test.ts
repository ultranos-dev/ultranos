import { describe, it, expect, beforeEach, vi } from 'vitest'

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

import { getHistoryPage, getShiftSummary, type HistoryFilters } from '@/lib/history-data'

function makeDispense(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    resourceType: 'MedicationDispense',
    status: 'completed',
    subject: { reference: 'Patient/pat1', display: 'Ahmad Khan' },
    medicationCodeableConcept: {
      coding: [{ system: 'urn:ultranos:medication', code: 'med1', display: 'Amoxicillin 500mg' }],
      text: 'Amoxicillin 500mg Capsule',
    },
    performer: [{ actor: { reference: 'Practitioner/p1', display: 'Dr. Reza' } }],
    authorizingPrescription: [{ reference: 'MedicationRequest/rx1' }],
    whenHandedOver: '2026-05-12T10:00:00.000Z',
    dosageInstruction: [{ text: '1 tablet, 3x per day, for 7 days' }],
    _ultranos: {
      hlcTimestamp: '2026-05-12T10:00:00.000Z:0:node1',
      createdAt: '2026-05-12T10:00:00.000Z',
      isOfflineCreated: false,
    },
    meta: {
      lastUpdated: '2026-05-12T10:00:00.000Z',
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

function setupDefaultWhereMock(dispenses: unknown[] = []) {
  mockDispensesWhere.mockReturnValue({
    aboveOrEqual: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue(dispenses),
    }),
    belowOrEqual: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue(dispenses),
    }),
    between: vi.fn().mockReturnValue({
      toArray: vi.fn().mockResolvedValue(dispenses),
    }),
  })
}

describe('history-data: getHistoryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockDispensesToArray.mockResolvedValue([])
    mockSyncQueueToArray.mockResolvedValue([])
    setupDefaultWhereMock()
  })

  it('returns empty page when no dispenses exist', async () => {
    const result = await getHistoryPage()
    expect(result.items).toHaveLength(0)
    expect(result.totalCount).toBe(0)
    expect(result.page).toBe(1)
    expect(result.totalPages).toBe(1)
  })

  it('returns dispenses sorted by whenHandedOver descending', async () => {
    const d1 = makeDispense({ id: 'd-early', whenHandedOver: '2026-05-12T08:00:00.000Z' })
    const d2 = makeDispense({ id: 'd-late', whenHandedOver: '2026-05-12T14:00:00.000Z' })
    setupDefaultWhereMock([d1, d2])

    const result = await getHistoryPage()
    expect(result.items[0]!.id).toBe('d-late')
    expect(result.items[1]!.id).toBe('d-early')
  })

  it('extracts patient first name only (data minimization)', async () => {
    const d1 = makeDispense({ id: 'h1' })
    setupDefaultWhereMock([d1])

    const result = await getHistoryPage()
    expect(result.items[0]!.patientFirstName).toBe('Ahmad')
  })

  it('extracts medication names from coding', async () => {
    const d1 = makeDispense({
      id: 'h2',
      medicationCodeableConcept: {
        coding: [
          { system: 'urn:ultranos:medication', code: 'med1', display: 'Amoxicillin 500mg' },
          { system: 'urn:ultranos:medication', code: 'med2', display: 'Ibuprofen 200mg' },
        ],
      },
    })
    setupDefaultWhereMock([d1])

    const result = await getHistoryPage()
    expect(result.items[0]!.medicationNames).toEqual(['Amoxicillin 500mg', 'Ibuprofen 200mg'])
  })

  it('extracts pharmacist display from performer', async () => {
    const d1 = makeDispense({ id: 'h3' })
    setupDefaultWhereMock([d1])

    const result = await getHistoryPage()
    expect(result.items[0]!.pharmacistDisplay).toBe('Dr. Reza')
  })

  it('derives sync status as synced when not in syncQueue', async () => {
    const d1 = makeDispense({ id: 'h4' })
    setupDefaultWhereMock([d1])
    mockSyncQueueToArray.mockResolvedValue([])

    const result = await getHistoryPage()
    expect(result.items[0]!.syncStatus).toBe('synced')
  })

  it('derives sync status as pending when entry status is pending', async () => {
    const d1 = makeDispense({ id: 'h5' })
    setupDefaultWhereMock([d1])
    mockSyncQueueToArray.mockResolvedValue([
      makeSyncQueueEntry({ resourceId: 'h5', status: 'pending', retryCount: 0 }),
    ])

    const result = await getHistoryPage()
    expect(result.items[0]!.syncStatus).toBe('pending')
  })

  it('derives sync status as failed when entry status is failed', async () => {
    const d1 = makeDispense({ id: 'h6' })
    setupDefaultWhereMock([d1])
    mockSyncQueueToArray.mockResolvedValue([
      makeSyncQueueEntry({ resourceId: 'h6', status: 'failed', retryCount: 3 }),
    ])

    const result = await getHistoryPage()
    expect(result.items[0]!.syncStatus).toBe('failed')
  })

  it('filters by medication name (case-insensitive)', async () => {
    const d1 = makeDispense({ id: 'h7' })
    const d2 = makeDispense({
      id: 'h8',
      medicationCodeableConcept: {
        coding: [{ system: 'urn:ultranos:medication', code: 'med2', display: 'Ibuprofen 200mg' }],
      },
    })
    setupDefaultWhereMock([d1, d2])

    const result = await getHistoryPage({ medicationName: 'ibuprofen' })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.id).toBe('h8')
  })

  it('filters by sync status', async () => {
    const d1 = makeDispense({ id: 'h9' })
    const d2 = makeDispense({ id: 'h10' })
    setupDefaultWhereMock([d1, d2])
    mockSyncQueueToArray.mockResolvedValue([
      makeSyncQueueEntry({ resourceId: 'h10', status: 'failed', retryCount: 2 }),
    ])

    const result = await getHistoryPage({ syncStatus: 'failed' })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]!.id).toBe('h10')
  })

  it('filters by date range using Dexie where().between()', async () => {
    const d1 = makeDispense({ id: 'date-1' })
    setupDefaultWhereMock([d1])

    const result = await getHistoryPage({ dateFrom: '2026-05-12', dateTo: '2026-05-12' })
    expect(mockDispensesWhere).toHaveBeenCalledWith('meta.lastUpdated')
    expect(result.items).toHaveLength(1)
  })

  it('paginates with 20 items per page', async () => {
    const dispenses = Array.from({ length: 25 }, (_, i) =>
      makeDispense({
        id: `page-${i}`,
        whenHandedOver: new Date(2026, 4, 12, 10, i).toISOString(),
      }),
    )
    setupDefaultWhereMock(dispenses)

    const page1 = await getHistoryPage({}, 1)
    expect(page1.items).toHaveLength(20)
    expect(page1.totalCount).toBe(25)
    expect(page1.totalPages).toBe(2)
    expect(page1.page).toBe(1)

    const page2 = await getHistoryPage({}, 2)
    expect(page2.items).toHaveLength(5)
    expect(page2.page).toBe(2)
  })

  it('clamps page to valid range', async () => {
    setupDefaultWhereMock([makeDispense({ id: 'clamp-1' })])

    const result = await getHistoryPage({}, 999)
    expect(result.page).toBe(1)
    expect(result.items).toHaveLength(1)
  })
})

describe('history-data: getShiftSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setupDefaultWhereMock()
    mockSyncQueueToArray.mockResolvedValue([])
  })

  it('returns zero stats when no dispenses today', async () => {
    setupDefaultWhereMock([])

    const result = await getShiftSummary()
    expect(result.totalPrescriptions).toBe(0)
    expect(result.totalMedicationItems).toBe(0)
    expect(result.syncSuccessRate).toBe(100)
    expect(result.unresolvedFailures).toHaveLength(0)
  })

  it('counts total prescriptions and medication items', async () => {
    const d1 = makeDispense({
      id: 'shift-1',
      medicationCodeableConcept: {
        coding: [
          { code: 'a', display: 'Med A' },
          { code: 'b', display: 'Med B' },
        ],
      },
    })
    const d2 = makeDispense({ id: 'shift-2' })
    setupDefaultWhereMock([d1, d2])

    const result = await getShiftSummary()
    expect(result.totalPrescriptions).toBe(2)
    expect(result.totalMedicationItems).toBe(3) // 2 from d1 + 1 from d2
  })

  it('calculates sync success rate', async () => {
    const d1 = makeDispense({ id: 'rate-1' })
    const d2 = makeDispense({ id: 'rate-2' })
    const d3 = makeDispense({ id: 'rate-3' })
    setupDefaultWhereMock([d1, d2, d3])
    mockSyncQueueToArray.mockResolvedValue([
      makeSyncQueueEntry({ resourceId: 'rate-2', status: 'pending', retryCount: 0 }), // pending
      makeSyncQueueEntry({ resourceId: 'rate-3', status: 'failed', retryCount: 1 }), // failed
    ])

    const result = await getShiftSummary()
    expect(result.syncSuccessRate).toBe(33) // 1 synced / 3 total
  })

  it('lists unresolved sync failures', async () => {
    const d1 = makeDispense({ id: 'fail-1' })
    setupDefaultWhereMock([d1])
    mockSyncQueueToArray.mockResolvedValue([
      makeSyncQueueEntry({ resourceId: 'fail-1', status: 'failed', retryCount: 5 }),
    ])

    const result = await getShiftSummary()
    expect(result.unresolvedFailures).toHaveLength(1)
    expect(result.unresolvedFailures[0]!.id).toBe('fail-1')
  })
})
