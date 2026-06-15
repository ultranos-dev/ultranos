import { getDb } from './db'

/**
 * Generate a unique sample ID in the format: {PREFIX}-{YYYYMMDD}-{NNNN}
 * Default prefix: "LAB" (configurable per lab via lab settings).
 *
 * Algorithm:
 *   1. Get today's date as YYYYMMDD.
 *   2. Inside a Dexie transaction, count samples with today's prefix.
 *   3. Next sequence = count + 1, zero-padded to 4 digits.
 *   4. Collision check: if ID already exists, increment and retry (max 5 attempts).
 *
 * @param prefix - Lab-configurable ID prefix. Defaults to "LAB".
 * @returns The generated unique sample ID (e.g., "LAB-20260530-0001").
 * @throws If unable to generate a unique ID after 5 collision retries.
 */
export async function generateSampleId(prefix = 'LAB'): Promise<string> {
  const db = getDb()
  const today = getTodayYYYYMMDD()
  const datePrefix = `${prefix}-${today}-`

  return db.transaction('rw', db.samples, async () => {
    // Count existing samples for today to determine starting sequence
    const existing = await db.samples
      .filter((s) => s._ultranos.labSampleId.startsWith(datePrefix))
      .count()

    let sequence = existing + 1
    const MAX_RETRIES = 5

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const candidate = `${datePrefix}${String(sequence).padStart(4, '0')}`

      // Collision guard: verify the ID doesn't already exist
      const collision = await db.samples
        .filter((s) => s._ultranos.labSampleId === candidate)
        .count()

      if (collision === 0) {
        return candidate
      }

      sequence++
    }

    throw new Error(
      `Unable to generate unique sample ID after ${MAX_RETRIES} attempts. Manual resolution required.`,
    )
  })
}

/**
 * Returns today's date as YYYYMMDD (local time).
 */
export function getTodayYYYYMMDD(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}${m}${d}`
}
