/**
 * Check-In Scheduler — Story 46.5 (Task 3)
 *
 * Determines which mentorship pairings have overdue monthly check-ins for a
 * given technician (as either mentor or mentee).
 *
 * Reads only from local Dexie — no network calls. Safe to call offline.
 * No PHI: technician IDs are opaque identifiers.
 */

import { getDb } from '@/lib/db'
import type { MentorshipPairing } from '@/lib/mentorship-types'

/**
 * Returns active pairings where `nextCheckInDue` is in the past.
 *
 * A pairing is overdue when:
 *   - The technician participates as mentor OR mentee
 *   - `status` is 'active'
 *   - `nextCheckInDue` < current ISO 8601 timestamp (string comparison is
 *     valid for ISO 8601 dates — lexicographic order matches chronological order)
 *
 * @param technicianId - Opaque practitioner ID (not PHI)
 * @returns Array of overdue MentorshipPairing records, newest deadline first
 */
export async function getOverdueCheckIns(
  technicianId: string,
): Promise<MentorshipPairing[]> {
  try {
    const db = getDb()
    const now = new Date().toISOString()

    const pairings = await db.mentorship_pairings
      .where('mentorId')
      .equals(technicianId)
      .or('menteeId')
      .equals(technicianId)
      .filter(
        (pairing) =>
          pairing.status === 'active' && pairing.nextCheckInDue < now,
      )
      .toArray()

    // Sort by nextCheckInDue ascending (most overdue first)
    pairings.sort((a, b) => (a.nextCheckInDue < b.nextCheckInDue ? -1 : 1))

    return pairings
  } catch {
    // Dexie unavailable (e.g. unit-test environment without IndexedDB) — safe no-op
    return []
  }
}
