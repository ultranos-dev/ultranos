import { emitClientAudit, type ClientAuditEvent } from '@ultranos/audit-logger/client'
import { AuditAction, AuditResourceType, UserRole } from '@ultranos/shared-types'
import { hlc, serializeHlc } from '@/lib/hlc'
import { db } from '@/lib/db'

export const PROCUREMENT_RESOURCE_TYPES: readonly AuditResourceType[] = [
  AuditResourceType.PURCHASE_ORDER,
  AuditResourceType.SUPPLIER_INVOICE,
  AuditResourceType.SUPPLIER_PAYMENT,
  AuditResourceType.GOODS_RECEIPT,
]

/**
 * Emit a procurement audit event to the unified client audit ledger.
 * Never throws (fire-and-forget). Metadata must be non-PHI (ids, money, status,
 * reference numbers, operational reasons) — emitClientAudit strips known PHI
 * field names as a backstop.
 */
export function auditProcurementEvent(
  actorId: string,
  action: AuditAction,
  resourceType: AuditResourceType,
  resourceId: string,
  metadata?: Record<string, unknown>,
): void {
  void emitClientAudit({
    actorId: actorId || 'unknown',
    actorRole: UserRole.PHARMACIST, // RBAC is Phase 3b
    action,
    resourceType,
    resourceId,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: { ...metadata, source: 'pharmacy-lite', domain: 'procurement' },
  })
}

function referenceOf(e: ClientAuditEvent): string {
  const m = (e.metadata ?? {}) as Record<string, unknown>
  return String(m.poNumber ?? m.invoiceNumber ?? e.resourceId ?? '')
}

export async function getProcurementAuditEvents(filter?: {
  resourceType?: AuditResourceType
  action?: AuditAction
  search?: string
}): Promise<ClientAuditEvent[]> {
  const all = await db.clientAuditLog.toArray()
  const procurementSet = new Set<string>(PROCUREMENT_RESOURCE_TYPES as readonly string[])
  const q = filter?.search?.trim().toLowerCase()
  return all
    .filter((e) => procurementSet.has(e.resourceType))
    .filter((e) => !filter?.resourceType || e.resourceType === filter.resourceType)
    .filter((e) => !filter?.action || e.action === filter.action)
    .filter((e) => {
      if (!q) return true
      return e.resourceId.toLowerCase().includes(q) || referenceOf(e).toLowerCase().includes(q)
    })
    .sort((a, b) => (b.hlcTimestamp ?? '').localeCompare(a.hlcTimestamp ?? '') || (b.queuedAt ?? '').localeCompare(a.queuedAt ?? ''))
}
