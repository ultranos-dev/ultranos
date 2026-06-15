import { hlc, serializeHlc } from '@/lib/hlc'
import {
  getChecklistTemplates,
  createAudit,
  updateAudit,
  getAuditHistory,
  getDb,
} from '@/lib/db'
import { reportInfectionControlAuditEvent } from '@/lib/audit-client'
import {
  ChecklistItemStatus,
  AuditStatus,
} from '@/types/infection-control-audit'
import type {
  ChecklistItemResult,
  InfectionControlAudit,
  ComplianceTrend,
} from '@/types/infection-control-audit'

// ---------------------------------------------------------------------------
// Story 47.7 — Infection Control Self-Audit Service
// Manages audit lifecycle: creation, item recording, completion, and trend reporting.
// No PHI involved — conductedBy is an opaque practitioner ID.
// ---------------------------------------------------------------------------

/**
 * Start a new infection control audit for today.
 * Initialises all active checklist items as NOT_APPLICABLE so the auditor
 * can explicitly mark each one rather than leaving gaps.
 */
export async function startAudit(conductedBy: string): Promise<InfectionControlAudit> {
  const templates = await getChecklistTemplates()

  const today = new Date()
  const auditDate = today.toISOString().slice(0, 10) // YYYY-MM-DD
  const auditMonth = today.toISOString().slice(0, 7) // YYYY-MM

  const items: ChecklistItemResult[] = templates.map((t) => ({
    templateId: t.id,
    status: ChecklistItemStatus.NOT_APPLICABLE,
    notes: null,
    photoEvidence: null,
    photoFileName: null,
    completedAt: null,
    completedBy: conductedBy,
  }))

  const audit: InfectionControlAudit = {
    id: crypto.randomUUID(),
    auditDate,
    auditMonth,
    conductedBy,
    status: AuditStatus.IN_PROGRESS,
    items,
    complianceScore: null,
    completedAt: null,
    notes: '',
    hlcTimestamp: serializeHlc(hlc.now()),
  }

  await createAudit(audit)

  reportInfectionControlAuditEvent({
    action: 'IC_AUDIT_STARTED',
    auditId: audit.id,
    auditMonth: audit.auditMonth,
    conductedBy,
  })

  return audit
}

/**
 * Record the result for a single checklist item within an in-progress audit.
 * Blobs (photo evidence) are stored in IndexedDB alongside the item.
 */
export async function recordItemResult(
  auditId: string,
  templateId: string,
  result: {
    status: ChecklistItemStatus
    notes?: string
    photoEvidence?: Blob
    photoFileName?: string
  },
): Promise<void> {
  const db = getDb()
  const audit = await db.infection_control_audits.get(auditId)

  if (!audit) {
    throw new Error('Audit not found')
  }

  const updatedItems: ChecklistItemResult[] = audit.items.map((item) => {
    if (item.templateId !== templateId) return item
    return {
      ...item,
      status: result.status,
      notes: result.notes ?? null,
      photoEvidence: result.photoEvidence ?? null,
      photoFileName: result.photoFileName ?? null,
      completedAt: new Date().toISOString(),
      completedBy: item.completedBy,
    }
  })

  await updateAudit(auditId, { items: updatedItems })

  reportInfectionControlAuditEvent({
    action: 'IC_AUDIT_ITEM_RECORDED',
    auditId,
    auditMonth: audit.auditMonth,
    conductedBy: audit.conductedBy,
  })
}

/**
 * Calculate the compliance score for an audit.
 * Only PASS and FAIL items are counted — NOT_APPLICABLE items are excluded.
 * Returns null when every item is NOT_APPLICABLE (no data to score).
 */
export function calculateComplianceScore(audit: InfectionControlAudit): number | null {
  const applicable = audit.items.filter(
    (item) =>
      item.status === ChecklistItemStatus.PASS ||
      item.status === ChecklistItemStatus.FAIL,
  )

  if (applicable.length === 0) return null

  const passedCount = applicable.filter(
    (item) => item.status === ChecklistItemStatus.PASS,
  ).length

  return (passedCount / applicable.length) * 100
}

/**
 * Mark an audit as completed, calculate its compliance score, and queue it
 * for sync to the Hub.
 * Blob fields are stripped from the sync payload (Blobs are not JSON-serialisable).
 */
export async function completeAudit(auditId: string): Promise<InfectionControlAudit> {
  const db = getDb()
  const audit = await db.infection_control_audits.get(auditId)

  if (!audit) {
    throw new Error('Audit not found')
  }

  const score = calculateComplianceScore(audit)

  const completedAudit: InfectionControlAudit = {
    ...audit,
    status: AuditStatus.COMPLETED,
    complianceScore: score,
    completedAt: new Date().toISOString(),
  }

  await updateAudit(auditId, {
    status: AuditStatus.COMPLETED,
    complianceScore: score,
    completedAt: completedAudit.completedAt,
  })

  // Queue for sync — strip Blob photo evidence before serialising to JSON
  await db.syncQueue.add({
    id: crypto.randomUUID(),
    resourceType: 'InfectionControlAudit',
    resourceId: auditId,
    payload: JSON.parse(
      JSON.stringify({
        ...completedAudit,
        items: completedAudit.items.map((item) => ({
          ...item,
          photoEvidence: null, // Blobs are not JSON-serialisable
        })),
      }),
    ),
    status: 'pending',
    createdAt: new Date().toISOString(),
  })

  reportInfectionControlAuditEvent({
    action: 'IC_AUDIT_COMPLETED',
    auditId,
    auditMonth: audit.auditMonth,
    conductedBy: audit.conductedBy,
    complianceScore: score,
  })

  return completedAudit
}

/**
 * Return month-by-month compliance trends for the last `months` calendar months.
 * When a month has multiple completed audits, the most recent one is used.
 * Results are sorted ascending by month (oldest first).
 */
export async function getComplianceTrends(months: number): Promise<ComplianceTrend[]> {
  const allAudits = await getAuditHistory()

  // Group by auditMonth, keeping only the most recent completed audit per month
  const byMonth = new Map<string, InfectionControlAudit>()
  for (const audit of allAudits) {
    const existing = byMonth.get(audit.auditMonth)
    if (!existing || audit.completedAt! > existing.completedAt!) {
      byMonth.set(audit.auditMonth, audit)
    }
  }

  // Sort months descending, keep the last `months` entries, then re-sort ascending
  const sortedMonths = Array.from(byMonth.keys()).sort().reverse().slice(0, months).sort()

  return sortedMonths.map((month) => {
    const audit = byMonth.get(month)!
    const passedItems = audit.items.filter(
      (item) => item.status === ChecklistItemStatus.PASS,
    ).length
    const failedItems = audit.items
      .filter((item) => item.status === ChecklistItemStatus.FAIL)
      .map((item) => item.templateId)

    return {
      month,
      score: audit.complianceScore ?? 0,
      totalItems: audit.items.length,
      passedItems,
      failedItems,
    }
  })
}
