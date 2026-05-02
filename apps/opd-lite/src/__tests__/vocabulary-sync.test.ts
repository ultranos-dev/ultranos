import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── vi.hoisted: declare mocks before vi.mock factories run ────────────────────
// vi.mock factories are hoisted to the top of the file by Vitest, so any
// variables they reference must also be hoisted with vi.hoisted().

const {
  mockBulkPut,
  mockCount,
  mockTransaction,
  mockToArray,
  mockUpdate,
  mockAdd,
  mockInvalidateInteractionCache,
} = vi.hoisted(() => {
  const mockBulkPut = vi.fn().mockResolvedValue(undefined)
  const mockCount = vi.fn().mockResolvedValue(1)
  const mockToArray = vi.fn().mockResolvedValue([])
  const mockUpdate = vi.fn().mockResolvedValue(1)
  const mockAdd = vi.fn().mockResolvedValue(1)
  const mockTransaction = vi.fn().mockImplementation(
    async (_mode: string, _tables: unknown[], fn: () => Promise<void>) => {
      await fn()
    },
  )
  const mockInvalidateInteractionCache = vi.fn()
  return {
    mockBulkPut,
    mockCount,
    mockTransaction,
    mockToArray,
    mockUpdate,
    mockAdd,
    mockInvalidateInteractionCache,
  }
})

// ── Mock @/lib/db ─────────────────────────────────────────────────────────────
// Dexie causes DatabaseClosedError in jsdom — mock the entire module.

vi.mock('@/lib/db', () => ({
  db: {
    vocabularyMedications: { count: mockCount, bulkPut: mockBulkPut },
    vocabularyIcd10: { count: mockCount, bulkPut: mockBulkPut },
    vocabularyInteractions: {
      count: mockCount,
      toArray: mockToArray,
      update: mockUpdate,
      add: mockAdd,
    },
    transaction: mockTransaction,
  },
}))

// ── Mock @/services/interactionService ───────────────────────────────────────

vi.mock('@/services/interactionService', () => ({
  invalidateInteractionCache: mockInvalidateInteractionCache,
}))

// ── Import the module under test AFTER mocks are registered ──────────────────

import { syncAllVocabulary } from '@/lib/vocabulary-sync'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeFetchResponse(body: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
  } as unknown as Response
}

function makeSyncBody(entries: unknown[], latestVersion: number) {
  return {
    result: {
      data: {
        json: { entries, latestVersion },
      },
    },
  }
}

const validMed = { code: 'RX001', display: 'Amoxicillin', form: 'Capsule', strength: '500 mg', version: 2 }
const validIcd = { code: 'J06.9', display: 'Acute URTI', version: 2 }
const validInteraction = { drugA: 'Warfarin', drugB: 'Aspirin', severity: 'CONTRAINDICATED', description: 'Bleeding risk', version: 2 }

// ─────────────────────────────────────────────────────────────────────────────

describe('syncAllVocabulary', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    // Default: table has rows (so stored sinceVersion is used)
    mockCount.mockResolvedValue(1)
    mockToArray.mockResolvedValue([])
    fetchSpy = vi.spyOn(global, 'fetch')
    // Default: no stored version (sinceVersion = 0)
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {})
  })

  it('returns { succeeded, failed } with all three types in succeeded when all fetches succeed', async () => {
    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
      const urlStr = String(url)
      if (urlStr.includes('medications')) {
        return makeFetchResponse(makeSyncBody([validMed], 2))
      }
      if (urlStr.includes('icd10')) {
        return makeFetchResponse(makeSyncBody([validIcd], 2))
      }
      return makeFetchResponse(makeSyncBody([validInteraction], 2))
    })

    const result = await syncAllVocabulary('test-token')

    expect(result.succeeded).toHaveLength(3)
    expect(result.succeeded).toContain('medications')
    expect(result.succeeded).toContain('icd10')
    expect(result.succeeded).toContain('interactions')
    expect(result.failed).toHaveLength(0)
  })

  it('throws when all three types fail (Hub unreachable)', async () => {
    fetchSpy.mockRejectedValue(new Error('Network error'))

    await expect(syncAllVocabulary()).rejects.toThrow(
      '[vocab-sync] All vocabulary sync types failed',
    )
  })

  it('returns partial success when only some types fail', async () => {
    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
      const urlStr = String(url)
      if (urlStr.includes('medications')) {
        return makeFetchResponse(makeSyncBody([validMed], 2))
      }
      throw new Error('Server error')
    })

    const result = await syncAllVocabulary()

    expect(result.succeeded).toContain('medications')
    expect(result.failed).toContain('icd10')
    expect(result.failed).toContain('interactions')
  })

  it('always updates localStorage version even when entries are empty (P19)', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')

    fetchSpy.mockResolvedValue(makeFetchResponse(makeSyncBody([], 5)))

    await syncAllVocabulary()

    // setItem should have been called for each type with version 5
    const versionCalls = setItemSpy.mock.calls.filter(([_key, value]) => value === '5')
    expect(versionCalls.length).toBeGreaterThanOrEqual(3)
  })

  it('passes Authorization header when token is provided', async () => {
    fetchSpy.mockResolvedValue(makeFetchResponse(makeSyncBody([], 1)))

    await syncAllVocabulary('my-token')

    expect(fetchSpy.mock.calls.length).toBeGreaterThanOrEqual(3)
    for (const [, init] of fetchSpy.mock.calls) {
      const headers = (init as RequestInit).headers as Record<string, string>
      expect(headers['Authorization']).toBe('Bearer my-token')
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('getEffectiveSinceVersion (via syncAllVocabulary)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    fetchSpy = vi.spyOn(global, 'fetch')
  })

  it('resets sinceVersion to 0 when table is empty (localStorage/IndexedDB desync)', async () => {
    // localStorage reports version 5, but the table is empty
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('5')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {})
    mockCount.mockResolvedValue(0)

    fetchSpy.mockResolvedValue(makeFetchResponse(makeSyncBody([], 5)))

    await syncAllVocabulary()

    // Every fetch URL must carry sinceVersion: 0 (URL-encoded in query params)
    for (const [url] of fetchSpy.mock.calls) {
      const decoded = decodeURIComponent(String(url))
      expect(decoded).toContain('"sinceVersion":0')
    }
  })

  it('uses stored sinceVersion when table is non-empty', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue('3')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {})
    mockCount.mockResolvedValue(10)

    fetchSpy.mockResolvedValue(makeFetchResponse(makeSyncBody([], 3)))

    await syncAllVocabulary()

    for (const [url] of fetchSpy.mock.calls) {
      const decoded = decodeURIComponent(String(url))
      expect(decoded).toContain('"sinceVersion":3')
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('applyMedicationUpdates (via syncAllVocabulary)', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.clearAllMocks()
    mockCount.mockResolvedValue(1)
    mockToArray.mockResolvedValue([])
    fetchSpy = vi.spyOn(global, 'fetch')
    vi.spyOn(Storage.prototype, 'getItem').mockReturnValue(null)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {})
  })

  it('skips invalid medication entries and writes only valid ones to Dexie', async () => {
    const invalidEntry = { code: '', display: 'Bad', form: 'Tablet', strength: '10 mg', version: 2 } // empty code fails Zod
    const entries = [validMed, invalidEntry]

    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
      if (String(url).includes('medications')) {
        return makeFetchResponse(makeSyncBody(entries, 2))
      }
      return makeFetchResponse(makeSyncBody([], 1))
    })

    await syncAllVocabulary()

    // Find the bulkPut call that received the medication entries
    const medPutCall = mockBulkPut.mock.calls.find(
      (args) => Array.isArray(args[0]) && args[0].length > 0,
    )
    expect(medPutCall).toBeDefined()
    expect(medPutCall![0]).toHaveLength(1)
    expect(medPutCall![0][0].code).toBe('RX001')
  })

  it('does not write any entries when all medication entries are invalid', async () => {
    const allInvalid = [
      { code: '', display: 'Bad', form: 'Tablet', strength: '10 mg', version: 2 },
      { code: 'RX999', display: '', form: 'Tablet', strength: '10 mg', version: 2 },
    ]

    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
      if (String(url).includes('medications')) {
        return makeFetchResponse(makeSyncBody(allInvalid, 2))
      }
      return makeFetchResponse(makeSyncBody([], 1))
    })

    await syncAllVocabulary()

    // bulkPut must not have been called with any entries that had invalid codes/displays
    for (const [args] of mockBulkPut.mock.calls) {
      if (Array.isArray(args) && args.length > 0) {
        for (const entry of args) {
          expect(entry.code).not.toBe('')
          expect(entry.display).not.toBe('')
        }
      }
    }
  })

  it('invalidates interaction cache after applying medication updates', async () => {
    fetchSpy.mockImplementation(async (url: string | URL | Request) => {
      if (String(url).includes('medications')) {
        return makeFetchResponse(makeSyncBody([validMed], 2))
      }
      return makeFetchResponse(makeSyncBody([], 1))
    })

    await syncAllVocabulary()

    expect(mockInvalidateInteractionCache).toHaveBeenCalled()
  })
})
