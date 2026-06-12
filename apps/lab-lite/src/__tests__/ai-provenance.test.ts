/**
 * Story 53.6 — AI Provenance Trail
 *
 * Tests for:
 * - Provenance record creation (AC: 1, 6, 7)
 * - Hash chain integrity (AC: 2, 8)
 * - Tamper detection (AC: 2)
 * - PHI guard (AC: 6)
 * - Tech decision & physician confirmation (AC: 1, 5)
 * - Date range query (AC: 3)
 * - Drain worker sync (AC: 4)
 * - Integration test (full lifecycle)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createProvenanceRecord, recordTechDecision, recordPhysicianConfirmation, queryProvenance } from '@/lib/ai-provenance'
import { verifyProvenanceChain } from '@/lib/provenance-chain'
import type { AiProvenanceRecord, TechDecision, PhysicianConfirmation } from '@/lib/ai-provenance'
import { ProvenanceDrainWorker } from '@/lib/provenance-drain-worker'
import type { DrainableProvenanceStore, ProvenanceSyncFn } from '@/lib/provenance-drain-worker'
import { ConfidenceLevel } from '@/lib/confidence'

// ---------------------------------------------------------------------------
// Mock Dexie db
// ---------------------------------------------------------------------------
const mockRecords: AiProvenanceRecord[] = []

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    ai_provenance: {
      add: vi.fn(async (record: AiProvenanceRecord) => {
        mockRecords.push(record)
        return record.id
      }),
      put: vi.fn(async (record: AiProvenanceRecord) => {
        const idx = mockRecords.findIndex((r) => r.id === record.id)
        if (idx >= 0) mockRecords[idx] = record
        else mockRecords.push(record)
        return record.id
      }),
      get: vi.fn(async (id: string) => mockRecords.find((r) => r.id === id) ?? undefined),
      orderBy: vi.fn((field: string) => ({
        last: vi.fn(async () => {
          if (mockRecords.length === 0) return undefined
          return [...mockRecords].sort((a, b) =>
            (a[field as keyof AiProvenanceRecord] as string) > (b[field as keyof AiProvenanceRecord] as string) ? 1 : -1
          ).at(-1)
        }),
        toArray: vi.fn(async () => [...mockRecords].sort((a, b) =>
          (a[field as keyof AiProvenanceRecord] as string) > (b[field as keyof AiProvenanceRecord] as string) ? 1 : -1
        )),
      })),
      where: vi.fn((field: string) => ({
        between: vi.fn((start: string, end: string) => ({
          filter: vi.fn((fn: (r: AiProvenanceRecord) => boolean) => ({
            sortBy: vi.fn(async (sortField: string) =>
              mockRecords
                .filter((r) => {
                  const val = r[field as keyof AiProvenanceRecord] as string
                  return val >= start && val <= end
                })
                .filter(fn)
                .sort((a, b) =>
                  (a[sortField as keyof AiProvenanceRecord] as string) >
                  (b[sortField as keyof AiProvenanceRecord] as string) ? 1 : -1
                )
            ),
          })),
          sortBy: vi.fn(async (sortField: string) =>
            mockRecords
              .filter((r) => {
                const val = r[field as keyof AiProvenanceRecord] as string
                return val >= start && val <= end
              })
              .sort((a, b) =>
                (a[sortField as keyof AiProvenanceRecord] as string) >
                (b[sortField as keyof AiProvenanceRecord] as string) ? 1 : -1
              )
          ),
        })),
        equals: vi.fn((val: string) => ({
          limit: vi.fn((n: number) => ({
            toArray: vi.fn(async () =>
              mockRecords.filter((r) => (r[field as keyof AiProvenanceRecord] as string) === val).slice(0, n)
            ),
          })),
        })),
      })),
      transaction: vi.fn((_mode: string, _tables: unknown, fn: () => Promise<void>) => fn()),
    },
    transaction: vi.fn((_mode: string, _tables: unknown, fn: () => Promise<void>) => fn()),
  }),
}))

// P7 fix: mock the correct module (@ultranos/audit-logger/client, not @/lib/audit-client)
const emitClientAuditMock = vi.fn()
vi.mock('@ultranos/audit-logger/client', () => ({
  emitClientAudit: emitClientAuditMock,
  setAuditStoreAdapter: vi.fn(),
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: { getState: () => ({ session: { userId: 'tech-001', role: 'LAB_TECH' } }) },
}))

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeMinimalInput(overrides: Partial<Parameters<typeof createProvenanceRecord>[0]> = {}): Parameters<typeof createProvenanceRecord>[0] {
  // Derive a distinct hlcTimestamp from timestamp so HLC ordering is stable in tests
  const timestamp = (overrides as { timestamp?: string }).timestamp ?? new Date().toISOString()
  return {
    timestamp,
    hlcTimestamp: `${timestamp}-0000-abc123`,
    modelVersion: 'rule-engine-v1.0.0',
    modelHash: null,
    modelType: 'rule_engine',
    inputDescription: 'CBC result set, 7 numeric values',
    inputFieldCount: 7,
    inputTemplateCode: 'CBC-PANEL',
    aiOutput: 'Elevated WBC detected. Possible infection.',
    confidenceScore: 0.85,
    confidenceLevel: ConfidenceLevel.HIGH,
    sourceFeature: 'anomaly-detection',
    sampleId: 'sample-uuid-001',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('createProvenanceRecord', () => {
  beforeEach(() => {
    mockRecords.length = 0
    emitClientAuditMock.mockClear()
  })

  it('creates a record with all required fields populated', async () => {
    const id = await createProvenanceRecord(makeMinimalInput())
    expect(id).toBeTruthy()
    expect(typeof id).toBe('string')

    const stored = mockRecords.find((r) => r.id === id)
    expect(stored).toBeDefined()
    expect(stored!.modelVersion).toBe('rule-engine-v1.0.0')
    expect(stored!.inputDescription).toBe('CBC result set, 7 numeric values')
    expect(stored!.confidenceScore).toBe(0.85)
    expect(stored!.confidenceLevel).toBe('HIGH')
    expect(stored!.syncStatus).toBe('pending')
    expect(stored!.techDecision).toBeNull()
    expect(stored!.physicianConfirmation).toBeNull()
    expect(stored!.recordHash).toBeTruthy()
    expect(stored!.recordHash.length).toBe(64) // hex SHA-256
  })

  it('sets previousHash to null for the first record', async () => {
    const id = await createProvenanceRecord(makeMinimalInput())
    const stored = mockRecords.find((r) => r.id === id)
    expect(stored!.previousHash).toBeNull()
  })

  it('chains previousHash to prior record for second record', async () => {
    const id1 = await createProvenanceRecord(makeMinimalInput({ timestamp: '2026-05-31T00:00:00.000Z' }))
    const id2 = await createProvenanceRecord(makeMinimalInput({ timestamp: '2026-05-31T00:00:01.000Z' }))

    const r1 = mockRecords.find((r) => r.id === id1)!
    const r2 = mockRecords.find((r) => r.id === id2)!
    expect(r2.previousHash).toBe(r1.recordHash)
  })

  it('emits AI_PROVENANCE_CREATED audit event', async () => {
    await createProvenanceRecord(makeMinimalInput())
    expect(emitClientAuditMock).toHaveBeenCalledTimes(1)
    expect(emitClientAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ provenanceEvent: 'AI_PROVENANCE_CREATED' }),
      })
    )
  })

  // PHI Guard tests (AC: 6)
  it('rejects inputDescription containing a full name pattern', async () => {
    await expect(
      createProvenanceRecord(makeMinimalInput({ inputDescription: 'John Smith CBC result' }))
    ).rejects.toThrow(/PHI/)
  })

  it('rejects inputDescription containing a date of birth pattern', async () => {
    await expect(
      createProvenanceRecord(makeMinimalInput({ inputDescription: 'DOB: 01/15/1990 CBC result' }))
    ).rejects.toThrow(/PHI/)
  })

  it('rejects inputDescription containing an MRN pattern', async () => {
    await expect(
      createProvenanceRecord(makeMinimalInput({ inputDescription: 'MRN: 12345678 result' }))
    ).rejects.toThrow(/PHI/)
  })

  it('accepts a clean structural description without PHI', async () => {
    await expect(
      createProvenanceRecord(makeMinimalInput({ inputDescription: 'Urinalysis, 5 numeric + 2 coded values' }))
    ).resolves.toBeTruthy()
  })

  it('accepts a description with an ISO date that is NOT prefixed by DOB (no false positive)', async () => {
    // Previously a bare /\d{4}-\d{2}-\d{2}/ pattern caused false positives here
    await expect(
      createProvenanceRecord(makeMinimalInput({ inputDescription: 'HbA1c panel v2024-03-01, 3 numeric values' }))
    ).resolves.toBeTruthy()
  })
})

describe('Hash chain integrity', () => {
  beforeEach(() => {
    mockRecords.length = 0
    emitClientAuditMock.mockClear()
  })

  it('verifies a valid chain of 5 records', async () => {
    for (let i = 0; i < 5; i++) {
      await createProvenanceRecord(makeMinimalInput({ timestamp: `2026-05-31T00:00:0${i}.000Z` }))
    }

    const result = await verifyProvenanceChain('2026-05-31T00:00:00.000Z', '2026-05-31T23:59:59.000Z')
    expect(result.valid).toBe(true)
    expect(result.checkedCount).toBe(5)
    expect(result.brokenAt).toBeUndefined()
  })

  it('detects tampered record (modified aiOutput)', async () => {
    for (let i = 0; i < 3; i++) {
      await createProvenanceRecord(makeMinimalInput({ timestamp: `2026-05-31T00:00:0${i}.000Z` }))
    }

    // Tamper the second record
    const tampered = mockRecords[1]!
    mockRecords[1] = { ...tampered, aiOutput: 'TAMPERED OUTPUT' }

    const result = await verifyProvenanceChain('2026-05-31T00:00:00.000Z', '2026-05-31T23:59:59.000Z')
    expect(result.valid).toBe(false)
    expect(result.brokenAt).toBeDefined()
  })

  it('returns valid=true and checkedCount=0 for empty date range', async () => {
    const result = await verifyProvenanceChain('2020-01-01T00:00:00.000Z', '2020-01-02T00:00:00.000Z')
    expect(result.valid).toBe(true)
    expect(result.checkedCount).toBe(0)
  })

  it('verifies a single-record chain correctly', async () => {
    await createProvenanceRecord(makeMinimalInput({ timestamp: '2026-05-31T10:00:00.000Z' }))
    const result = await verifyProvenanceChain('2026-05-31T00:00:00.000Z', '2026-05-31T23:59:59.000Z')
    expect(result.valid).toBe(true)
    expect(result.checkedCount).toBe(1)
  })

  it('checkedCount equals the number of records successfully verified before break', async () => {
    for (let i = 0; i < 4; i++) {
      await createProvenanceRecord(makeMinimalInput({ timestamp: `2026-05-31T00:00:0${i}.000Z` }))
    }
    // Tamper record at index 2 (the third one)
    mockRecords[2] = { ...mockRecords[2]!, aiOutput: 'TAMPERED' }

    const result = await verifyProvenanceChain('2026-05-31T00:00:00.000Z', '2026-05-31T23:59:59.000Z')
    expect(result.valid).toBe(false)
    expect(result.checkedCount).toBe(2) // records 0 and 1 verified before break at index 2
  })
})

describe('recordTechDecision', () => {
  beforeEach(() => {
    mockRecords.length = 0
    emitClientAuditMock.mockClear()
  })

  it('appends tech decision to existing record', async () => {
    const id = await createProvenanceRecord(makeMinimalInput())
    const decision: TechDecision = {
      action: 'accepted',
      decisionTimestamp: new Date().toISOString(),
      techId: 'tech-001',
    }
    await recordTechDecision(id, decision)

    const stored = mockRecords.find((r) => r.id === id)
    expect(stored!.techDecision).toMatchObject(decision)
  })

  it('does NOT change recordHash after tech decision', async () => {
    const id = await createProvenanceRecord(makeMinimalInput())
    const original = mockRecords.find((r) => r.id === id)!
    const originalHash = original.recordHash

    await recordTechDecision(id, {
      action: 'modified',
      modifiedOutput: 'Modified flag text',
      decisionTimestamp: new Date().toISOString(),
      techId: 'tech-001',
    })

    const updated = mockRecords.find((r) => r.id === id)!
    expect(updated.recordHash).toBe(originalHash)
  })

  it('emits AI_TECH_DECISION_RECORDED audit event', async () => {
    const id = await createProvenanceRecord(makeMinimalInput())
    emitClientAuditMock.mockClear()

    await recordTechDecision(id, { action: 'accepted', decisionTimestamp: new Date().toISOString(), techId: 'tech-001' })

    expect(emitClientAuditMock).toHaveBeenCalledTimes(1)
    expect(emitClientAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ provenanceEvent: 'AI_TECH_DECISION_RECORDED' }),
      })
    )
  })
})

describe('recordPhysicianConfirmation', () => {
  beforeEach(() => {
    mockRecords.length = 0
    emitClientAuditMock.mockClear()
  })

  it('appends physician confirmation to existing record', async () => {
    const id = await createProvenanceRecord(makeMinimalInput())
    const confirmation: PhysicianConfirmation = {
      action: 'confirmed',
      confirmationTimestamp: new Date().toISOString(),
      physicianId: 'physician-001',
    }
    await recordPhysicianConfirmation(id, confirmation)

    const stored = mockRecords.find((r) => r.id === id)
    expect(stored!.physicianConfirmation).toMatchObject(confirmation)
  })

  it('does NOT change recordHash after physician confirmation', async () => {
    const id = await createProvenanceRecord(makeMinimalInput())
    const originalHash = mockRecords.find((r) => r.id === id)!.recordHash

    await recordPhysicianConfirmation(id, {
      action: 'overridden',
      notes: 'Clinical context overrides AI suggestion',
      confirmationTimestamp: new Date().toISOString(),
      physicianId: 'physician-001',
    })

    const updated = mockRecords.find((r) => r.id === id)!
    expect(updated.recordHash).toBe(originalHash)
  })

  it('emits AI_PHYSICIAN_CONFIRMATION_RECORDED audit event', async () => {
    const id = await createProvenanceRecord(makeMinimalInput())
    emitClientAuditMock.mockClear()

    await recordPhysicianConfirmation(id, {
      action: 'confirmed',
      confirmationTimestamp: new Date().toISOString(),
      physicianId: 'physician-001',
    })

    expect(emitClientAuditMock).toHaveBeenCalledTimes(1)
    expect(emitClientAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ provenanceEvent: 'AI_PHYSICIAN_CONFIRMATION_RECORDED' }),
      })
    )
  })
})

describe('queryProvenance', () => {
  beforeEach(() => {
    mockRecords.length = 0
    emitClientAuditMock.mockClear()
  })

  it('returns records within date range', async () => {
    await createProvenanceRecord(makeMinimalInput({ timestamp: '2026-05-31T08:00:00.000Z', sourceFeature: 'anomaly-detection' }))
    await createProvenanceRecord(makeMinimalInput({ timestamp: '2026-05-31T10:00:00.000Z', sourceFeature: 'anomaly-detection' }))
    await createProvenanceRecord(makeMinimalInput({ timestamp: '2026-06-01T08:00:00.000Z', sourceFeature: 'anomaly-detection' }))

    const results = await queryProvenance('2026-05-31T00:00:00.000Z', '2026-05-31T23:59:59.000Z')
    expect(results).toHaveLength(2)
  })

  it('returns empty array for date range with no records', async () => {
    const results = await queryProvenance('2020-01-01T00:00:00.000Z', '2020-01-02T00:00:00.000Z')
    expect(results).toHaveLength(0)
  })

  it('filters by sourceFeature when provided', async () => {
    await createProvenanceRecord(makeMinimalInput({ timestamp: '2026-05-31T08:00:00.000Z', sourceFeature: 'anomaly-detection' }))
    await createProvenanceRecord(makeMinimalInput({ timestamp: '2026-05-31T09:00:00.000Z', sourceFeature: 'consultation-formatter' }))

    const results = await queryProvenance('2026-05-31T00:00:00.000Z', '2026-05-31T23:59:59.000Z', { sourceFeature: 'anomaly-detection' })
    expect(results).toHaveLength(1)
    expect(results[0]!.sourceFeature).toBe('anomaly-detection')
  })

  it('returns records sorted by timestamp ascending', async () => {
    await createProvenanceRecord(makeMinimalInput({ timestamp: '2026-05-31T10:00:00.000Z' }))
    await createProvenanceRecord(makeMinimalInput({ timestamp: '2026-05-31T08:00:00.000Z' }))
    await createProvenanceRecord(makeMinimalInput({ timestamp: '2026-05-31T09:00:00.000Z' }))

    const results = await queryProvenance('2026-05-31T00:00:00.000Z', '2026-05-31T23:59:59.000Z')
    expect(results[0]!.timestamp).toBe('2026-05-31T08:00:00.000Z')
    expect(results[1]!.timestamp).toBe('2026-05-31T09:00:00.000Z')
    expect(results[2]!.timestamp).toBe('2026-05-31T10:00:00.000Z')
  })
})

// ---------------------------------------------------------------------------
// Drain worker tests (AC: 4, 9)
// ---------------------------------------------------------------------------

describe('ProvenanceDrainWorker', () => {
  it('calls syncFn with pending records and marks them synced on success', async () => {
    const pending: AiProvenanceRecord[] = [
      { ...makeMinimalInput({ timestamp: '2026-05-31T00:00:00.000Z' }), id: 'r1', previousHash: null, recordHash: 'abc', syncStatus: 'pending', techDecision: null, physicianConfirmation: null },
      { ...makeMinimalInput({ timestamp: '2026-05-31T00:00:01.000Z' }), id: 'r2', previousHash: 'abc', recordHash: 'def', syncStatus: 'pending', techDecision: null, physicianConfirmation: null },
    ]
    const synced: string[] = []
    const store: DrainableProvenanceStore = {
      getPending: vi.fn().mockResolvedValueOnce(pending).mockResolvedValueOnce([]),
      markSynced: vi.fn(async (ids) => { synced.push(...ids) }),
      markFailed: vi.fn(),
    }
    const syncFn: ProvenanceSyncFn = vi.fn().mockResolvedValue([
      { id: 'r1', success: true },
      { id: 'r2', success: true },
    ])

    const worker = new ProvenanceDrainWorker({ store, syncFn })
    await worker.drain()

    expect(syncFn).toHaveBeenCalledTimes(1)
    expect(syncFn).toHaveBeenCalledWith(pending)
    expect(store.markSynced).toHaveBeenCalledWith(['r1', 'r2'])
    expect(synced).toEqual(['r1', 'r2'])
  })

  it('calls markFailed after MAX_RETRIES exhausted on persistent failure', async () => {
    const pending: AiProvenanceRecord[] = [
      { ...makeMinimalInput(), id: 'r1', previousHash: null, recordHash: 'abc', syncStatus: 'pending', techDecision: null, physicianConfirmation: null },
    ]
    const store: DrainableProvenanceStore = {
      getPending: vi.fn().mockResolvedValueOnce(pending).mockResolvedValueOnce([]),
      markSynced: vi.fn(),
      markFailed: vi.fn(),
    }
    const syncFn: ProvenanceSyncFn = vi.fn().mockResolvedValue([{ id: 'r1', success: false }])

    const worker = new ProvenanceDrainWorker({ store, syncFn })
    await worker.drain()

    // After 3 attempts with all-failure results, markFailed is called
    expect(syncFn).toHaveBeenCalledTimes(3)
    expect(store.markFailed).toHaveBeenCalledWith(['r1'])
  })

  it('does not drain when offline', async () => {
    const store: DrainableProvenanceStore = {
      getPending: vi.fn(),
      markSynced: vi.fn(),
      markFailed: vi.fn(),
    }
    const syncFn: ProvenanceSyncFn = vi.fn()

    const originalOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine')
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })

    const worker = new ProvenanceDrainWorker({ store, syncFn })
    await worker.drain()

    expect(store.getPending).not.toHaveBeenCalled()
    expect(syncFn).not.toHaveBeenCalled()

    if (originalOnLine) Object.defineProperty(navigator, 'onLine', originalOnLine)
  })

  it('does not run concurrent drain cycles', async () => {
    let resolveFirst!: () => void
    const firstDrainPromise = new Promise<void>((r) => { resolveFirst = r })

    const store: DrainableProvenanceStore = {
      getPending: vi.fn().mockImplementationOnce(async () => { await firstDrainPromise; return [] }),
      markSynced: vi.fn(),
      markFailed: vi.fn(),
    }
    const syncFn: ProvenanceSyncFn = vi.fn()

    const worker = new ProvenanceDrainWorker({ store, syncFn })
    const p1 = worker.drain()
    const p2 = worker.drain() // second call while first is in progress

    resolveFirst()
    await Promise.all([p1, p2])

    // getPending called once (second drain was a no-op due to draining guard)
    expect(store.getPending).toHaveBeenCalledTimes(1)
  })

  it('marks partially-failed batch: syncs successes and retries only failures', async () => {
    const pending: AiProvenanceRecord[] = [
      { ...makeMinimalInput(), id: 'r1', previousHash: null, recordHash: 'a', syncStatus: 'pending', techDecision: null, physicianConfirmation: null },
      { ...makeMinimalInput(), id: 'r2', previousHash: 'a', recordHash: 'b', syncStatus: 'pending', techDecision: null, physicianConfirmation: null },
    ]
    const store: DrainableProvenanceStore = {
      getPending: vi.fn().mockResolvedValueOnce(pending).mockResolvedValueOnce([]),
      markSynced: vi.fn(),
      markFailed: vi.fn(),
    }
    // r1 always succeeds; r2 always fails
    const syncFn: ProvenanceSyncFn = vi.fn().mockResolvedValue([
      { id: 'r1', success: true },
      { id: 'r2', success: false },
    ])

    const worker = new ProvenanceDrainWorker({ store, syncFn })
    await worker.drain()

    // r1 marked synced on first call
    expect(store.markSynced).toHaveBeenCalledWith(['r1'])
    // After 3 total attempts for r2, markFailed called
    expect(store.markFailed).toHaveBeenCalledWith(['r2'])
  })
})

// ---------------------------------------------------------------------------
// Full lifecycle integration test
// ---------------------------------------------------------------------------

describe('Full lifecycle integration test', () => {
  beforeEach(() => {
    mockRecords.length = 0
    emitClientAuditMock.mockClear()
  })

  it('create → tech decision → physician confirmation → verify chain → query', async () => {
    const id = await createProvenanceRecord(makeMinimalInput({
      timestamp: '2026-05-31T12:00:00.000Z',
    }))

    await recordTechDecision(id, {
      action: 'accepted',
      decisionTimestamp: '2026-05-31T12:05:00.000Z',
      techId: 'tech-001',
    })

    await recordPhysicianConfirmation(id, {
      action: 'confirmed',
      confirmationTimestamp: '2026-05-31T12:10:00.000Z',
      physicianId: 'physician-001',
    })

    const chainResult = await verifyProvenanceChain('2026-05-31T00:00:00.000Z', '2026-05-31T23:59:59.000Z')
    expect(chainResult.valid).toBe(true)
    expect(chainResult.checkedCount).toBe(1)

    const records = await queryProvenance('2026-05-31T00:00:00.000Z', '2026-05-31T23:59:59.000Z')
    expect(records).toHaveLength(1)
    expect(records[0]!.techDecision?.action).toBe('accepted')
    expect(records[0]!.physicianConfirmation?.action).toBe('confirmed')

    // 3 audit events emitted: CREATED, TECH_DECISION, PHYSICIAN_CONFIRMATION
    expect(emitClientAuditMock).toHaveBeenCalledTimes(3)
  })
})
