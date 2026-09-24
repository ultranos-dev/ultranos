import { emitClientAudit } from '@ultranos/audit-logger/client'
import { AuditAction, AuditResourceType, UserRole } from '@ultranos/shared-types'
import { hlc, serializeHlc } from '@/lib/hlc'

/**
 * Emit a POS financial audit event (void / refund / cash-out) to the unified
 * client audit ledger. Story 62.1.
 *
 * Fire-and-forget (never throws). Metadata MUST be non-PHI — ids, money amounts,
 * status, reference numbers, and operational reasons only. No medication names,
 * patient names, or free-text that could carry PHI. `emitClientAudit` strips
 * known PHI field names as a backstop, but callers must not pass clinical text.
 */
export function auditPosEvent(
  actorId: string,
  action: AuditAction,
  resourceType: AuditResourceType,
  resourceId: string,
  metadata?: Record<string, unknown>,
): void {
  void emitClientAudit({
    actorId: actorId || 'unknown',
    actorRole: UserRole.PHARMACIST, // RBAC is Phase 3b (mirrors procurement audit)
    action,
    resourceType,
    resourceId,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: { ...metadata, source: 'pharmacy-lite', domain: 'pos' },
  })
}
