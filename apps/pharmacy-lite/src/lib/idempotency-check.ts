import { db } from '@/lib/db'

export interface IdempotencyResult {
  alreadyDispensed: boolean
  dispensedAt?: string
}

/**
 * Check if any prescription in the list has already been dispensed locally.
 * Queries the Dexie `dispenses` table for existing records matching
 * the same `authorizingPrescription[0].reference`.
 *
 * Returns the first match found (fail-fast).
 */
export async function checkPrescriptionAlreadyDispensed(
  prescriptionIds: string[],
): Promise<IdempotencyResult> {
  const allDispenses = await db.dispenses.toArray()

  for (const rxId of prescriptionIds) {
    const ref = `MedicationRequest/${rxId}`
    const match = allDispenses.find(
      (d) => d.authorizingPrescription?.[0]?.reference === ref,
    )
    if (match) {
      return {
        alreadyDispensed: true,
        dispensedAt: match.whenHandedOver ?? match._ultranos.createdAt,
      }
    }
  }

  return { alreadyDispensed: false }
}
