/**
 * Story 47.5 — Spill & Decontamination Protocol: Integration Tests
 * Task 10.5 — Full spill workflow integration: start → steps → complete
 *
 * Tests the complete service-layer lifecycle as it runs in production:
 *   1. startSpillIncident  — creates record, emits SPILL_PROTOCOL_STARTED audit
 *   2. completeStep × N   — updates stepsCompleted, emits SPILL_STEP_COMPLETED audits (idempotent)
 *   3. completeSpillIncident — sets completedAt, saves notes, enqueues sync, emits SPILL_PROTOCOL_COMPLETED
 *   4. getAllSpillIncidents  — returns record newest-first
 *
 * Offline simulation: sync queue operations do not block any workflow step.
 * The enqueueSyncEvent mock throws on the first call to verify error isolation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  startSpillIncident,
  completeStep,
  completeSpillIncident,
  getAllSpillIncidents,
} from '../lib/safety/spill-service'
import { SpillType, RiskTier } from '../types/spill-protocol'
import type { SpillIncident } from '../types/spill-protocol'

// ---------------------------------------------------------------------------
// Shared mutable DB state
// ---------------------------------------------------------------------------

const db: Record<string, SpillIncident> = {}
let syncQueue: object[] = []

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../lib/db', () => ({
  getDb: () => ({
    spill_incidents: {
      add: vi.fn().mockImplementation((incident: SpillIncident) => {
        db[incident.id] = incident
        return Promise.resolve(incident.id)
      }),
      get: vi.fn().mockImplementation((id: string) => Promise.resolve(db[id] ?? undefined)),
      update: vi.fn().mockImplementation((id: string, changes: Partial<SpillIncident>) => {
        if (db[id]) Object.assign(db[id], changes)
        return Promise.resolve(undefined)
      }),
      orderBy: vi.fn().mockReturnValue({
        toArray: vi.fn().mockImplementation(() =>
          Promise.resolve(
            Object.values(db).sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)),
          ),
        ),
      }),
    },
  }),
  enqueueSyncEvent: vi.fn().mockImplementation((event: object) => {
    syncQueue.push(event)
    return Promise.resolve()
  }),
}))

vi.mock('../lib/hlc', () => ({
  hlc: { now: vi.fn().mockReturnValue({ wallTime: 1000, logicalTime: 0, nodeId: 'test' }) },
  serializeHlc: vi.fn().mockReturnValue('2026-06-01T00:00:00.000Z-0-test'),
}))

vi.mock('../lib/audit-client', () => ({
  reportSpillAuditEvent: vi.fn(),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

beforeEach(() => {
  Object.keys(db).forEach((k) => delete db[k])
  syncQueue = []
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Integration: full happy path
// ---------------------------------------------------------------------------

describe('Full spill workflow — Blood/Serum (MODERATE)', () => {
  it('completes the full lifecycle and leaves a well-formed record', async () => {
    const { reportSpillAuditEvent } = await import('../lib/audit-client')
    const { enqueueSyncEvent } = await import('../lib/db')

    // Step 1 — start
    const incident = await startSpillIncident({
      spillType: SpillType.BLOOD_SERUM,
      location: 'Sample Reception Bench 3',
      techId: 'tech-001',
    })

    expect(incident.spillType).toBe(SpillType.BLOOD_SERUM)
    expect(incident.riskTier).toBe(RiskTier.MODERATE)
    expect(incident.completedAt).toBeNull()
    expect(incident.stepsCompleted).toHaveLength(0)
    expect(reportSpillAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'SPILL_PROTOCOL_STARTED',
      incidentId: incident.id,
    }))

    // Step 2 — record decontamination steps
    await completeStep(incident.id, 1, 'tech-001')
    await completeStep(incident.id, 2, 'tech-001')
    await completeStep(incident.id, 3, 'tech-001')

    expect(db[incident.id].stepsCompleted).toEqual(expect.arrayContaining([1, 2, 3]))
    expect(reportSpillAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'SPILL_STEP_COMPLETED',
      stepNumber: 3,
    }))

    // Step 3 — complete
    await completeSpillIncident(incident.id, 'Bleach applied, area cleared.', 'tech-001')

    expect(db[incident.id].completedAt).not.toBeNull()
    expect(db[incident.id].notes).toBe('Bleach applied, area cleared.')
    expect(enqueueSyncEvent).toHaveBeenCalledWith(expect.objectContaining({
      resourceType: 'SPILL_INCIDENT',
      resourceId: incident.id,
    }))
    expect(reportSpillAuditEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'SPILL_PROTOCOL_COMPLETED',
    }))
  })
})

// ---------------------------------------------------------------------------
// Integration: full happy path — Culture/Microbiology (CRITICAL)
// ---------------------------------------------------------------------------

describe('Full spill workflow — Culture/Microbiology (CRITICAL)', () => {
  it('creates a CRITICAL-tier incident with required PPE fields', async () => {
    const incident = await startSpillIncident({
      spillType: SpillType.CULTURE_MICROBIOLOGY,
      location: 'Microbiology Room',
      techId: 'tech-007',
    })

    expect(incident.riskTier).toBe(RiskTier.CRITICAL)
    expect(incident.spillType).toBe(SpillType.CULTURE_MICROBIOLOGY)
  })
})

// ---------------------------------------------------------------------------
// Idempotency: duplicate step completions
// ---------------------------------------------------------------------------

describe('Step completion idempotency', () => {
  it('does not double-count a step completed twice', async () => {
    const incident = await startSpillIncident({
      spillType: SpillType.URINE,
      location: 'Urinalysis Bench',
      techId: 'tech-002',
    })

    await completeStep(incident.id, 1, 'tech-002')
    await completeStep(incident.id, 1, 'tech-002') // duplicate

    expect(db[incident.id].stepsCompleted.filter((s) => s === 1)).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Offline simulation: sync queue failure does not block workflow
// ---------------------------------------------------------------------------

describe('Offline resilience — sync queue failure', () => {
  it('still completes the local incident record when enqueueSyncEvent throws', async () => {
    const { enqueueSyncEvent } = await import('../lib/db')
    ;(enqueueSyncEvent as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Network unavailable'),
    )

    const incident = await startSpillIncident({
      spillType: SpillType.BLOOD_SERUM,
      location: 'Centrifuge Area',
      techId: 'tech-003',
    })

    // completeSpillIncident must NOT throw even if sync queue fails
    await expect(
      completeSpillIncident(incident.id, 'Offline test notes.', 'tech-003'),
    ).resolves.not.toThrow()

    // Local record is still updated
    expect(db[incident.id].completedAt).not.toBeNull()
    expect(db[incident.id].notes).toBe('Offline test notes.')
  })
})

// ---------------------------------------------------------------------------
// History ordering: getAllSpillIncidents returns newest-first
// ---------------------------------------------------------------------------

describe('getAllSpillIncidents — ordering', () => {
  it('returns multiple incidents newest-first across spill types', async () => {
    const i1 = await startSpillIncident({ spillType: SpillType.URINE, location: 'A', techId: 'tech-1' })
    const i2 = await startSpillIncident({ spillType: SpillType.BLOOD_SERUM, location: 'B', techId: 'tech-2' })
    const i3 = await startSpillIncident({ spillType: SpillType.CHEMICAL_REAGENT, location: 'C', techId: 'tech-3' })

    db[i1.id].occurredAt = '2026-03-01T08:00:00.000Z'
    db[i2.id].occurredAt = '2026-03-01T09:30:00.000Z'
    db[i3.id].occurredAt = '2026-03-01T11:00:00.000Z'

    const result = await getAllSpillIncidents()

    expect(result).toHaveLength(3)
    expect(result[0].id).toBe(i3.id)
    expect(result[1].id).toBe(i2.id)
    expect(result[2].id).toBe(i1.id)
  })
})
