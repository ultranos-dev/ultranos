import { db, type DispenseAuditEntry } from '@/lib/db'
import { hlc, serializeHlc } from '@/lib/hlc'
import type { LocalMedicationDispense } from '@/lib/medication-dispense'
import { emitAuditEvent } from '@/lib/audit-emitter'
import {
  AuditAction,
  AuditOutcome,
  AuditResourceType,
  UserRole,
} from '@ultranos/shared-types'

/**
 * Append-only audit log entry for a medication dispense event.
 * Follows the same pattern as interactionAuditService.
 *
 * Two audit writes happen here:
 *   1. Local Dexie table (dispenseAuditLog) — the local record with
 *      clinical details (encrypted at rest via Dexie middleware).
 *   2. Structured audit event (pendingAuditEvents) — queued for sync
 *      to the Hub API where it feeds into the shared AuditLogger with
 *      SHA-256 hash chaining. Contains only opaque IDs, never PHI.
 *
 * This dual-write satisfies CLAUDE.md healthcare safety rule #6.
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

  // 1. Local Dexie audit record (encrypted, includes clinical details)
  await db.dispenseAuditLog.add(entry)

  // 2. Structured audit event for Hub sync (opaque IDs only — no PHI).
  //    Maps dispense actions to the shared AuditAction enum.
  //    NOTE: Do NOT include medication names, codes, or any clinical
  //    content in the audit event payload. Use opaque IDs only.
  await emitAuditEvent({
    actorId: dispense.performer?.[0]?.actor.reference,
    actorRole: UserRole.PHARMACIST,
    action: action === 'created' ? AuditAction.CREATE : AuditAction.DELETE_REQUEST,
    resourceType: AuditResourceType.PRESCRIPTION,
    resourceId: dispense.id,
    patientId: dispense.subject.reference,
    outcome: AuditOutcome.SUCCESS,
    metadata: {
      dispenseAction: action,
      source: 'pharmacy-lite',
    },
  })
}
