import { getHubApiUrl } from './trpc'

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
 * Fire-and-forget audit event reporting for upload queue operations.
 * Never throws — queue operations must not be blocked by audit failures.
 * Reports to Hub API via the lab.reportQueueEvent tRPC endpoint.
 */
export async function reportQueueAuditEvent(payload: QueueAuditPayload, token?: string): Promise<void> {
  try {
    await fetch(`${getHubApiUrl()}/lab.reportQueueEvent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        json: {
          event: payload.action,
          queueEntryId: payload.queueEntryId,
          testCategory: payload.testCategory,
          patientRef: payload.patientRef,
          timestamp: payload.timestamp,
          ...(payload.technicianId ? { technicianId: payload.technicianId } : {}),
        },
      }),
    })
  } catch {
    // Audit reporting is best-effort from the client.
    // Server-side capture is the long-term solution.
  }
}
