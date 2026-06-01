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
      })),
    },
  }),
}))

vi.mock('@/lib/audit-client', () => ({
  reportProvenanceEvent: vi.fn(),
}))

vi.mock('@/stores/auth-session-store', () => ({
  useAuthSessionStore: { getState: () => ({ session: { userId: 'tech-001' } }) },
}))

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeMinimalInput(overrides: Partial<Parameters<typeof createProvenanceRecord>[0]> = {}): Parameters<typeof createProvenanceRecord>[0] {
  return {
    timestamp: new Date().toISOString(),
    hlcTimestamp: '2026-05-31T00:00:00.000Z-0000-abc123',
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

  // PHI Guard tests (AC: 6)
  it('rejects inputDescription containing a full name pattern', async () => {
    await expect(
      createProvenanceRecord(makeMinimalInput({ inputDescription: 'John Smith CBC result' }))
    ).rejects.toThrow(/PHI/)
  })

  it('rejects inputDescription containing a date of birth pattern', async () => {
    await expect(
      createProvenanceRecord(makeMinimalInput({ inputDescription: 'DOB: 1990-01-15 CBC result' }))
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
})

describe('Hash chain integrity', () => {
  beforeEach(() => {
    mockRecords.length = 0
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
})

describe('recordTechDecision', () => {
  beforeEach(() => {
    mockRecords.length = 0
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
})

describe('recordPhysicianConfirmation', () => {
  beforeEach(() => {
    mockRecords.length = 0
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
})

describe('queryProvenance', () => {
  beforeEach(() => {
    mockRecords.length = 0
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

describe('Full lifecycle integration test', () => {
  beforeEach(() => {
    mockRecords.length = 0
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

    const records = await queryProvenance('2026-05-31T00:00:00.000Z', '2026-05-31T23:59:59.000Z')
    expect(records).toHaveLength(1)
    expect(records[0]!.techDecision?.action).toBe('accepted')
    expect(records[0]!.physicianConfirmation?.action).toBe('confirmed')
  })
})
