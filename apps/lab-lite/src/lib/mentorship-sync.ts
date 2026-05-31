/**
 * Mentorship Pairing Sync — Story 46.5 (Task 2)
 *
 * Syncs mentorship pairing data between Lab-Lite (Dexie) and the Hub API.
 *
 * Pairing lifecycle is fully Hub-managed (district health officers create/close
 * pairings). Lab-Lite is read-only with respect to pairing records.
 *
 * What this module does:
 *   1. Pull pairing registry from Hub (upsert into Dexie)
 *   2. Push pending local journal entries and check-in records to Hub
 *   3. Pull the partner's journal entries and check-in responses from Hub
 *
 * Offline-first: all operations degrade gracefully to no-ops when the Hub
 * is unreachable. Errors never propagate to callers — they are logged at
 * warn level (no PHI in log output).
 *
 * No patient data is involved in this module (CLAUDE.md Rule #7 not applicable).
 */

import { getDb } from '@/lib/db'
import type { MentorshipPairing, LearningJournalEntry, CheckInRecord } from '@/lib/mentorship-types'

// ---------------------------------------------------------------------------
// Hub API URL (mirrors the pattern in trpc.ts and other sync modules)
// ---------------------------------------------------------------------------

const HUB_API_URL =
  typeof window !== 'undefined'
    ? process.env.NEXT_PUBLIC_HUB_API_URL ?? 'http://localhost:3000/api/trpc'
    : process.env.HUB_API_URL ?? 'http://localhost:3000/api/trpc'

// ---------------------------------------------------------------------------
// Public surface
// ---------------------------------------------------------------------------

export interface MentorshipSyncSummary {
  pairingCount: number
  pendingJournalEntries: number
  pendingCheckIns: number
}

/**
 * Return a dashboard-ready summary of local mentorship data for the given
 * technician (mentor or mentee).
 *
 * Reads only from local Dexie — never touches the network.
 * Safe to call offline and at any frequency.
 */
export async function getMentorshipSyncSummary(
  technicianId: string,
): Promise<MentorshipSyncSummary> {
  const db = getDb()

  const [activePairings, pendingJournal, pendingCheckIns] = await Promise.all([
    // Count pairings where this technician is mentor or mentee
    db.mentorship_pairings
      .where('mentorId')
      .equals(technicianId)
      .or('menteeId')
      .equals(technicianId)
      .count(),
    // Count journal entries authored by this technician that haven't been synced
    db.learning_journal
      .where('syncStatus')
      .equals('pending')
      .filter((entry) => entry.authorId === technicianId)
      .count(),
    // Count check-in records completed by this technician that haven't been synced
    db.check_in_records
      .where('syncStatus')
      .equals('pending')
      .filter((record) => record.completedBy === technicianId)
      .count(),
  ])

  return {
    pairingCount: activePairings,
    pendingJournalEntries: pendingJournal,
    pendingCheckIns: pendingCheckIns,
  }
}

/**
 * Run a full mentorship sync cycle for the given technician.
 *
 * Steps (in order):
 *   1. Pull pairing registry from Hub
 *   2. Push pending local journal entries to Hub
 *   3. Push pending local check-in records to Hub
 *   4. Pull partner's journal entries and check-in responses from Hub
 *
 * The entire function is error-safe — exceptions are caught and logged
 * without PHI. Callers receive a resolved Promise regardless of network state.
 */
export async function syncMentorshipPairings(technicianId: string): Promise<void> {
  // Each phase is isolated: one phase failing does not prevent subsequent phases.
  await _pullPairings(technicianId)
  await _pushPendingJournalEntries(technicianId)
  await _pushPendingCheckIns(technicianId)
  await _pullPartnerContent(technicianId)
}

// ---------------------------------------------------------------------------
// Phase 1 — Pull pairing registry from Hub
// ---------------------------------------------------------------------------

async function _pullPairings(technicianId: string): Promise<void> {
  try {
    const input = encodeURIComponent(JSON.stringify({ json: { technicianId } }))
    const res = await fetch(
      `${HUB_API_URL}/mentorship.listPairings?input=${input}`,
      {
        method: 'GET',
        signal: AbortSignal.timeout(15_000),
      },
    )

    if (!res.ok) {
      // Hub endpoint not yet implemented or server error — silent no-op
      console.warn(
        `[mentorship-sync] Pull pairings returned ${res.status} — skipping`,
      )
      return
    }

    const body = (await res.json()) as {
      result: { data: { json: { pairings: MentorshipPairing[] } } }
    }
    const remotePairings: MentorshipPairing[] = body.result.data.json.pairings ?? []

    if (remotePairings.length === 0) return

    // Upsert changed pairings using meta.lastUpdated for change detection
    const db = getDb()
    const localPairings = await db.mentorship_pairings
      .where('mentorId')
      .equals(technicianId)
      .or('menteeId')
      .equals(technicianId)
      .toArray()
    const localMap = new Map(localPairings.map((p) => [p.id, p]))

    const toUpsert: MentorshipPairing[] = []
    for (const remote of remotePairings) {
      const local = localMap.get(remote.id)
      if (!local || remote.meta.lastUpdated > local.meta.lastUpdated) {
        toUpsert.push(remote)
      }
    }

    if (toUpsert.length > 0) {
      await db.mentorship_pairings.bulkPut(toUpsert)
    }
  } catch (err) {
    // Offline or Hub unavailable — no-op
    console.warn(
      '[mentorship-sync] Pull pairings unavailable:',
      err instanceof Error ? err.message : 'unknown',
    )
  }
}

// ---------------------------------------------------------------------------
// Phase 2 — Push pending journal entries to Hub
// ---------------------------------------------------------------------------

async function _pushPendingJournalEntries(technicianId: string): Promise<void> {
  try {
    const db = getDb()
    const pending = await db.learning_journal
      .where('syncStatus')
      .equals('pending')
      .filter((entry) => entry.authorId === technicianId)
      .toArray()

    if (pending.length === 0) return

    const res = await fetch(`${HUB_API_URL}/mentorship.pushJournalEntries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: { entries: pending } }),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) {
      console.warn(
        `[mentorship-sync] Push journal entries returned ${res.status} — will retry on next sync`,
      )
      return
    }

    // Mark successfully pushed entries as synced
    await db.transaction('rw', db.learning_journal, async () => {
      for (const entry of pending) {
        await db.learning_journal.update(entry.id, {
          syncStatus: 'synced' as LearningJournalEntry['syncStatus'],
        })
      }
    })
  } catch (err) {
    console.warn(
      '[mentorship-sync] Push journal entries unavailable:',
      err instanceof Error ? err.message : 'unknown',
    )
  }
}

// ---------------------------------------------------------------------------
// Phase 3 — Push pending check-in records to Hub
// ---------------------------------------------------------------------------

async function _pushPendingCheckIns(technicianId: string): Promise<void> {
  try {
    const db = getDb()
    const pending = await db.check_in_records
      .where('syncStatus')
      .equals('pending')
      .filter((record) => record.completedBy === technicianId)
      .toArray()

    if (pending.length === 0) return

    const res = await fetch(`${HUB_API_URL}/mentorship.pushCheckIns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ json: { checkIns: pending } }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      console.warn(
        `[mentorship-sync] Push check-ins returned ${res.status} — will retry on next sync`,
      )
      return
    }

    // Mark successfully pushed records as synced
    await db.transaction('rw', db.check_in_records, async () => {
      for (const record of pending) {
        await db.check_in_records.update(record.id, {
          syncStatus: 'synced' as CheckInRecord['syncStatus'],
        })
      }
    })
  } catch (err) {
    console.warn(
      '[mentorship-sync] Push check-ins unavailable:',
      err instanceof Error ? err.message : 'unknown',
    )
  }
}

// ---------------------------------------------------------------------------
// Phase 4 — Pull partner's journal entries and check-in responses
// ---------------------------------------------------------------------------

async function _pullPartnerContent(technicianId: string): Promise<void> {
  try {
    const db = getDb()

    // Collect all pairing IDs where this technician participates
    const pairings = await db.mentorship_pairings
      .where('mentorId')
      .equals(technicianId)
      .or('menteeId')
      .equals(technicianId)
      .toArray()

    if (pairings.length === 0) return

    const pairingIds = pairings.map((p) => p.id)

    const input = encodeURIComponent(
      JSON.stringify({ json: { technicianId, pairingIds } }),
    )
    const res = await fetch(
      `${HUB_API_URL}/mentorship.pullPartnerContent?input=${input}`,
      {
        method: 'GET',
        signal: AbortSignal.timeout(30_000),
      },
    )

    if (!res.ok) {
      console.warn(
        `[mentorship-sync] Pull partner content returned ${res.status} — skipping`,
      )
      return
    }

    const body = (await res.json()) as {
      result: {
        data: {
          json: {
            journalEntries: LearningJournalEntry[]
            checkInRecords: CheckInRecord[]
          }
        }
      }
    }

    const { journalEntries = [], checkInRecords = [] } = body.result.data.json

    // Upsert partner's journal entries (only entries NOT authored by this technician)
    const partnerJournal = journalEntries.filter(
      (e) => e.authorId !== technicianId,
    )
    if (partnerJournal.length > 0) {
      await db.learning_journal.bulkPut(partnerJournal)
    }

    // Upsert partner's check-in records (only records NOT completed by this technician)
    const partnerCheckIns = checkInRecords.filter(
      (r) => r.completedBy !== technicianId,
    )
    if (partnerCheckIns.length > 0) {
      await db.check_in_records.bulkPut(partnerCheckIns)
    }
  } catch (err) {
    console.warn(
      '[mentorship-sync] Pull partner content unavailable:',
      err instanceof Error ? err.message : 'unknown',
    )
  }
}
