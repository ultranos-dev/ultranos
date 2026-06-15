/**
 * Story 43.2 — QC Run CRUD Service
 *
 * Manages Quality Control run data in Dexie (local, offline-first).
 * QC data is purely operational — no PHI. Audit events are emitted for
 * traceability but contain no patient data.
 *
 * Key design decisions:
 * - calendarDate (YYYY-MM-DD) is used for "today?" checks — not HLC.
 *   HLC is for causal ordering; "has QC been run today?" is a calendar question.
 * - getLatestQcRun returns the most recent run regardless of date (for snapshot capture).
 * - getTodayQcRun returns today's most recent run (for warning banner display).
 */

import Dexie from 'dexie'
import { getDb } from '@/lib/db'
import type { QcRun } from '@/lib/db'
import { hlc, serializeHlc } from '@/lib/hlc'
import { emitClientAudit } from '@ultranos/audit-logger/client'
import type { ClientAuditEventInput } from '@ultranos/audit-logger/client'
import { AuditAction, AuditResourceType, UserRole } from '@ultranos/shared-types'
import { useAuthSessionStore } from '@/stores/auth-session-store'

// ---------------------------------------------------------------------------
// Core CRUD
// ---------------------------------------------------------------------------

/**
 * Persist a new QC run to Dexie and emit an audit event.
 * Never throws from the audit path — QC save must not be blocked by audit failures.
 */
export async function saveQcRun(run: QcRun): Promise<void> {
  const db = getDb()
  await db.qcRuns.put(run)
  _emitQcRunAuditEvent(run)
}

/**
 * Return the most recent QC run for the given analyte/instrument, regardless of date.
 * Used by snapshot capture — we want the last QC state even if it was yesterday.
 */
export async function getLatestQcRun(
  analyte: string,
  instrumentId: string,
): Promise<QcRun | undefined> {
  const db = getDb()
  const runs = await db.qcRuns
    .where('[analyte+instrumentId+calendarDate]')
    .between([analyte, instrumentId, Dexie.minKey], [analyte, instrumentId, Dexie.maxKey])
    .toArray()
  // Sort by HLC timestamp descending (newest first)
  runs.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  return runs[0]
}

/**
 * Return the most recent QC run for the given analyte/instrument on today's calendar date.
 * Used by QcWarningBanner — "has QC been run today?"
 */
export async function getTodayQcRun(
  analyte: string,
  instrumentId: string,
): Promise<QcRun | undefined> {
  const today = new Date().toISOString().slice(0, 10)
  const db = getDb()
  const runs = await db.qcRuns
    .where('[analyte+instrumentId+calendarDate]')
    .equals([analyte, instrumentId, today])
    .toArray()
  // Sort by HLC timestamp descending (newest first)
  runs.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  return runs[0]
}

/**
 * Return the last `limit` QC runs for a given analyte/instrument, ordered newest first.
 * Used by QcHistoryView and drift detection algorithms.
 */
export async function getQcRunHistory(
  analyte: string,
  instrumentId: string,
  limit = 50,
): Promise<QcRun[]> {
  const db = getDb()
  const runs = await db.qcRuns
    .where('[analyte+instrumentId+calendarDate]')
    .between([analyte, instrumentId, Dexie.minKey], [analyte, instrumentId, Dexie.maxKey])
    .toArray()
  // Sort by HLC timestamp descending (newest first), then slice
  runs.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  return runs.slice(0, limit)
}

// ---------------------------------------------------------------------------
// Story 43.6 drift detection integration hooks (Task 8)
// ---------------------------------------------------------------------------

/**
 * Return the last `count` QC runs for drift detection algorithms (Story 43.6).
 * Exported so drift detection can consume history without a direct Dexie import.
 */
export async function getRecentQcRuns(
  analyte: string,
  instrumentId: string,
  count: number,
): Promise<QcRun[]> {
  return getQcRunHistory(analyte, instrumentId, count)
}

/**
 * Stub for Story 43.6 (Drift Detection).
 * Returns false until drift detection algorithms are implemented.
 * Story 43.6 will replace this with Westgard rule evaluation.
 */
export async function isQcDriftWarningActive(
  _analyte: string,
  _instrumentId: string,
): Promise<boolean> {
  return false
}

// ---------------------------------------------------------------------------
// Audit emission — no PHI in metadata (QC data is operational, CLAUDE.md Rule #7)
// ---------------------------------------------------------------------------

function _emitQcRunAuditEvent(run: QcRun): void {
  const session = useAuthSessionStore.getState().session

  const input: ClientAuditEventInput = {
    actorId: session?.userId ?? run.techId,
    actorRole: UserRole.LAB_TECH,
    action: AuditAction.CREATE,
    resourceType: 'QC_RUN' as AuditResourceType,
    resourceId: run.id,
    hlcTimestamp: serializeHlc(hlc.now()),
    metadata: {
      qcEvent: 'QC_RUN_CREATED',
      outcome: 'SUCCESS',
      analyte: run.analyte,
      instrumentId: run.instrumentId,
      controlLevel: run.controlLevel,
      passOrFail: run.passOrFail,
      source: 'lab-lite',
    },
  }

  void emitClientAudit(input)
}
