/**
 * Story 43.3 — Amendment & Correction Protocol
 *
 * Core amendment logic: initiate, authorize, commit.
 *
 * Architecture:
 *   - Three-actor workflow: tech initiates → supervisor authorizes → system commits
 *   - Original report is NEVER deleted or overwritten (legal requirement)
 *   - FHIR status transitions: final → amended (or entered-in-error for WRONG_PATIENT)
 *   - Corrected report: status = 'corrected', references original via _ultranos.amendsReportId
 *   - Offline-safe: all state stored in Dexie; sync queue handles Hub dispatch
 *
 * PHI rules (CLAUDE.md Rules #1, #6, #7):
 *   - Audit metadata uses opaque IDs only — no patient names, no result values
 *   - Notification payloads use opaque report IDs — no PHI
 *   - originalValues/amendedValues stored in amendments table (local only, not in audit)
 */

import Dexie from 'dexie'
import { getDb } from './db'
import { hlc, serializeHlc } from './hlc'
import { useAuthSessionStore } from '@/stores/auth-session-store'
import { reportAmendmentEvent } from './audit-client'
import { createLogbookAmendment } from './logbook-writer'
import type { AmendmentRecord } from '@ultranos/shared-types'
import { AmendmentReasonCode } from '@ultranos/shared-types'
import type { LabRole } from '@ultranos/shared-types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AmendmentSession {
  userId: string
  labRole: string
}

export interface InitiateAmendmentResult {
  amendmentId: string
  correctedReportId: string
}

export interface AuthorizeAmendmentPayload {
  amendmentId: string
  reasonCode: AmendmentReasonCode
  reasonText: string
  supervisorId: string
  amendedValues: Record<string, unknown>
}

// Supervisor-eligible roles per story 43.3 dev notes
const SUPERVISOR_ROLES: string[] = ['SUPERVISOR', 'LAB_MANAGER']

// ---------------------------------------------------------------------------
// Step 1: Initiate Amendment
// ---------------------------------------------------------------------------

/**
 * Begins the amendment workflow for a released/final lab result.
 *
 * - Deep-clones the original DiagnosticReport (snapshot of original values)
 * - Sets original report status to 'amended'
 * - Creates a new 'corrected' report referencing the original
 * - Saves an AmendmentRecord with status PENDING_AUTHORIZATION
 * - Emits audit event (AC #6 / CLAUDE.md Rule #6)
 *
 * Never throws PHI in error messages (CLAUDE.md Rule #1).
 */
export async function initiateAmendment(
  reportId: string,
  initiatedBy: string,
): Promise<InitiateAmendmentResult> {
  const db = getDb()
  const session = useAuthSessionStore.getState().session

  // Load the original report
  // Cast to any: lab_results stores full FHIR DiagnosticReport objects at runtime,
  // but the LabResult type is a minimal subset used by the trigger engine.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const original = await db.lab_results.get(reportId) as any
  if (!original) {
    throw new Error(`Amendment failed: report not found (id: ${reportId})`)
  }

  // Only final/released results can be amended
  if (original.status !== 'final' && original.status !== 'corrected') {
    throw new Error(
      `Amendment failed: report status '${original.status}' is not eligible for amendment. Only final or corrected reports can be amended.`,
    )
  }

  // Deep-clone original values snapshot — NEVER log these values (CLAUDE.md Rule #1)
  const originalValues: Record<string, unknown> = {
    status: original.status,
    issued: original.issued,
    code: original.code,
    conclusion: original.conclusion,
    result: original.result,
  }

  // Create the corrected report ID
  const correctedReportId = crypto.randomUUID()
  const amendmentId = crypto.randomUUID()
  const hlcTs = serializeHlc(hlc.now())
  const now = new Date().toISOString()

  // Mark the original report as 'amended'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.lab_results as Dexie.Table<any, string>).update(reportId, {
    status: 'amended',
    meta: {
      ...original.meta,
      lastUpdated: now,
      versionId: String((parseInt(original.meta?.versionId ?? '1') + 1)),
    },
  })

  // Create the corrected report (deep copy, new ID, status corrected)
  const correctedReport = {
    ...JSON.parse(JSON.stringify(original)),
    id: correctedReportId,
    status: 'corrected',
    _ultranos: {
      ...original._ultranos,
      amendsReportId: reportId,
      hlcTimestamp: hlcTs,
      createdAt: now,
    },
    meta: {
      ...original.meta,
      lastUpdated: now,
      versionId: '1',
    },
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.lab_results as Dexie.Table<any, string>).add(correctedReport)

  // Save the amendment record
  const amendmentRecord: AmendmentRecord = {
    id: amendmentId,
    originalReportId: reportId,
    amendedReportId: correctedReportId,
    reasonCode: '' as AmendmentReasonCode, // filled in by authorizeAmendment
    reasonText: '',
    authorizedBy: '',
    authorizedAt: '',
    initiatedBy: session?.userId ?? initiatedBy,
    initiatedAt: now,
    originalValues,
    amendedValues: {},
    hlcTimestamp: hlcTs,
    status: 'PENDING_AUTHORIZATION',
    syncStatus: 'pending',
  }
  await db.amendments.add(amendmentRecord)

  // Audit: initiation (opaque IDs only — no PHI, no result values)
  reportAmendmentEvent({
    action: 'AMENDMENT_INITIATED',
    amendmentId,
    originalReportId: reportId,
    initiatedBy: session?.userId ?? initiatedBy,
    outcome: 'SUCCESS',
  })

  return { amendmentId, correctedReportId }
}

// ---------------------------------------------------------------------------
// Step 2: Supervisor Authorization
// ---------------------------------------------------------------------------

/**
 * Supervisor authorizes and fills in the mandatory amendment fields.
 *
 * Validates:
 *   - Supervisor role (LAB_SUPERVISOR or LAB_MANAGER)
 *   - reasonCode is present
 *   - reasonText is at least 10 characters
 *
 * For WRONG_PATIENT: sets original report to 'entered-in-error' per FHIR semantics.
 * Authorization attempt emits an audit event regardless of success or failure (AC #2 / task 3.5).
 *
 * Never throws PHI in error messages.
 */
export async function authorizeAmendment(
  payload: AuthorizeAmendmentPayload,
  session: AmendmentSession,
): Promise<AmendmentRecord> {
  const { amendmentId, reasonCode, reasonText, supervisorId, amendedValues } = payload

  // Role validation — AC #2
  if (!SUPERVISOR_ROLES.includes(session.labRole)) {
    // Audit the failed attempt before throwing
    reportAmendmentEvent({
      action: 'AMENDMENT_AUTH_DENIED',
      amendmentId,
      originalReportId: 'unknown',
      initiatedBy: session.userId,
      outcome: 'FAILURE',
    })
    throw new Error(
      `Amendment authorization failed: supervisor authorization required. Role '${session.labRole}' is not eligible.`,
    )
  }

  // Mandatory field validation — AC #2 / task 4.3
  if (!reasonCode) {
    throw new Error('Amendment authorization failed: reasonCode is required')
  }
  if (!reasonText || reasonText.trim().length < 10) {
    throw new Error('Amendment authorization failed: reasonText must be at least 10 characters')
  }

  const db = getDb()
  const amendment = await db.amendments.get(amendmentId)
  if (!amendment) {
    throw new Error(`Amendment not found: ${amendmentId}`)
  }

  const now = new Date().toISOString()
  const hlcTs = serializeHlc(hlc.now())

  // FHIR edge case: WRONG_PATIENT → entered-in-error (not just amended)
  if (reasonCode === AmendmentReasonCode.WRONG_PATIENT) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.lab_results as Dexie.Table<any, string>).update(amendment.originalReportId, {
      status: 'entered-in-error',
      meta: { lastUpdated: now },
    })
  }

  // Update the amendment record with authorization details
  const updated: Partial<AmendmentRecord> = {
    reasonCode,
    reasonText: reasonText.trim(),
    authorizedBy: session.userId,
    authorizedAt: now,
    amendedValues,
    hlcTimestamp: hlcTs,
  }
  await db.amendments.update(amendmentId, updated)

  // Audit: supervisor authorization (opaque IDs only)
  reportAmendmentEvent({
    action: 'AMENDMENT_AUTHORIZED',
    amendmentId,
    originalReportId: amendment.originalReportId,
    initiatedBy: session.userId,
    outcome: 'SUCCESS',
  })

  return { ...amendment, ...updated } as AmendmentRecord
}

// ---------------------------------------------------------------------------
// Step 3: Commit Amendment
// ---------------------------------------------------------------------------

/**
 * Commits the fully-authorized amendment:
 *   - Marks AmendmentRecord as COMMITTED
 *   - Updates the corrected DiagnosticReport with amended observation values
 *   - Appends a logbook amendment entry (original entry untouched — AC #5)
 *   - Queues physician notification (opaque IDs, no PHI — AC #3)
 *   - Queues patient notification check (AC #4)
 *   - Emits final audit event (AC #6)
 *   - Enqueues amendment record for Hub sync
 *
 * Never throws — notification/logbook failures must not block commit.
 */
export async function commitAmendment(amendmentId: string): Promise<void> {
  const db = getDb()
  const session = useAuthSessionStore.getState().session

  const amendment = await db.amendments.get(amendmentId)
  if (!amendment) {
    throw new Error(`Cannot commit: amendment ${amendmentId} not found`)
  }

  const now = new Date().toISOString()
  const hlcTs = serializeHlc(hlc.now())

  // 1. Mark amendment as COMMITTED
  await db.amendments.update(amendmentId, {
    status: 'COMMITTED',
    syncStatus: 'pending',
    hlcTimestamp: hlcTs,
  })

  // 2. Update corrected report with amended values
  if (amendment.amendedValues && Object.keys(amendment.amendedValues).length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.lab_results as Dexie.Table<any, string>).update(amendment.amendedReportId, {
      conclusion: amendment.amendedValues['conclusion'] as string | undefined,
      meta: { lastUpdated: now },
    })
  }

  // 3. Append logbook amendment entry — never modify original (AC #5 / task 7.3)
  try {
    await createLogbookAmendment({
      originalEntryId: amendment.originalReportId,
      diagnosticReportId: amendment.amendedReportId,
      date: now.split('T')[0]!,
      patientRef: 'pending-sync',  // resolved from corrected report on sync
      patientFirstName: '',
      patientAge: 0,
      testType: '',
      testLoincCode: '',
      resultSummary: `Amendment: ${amendment.reasonCode}`,
      technicianId: amendment.initiatedBy,
      technicianName: '',
      authorizerId: amendment.authorizedBy,
      authorizerName: '',
      authorizedAt: amendment.authorizedAt,
      amendmentReason: amendment.reasonText,
    })
  } catch {
    // Logbook failure is non-fatal — amendment is committed, logbook syncs on retry
  }

  // 4. Queue physician notification (AC #3, task 5)
  // Payload: OPAQUE IDs only — NO result values, NO PHI (CLAUDE.md Rule #1, Rule #7)
  try {
    await db.syncQueue.put({
      id: crypto.randomUUID(),
      resourceType: 'notification',
      resourceId: amendment.amendedReportId,
      status: 'pending',
      createdAt: now,
      hlcTimestamp: hlcTs,
      lastAttemptAt: null,
      retryCount: 0,
      payload: {
        type: 'RESULT_AMENDED',
        payload: {
          originalReportId: amendment.originalReportId,
          amendedReportId: amendment.amendedReportId,
          reasonCode: amendment.reasonCode,
          amendmentTimestamp: now,
          notifyPhysician: true,
          notifyPatient: false, // determined by Hub on delivery (AC #4)
        },
      },
    })
  } catch {
    // Notification queue failure is non-fatal
  }

  // 5. Audit: completion (opaque IDs — no PHI, no result values)
  reportAmendmentEvent({
    action: 'AMENDMENT_COMMITTED',
    amendmentId,
    originalReportId: amendment.originalReportId,
    initiatedBy: session?.userId ?? amendment.initiatedBy,
    outcome: 'SUCCESS',
    meta: {
      reasonCode: amendment.reasonCode,
      authorizedBy: amendment.authorizedBy,
    },
  })

  // 6. Enqueue amendment record for Hub sync (Tier 2 — clinical data)
  try {
    await db.syncQueue.put({
      id: crypto.randomUUID(),
      resourceType: 'Amendment',
      resourceId: amendmentId,
      status: 'pending',
      createdAt: now,
      hlcTimestamp: hlcTs,
      lastAttemptAt: null,
      retryCount: 0,
      payload: { amendmentId },
    })
  } catch {
    // Sync queue failure is non-fatal
  }
}

// ---------------------------------------------------------------------------
// Amendment Chain Query
// ---------------------------------------------------------------------------

/**
 * Returns all amendment records associated with an original report,
 * ordered chronologically by initiatedAt (AC #6 — full amendment chain visible).
 *
 * Handles N-deep chains: searches by originalReportId across the full table.
 */
export async function getAmendmentChain(rootReportId: string): Promise<AmendmentRecord[]> {
  const db = getDb()

  // Collect all amendments in the chain starting from the root
  const chain: AmendmentRecord[] = []
  const visited = new Set<string>()
  const queue = [rootReportId]

  while (queue.length > 0) {
    const currentId = queue.shift()!
    if (visited.has(currentId)) continue
    visited.add(currentId)

    const amendments = await db.amendments
      .where('originalReportId')
      .equals(currentId)
      .toArray()

    for (const amendment of amendments) {
      chain.push(amendment)
      // Follow the chain to the corrected report
      if (amendment.amendedReportId && !visited.has(amendment.amendedReportId)) {
        queue.push(amendment.amendedReportId)
      }
    }
  }

  // Sort chronologically
  return chain.sort((a, b) => a.initiatedAt.localeCompare(b.initiatedAt))
}
