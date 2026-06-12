/**
 * Story 53.4 — Consultation Recipient Configuration
 *
 * Recipients (pathologists, reference labs) are fetched from Hub API and
 * cached in Dexie for offline use. Falls back to manual entry when no
 * cached recipients exist.
 *
 * No PHI: recipient data is operational/directory information only.
 */

import { getDb } from './db'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConsultationRecipient {
  id: string
  name: string
  type: 'pathologist' | 'reference_lab'
  specialization: string
  contactMethod: 'hub_message' | 'email'
  isAvailable: boolean
}

// ---------------------------------------------------------------------------
// Dexie helpers
// ---------------------------------------------------------------------------

/** Fetch all cached recipients from Dexie. */
export async function getCachedRecipients(): Promise<ConsultationRecipient[]> {
  const db = getDb()
  return db.consultation_recipients.toArray()
}

/** Fetch recipients by type from Dexie cache. */
export async function getCachedRecipientsByType(
  type: 'pathologist' | 'reference_lab',
): Promise<ConsultationRecipient[]> {
  const db = getDb()
  return db.consultation_recipients.where('type').equals(type).toArray()
}

/** Upsert a recipient into the Dexie cache. */
export async function upsertRecipient(recipient: ConsultationRecipient): Promise<void> {
  const db = getDb()
  await db.consultation_recipients.put(recipient)
}

/**
 * Sync recipients from Hub API into local Dexie cache.
 * Called when online. Replaces the full list on each successful sync.
 * Never throws — connectivity failures are non-critical.
 */
export async function syncRecipientsFromHub(
  hubApiUrl: string,
  token: string,
): Promise<void> {
  try {
    const res = await fetch(`${hubApiUrl}/consultation/recipients`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return

    const data = (await res.json()) as { recipients: ConsultationRecipient[] }
    if (!Array.isArray(data?.recipients)) return  // malformed response — keep cached data

    const db = getDb()

    await db.transaction('rw', db.consultation_recipients, async () => {
      await db.consultation_recipients.clear()
      for (const r of data.recipients) {
        await db.consultation_recipients.put(r)
      }
    })
  } catch {
    // Non-critical — cached recipients remain available
  }
}
