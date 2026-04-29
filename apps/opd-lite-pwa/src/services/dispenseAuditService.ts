import { db, type DispenseAuditEntry } from '@/lib/db'
import { hlc, serializeHlc } from '@/lib/hlc'
import type { LocalMedicationDispense } from '@/lib/medication-dispense'

/**
 * Append-only audit log entry for a medication dispense event.
 * Follows the same pattern as interactionAuditService.
 */
export async function logDispenseEvent(
  dispense: LocalMedicationDispense,
  action: 'created' | 'cancelled',
): Promise<void> {
  const ts = hlc.now()

  const entry: DispenseAuditEntry = {
    id: crypto.randomUUID(),
    dispenseId: dispense.id,
    patientRef: dispense.subject.reference,
    medicationCode: dispense.medicationCodeableConcept.coding?.[0]?.code ?? '',
    medicationDisplay: dispense.medicationCodeableConcept.text ?? '',
    pharmacistRef: dispense.performer?.[0]?.actor.reference ?? '',
    action,
    hlcTimestamp: serializeHlc(ts),
    createdAt: new Date().toISOString(),
  }

  await db.dispenseAuditLog.add(entry)
}
