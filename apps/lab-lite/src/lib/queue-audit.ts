import { reportQueueAuditEvent as emitQueueAuditToLedger } from './audit-client'

export type QueueAuditEventType =
  | 'QUEUE_ENTRY_CREATED'
  | 'QUEUE_DRAIN_SUCCESS'
  | 'QUEUE_ITEM_EXPIRED'
  | 'QUEUE_ITEM_DISCARDED'

export interface QueueAuditPayload {
  action: QueueAuditEventType
  queueEntryId: number
  testCategory: string
  patientRef: string
  timestamp: string
  technicianId?: string
}

/**
 * Queue audit event reporting for upload queue operations.
 * Never throws — queue operations must not be blocked by audit failures.
 *
 * Story 59.1 disposition (C-SYS-5): this module previously POSTed to
 * `lab.reportQueueEvent`, a Hub procedure that never existed — every event was
 * silently lost. It now records through the client Dexie audit ledger
 * (`audit-client.reportQueueAuditEvent`), whose drain worker syncs to the Hub's
 * real, authenticated `audit.sync` endpoint. This is DURABLE (survives offline)
 * and avoids adding another spoofable fire-and-forget audit sink on the Hub.
 *
 * The `token` parameter is retained for call-site compatibility; the ledger
 * drain resolves its own token at sync time.
 */
export async function reportQueueAuditEvent(payload: QueueAuditPayload, _token?: string): Promise<void> {
  try {
    emitQueueAuditToLedger({
      action: payload.action,
      queueEntryId: payload.queueEntryId,
      testCategory: payload.testCategory,
      patientRef: payload.patientRef,
      timestamp: payload.timestamp,
      ...(payload.technicianId ? { technicianId: payload.technicianId } : {}),
    })
  } catch {
    // Audit reporting is best-effort from the client — the ledger write itself
    // is local and durable; only unexpected synchronous errors land here.
  }
}
