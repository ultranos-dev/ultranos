/**
 * Logbook Sequential Numbering Service — Story 42.8
 *
 * Provides monotonically-increasing sequence numbers for the lab logbook.
 * Sequence assignment and entry insertion MUST happen inside a single Dexie
 * transaction (see logbook-writer.ts) to prevent gaps or duplicates under
 * concurrent usage on the same device.
 *
 * Multi-device note: If multiple devices authorize results offline
 * simultaneously, local seqNos may diverge. Hub reconciliation assigns
 * canonical sequence numbers on merge; the local seqNo is updated on next
 * sync pull. The facilityPrefix namespaces sequences per facility.
 */

import { getDb } from './db'

/**
 * Read the current maximum seqNo from the labLogbook table and return max + 1.
 * Returns 1 if the table is empty (first entry).
 *
 * IMPORTANT: This function must be called inside a `db.transaction('rw', db.labLogbook, ...)`
 * block together with the actual insert to prevent sequence gaps under concurrency.
 */
export async function getNextSequenceNumber(): Promise<number> {
  const db = getDb()
  const lastEntry = await db.labLogbook.orderBy('seqNo').last()
  return lastEntry ? lastEntry.seqNo + 1 : 1
}

/**
 * Format a facility-prefixed display number for the logbook register.
 * e.g., facilityPrefix='KBL', seqNo=42 → 'KBL-0042'
 */
export function formatDisplayNumber(facilityPrefix: string, seqNo: number): string {
  return `${facilityPrefix}-${seqNo.toString().padStart(4, '0')}`
}
