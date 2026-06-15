import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import 'fake-indexeddb/auto'
import { getDb } from '../lib/db'
import {
  startAudit,
  recordItemResult,
  calculateComplianceScore,
  completeAudit,
  getComplianceTrends,
} from '../lib/safety/audit-checklist-service'
import {
  ChecklistItemStatus,
  AuditStatus,
  type InfectionControlAudit,
} from '../types/infection-control-audit'

vi.mock('@/lib/audit-client', () => ({
  reportInfectionControlAuditEvent: vi.fn(),
}))

vi.mock('@/lib/hlc', () => ({
  hlc: { now: () => ({ wallMs: Date.now(), counter: 0, nodeId: 'test-node' }) },
  serializeHlc: () => 'hlc-test-timestamp',
}))

import { reportInfectionControlAuditEvent } from '@/lib/audit-client'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAudit(
  itemStatuses: ChecklistItemStatus[],
  overrides: Partial<InfectionControlAudit> = {},
): InfectionControlAudit {
  return {
    id: 'audit-test-' + Math.random(),
    auditDate: '2025-01-15',
    auditMonth: '2025-01',
    conductedBy: 'practitioner-123',
    status: AuditStatus.IN_PROGRESS,
    complianceScore: null,
    completedAt: null,
    notes: '',
    hlcTimestamp: 'hlc-test',
    items: itemStatuses.map((status, i) => ({
      templateId: 'ic-test-0' + (i + 1),
      status,
      notes: null,
      photoEvidence: null,
      photoFileName: null,
      completedAt:
        status !== ChecklistItemStatus.NOT_APPLICABLE
          ? new Date().toISOString()
          : null,
      completedBy: 'practitioner-123',
    })),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  vi.clearAllMocks()

  const db = getDb()
  await db.checklist_templates.clear()
  await db.infection_control_audits.clear()

  await db.checklist_templates.bulkPut([
    {
      id: 'ic-test-01',
      category: 'Hand Hygiene',
      description: 'Test item 1',
      order: 1,
      isDefault: true,
      requiresPhoto: false,
      isActive: true,
    },
    {
      id: 'ic-test-02',
      category: 'PPE',
      description: 'Test item 2',
      order: 2,
      isDefault: false,
      requiresPhoto: true,
      isActive: true,
    },
    {
      id: 'ic-test-03',
      category: 'General',
      description: 'Inactive item',
      order: 3,
      isDefault: false,
      requiresPhoto: false,
      isActive: false,
    },
  ])
})

afterEach(async () => {
  const db = getDb()
  await db.checklist_templates.clear()
  await db.infection_control_audits.clear()
})

// ---------------------------------------------------------------------------
// startAudit
// ---------------------------------------------------------------------------

describe('startAudit', () => {
  it('creates audit with all active templates as NOT_APPLICABLE', async () => {
    const audit = await startAudit('practitioner-123')

    expect(audit.status).toBe(AuditStatus.IN_PROGRESS)
    expect(audit.conductedBy).toBe('practitioner-123')
    // Only 2 active templates (ic-test-03 is inactive)
    expect(audit.items.length).toBe(2)
    for (const item of audit.items) {
      expect(item.status).toBe(ChecklistItemStatus.NOT_APPLICABLE)
    }
    expect(audit.completedAt).toBeNull()
  })

  it('saves audit to Dexie', async () => {
    const audit = await startAudit('practitioner-123')

    const db = getDb()
    const saved = await db.infection_control_audits.get(audit.id)
    expect(saved).not.toBeUndefined()
    expect(saved!.id).toBe(audit.id)
  })

  it('emits IC_AUDIT_STARTED event', async () => {
    await startAudit('practitioner-123')

    expect(reportInfectionControlAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'IC_AUDIT_STARTED' }),
    )
  })
})

// ---------------------------------------------------------------------------
// recordItemResult
// ---------------------------------------------------------------------------

describe('recordItemResult', () => {
  it('updates matching item status to PASS', async () => {
    const audit = await startAudit('practitioner-123')
    await recordItemResult(audit.id, 'ic-test-01', {
      status: ChecklistItemStatus.PASS,
    })

    const db = getDb()
    const updated = await db.infection_control_audits.get(audit.id)
    const item = updated!.items.find((i) => i.templateId === 'ic-test-01')
    expect(item).toBeDefined()
    expect(item!.status).toBe(ChecklistItemStatus.PASS)
    expect(item!.completedAt).not.toBeNull()
  })

  it('stores notes on FAIL item', async () => {
    const audit = await startAudit('practitioner-123')
    await recordItemResult(audit.id, 'ic-test-01', {
      status: ChecklistItemStatus.FAIL,
      notes: 'Need to restock',
    })

    const db = getDb()
    const updated = await db.infection_control_audits.get(audit.id)
    const item = updated!.items.find((i) => i.templateId === 'ic-test-01')
    expect(item!.status).toBe(ChecklistItemStatus.FAIL)
    expect(item!.notes).toBe('Need to restock')
  })

  it('throws when audit not found', async () => {
    await expect(
      recordItemResult('non-existent-audit-id', 'ic-test-01', {
        status: ChecklistItemStatus.PASS,
      }),
    ).rejects.toThrow('Audit not found')
  })
})

// ---------------------------------------------------------------------------
// calculateComplianceScore
// ---------------------------------------------------------------------------

describe('calculateComplianceScore', () => {
  it('returns 100 when all items pass', () => {
    const audit = makeAudit([
      ChecklistItemStatus.PASS,
      ChecklistItemStatus.PASS,
      ChecklistItemStatus.PASS,
    ])
    expect(calculateComplianceScore(audit)).toBe(100)
  })

  it('returns 0 when all items fail', () => {
    const audit = makeAudit([
      ChecklistItemStatus.FAIL,
      ChecklistItemStatus.FAIL,
      ChecklistItemStatus.FAIL,
    ])
    expect(calculateComplianceScore(audit)).toBe(0)
  })

  it('returns null when all items are NOT_APPLICABLE', () => {
    const audit = makeAudit([
      ChecklistItemStatus.NOT_APPLICABLE,
      ChecklistItemStatus.NOT_APPLICABLE,
      ChecklistItemStatus.NOT_APPLICABLE,
    ])
    expect(calculateComplianceScore(audit)).toBeNull()
  })

  it('excludes NOT_APPLICABLE items from calculation', () => {
    // 2 PASS + 1 FAIL + 2 NOT_APPLICABLE = 5 items; score = (2/3)*100
    const audit = makeAudit([
      ChecklistItemStatus.PASS,
      ChecklistItemStatus.PASS,
      ChecklistItemStatus.FAIL,
      ChecklistItemStatus.NOT_APPLICABLE,
      ChecklistItemStatus.NOT_APPLICABLE,
    ])
    const score = calculateComplianceScore(audit)
    expect(score).not.toBeNull()
    expect(score!).toBeCloseTo((2 / 3) * 100, 2)
  })

  it('returns 50 for mix of pass and fail', () => {
    const audit = makeAudit([
      ChecklistItemStatus.PASS,
      ChecklistItemStatus.PASS,
      ChecklistItemStatus.FAIL,
      ChecklistItemStatus.FAIL,
    ])
    expect(calculateComplianceScore(audit)).toBe(50)
  })
})

// ---------------------------------------------------------------------------
// completeAudit
// ---------------------------------------------------------------------------

describe('completeAudit', () => {
  it('sets status to COMPLETED and calculates score', async () => {
    const audit = await startAudit('practitioner-123')
    await recordItemResult(audit.id, 'ic-test-01', {
      status: ChecklistItemStatus.PASS,
    })
    await recordItemResult(audit.id, 'ic-test-02', {
      status: ChecklistItemStatus.PASS,
    })

    const completed = await completeAudit(audit.id)
    expect(completed.status).toBe(AuditStatus.COMPLETED)
    expect(completed.complianceScore).toBe(100)
    expect(typeof completed.completedAt).toBe('string')
  })

  it('saves completion to Dexie', async () => {
    const audit = await startAudit('practitioner-123')
    await completeAudit(audit.id)

    const db = getDb()
    const saved = await db.infection_control_audits.get(audit.id)
    expect(saved!.status).toBe(AuditStatus.COMPLETED)
  })

  it('queues sync entry', async () => {
    const audit = await startAudit('practitioner-123')
    await completeAudit(audit.id)

    const db = getDb()
    const entries = await db.syncQueue
      .filter(
        (e) =>
          e.resourceType === 'InfectionControlAudit' &&
          e.resourceId === audit.id,
      )
      .toArray()
    expect(entries.length).toBeGreaterThan(0)
  })

  it('strips Blob from sync payload', async () => {
    const audit = await startAudit('practitioner-123')
    // Record an item with a mock photo evidence Blob
    await recordItemResult(audit.id, 'ic-test-02', {
      status: ChecklistItemStatus.PASS,
      photoEvidence: new Blob(['fake-image-data'], { type: 'image/jpeg' }),
      photoFileName: 'photo.jpg',
    })
    await completeAudit(audit.id)

    const db = getDb()
    const entries = await db.syncQueue
      .filter((e) => e.resourceId === audit.id)
      .toArray()
    expect(entries.length).toBeGreaterThan(0)

    const payload = entries[0].payload as InfectionControlAudit
    for (const item of payload.items) {
      expect(item.photoEvidence).toBeNull()
    }
  })

  it('emits IC_AUDIT_COMPLETED event with complianceScore', async () => {
    const audit = await startAudit('practitioner-123')
    await recordItemResult(audit.id, 'ic-test-01', {
      status: ChecklistItemStatus.PASS,
    })
    await completeAudit(audit.id)

    expect(reportInfectionControlAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'IC_AUDIT_COMPLETED',
        complianceScore: expect.any(Number),
      }),
    )
  })
})

// ---------------------------------------------------------------------------
// getComplianceTrends
// ---------------------------------------------------------------------------

describe('getComplianceTrends', () => {
  it('returns empty array when no audits', async () => {
    const trends = await getComplianceTrends(6)
    expect(trends).toEqual([])
  })

  it('returns one trend per month', async () => {
    const db = getDb()
    await db.infection_control_audits.bulkPut([
      {
        ...makeAudit([ChecklistItemStatus.PASS]),
        id: 'audit-m1',
        auditMonth: '2025-01',
        status: AuditStatus.COMPLETED,
        complianceScore: 100,
        completedAt: '2025-01-15T10:00:00.000Z',
      },
      {
        ...makeAudit([ChecklistItemStatus.FAIL]),
        id: 'audit-m2',
        auditMonth: '2025-02',
        status: AuditStatus.COMPLETED,
        complianceScore: 0,
        completedAt: '2025-02-10T10:00:00.000Z',
      },
      {
        ...makeAudit([ChecklistItemStatus.PASS, ChecklistItemStatus.FAIL]),
        id: 'audit-m3',
        auditMonth: '2025-03',
        status: AuditStatus.COMPLETED,
        complianceScore: 50,
        completedAt: '2025-03-05T10:00:00.000Z',
      },
    ])

    const trends = await getComplianceTrends(6)
    expect(trends.length).toBe(3)
    const months = trends.map((t) => t.month)
    expect(months).toContain('2025-01')
    expect(months).toContain('2025-02')
    expect(months).toContain('2025-03')
  })

  it('uses most recent audit when multiple per month', async () => {
    const db = getDb()
    await db.infection_control_audits.bulkPut([
      {
        ...makeAudit([ChecklistItemStatus.FAIL]),
        id: 'audit-jan-early',
        auditMonth: '2025-01',
        status: AuditStatus.COMPLETED,
        complianceScore: 0,
        completedAt: '2025-01-05T10:00:00.000Z',
      },
      {
        ...makeAudit([ChecklistItemStatus.PASS]),
        id: 'audit-jan-late',
        auditMonth: '2025-01',
        status: AuditStatus.COMPLETED,
        complianceScore: 100,
        completedAt: '2025-01-20T10:00:00.000Z',
      },
    ])

    const trends = await getComplianceTrends(6)
    expect(trends.length).toBe(1)
    expect(trends[0].month).toBe('2025-01')
    // The later audit has score 100
    expect(trends[0].score).toBe(100)
  })

  it('limits to requested number of months', async () => {
    const db = getDb()
    const months = ['2025-01', '2025-02', '2025-03', '2025-04', '2025-05']
    await db.infection_control_audits.bulkPut(
      months.map((auditMonth, i) => ({
        ...makeAudit([ChecklistItemStatus.PASS]),
        id: 'audit-limit-' + i,
        auditMonth,
        status: AuditStatus.COMPLETED,
        complianceScore: 100,
        completedAt: `${auditMonth}-15T10:00:00.000Z`,
      })),
    )

    const trends = await getComplianceTrends(3)
    expect(trends.length).toBe(3)
  })
})
