/**
 * Reference Lab Configuration Service Tests — Story 54.4 / Task 14.3
 *
 * Covers: addReferenceLab, updateReferenceLab, deactivateReferenceLab, getLabsForTest.
 * Audit event emission is verified for all mutating operations.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import 'fake-indexeddb/auto'

vi.mock('../lib/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/db')>()
  return {
    ...actual,
    getDb: vi.fn(),
    putReferenceLab: vi.fn(),
    getActiveReferenceLabs: vi.fn(),
  }
})

vi.mock('../lib/audit-client', () => ({
  reportSendOutAuditEvent: vi.fn(),
}))

vi.mock('../lib/hlc', () => ({
  hlc: { now: () => ({ wallMs: Date.now(), counter: 0, nodeId: 'test' }) },
  serializeHlc: vi.fn().mockReturnValue('mock-hlc'),
}))

vi.mock('uuid', () => ({ v4: vi.fn().mockReturnValue('mock-uuid') }))

import {
  addReferenceLab,
  updateReferenceLab,
  deactivateReferenceLab,
  getLabsForTest,
} from '../lib/reference-lab-config'
import { getDb, putReferenceLab, getActiveReferenceLabs } from '../lib/db'
import { reportSendOutAuditEvent } from '../lib/audit-client'
import type { ReferenceLab } from '../types/reference-lab'

const mockGetDb = vi.mocked(getDb)
const mockPutReferenceLab = vi.mocked(putReferenceLab)
const mockGetActiveReferenceLabs = vi.mocked(getActiveReferenceLabs)
const mockReportSendOutAuditEvent = vi.mocked(reportSendOutAuditEvent)

function makeReferenceLab(overrides: Partial<ReferenceLab> = {}): ReferenceLab {
  const now = new Date().toISOString()
  return {
    id: 'lab-001',
    name: 'Kabul Reference Lab',
    accreditationNumber: 'AFG-LAB-001',
    address: 'Kabul, Afghanistan',
    supportedTests: ['2085-9', '4548-4'],
    averageTATDays: { '2085-9': 5 },
    isActive: true,
    meta: { lastUpdated: now, versionId: '1' },
    _ultranos: { createdAt: now, hlcTimestamp: 'mock-hlc' },
    ...overrides,
  }
}

function makeMockDb(overrides: Record<string, unknown> = {}) {
  return {
    reference_labs: {
      get: vi.fn(),
    },
    ...overrides,
  } as unknown as ReturnType<typeof getDb>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('addReferenceLab', () => {
  it('creates a lab record with isActive true', async () => {
    mockPutReferenceLab.mockResolvedValue(undefined)

    const lab = await addReferenceLab(
      {
        name: 'Kabul Reference Lab',
        accreditationNumber: 'AFG-LAB-001',
        address: 'Kabul, Afghanistan',
        supportedTests: ['2085-9'],
        averageTATDays: { '2085-9': 5 },
      },
      'actor-001',
    )

    expect(lab.isActive).toBe(true)
    expect(lab.name).toBe('Kabul Reference Lab')
    expect(lab.id).toBe('mock-uuid')
    expect(mockPutReferenceLab).toHaveBeenCalledWith(expect.objectContaining({ isActive: true }))
  })

  it('emits REFERENCE_LAB_CONFIGURED audit event', async () => {
    mockPutReferenceLab.mockResolvedValue(undefined)

    await addReferenceLab(
      {
        name: 'Herat Lab',
        accreditationNumber: 'AFG-LAB-002',
        address: 'Herat, Afghanistan',
        supportedTests: ['4548-4'],
        averageTATDays: {},
      },
      'actor-002',
    )

    expect(mockReportSendOutAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'REFERENCE_LAB_CONFIGURED',
        actorId: 'actor-002',
      }),
    )
  })

  it('assigns HLC timestamp to new lab', async () => {
    mockPutReferenceLab.mockResolvedValue(undefined)

    const lab = await addReferenceLab(
      {
        name: 'Test Lab',
        accreditationNumber: 'TST-001',
        address: 'Test City',
        supportedTests: [],
        averageTATDays: {},
      },
      'actor-001',
    )

    expect(lab._ultranos.hlcTimestamp).toBe('mock-hlc')
  })
})

describe('updateReferenceLab', () => {
  it('updates fields and bumps versionId', async () => {
    const db = makeMockDb()
    const existing = makeReferenceLab({ meta: { lastUpdated: new Date().toISOString(), versionId: '3' } })
    ;(db.reference_labs.get as ReturnType<typeof vi.fn>).mockResolvedValue(existing)
    mockGetDb.mockReturnValue(db)
    mockPutReferenceLab.mockResolvedValue(undefined)

    const updated = await updateReferenceLab('lab-001', { name: 'New Name' }, 'actor-001')

    expect(updated.name).toBe('New Name')
    expect(updated.meta.versionId).toBe('4')
  })

  it('emits REFERENCE_LAB_CONFIGURED audit event on update', async () => {
    const db = makeMockDb()
    ;(db.reference_labs.get as ReturnType<typeof vi.fn>).mockResolvedValue(makeReferenceLab())
    mockGetDb.mockReturnValue(db)
    mockPutReferenceLab.mockResolvedValue(undefined)

    await updateReferenceLab('lab-001', { address: 'New Address' }, 'manager-001')

    expect(mockReportSendOutAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'REFERENCE_LAB_CONFIGURED', actorId: 'manager-001' }),
    )
  })

  it('throws when lab not found', async () => {
    const db = makeMockDb()
    ;(db.reference_labs.get as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    mockGetDb.mockReturnValue(db)

    await expect(
      updateReferenceLab('missing-id', { name: 'X' }, 'actor-001'),
    ).rejects.toThrow(/not found/i)
  })
})

describe('deactivateReferenceLab', () => {
  it('sets isActive to false', async () => {
    const db = makeMockDb()
    ;(db.reference_labs.get as ReturnType<typeof vi.fn>).mockResolvedValue(makeReferenceLab())
    mockGetDb.mockReturnValue(db)
    mockPutReferenceLab.mockResolvedValue(undefined)

    await deactivateReferenceLab('lab-001', 'actor-001')

    expect(mockPutReferenceLab).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false }),
    )
  })

  it('emits audit event on deactivation', async () => {
    const db = makeMockDb()
    ;(db.reference_labs.get as ReturnType<typeof vi.fn>).mockResolvedValue(makeReferenceLab())
    mockGetDb.mockReturnValue(db)
    mockPutReferenceLab.mockResolvedValue(undefined)

    await deactivateReferenceLab('lab-001', 'supervisor-001')

    expect(mockReportSendOutAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'REFERENCE_LAB_CONFIGURED' }),
    )
  })
})

describe('getLabsForTest', () => {
  it('returns only labs that support the requested LOINC code', async () => {
    const labWithTest = makeReferenceLab({ id: 'lab-a', supportedTests: ['2085-9', '4548-4'] })
    const labWithoutTest = makeReferenceLab({ id: 'lab-b', supportedTests: ['4548-4'] })
    mockGetActiveReferenceLabs.mockResolvedValue([labWithTest, labWithoutTest])

    const result = await getLabsForTest('2085-9')

    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('lab-a')
  })

  it('returns empty array when no active lab supports the test', async () => {
    const lab = makeReferenceLab({ supportedTests: ['9999-0'] })
    mockGetActiveReferenceLabs.mockResolvedValue([lab])

    const result = await getLabsForTest('2085-9')

    expect(result).toHaveLength(0)
  })

  it('returns all matching active labs', async () => {
    const lab1 = makeReferenceLab({ id: 'lab-1', supportedTests: ['2085-9'] })
    const lab2 = makeReferenceLab({ id: 'lab-2', supportedTests: ['2085-9', '4548-4'] })
    const lab3 = makeReferenceLab({ id: 'lab-3', supportedTests: ['4548-4'] })
    mockGetActiveReferenceLabs.mockResolvedValue([lab1, lab2, lab3])

    const result = await getLabsForTest('2085-9')

    expect(result).toHaveLength(2)
    expect(result.map((l) => l.id)).toEqual(expect.arrayContaining(['lab-1', 'lab-2']))
  })
})
