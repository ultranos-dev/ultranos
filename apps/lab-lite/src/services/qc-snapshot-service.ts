/**
 * Story 43.2 — QC Snapshot Capture Service
 *
 * A QcSnapshot is an immutable, denormalized deep-copy of a QcRun attached to
 * a patient result at save time. It preserves the exact QC state at the moment
 * the result was entered — even if the original QcRun is later amended.
 *
 * Why deep copy instead of FK reference?
 * - Immutability: if a QcRun is amended later, the snapshot is unaffected
 * - Offline resilience: no join needed at display time — snapshot is self-contained
 * - Legal defensibility: point-in-time attestation "QC was X when this result was saved"
 *
 * Also derives the QcWarning for the result:
 *   QC_FAILING (red)  > QC_DRIFT (orange) > NO_QC_TODAY (amber) > null (passing)
 */

import { hlc, serializeHlc } from '@/lib/hlc'
import type { QcSnapshot, QcWarning } from '@/lib/db'
import {
  getLatestQcRun,
  isQcDriftWarningActive,
} from '@/services/qc-run-service'
import { emitClientAudit } from '@ultranos/audit-logger/client'
import type { ClientAuditEventInput } from '@ultranos/audit-logger/client'
import { AuditAction, AuditResourceType, UserRole } from '@ultranos/shared-types'
import { useAuthSessionStore } from '@/stores/auth-session-store'

// ---------------------------------------------------------------------------
// Snapshot capture
// ---------------------------------------------------------------------------

/**
 * Capture a QC snapshot for the given analyte/instrument at the current moment.
 *
 * Returns null if no QC run exists at all for this analyte/instrument.
 * The caller must set qcWarning = 'NO_QC_TODAY' in that case.
 *
 * The snapshot is a deep copy — mutating the source QcRun does not affect it.
 */
export async function captureQcSnapshot(
  analyte: string,
  instrumentId: string,
): Promise<QcSnapshot | null> {
  const latestRun = await getLatestQcRun(analyte, instrumentId)
  if (!latestRun) return null

  // Deep copy all QC run fields into the snapshot
  const snapshot: QcSnapshot = {
    qcRunId: latestRun.id,
    analyte: latestRun.analyte,
    instrumentId: latestRun.instrumentId,
    controlLevel: latestRun.controlLevel,
    passOrFail: latestRun.passOrFail,
    // Spread-copy nested objects to ensure no reference sharing
    controlValues: { ...latestRun.controlValues },
    expectedRange: { ...latestRun.expectedRange },
    qcTimestamp: latestRun.timestamp,
    snapshotTakenAt: serializeHlc(hlc.now()),
  }

  return snapshot
}

// ---------------------------------------------------------------------------
// QC Warning derivation
// ---------------------------------------------------------------------------

/**
 * Derive the qcWarning value for a result being saved.
 *
 * Priority (highest to lowest):
 *   QC_FAILING > QC_DRIFT > NO_QC_TODAY > null
 *
 * @param snapshot - Result of captureQcSnapshot (null = no QC run exists)
 * @param analyte  - LOINC code (needed for drift check)
 * @param instrumentId - Instrument identifier
 */
export async function deriveQcWarning(
  snapshot: QcSnapshot | null,
  analyte: string,
  instrumentId: string,
): Promise<QcWarning> {
  if (snapshot === null) return 'NO_QC_TODAY'
  if (snapshot.passOrFail === 'FAIL') return 'QC_FAILING'

  // Check drift (Story 43.6 stub — always false until 43.6 is implemented)
  const driftActive = await isQcDriftWarningActive(analyte, instrumentId)
  if (driftActive) return 'QC_DRIFT'

  return null
}

// ---------------------------------------------------------------------------
// Audit emission for snapshot binding — no PHI (CLAUDE.md Rule #7)
// ---------------------------------------------------------------------------

/**
 * Emit an audit event recording the QC snapshot binding to a patient result.
 * resultId is an opaque UUID — never a patient name (CLAUDE.md Rule #1).
 * Never throws — result save must not be blocked by audit failures.
 */
export function emitQcSnapshotAuditEvent(payload: {
  resultId: string
  qcRunId: string | null
  analyte: string
  passOrFail: 'PASS' | 'FAIL' | null
  qcWarning: QcWarning
}): void {
  const session = useAuthSessionStore.getState().session

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? 'unknown',
    actorRole: UserRole.LAB_TECH,
    action: AuditAction.CREATE,
    resourceType: 'QC_SNAPSHOT' as AuditResourceType,
    resourceId: payload.resultId,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      qcEvent: 'QC_SNAPSHOT_BOUND',
      outcome: 'SUCCESS',
      // resultId is opaque UUID — no PHI (CLAUDE.md Rule #1)
      resultId: payload.resultId,
      qcRunId: payload.qcRunId ?? 'none',
      analyte: payload.analyte,
      passOrFail: payload.passOrFail ?? 'NONE',
      qcWarning: payload.qcWarning ?? 'none',
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}
