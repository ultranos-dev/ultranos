import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { getDb } from '../lib/db'
import { generateInspectionPack } from '../lib/safety/inspection-readiness'
import { AuditStatus, ChecklistItemStatus } from '../types/infection-control-audit'
import type { InfectionControlAudit } from '../types/infection-control-audit'

vi.mock('@/lib/audit-client', () => ({
  reportInfectionControlAuditEvent: vi.fn(),
}))

vi.mock('@/lib/hlc', () => ({
  hlc: { now: () => ({ wallMs: Date.now(), counter: 0, nodeId: 'test-node' }) },
  serializeHlc: () => 'hlc-test-timestamp',
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCompletedAudit(
  overrides: Partial<InfectionControlAudit> = {},
): InfectionControlAudit {
  return {
    id: 'audit-' + Math.random().toString(36).slice(2),
    auditDate: '2025-01-15',
    auditMonth: '2025-01',
    conductedBy: 'practitioner-123',
    status: AuditStatus.COMPLETED,
    complianceScore: 80,
    completedAt: '2025-01-15T10:00:00.000Z',
    notes: '',
    hlcTimestamp: 'hlc-test',
    items: [
      {
        templateId: 'ic-hh-01',
        status: ChecklistItemStatus.PASS,
        notes: null,
        photoEvidence: null,
        photoFileName: null,
        completedAt: '2025-01-15T10:00:00.000Z',
        completedBy: 'practitioner-123',
      },
    ],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  vi.clearAllMocks()
  const db = getDb()
  await db.infection_control_audits.clear()
})

afterEach(async () => {
  const db = getDb()
  await db.infection_control_audits.clear()
})

// ---------------------------------------------------------------------------
// generateInspectionPack
// ---------------------------------------------------------------------------

describe('generateInspectionPack', () => {
  it('returns a pack with correct dateRange', async () => {
    const pack = await generateInspectionPack({ start: '2025-01-01', end: '2025-03-31' })
    expect(pack.dateRange.start).toBe('2025-01-01')
    expect(pack.dateRange.end).toBe('2025-03-31')
  })

  it('includes generatedAt as ISO string', async () => {
    const pack = await generateInspectionPack({ start: '2025-01-01', end: '2025-03-31' })
    expect(() => new Date(pack.generatedAt)).not.toThrow()
    expect(pack.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('includes audits within the date range', async () => {
    const db = getDb()
    await db.infection_control_audits.bulkPut([
      makeCompletedAudit({ id: 'a1', auditDate: '2025-01-15', auditMonth: '2025-01', complianceScore: 90 }),
      makeCompletedAudit({ id: 'a2', auditDate: '2025-02-10', auditMonth: '2025-02', complianceScore: 70 }),
      makeCompletedAudit({ id: 'a3', auditDate: '2025-05-01', auditMonth: '2025-05', complianceScore: 85 }),
    ])

    const pack = await generateInspectionPack({ start: '2025-01-01', end: '2025-03-31' })
    const ids = pack.auditResults.map((a) => a.id)
    expect(ids).toContain('a1')
    expect(ids).toContain('a2')
    expect(ids).not.toContain('a3')
  })

  it('calculates overallComplianceScore as average of scored audits', async () => {
    const db = getDb()
    await db.infection_control_audits.bulkPut([
      makeCompletedAudit({ id: 'b1', auditDate: '2025-01-01', auditMonth: '2025-01', complianceScore: 100 }),
      makeCompletedAudit({ id: 'b2', auditDate: '2025-02-01', auditMonth: '2025-02', complianceScore: 60 }),
    ])

    const pack = await generateInspectionPack({ start: '2025-01-01', end: '2025-03-31' })
    expect(pack.overallComplianceScore).toBeCloseTo(80)
  })

  it('returns overallComplianceScore of 0 when no audits in range', async () => {
    const pack = await generateInspectionPack({ start: '2025-01-01', end: '2025-03-31' })
    expect(pack.overallComplianceScore).toBe(0)
  })

  it('excludes audits with null complianceScore from average', async () => {
    const db = getDb()
    await db.infection_control_audits.bulkPut([
      makeCompletedAudit({ id: 'c1', auditDate: '2025-01-01', auditMonth: '2025-01', complianceScore: 100 }),
      makeCompletedAudit({ id: 'c2', auditDate: '2025-02-01', auditMonth: '2025-02', complianceScore: null }),
    ])

    const pack = await generateInspectionPack({ start: '2025-01-01', end: '2025-03-31' })
    // Only c1 (score=100) counts; c2 is excluded
    expect(pack.overallComplianceScore).toBeCloseTo(100)
  })

  it('always lists spillIncidents in missingSections', async () => {
    const pack = await generateInspectionPack({ start: '2025-01-01', end: '2025-03-31' })
    expect(pack.missingSections).toContain('spillIncidents')
    expect(pack.spillIncidents).toHaveLength(0)
  })

  it('lists temperatureCompliance in missingSections when tables absent', async () => {
    const pack = await generateInspectionPack({ start: '2025-01-01', end: '2025-03-31' })
    expect(pack.missingSections).toContain('temperatureCompliance')
    expect(pack.temperatureCompliance).toEqual({
      totalReadings: 0,
      excursionCount: 0,
      excursionRate: 0,
    })
  })

  it('never throws — degrades gracefully on all failures', async () => {
    // Should always resolve, never reject
    await expect(
      generateInspectionPack({ start: '2025-01-01', end: '2025-03-31' }),
    ).resolves.toBeDefined()
  })
})
