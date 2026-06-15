import { getQueueItems, updateQueueItemStatus, autoExpireReagents } from './db'
import type { QueueAuditEvent } from './upload-queue-worker'
import { reportReagentEvent } from './audit-client'

const EXPIRY_MS = 48 * 60 * 60 * 1000 // 48 hours
const CHECK_INTERVAL_MS = 15 * 60 * 1000 // 15 minutes

/**
 * Scan queue for items older than 48 hours and mark them expired.
 * Only marks 'pending' items — uploading, expired, and failed items are skipped.
 * Returns the count of newly expired items.
 */
export async function checkExpiredItems(
  onAuditEvent: (event: QueueAuditEvent) => void,
): Promise<{ expiredCount: number }> {
  const items = await getQueueItems()
  const now = Date.now()
  let expiredCount = 0

  for (const item of items) {
    if (item.status === 'expired' || item.status === 'failed' || item.status === 'uploading') continue

    const age = now - new Date(item.queuedAt).getTime()
    if (age > EXPIRY_MS) {
      await updateQueueItemStatus(item.id!, 'expired')
      expiredCount++
      onAuditEvent({
        action: 'QUEUE_ITEM_EXPIRED',
        queueEntryId: item.id!,
        testCategory: item.metadata.loincDisplay,
        patientRef: item.patientRef,
        timestamp: new Date().toISOString(),
      })
    }
  }

  return { expiredCount }
}

/**
 * Scan ACTIVE reagents whose expiryDate < today and mark them EXPIRED.
 * Uses a Dexie transaction-with-status-check to guard against concurrent tab writes.
 * Emits REAGENT_AUTO_EXPIRED audit events for each auto-expired reagent.
 * Returns the count of reagents auto-expired.
 */
export async function checkExpiredReagents(): Promise<{ expiredCount: number }> {
  const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const expiredReagentIds = await autoExpireReagents(today)

  for (const reagentId of expiredReagentIds) {
    reportReagentEvent({
      action: 'REAGENT_AUTO_EXPIRED',
      reagentId,
      statusChange: 'ACTIVE → EXPIRED',
    })
  }

  return { expiredCount: expiredReagentIds.length }
}

/**
 * Start periodic expiry checking (every 15 minutes).
 * Also runs immediately on startup. Checks both upload queue items and reagents.
 * Returns cleanup function.
 */
export function startExpiryChecker(
  onAuditEvent: (event: QueueAuditEvent) => void,
): () => void {
  // Run immediately
  checkExpiredItems(onAuditEvent)
  checkExpiredReagents()

  const interval = setInterval(() => {
    checkExpiredItems(onAuditEvent)
    checkExpiredReagents()
  }, CHECK_INTERVAL_MS)

  return () => clearInterval(interval)
}
