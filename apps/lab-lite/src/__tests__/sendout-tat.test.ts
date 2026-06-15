/**
 * Send-Out TAT (Turnaround Time) Tests — Story 54.4 / Task 14.2
 *
 * Covers: calculatePendingTAT, getOverdueSendOuts, getAverageTATByLab.
 * All metrics are operational (no PHI).
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import 'fake-indexeddb/auto'

vi.mock('../lib/db', () => ({
  getDb: vi.fn(),
}))

import { calculatePendingTAT, getOverdueSendOuts, getAverageTATByLab } from '../lib/sendout-tat'
import { getDb } from '../lib/db'
import type { SendOut, ReferenceLab } from '../types/reference-lab'

const mockGetDb = vi.mocked(getDb)

/** Build a mock HLC-style sentAt string representing `msDaysAgo` days ago. */
function sentAtDaysAgo(days: number): string {
  const ms = Date.now() - days * 24 * 60 * 60 * 1000
  return `${ms}|0|test`
}

/** Build a mock HLC for resultsAvailableAt (wall-clock, now). */
function hlcNow(): string {
  return `${Date.now()}|0|test`
}

function makeSendOut(overrides: Partial<SendOut> = {}): SendOut {
  const now = new Date().toISOString()
  return {
    id: 'so-001',
    sampleId: 'sample-001',
    referenceLabId: 'lab-001',
    testRequested: { loincCode: '2085-9', loincDisplay: 'Cholesterol' },
    clinicalContext: 'hyperlipidemia',
    status: 'sent',
    sentAt: sentAtDaysAgo(3),
    receivedAt: null,
    processingStartedAt: null,
    resultsAvailableAt: null,
    cancelledAt: null,
    shippingManifestId: 'manifest-001',
    referralFormId: 'referral-001',
    resultId: null,
    meta: { lastUpdated: now, versionId: '1' },
    _ultranos: { createdAt: now, hlcTimestamp: 'mock-hlc' },
    ...overrides,
  }
}

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
    send_outs: {
      get: vi.fn(),
      where: vi.fn(),
    },
    reference_labs: {
      get: vi.fn(),
      toArray: vi.fn(),
    },
    ...overrides,
  } as unknown as ReturnType<typeof getDb>
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('calculatePendingTAT', () => {
  it('returns correct elapsed days and expected days from lab profile', async () => {
    const db = makeMockDb()
    const sendOut = makeSendOut({ sentAt: sentAtDaysAgo(3) })
    const lab = makeReferenceLab({ averageTATDays: { '2085-9': 5 } })
    ;(db.send_outs.get as ReturnType<typeof vi.fn>).mockResolvedValue(sendOut)
    ;(db.reference_labs.get as ReturnType<typeof vi.fn>).mockResolvedValue(lab)
    mockGetDb.mockReturnValue(db)

    const result = await calculatePendingTAT('so-001')

    expect(result.sendOutId).toBe('so-001')
    expect(result.expectedDays).toBe(5)
    expect(result.elapsedDays).toBeGreaterThan(2.9)
    expect(result.elapsedDays).toBeLessThan(3.1)
    expect(result.isOverdue).toBe(false)
  })

  it('marks as overdue when elapsed > expected', async () => {
    const db = makeMockDb()
    const sendOut = makeSendOut({ sentAt: sentAtDaysAgo(8) })
    const lab = makeReferenceLab({ averageTATDays: { '2085-9': 5 } })
    ;(db.send_outs.get as ReturnType<typeof vi.fn>).mockResolvedValue(sendOut)
    ;(db.reference_labs.get as ReturnType<typeof vi.fn>).mockResolvedValue(lab)
    mockGetDb.mockReturnValue(db)

    const result = await calculatePendingTAT('so-001')

    expect(result.isOverdue).toBe(true)
    expect(result.overdueByDays).toBeGreaterThan(2.9)
  })

  it('falls back to 7-day expected TAT when lab has no profile for the test', async () => {
    const db = makeMockDb()
    const sendOut = makeSendOut({ sentAt: sentAtDaysAgo(3) })
    const lab = makeReferenceLab({ averageTATDays: {} })
    ;(db.send_outs.get as ReturnType<typeof vi.fn>).mockResolvedValue(sendOut)
    ;(db.reference_labs.get as ReturnType<typeof vi.fn>).mockResolvedValue(lab)
    mockGetDb.mockReturnValue(db)

    const result = await calculatePendingTAT('so-001')

    expect(result.expectedDays).toBe(7)
    expect(result.isOverdue).toBe(false)
  })

  it('falls back to 7-day expected TAT when lab not found', async () => {
    const db = makeMockDb()
    const sendOut = makeSendOut({ sentAt: sentAtDaysAgo(3) })
    ;(db.send_outs.get as ReturnType<typeof vi.fn>).mockResolvedValue(sendOut)
    ;(db.reference_labs.get as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    mockGetDb.mockReturnValue(db)

    const result = await calculatePendingTAT('so-001')

    expect(result.expectedDays).toBe(7)
  })

  it('throws when send-out not found', async () => {
    const db = makeMockDb()
    ;(db.send_outs.get as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
    mockGetDb.mockReturnValue(db)

    await expect(calculatePendingTAT('missing-id')).rejects.toThrow(/not found/i)
  })
})

describe('getOverdueSendOuts', () => {
  it('returns send-outs exceeding threshold TAT', async () => {
    const db = makeMockDb()
    // overdue: 10 days elapsed, expected 5 → ratio 2.0 > 1.5 threshold
    const overdueOut = makeSendOut({ id: 'so-overdue', sentAt: sentAtDaysAgo(10) })
    // on-time: 3 days elapsed, expected 5 → ratio 0.6 < 1.5 threshold
    const onTimeOut = makeSendOut({ id: 'so-ok', sentAt: sentAtDaysAgo(3) })
    const lab = makeReferenceLab({ averageTATDays: { '2085-9': 5 } })

    const whereChain = { anyOf: vi.fn().mockReturnThis(), toArray: vi.fn().mockResolvedValue([overdueOut, onTimeOut]) }
    ;(db.send_outs.where as ReturnType<typeof vi.fn>).mockReturnValue(whereChain)
    ;(db.reference_labs.toArray as ReturnType<typeof vi.fn>).mockResolvedValue([lab])
    mockGetDb.mockReturnValue(db)

    const result = await getOverdueSendOuts(1.5)

    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('so-overdue')
  })

  it('returns empty array when nothing is overdue', async () => {
    const db = makeMockDb()
    const onTimeOut = makeSendOut({ sentAt: sentAtDaysAgo(2) })
    const lab = makeReferenceLab({ averageTATDays: { '2085-9': 5 } })

    const whereChain = { anyOf: vi.fn().mockReturnThis(), toArray: vi.fn().mockResolvedValue([onTimeOut]) }
    ;(db.send_outs.where as ReturnType<typeof vi.fn>).mockReturnValue(whereChain)
    ;(db.reference_labs.toArray as ReturnType<typeof vi.fn>).mockResolvedValue([lab])
    mockGetDb.mockReturnValue(db)

    const result = await getOverdueSendOuts()

    expect(result).toHaveLength(0)
  })

  it('sorts by most overdue first', async () => {
    const db = makeMockDb()
    // so-a: 12 days elapsed / 5 expected = ratio 2.4
    // so-b: 9 days elapsed / 5 expected = ratio 1.8
    const soA = makeSendOut({ id: 'so-a', sentAt: sentAtDaysAgo(12) })
    const soB = makeSendOut({ id: 'so-b', sentAt: sentAtDaysAgo(9) })
    const lab = makeReferenceLab({ averageTATDays: { '2085-9': 5 } })

    const whereChain = { anyOf: vi.fn().mockReturnThis(), toArray: vi.fn().mockResolvedValue([soB, soA]) }
    ;(db.send_outs.where as ReturnType<typeof vi.fn>).mockReturnValue(whereChain)
    ;(db.reference_labs.toArray as ReturnType<typeof vi.fn>).mockResolvedValue([lab])
    mockGetDb.mockReturnValue(db)

    const result = await getOverdueSendOuts()

    expect(result[0]?.id).toBe('so-a')
    expect(result[1]?.id).toBe('so-b')
  })
})

describe('getAverageTATByLab', () => {
  it('computes average TAT per LOINC code', async () => {
    const db = makeMockDb()
    // Two completed Cholesterol send-outs: 6 days and 4 days ago
    const completed1 = makeSendOut({
      id: 'so-1',
      status: 'results-available',
      sentAt: sentAtDaysAgo(6),
      resultsAvailableAt: hlcNow(),
      testRequested: { loincCode: '2085-9', loincDisplay: 'Cholesterol' },
    })
    const completed2 = makeSendOut({
      id: 'so-2',
      status: 'results-available',
      sentAt: sentAtDaysAgo(4),
      resultsAvailableAt: hlcNow(),
      testRequested: { loincCode: '2085-9', loincDisplay: 'Cholesterol' },
    })

    const filterFn = (sendOut: SendOut) =>
      sendOut.status === 'results-available' && sendOut.resultsAvailableAt !== null
    const whereChain = {
      equals: vi.fn().mockReturnThis(),
      filter: vi.fn((fn: (s: SendOut) => boolean) => ({
        toArray: vi.fn().mockResolvedValue([completed1, completed2].filter(fn)),
      })),
    }
    ;(db.send_outs.where as ReturnType<typeof vi.fn>).mockReturnValue(whereChain)
    mockGetDb.mockReturnValue(db)

    const result = await getAverageTATByLab('lab-001')

    expect(result['2085-9']).toBeGreaterThan(4.9)
    expect(result['2085-9']).toBeLessThan(6.1)
  })

  it('returns empty object when no completed send-outs', async () => {
    const db = makeMockDb()
    const whereChain = {
      equals: vi.fn().mockReturnThis(),
      filter: vi.fn(() => ({ toArray: vi.fn().mockResolvedValue([]) })),
    }
    ;(db.send_outs.where as ReturnType<typeof vi.fn>).mockReturnValue(whereChain)
    mockGetDb.mockReturnValue(db)

    const result = await getAverageTATByLab('lab-001')

    expect(result).toEqual({})
  })

  it('groups averages separately by LOINC code', async () => {
    const db = makeMockDb()
    const chol = makeSendOut({
      id: 'so-chol',
      status: 'results-available',
      sentAt: sentAtDaysAgo(5),
      resultsAvailableAt: hlcNow(),
      testRequested: { loincCode: '2085-9', loincDisplay: 'Cholesterol' },
    })
    const hba1c = makeSendOut({
      id: 'so-hba1c',
      status: 'results-available',
      sentAt: sentAtDaysAgo(10),
      resultsAvailableAt: hlcNow(),
      testRequested: { loincCode: '4548-4', loincDisplay: 'HbA1c' },
    })

    const filterFn = (sendOut: SendOut) =>
      sendOut.status === 'results-available' && sendOut.resultsAvailableAt !== null
    const whereChain = {
      equals: vi.fn().mockReturnThis(),
      filter: vi.fn((fn: (s: SendOut) => boolean) => ({
        toArray: vi.fn().mockResolvedValue([chol, hba1c].filter(fn)),
      })),
    }
    ;(db.send_outs.where as ReturnType<typeof vi.fn>).mockReturnValue(whereChain)
    mockGetDb.mockReturnValue(db)

    const result = await getAverageTATByLab('lab-001')

    expect(result['2085-9']).toBeDefined()
    expect(result['4548-4']).toBeDefined()
    expect(result['4548-4']!).toBeGreaterThan(result['2085-9']!)
  })
})
