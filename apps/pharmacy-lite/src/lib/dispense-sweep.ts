import { db } from '@/lib/db'
import { buildRecordDispensePayload } from '@/lib/dispense-sync'
import { enqueuePharmacySyncEntry } from '@/lib/dexie-sync-adapter'

/**
 * Story 57.3 (H-PHARM-1, AC #5): orphaned-dispense recovery sweep.
 *
 * A dispense record is safety-critical and must always be durably queued for
 * Hub sync. If a dispense was persisted to `db.dispenses` but its sync-queue
 * entry never got created (e.g. an enqueue that failed silently, or a crash
 * between the `dispenses.put` and the enqueue), the record would sit forever in
 * IndexedDB with nothing pushing it — and would then be destroyed at logout.
 *
 * This sweep finds every dispense row that has NO corresponding sync-queue entry
 * (any status) and re-enqueues it. Matching is by the dispense id, which the
 * sync-queue stores in cleartext as `resourceId` (the payload is encrypted, the
 * id is not). Re-enqueueing a record the Hub already has is safe: the Hub's
 * recordDispense endpoint is idempotent on dispenseId.
 *
 * Runs at drain start (login / worker start) and on reconnect, before the drain
 * pushes. Never throws — a sweep failure must not block the drain or a workflow.
 *
 * @returns the number of orphaned dispenses re-enqueued (for tests / diagnostics).
 */
export async function sweepOrphanedDispenses(): Promise<number> {
  try {
    const [dispenses, queueEntries] = await Promise.all([
      db.dispenses.toArray(),
      db.syncQueue.where('resourceType').equals('MedicationDispense').toArray(),
    ])

    // Set of dispense ids that already have a sync-queue entry (any status).
    const queuedIds = new Set(queueEntries.map((e) => e.resourceId))

    let reEnqueued = 0
    for (const dispense of dispenses) {
      if (queuedIds.has(dispense.id)) continue

      // Reconstruct the Hub payload from the dispense itself (pharmacistRef comes
      // from the stored performer ref; the drain re-fetches the token at push time).
      const payload = buildRecordDispensePayload(dispense)
      await enqueuePharmacySyncEntry({
        resourceType: 'MedicationDispense',
        resourceId: dispense.id,
        action: 'dispense_sync',
        payload,
        hlcTimestamp: dispense._ultranos.hlcTimestamp,
      })
      reEnqueued++
    }

    return reEnqueued
  } catch {
    // Non-fatal — the drain will still run; the sweep retries next cycle.
    return 0
  }
}
