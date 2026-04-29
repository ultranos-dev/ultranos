import { db, type InteractionAuditEntry } from '@/lib/db'
import { hlc, serializeHlc } from '@/lib/hlc'

interface LogInteractionCheckParams {
  encounterId: string
  patientId: string
  medicationRequestId: string
  medicationDisplay: string
  checkResult: 'CLEAR' | 'WARNING' | 'BLOCKED' | 'UNAVAILABLE'
  interactionsFound: number
  overrideReason?: string
  practitionerRef: string
}

/**
 * Append-only audit log entry for an interaction check.
 * Records Pass/Blocked/Overridden/Unavailable for compliance.
 */
export async function logInteractionCheck(params: LogInteractionCheckParams): Promise<void> {
  const nowIso = new Date().toISOString()
  const ts = hlc.now()

  const entry: InteractionAuditEntry = {
    id: crypto.randomUUID(),
    encounterId: params.encounterId,
    patientId: params.patientId,
    medicationRequestId: params.medicationRequestId,
    medicationDisplay: params.medicationDisplay,
    checkResult: params.checkResult,
    interactionsFound: params.interactionsFound,
    overrideReason: params.overrideReason,
    practitionerRef: params.practitionerRef,
    hlcTimestamp: serializeHlc(ts),
    createdAt: nowIso,
  }

  await db.interactionAuditLog.add(entry)
}

/**
 * Retrieve all interaction audit entries for an encounter.
 */
export async function getInteractionAuditLog(encounterId: string): Promise<InteractionAuditEntry[]> {
  return db.interactionAuditLog
    .where('encounterId')
    .equals(encounterId)
    .toArray()
}
