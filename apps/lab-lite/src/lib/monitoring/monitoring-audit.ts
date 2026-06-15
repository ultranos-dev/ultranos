/**
 * Monitoring Audit Event Emitter — Story 52.1
 *
 * Centralises audit emission for monitoring flag operations.
 * Follows CLAUDE.md Rule #6: every PHI access/write must be audit-logged.
 * Metadata uses opaque IDs only — never patient names, test names, or
 * medication display names (those are operational data, not PHI per se,
 * but we keep all monitoring audit metadata to opaque refs for consistency).
 */

import { emitClientAudit } from '@ultranos/audit-logger/client'
import { AuditAction, AuditResourceType, UserRole } from '@ultranos/shared-types'
import { hlc, serializeHlc } from '@/lib/hlc'
import { useAuthSessionStore } from '@/stores/auth-session-store'

export type MonitoringAuditEvent =
  | 'MONITORING_FLAG_CREATED'
  | 'MONITORING_FLAG_UPDATED'
  | 'MONITORING_FLAG_COMPLETED'
  | 'MONITORING_FLAG_OVERDUE'
  | 'MONITORING_REMINDER_SENT'

export function emitMonitoringAuditEvent(
  event: MonitoringAuditEvent,
  metadata: Record<string, string | number | boolean | null | undefined>,
): void {
  const session = useAuthSessionStore.getState().session

  const actionMap: Record<MonitoringAuditEvent, AuditAction> = {
    MONITORING_FLAG_CREATED: AuditAction.CREATE,
    MONITORING_FLAG_UPDATED: AuditAction.UPDATE,
    MONITORING_FLAG_COMPLETED: AuditAction.UPDATE,
    MONITORING_FLAG_OVERDUE: AuditAction.UPDATE,
    MONITORING_REMINDER_SENT: AuditAction.CREATE,
  }

  void emitClientAudit({
    actorId: session?.userId ?? 'system',
    actorRole: UserRole.LAB_TECH,
    action: actionMap[event],
    resourceType: AuditResourceType.MEDICATION_DISPENSE,
    resourceId: String(metadata['dispensingEventId'] ?? metadata['patientRef'] ?? 'unknown'),
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      monitoringEvent: event,
      outcome: 'SUCCESS',
      source: 'lab-lite',
      ...metadata,
    },
  })
}
